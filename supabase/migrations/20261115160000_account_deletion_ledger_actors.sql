-- Retire payment-record authorship without changing settlement evidence or payees.
-- Source only. Financial-party retention and the whole deletion workflow remain separate.
BEGIN;
SET LOCAL search_path='';
SET LOCAL lock_timeout='5s';
DO $$ DECLARE actual jsonb;target text;
 expected_columns jsonb:=$columns${"order_payments":{"id":["uuid",true,"gen_random_uuid()",""],"order_id":["uuid",true,null,""],"kind":["payment_record_kind",true,null,""],"provider":["text",true,null,""],"external_reference":["text",true,null,""],"amount_cents":["integer",true,null,""],"currency":["character(3)",true,"'USD'::bpchar",""],"provider_status":["payment_record_status",true,null,""],"occurred_at":["timestamp with time zone",true,"now()",""],"recorded_by":["uuid",true,null,""],"note":["text",false,null,""],"created_at":["timestamp with time zone",true,"now()",""],"updated_at":["timestamp with time zone",true,"now()",""]},"order_payouts":{"id":["uuid",true,"gen_random_uuid()",""],"order_id":["uuid",true,null,""],"payee_id":["uuid",true,null,""],"provider":["text",true,null,""],"external_reference":["text",false,null,""],"amount_cents":["integer",true,null,""],"currency":["character(3)",true,"'USD'::bpchar",""],"status":["payout_status",true,"'pending'::payout_status",""],"occurred_at":["timestamp with time zone",false,null,""],"recorded_by":["uuid",true,null,""],"note":["text",false,null,""],"created_at":["timestamp with time zone",true,"now()",""],"updated_at":["timestamp with time zone",true,"now()",""]}}$columns$;
 expected_constraints jsonb:=$constraints${"order_payments.order_payments_amount_cents_check":"CHECK (amount_cents > 0)","order_payments.order_payments_order_id_fkey":"FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE","order_payments.order_payments_pkey":"PRIMARY KEY (id)","order_payments.order_payments_provider_external_reference_kind_key":"UNIQUE (provider, external_reference, kind)","order_payments.order_payments_reference_is_not_an_instrument":"CHECK (external_reference !~ '[0-9]{12,}'::text)","order_payouts.order_payouts_amount_cents_check":"CHECK (amount_cents >= 0)","order_payouts.order_payouts_order_id_fkey":"FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE","order_payouts.order_payouts_order_id_key":"UNIQUE (order_id)","order_payouts.order_payouts_pkey":"PRIMARY KEY (id)","order_payouts.order_payouts_reference_is_not_an_instrument":"CHECK (external_reference IS NULL OR external_reference !~ '[0-9]{12,}'::text)"}$constraints$;
 expected_policies jsonb:=$policies${"order_payments.Parties and staff read payment evidence":["r","((EXISTS ( SELECT 1\n   FROM orders o\n  WHERE ((o.id = order_payments.order_id) AND ((o.buyer_id = auth.uid()) OR (o.seller_id = auth.uid()))))) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role))",null],"order_payments.bluebird_account_session_boundary":["*","( SELECT account_current_session_active() AS account_current_session_active)","( SELECT account_current_session_active() AS account_current_session_active)"],"order_payouts.Payee and staff read payout records":["r","((payee_id = auth.uid()) OR (EXISTS ( SELECT 1\n   FROM orders o\n  WHERE ((o.id = order_payouts.order_id) AND (o.buyer_id = auth.uid())))) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role))",null],"order_payouts.bluebird_account_session_boundary":["*","( SELECT account_current_session_active() AS account_current_session_active)","( SELECT account_current_session_active() AS account_current_session_active)"]}$policies$;
BEGIN
 PERFORM 1 FROM public.account_deletion_controls WHERE id AND NOT worker_enabled FOR SHARE;
 IF NOT FOUND OR NOT public.account_deletion_business_claim_barrier_current()
 OR NOT public.account_deletion_private_barrier_current() OR NOT public.account_deletion_profile_barrier_current()
 OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Review disabled ledger authorship prerequisites';END IF;
 FOREACH target IN ARRAY ARRAY['order_payments','order_payouts'] LOOP
  EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE',target);
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=format('public.%I',target)::regclass AND relkind='r' AND relrowsecurity AND NOT relispartition)
  OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhparent=format('public.%I',target)::regclass OR inhrelid=format('public.%I',target)::regclass)
  OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class=format('public.%I',target)::regclass)
  OR(SELECT count(*)FROM pg_trigger WHERE tgrelid=format('public.%I',target)::regclass AND NOT tgisinternal)<>1
  OR NOT EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid=format('public.%I',target)::regclass
    AND t.tgname='guard_'||target AND t.tgtype=31 AND t.tgenabled='O' AND p.oid='public.guard_pilot_writes()'::regprocedure AND md5(p.prosrc)='9d3052e8c37745fa6812af16f70478e0')
  THEN RAISE EXCEPTION 'Review ledger relation layout and hooks';END IF;
 END LOOP;
 SELECT jsonb_object_agg(relname,cols)INTO actual FROM(SELECT c.relname,jsonb_object_agg(a.attname,jsonb_build_array(replace(format_type(a.atttypid,a.atttypmod),'public.',''),a.attnotnull,replace(pg_get_expr(d.adbin,d.adrelid),'public.',''),a.attgenerated))cols
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE n.nspname='public'AND c.relname IN('order_payments','order_payouts')AND a.attnum>0 AND NOT a.attisdropped GROUP BY c.relname)r;
 IF actual IS DISTINCT FROM expected_columns THEN RAISE EXCEPTION 'Review ledger columns';END IF;
 SELECT jsonb_object_agg(replace(conrelid::regclass::text,'public.','')||'.'||conname,replace(pg_get_constraintdef(oid,true),'public.',''))INTO actual FROM pg_constraint
 WHERE contype<>'n'AND(conrelid IN('public.order_payments'::regclass,'public.order_payouts'::regclass)OR confrelid IN('public.order_payments'::regclass,'public.order_payouts'::regclass));
 IF actual IS DISTINCT FROM expected_constraints THEN RAISE EXCEPTION 'Review ledger relationships';END IF;
 SELECT jsonb_object_agg(replace(polrelid::regclass::text,'public.','')||'.'||polname,jsonb_build_array(polcmd,replace(pg_get_expr(polqual,polrelid),'public.',''),replace(pg_get_expr(polwithcheck,polrelid),'public.','')))INTO actual FROM pg_policy WHERE polrelid IN('public.order_payments'::regclass,'public.order_payouts'::regclass);
 IF actual IS DISTINCT FROM expected_policies OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid IN('public.order_payments'::regclass,'public.order_payouts'::regclass)
  AND (NOT polroles <@ ARRAY[0::oid,(SELECT oid FROM pg_roles WHERE rolname='authenticated')] OR polpermissive IS DISTINCT FROM (polcmd='r')))
 THEN RAISE EXCEPTION 'Review ledger row policies';END IF;
END $$;

ALTER TABLE public.order_payments ALTER COLUMN recorded_by DROP NOT NULL;
ALTER TABLE public.order_payouts ALTER COLUMN recorded_by DROP NOT NULL;
CREATE INDEX account_deletion_payment_actor ON public.order_payments(recorded_by,id);
CREATE INDEX account_deletion_payout_actor ON public.order_payouts(recorded_by,id);
CREATE INDEX account_deletion_payout_payee ON public.order_payouts(payee_id,id);

-- The existing trusted-operation guard and policies remain in force. A valid
-- provider settlement may arrive after deletion; it must not resurrect authorship.
CREATE FUNCTION public.guard_account_deletion_ledger_actor()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
BEGIN
 IF NEW.recorded_by IS NULL THEN RETURN NEW;END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Ledger authorship unavailable';END IF;
 BEGIN
  PERFORM public.assert_member_private_record_writer(NEW.recorded_by);
 EXCEPTION WHEN raise_exception THEN
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=NEW.recorded_by AND deleted_at IS NULL)
   OR EXISTS(SELECT 1 FROM public.mobile_account_deletions WHERE user_id=NEW.recorded_by)
   OR EXISTS(SELECT 1 FROM public.account_deletion_jobs WHERE user_id=NEW.recorded_by AND status<>'completed')
  THEN NEW.recorded_by:=NULL; ELSE RAISE; END IF;
 END;
 RETURN NEW;
END $$;
CREATE TRIGGER account_deletion_ledger_actor BEFORE INSERT OR UPDATE ON public.order_payments FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_ledger_actor();
CREATE TRIGGER account_deletion_ledger_actor BEFORE INSERT OR UPDATE ON public.order_payouts FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_ledger_actor();
CREATE FUNCTION public.account_deletion_ledger_actor_remaining(_user uuid)RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.order_payments WHERE recorded_by=_user)
 OR EXISTS(SELECT 1 FROM public.order_payouts WHERE recorded_by=_user);
$$;

CREATE OR REPLACE FUNCTION public.account_deletion_profile_financial_remaining(_user uuid)RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.orders WHERE buyer_id=_user OR seller_id=_user)
 OR EXISTS(SELECT 1 FROM public.listing_upgrade_purchases WHERE user_id=_user)
 OR EXISTS(SELECT 1 FROM public.seller_profiles WHERE user_id=_user AND stripe_account_id IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.shopper_service_profiles WHERE shopper_id=_user AND stripe_account_id IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.sourcing_assignments a JOIN public.shopper_service_profiles p ON p.id=a.shopper_profile_id WHERE p.shopper_id=_user)
 OR EXISTS(SELECT 1 FROM public.order_payouts WHERE payee_id=_user)
 OR public.account_deletion_ledger_actor_remaining(_user);
$$;

CREATE FUNCTION public.account_deletion_ledger_actor_scope(_id uuid,_user uuid,_lease uuid,_phase text)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
BEGIN
 PERFORM public.account_deletion_business_claim_scope(_id,_user,_lease,_phase);
 LOCK TABLE public.order_payments,public.order_payouts IN ROW EXCLUSIVE MODE;
 IF NOT public.account_deletion_ledger_actor_barrier_current()THEN RAISE EXCEPTION 'Ledger authorship requires schema review';END IF;
END $$;
CREATE FUNCTION public.retire_account_deletion_ledger_actors(_id uuid,_user uuid,_lease uuid,_limit integer DEFAULT 100)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE source text;changed integer:=0;previous_trust text:=coalesce(current_setting('parkvault.trusted_operation',true),'');
BEGIN
 IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Ledger authorship unavailable';END IF;
 PERFORM public.account_deletion_ledger_actor_scope(_id,_user,_lease,'records');
 PERFORM set_config('parkvault.trusted_operation','on',true);
 FOREACH source IN ARRAY ARRAY['order_payments','order_payouts'] LOOP
  EXECUTE format('WITH targets AS(SELECT id FROM public.%I WHERE recorded_by=$1 ORDER BY id LIMIT $2 FOR UPDATE),retired AS(UPDATE public.%I p SET recorded_by=NULL FROM targets t WHERE p.id=t.id RETURNING 1)SELECT count(*)::integer FROM retired',source,source)INTO changed USING _user,_limit;
  EXIT WHEN changed>0;
 END LOOP;
 PERFORM set_config('parkvault.trusted_operation',previous_trust,true);
 IF NOT public.account_deletion_lease_current(_id,_user,_lease,'records') OR NOT public.account_deletion_ledger_actor_barrier_current()
 OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)THEN RAISE EXCEPTION 'Ledger authorship unavailable';END IF;
 RETURN jsonb_build_object('source',CASE WHEN changed=0 THEN NULL ELSE source END,'changed',changed,'pass_done',NOT public.account_deletion_ledger_actor_remaining(_user));
END $$;
CREATE FUNCTION public.verify_account_deletion_ledger_actors(_id uuid,_user uuid,_lease uuid)RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.account_deletion_ledger_actor_scope(_id,_user,_lease,'verification');
 RETURN NOT public.account_deletion_ledger_actor_remaining(_user)AND public.account_deletion_lease_current(_id,_user,_lease,'verification');
END $$;
CREATE FUNCTION public.guard_account_deletion_ledger_actor_completion()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status='completed'AND(NOT public.account_deletion_ledger_actor_barrier_current()
  OR public.account_deletion_ledger_actor_remaining(OLD.user_id)
  OR EXISTS(SELECT 1 FROM public.order_payouts WHERE payee_id=OLD.user_id))
 THEN RAISE EXCEPTION 'Ledger identity handling is incomplete';END IF;RETURN NEW;
END $$;
CREATE TRIGGER guard_account_deletion_ledger_actor_completion AFTER UPDATE OF status,user_id ON public.account_deletion_jobs FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_ledger_actor_completion();

CREATE FUNCTION public.account_deletion_ledger_actor_catalog()RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''SET TimeZone='UTC'AS $$
 WITH sources AS(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname=ANY(ARRAY['order_payments','order_payouts']))
 SELECT jsonb_build_object(
 'relations',(SELECT jsonb_agg(jsonb_build_array(oid::regclass::text,relkind,relispartition,relrowsecurity,relforcerowsecurity,relacl::text)ORDER BY oid)FROM pg_class WHERE oid IN(SELECT oid FROM sources)),
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attrelid::regclass::text,a.attname,a.atttypid::regtype::text,a.atttypmod,a.attnotnull,a.attgenerated,pg_get_expr(d.adbin,d.adrelid))ORDER BY a.attrelid,a.attnum)FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid IN(SELECT oid FROM sources)AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conrelid::regclass::text,conname,pg_get_constraintdef(oid,true),convalidated,condeferrable,condeferred)ORDER BY conrelid,conname)FROM pg_constraint WHERE conrelid IN(SELECT oid FROM sources)OR confrelid IN(SELECT oid FROM sources)),
 'hooks',(SELECT jsonb_object_agg(tgrelid::regclass::text||'.'||tgname,jsonb_build_array(pg_get_triggerdef(oid,true),md5(pg_get_functiondef(tgfoid)),tgenabled))FROM pg_trigger WHERE tgrelid IN(SELECT oid FROM sources)AND NOT tgisinternal),
 'indexes',(SELECT jsonb_agg(pg_get_indexdef(indexrelid)ORDER BY indexrelid)FROM pg_index WHERE indrelid IN(SELECT oid FROM sources)),
 'policies',(SELECT jsonb_agg(jsonb_build_array(polrelid::regclass::text,polname,polcmd,polpermissive,polroles::text,pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid))ORDER BY polrelid,polname)FROM pg_policy WHERE polrelid IN(SELECT oid FROM sources)),
 'rules',(SELECT coalesce(jsonb_agg(pg_get_ruledef(oid,true)ORDER BY oid),'[]')FROM pg_rewrite WHERE ev_class IN(SELECT oid FROM sources)),
 'inheritance',(SELECT count(*)FROM pg_inherits WHERE inhparent IN(SELECT oid FROM sources)OR inhrelid IN(SELECT oid FROM sources)));
$$;


CREATE TABLE public.account_deletion_ledger_actor_contract(id boolean PRIMARY KEY DEFAULT true CHECK(id),catalog jsonb NOT NULL,functions jsonb NOT NULL);
ALTER TABLE public.account_deletion_ledger_actor_contract ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_ledger_actor_contract FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.account_deletion_ledger_actor_contract TO service_role;
CREATE FUNCTION public.account_deletion_ledger_actor_functions()RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_array(md5(pg_get_functiondef(p.oid)),p.prosecdef,p.proconfig,p.proacl::text))FROM pg_proc p WHERE p.oid IN(to_regprocedure('public.guard_account_deletion_ledger_actor()'),to_regprocedure('public.account_deletion_ledger_actor_remaining(uuid)'),to_regprocedure('public.account_deletion_ledger_actor_scope(uuid,uuid,uuid,text)'),to_regprocedure('public.retire_account_deletion_ledger_actors(uuid,uuid,uuid,integer)'),to_regprocedure('public.verify_account_deletion_ledger_actors(uuid,uuid,uuid)'),to_regprocedure('public.guard_account_deletion_ledger_actor_completion()'),to_regprocedure('public.account_deletion_ledger_actor_catalog()'),to_regprocedure('public.account_deletion_ledger_actor_functions()'),to_regprocedure('public.account_deletion_ledger_actor_barrier_current()'),to_regprocedure('public.assert_member_private_record_writer(uuid)'),to_regprocedure('public.account_deletion_profile_financial_remaining(uuid)'),to_regprocedure('public.guard_pilot_writes()'),to_regprocedure('public.is_trusted_operation()'));
$$;
CREATE FUNCTION public.account_deletion_ledger_actor_barrier_current()RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.account_deletion_ledger_actor_contract WHERE id AND catalog=public.account_deletion_ledger_actor_catalog()AND functions=public.account_deletion_ledger_actor_functions());
$$;
REVOKE ALL ON FUNCTION public.guard_account_deletion_ledger_actor(),public.account_deletion_ledger_actor_remaining(uuid),public.account_deletion_ledger_actor_scope(uuid,uuid,uuid,text),public.retire_account_deletion_ledger_actors(uuid,uuid,uuid,integer),public.verify_account_deletion_ledger_actors(uuid,uuid,uuid),public.guard_account_deletion_ledger_actor_completion(),public.account_deletion_ledger_actor_catalog(),public.account_deletion_ledger_actor_functions(),public.account_deletion_ledger_actor_barrier_current() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.retire_account_deletion_ledger_actors(uuid,uuid,uuid,integer),public.verify_account_deletion_ledger_actors(uuid,uuid,uuid)TO service_role;
SELECT public.protect_account_access_boundaries();
-- Refresh only the one reviewed profile function and one new completion hook.
UPDATE public.account_deletion_profile_contract SET functions=jsonb_set(functions,ARRAY[('public.account_deletion_profile_financial_remaining(uuid)'::regprocedure)::text],to_jsonb((SELECT md5(pg_get_functiondef('public.account_deletion_profile_financial_remaining(uuid)'::regprocedure)))))WHERE id;
DO $$BEGIN
 IF (public.account_deletion_private_hooks()-'public.account_deletion_jobs.guard_account_deletion_ledger_actor_completion') IS DISTINCT FROM (SELECT hooks FROM public.account_deletion_private_contract WHERE id)
 THEN RAISE EXCEPTION 'Unreviewed private completion hook change';END IF;
END $$;
UPDATE public.account_deletion_private_contract SET hooks=public.account_deletion_private_hooks()WHERE id;
INSERT INTO public.account_deletion_ledger_actor_contract SELECT true,public.account_deletion_ledger_actor_catalog(),public.account_deletion_ledger_actor_functions();
DO $$BEGIN
 IF NOT public.account_deletion_ledger_actor_barrier_current()OR NOT public.account_deletion_business_claim_barrier_current()
 OR NOT public.account_deletion_profile_barrier_current()OR NOT public.account_deletion_private_barrier_current()
 OR public.account_access_coverage() IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Ledger authorship boundaries require review';END IF;
END $$;
COMMIT;
