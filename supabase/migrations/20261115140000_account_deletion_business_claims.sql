-- Source-only business claim erasure. No worker activation or Auth removal.
BEGIN;
SET LOCAL search_path='';
SET LOCAL TimeZone='UTC';
SET LOCAL lock_timeout='5s';
DO $$ DECLARE expected_columns jsonb:=$columns${"employer_claims":{"id":["uuid",true,"gen_random_uuid()",""],"employer_key":["text",true,null,""],"employer_name":["text",true,null,""],"city":["text",true,"''::text",""],"state":["text",true,"''::text",""],"user_id":["uuid",true,null,""],"contact":["text",true,null,""],"role":["text",true,null,""],"note":["text",false,null,""],"status":["text",true,"'pending'::text",""],"created_at":["timestamp with time zone",true,"now()",""],"reviewed_at":["timestamp with time zone",false,null,""],"reviewed_by":["uuid",false,null,""]},"service_directory":{"id":["text",true,null,""],"name":["text",true,null,""],"trade":["text",true,null,""],"trades":["text[]",true,"'{}'::text[]",""],"priority":["smallint",true,"2",""],"category_labels":["text[]",true,"'{}'::text[]",""],"address":["text",false,null,""],"city":["text",true,null,""],"state":["text",true,"'ID'::text",""],"postcode":["text",false,null,""],"latitude":["double precision",false,null,""],"longitude":["double precision",false,null,""],"phone":["text",false,null,""],"website":["text",false,null,""],"email":["text",false,null,""],"facebook_id":["text",false,null,""],"instagram":["text",false,null,""],"source_refreshed_at":["date",false,null,""],"enrichment":["jsonb",false,null,""],"enriched_at":["timestamp with time zone",false,null,""],"claimed_by":["uuid",false,null,""],"claimed_at":["timestamp with time zone",false,null,""],"hidden":["boolean",true,"false",""],"imported_at":["timestamp with time zone",true,"now()",""],"updated_at":["timestamp with time zone",true,"now()",""],"phone_digits":["text",false,"\"right\"(regexp_replace(COALESCE(phone, ''::text), '\\D'::text, ''::text, 'g'::text), 10)","s"]},"service_directory_claims":{"id":["uuid",true,"gen_random_uuid()",""],"directory_id":["text",true,null,""],"user_id":["uuid",true,null,""],"contact":["text",true,null,""],"role":["text",true,null,""],"note":["text",false,null,""],"status":["text",true,"'pending'::text",""],"created_at":["timestamp with time zone",true,"now()",""],"reviewed_at":["timestamp with time zone",false,null,""],"reviewed_by":["uuid",false,null,""]}}$columns$::jsonb;
 expected_constraints jsonb:=$constraints${"employer_claims.employer_claims_city_check":"CHECK (char_length(city) <= 120)","employer_claims.employer_claims_contact_check":"CHECK (char_length(btrim(contact)) >= 3 AND char_length(btrim(contact)) <= 200)","employer_claims.employer_claims_employer_key_check":"CHECK (char_length(employer_key) >= 3 AND char_length(employer_key) <= 200)","employer_claims.employer_claims_employer_key_user_id_key":"UNIQUE (employer_key, user_id)","employer_claims.employer_claims_employer_name_check":"CHECK (char_length(btrim(employer_name)) >= 2 AND char_length(btrim(employer_name)) <= 200)","employer_claims.employer_claims_note_check":"CHECK (note IS NULL OR char_length(note) <= 1000)","employer_claims.employer_claims_pkey":"PRIMARY KEY (id)","employer_claims.employer_claims_reviewed_by_fkey":"FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL","employer_claims.employer_claims_role_check":"CHECK (char_length(btrim(role)) >= 2 AND char_length(btrim(role)) <= 80)","employer_claims.employer_claims_state_check":"CHECK (char_length(state) <= 40)","employer_claims.employer_claims_status_check":"CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))","employer_claims.employer_claims_user_id_fkey":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE","service_directory.service_directory_claimed_by_fkey":"FOREIGN KEY (claimed_by) REFERENCES auth.users(id) ON DELETE SET NULL","service_directory.service_directory_id_check":"CHECK (id ~ '^fsq-[0-9a-f]{24}$'::text)","service_directory.service_directory_name_check":"CHECK (char_length(name) >= 1 AND char_length(name) <= 200)","service_directory.service_directory_pkey":"PRIMARY KEY (id)","service_directory.service_directory_priority_check":"CHECK (priority >= 1 AND priority <= 3)","service_directory_claims.service_directory_claims_directory_id_fkey":"FOREIGN KEY (directory_id) REFERENCES service_directory(id) ON DELETE CASCADE","service_directory_claims.service_directory_claims_contact_check":"CHECK (char_length(btrim(contact)) >= 3 AND char_length(btrim(contact)) <= 200)","service_directory_claims.service_directory_claims_directory_id_user_id_key":"UNIQUE (directory_id, user_id)","service_directory_claims.service_directory_claims_note_check":"CHECK (note IS NULL OR char_length(note) <= 1000)","service_directory_claims.service_directory_claims_pkey":"PRIMARY KEY (id)","service_directory_claims.service_directory_claims_reviewed_by_fkey":"FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL","service_directory_claims.service_directory_claims_role_check":"CHECK (char_length(btrim(role)) >= 2 AND char_length(btrim(role)) <= 80)","service_directory_claims.service_directory_claims_status_check":"CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))","service_directory_claims.service_directory_claims_user_id_fkey":"FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE"}$constraints$::jsonb;
 expected_functions jsonb:=$functions${}$functions$::jsonb;
 expected_policies jsonb:=$policies${"employer_claims.Admins review employer claims":["w",true,["authenticated"],"has_role(auth.uid(), 'admin'::app_role)","has_role(auth.uid(), 'admin'::app_role)"],"employer_claims.Members file their own employer claims":["a",true,["authenticated"],null,"((user_id = auth.uid()) AND (status = 'pending'::text))"],"employer_claims.Members read their own employer claims":["r",true,["authenticated"],"((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))",null],"employer_claims.bluebird_account_session_boundary":["*",false,["authenticated"],"( SELECT account_current_session_active() AS account_current_session_active)","( SELECT account_current_session_active() AS account_current_session_active)"],"service_directory.bluebird_account_session_boundary":["*",false,["authenticated"],"( SELECT account_current_session_active() AS account_current_session_active)","( SELECT account_current_session_active() AS account_current_session_active)"],"service_directory_claims.Admins review claims":["w",true,["authenticated"],"has_role(auth.uid(), 'admin'::app_role)","has_role(auth.uid(), 'admin'::app_role)"],"service_directory_claims.Members file their own claims":["a",true,["authenticated"],null,"((user_id = auth.uid()) AND (status = 'pending'::text))"],"service_directory_claims.Members read their own claims":["r",true,["authenticated"],"((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))",null],"service_directory_claims.bluebird_account_session_boundary":["*",false,["authenticated"],"( SELECT account_current_session_active() AS account_current_session_active)","( SELECT account_current_session_active() AS account_current_session_active)"]}$policies$::jsonb;
 expected_acls jsonb:=$acls${"employer_claims":"{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=arw/postgres}","service_directory":"{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres}","service_directory_claims":"{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=arw/postgres}"}$acls$::jsonb;
 actual jsonb;target text;sources text[]:=ARRAY['employer_claims','service_directory_claims','service_directory'];
BEGIN
 PERFORM 1 FROM public.account_deletion_controls WHERE id AND NOT worker_enabled FOR SHARE;
 IF NOT FOUND OR NOT public.account_deletion_private_barrier_current()OR NOT public.account_deletion_sourcing_barrier_current()OR NOT public.account_deletion_consent_barrier_current()OR NOT public.account_deletion_activity_barrier_current()
 OR public.account_access_coverage()IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)
 THEN RAISE EXCEPTION 'Review disabled business claim prerequisites';END IF;
 FOREACH target IN ARRAY sources LOOP
  EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE',target);
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=format('public.%I',target)::regclass AND relkind='r'AND NOT relispartition AND relrowsecurity)
   OR EXISTS(SELECT 1 FROM pg_inherits WHERE inhparent=format('public.%I',target)::regclass OR inhrelid=format('public.%I',target)::regclass)
   OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class=format('public.%I',target)::regclass)
   OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=format('public.%I',target)::regclass AND NOT tgisinternal AND NOT(tgname='account_deletion_consent_retention_writer'AND tgfoid='public.guard_account_deletion_consent_retention_writer()'::regprocedure AND tgenabled='O'AND tgtype=23 AND target IN('employer_claims','service_directory_claims')))
  THEN RAISE EXCEPTION 'Review business claim layout and hooks';END IF;
 END LOOP;
 SELECT jsonb_object_agg(relname,cols)INTO actual FROM(SELECT c.relname,jsonb_object_agg(a.attname,jsonb_build_array(replace(format_type(a.atttypid,a.atttypmod),'public.',''),a.attnotnull,replace(pg_get_expr(d.adbin,d.adrelid),'public.',''),a.attgenerated))cols
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE n.nspname='public'AND c.relname=ANY(sources)AND a.attnum>0 AND NOT a.attisdropped GROUP BY c.relname)r;
 IF actual IS DISTINCT FROM expected_columns THEN RAISE EXCEPTION 'Review business claim columns';END IF;
 SELECT jsonb_object_agg(replace(conrelid::regclass::text,'public.','')||'.'||conname,replace(pg_get_constraintdef(oid,true),'public.',''))INTO actual FROM pg_constraint WHERE contype<>'n'AND(conrelid IN('public.employer_claims'::regclass,'public.service_directory_claims'::regclass,'public.service_directory'::regclass)OR confrelid IN('public.employer_claims'::regclass,'public.service_directory_claims'::regclass,'public.service_directory'::regclass));
 IF actual IS DISTINCT FROM expected_constraints THEN RAISE EXCEPTION 'Review business claim relationships';END IF;

 SELECT jsonb_object_agg(c.relname,c.relacl::text)INTO actual FROM pg_class c WHERE c.oid IN('public.employer_claims'::regclass,'public.service_directory_claims'::regclass,'public.service_directory'::regclass);
 IF actual IS DISTINCT FROM expected_acls THEN RAISE EXCEPTION 'Review business claim permissions';END IF;
 SELECT jsonb_object_agg(replace(p.polrelid::regclass::text,'public.','')||'.'||p.polname,jsonb_build_array(p.polcmd,p.polpermissive,
 (SELECT jsonb_agg(CASE WHEN role_oid=0 THEN 'PUBLIC'ELSE pg_get_userbyid(role_oid)END ORDER BY role_oid)FROM unnest(p.polroles)role_oid),replace(pg_get_expr(p.polqual,p.polrelid),'public.',''),replace(pg_get_expr(p.polwithcheck,p.polrelid),'public.','')))INTO actual FROM pg_policy p WHERE p.polrelid IN('public.employer_claims'::regclass,'public.service_directory_claims'::regclass,'public.service_directory'::regclass);
 IF actual IS DISTINCT FROM expected_policies THEN RAISE EXCEPTION 'Review business claim policies';END IF;


END $$;



ALTER TABLE public.employer_claims DROP CONSTRAINT employer_claims_user_id_fkey,DROP CONSTRAINT employer_claims_reviewed_by_fkey,
 ADD CONSTRAINT employer_claims_user_id_fkey FOREIGN KEY(user_id)REFERENCES auth.users(id)ON DELETE RESTRICT,
 ADD CONSTRAINT employer_claims_reviewed_by_fkey FOREIGN KEY(reviewed_by)REFERENCES auth.users(id)ON DELETE RESTRICT;
ALTER TABLE public.service_directory_claims DROP CONSTRAINT service_directory_claims_user_id_fkey,DROP CONSTRAINT service_directory_claims_reviewed_by_fkey,
 ADD CONSTRAINT service_directory_claims_user_id_fkey FOREIGN KEY(user_id)REFERENCES auth.users(id)ON DELETE RESTRICT,
 ADD CONSTRAINT service_directory_claims_reviewed_by_fkey FOREIGN KEY(reviewed_by)REFERENCES auth.users(id)ON DELETE RESTRICT;
ALTER TABLE public.service_directory DROP CONSTRAINT service_directory_claimed_by_fkey,
 ADD CONSTRAINT service_directory_claimed_by_fkey FOREIGN KEY(claimed_by)REFERENCES auth.users(id)ON DELETE RESTRICT;
CREATE INDEX account_deletion_employer_claim_owner ON public.employer_claims(user_id,id);
CREATE INDEX account_deletion_employer_claim_reviewer ON public.employer_claims(reviewed_by,id);
CREATE INDEX account_deletion_service_claim_owner ON public.service_directory_claims(user_id,id);
CREATE INDEX account_deletion_service_claim_reviewer ON public.service_directory_claims(reviewed_by,id);
CREATE INDEX account_deletion_service_directory_owner ON public.service_directory(claimed_by,id);

CREATE FUNCTION public.account_deletion_business_claim_context(_user uuid)RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''AS $$
DECLARE context jsonb;BEGIN
 context:=nullif(current_setting('bluebird.business_claim_cleanup',true),'')::jsonb;
 IF context IS NULL OR context->>'user'IS DISTINCT FROM _user::text THEN RETURN false;END IF;
 RETURN public.account_deletion_lease_current((context->>'id')::uuid,_user,(context->>'lease')::uuid,'records')AND public.account_deletion_business_claim_barrier_current();
EXCEPTION WHEN OTHERS THEN RETURN false;END $$;

CREATE FUNCTION public.guard_account_deletion_business_claim_writer()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''SET lock_timeout='1s'AS $$
DECLARE member uuid;previous jsonb;item jsonb;BEGIN
 IF TG_OP='DELETE'THEN
  IF TG_TABLE_NAME='service_directory'THEN member:=OLD.claimed_by;ELSE member:=OLD.user_id;END IF;
  IF TG_TABLE_NAME<>'service_directory'AND public.account_deletion_business_claim_context(member)THEN RETURN OLD;END IF;
  IF member IS NOT NULL THEN PERFORM public.assert_member_private_record_writer(member);END IF;
  RETURN OLD;
 END IF;
 item:=to_jsonb(NEW);IF TG_OP='UPDATE'THEN previous:=to_jsonb(OLD);END IF;
 IF TG_TABLE_NAME='service_directory'THEN
  IF TG_OP='UPDATE'AND NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Directory identity is immutable';END IF;
  IF TG_OP='UPDATE'AND NEW.claimed_by IS NOT DISTINCT FROM OLD.claimed_by THEN
   IF NEW.claimed_at IS DISTINCT FROM OLD.claimed_at THEN RAISE EXCEPTION 'Claim assignment requires review';END IF;
   RETURN NEW; -- Normal provider enrichment is independent of member deletion.
  END IF;
  IF TG_OP='UPDATE'AND NEW.claimed_by IS NULL AND NEW.claimed_at IS NULL
   AND item-ARRAY['claimed_by','claimed_at','updated_at','phone_digits']=previous-ARRAY['claimed_by','claimed_at','updated_at','phone_digits']
   AND public.account_deletion_business_claim_context(OLD.claimed_by)THEN RETURN NEW;END IF;
  IF NEW.claimed_by IS NULL THEN
   IF TG_OP='UPDATE'AND OLD.claimed_by IS NOT NULL THEN RAISE EXCEPTION 'Claim assignment requires review';END IF;
   IF NEW.claimed_at IS NOT NULL THEN RAISE EXCEPTION 'Claim assignment requires review';END IF;
   RETURN NEW;
  END IF;
  IF TG_OP='UPDATE'AND OLD.claimed_by IS NOT NULL THEN RAISE EXCEPTION 'Claim assignment requires review';END IF;
  PERFORM public.assert_member_private_record_writer(NEW.claimed_by);
  IF NEW.claimed_at IS NULL OR NOT EXISTS(SELECT 1 FROM public.service_directory_claims WHERE directory_id=NEW.id AND user_id=NEW.claimed_by AND status='approved')
  THEN RAISE EXCEPTION 'Approved claim required';END IF;
 ELSE
  IF TG_OP='INSERT'AND(NEW.status<>'pending'OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL)THEN RAISE EXCEPTION 'New claim must await review';END IF;
  IF TG_OP='UPDATE'THEN
   IF item-ARRAY['status','reviewed_by','reviewed_at']IS DISTINCT FROM previous-ARRAY['status','reviewed_by','reviewed_at']
   THEN RAISE EXCEPTION 'Claim authorship is immutable';END IF;
   IF NEW.reviewed_by IS NULL AND OLD.reviewed_by IS NOT NULL
    AND item-'reviewed_by'=previous-'reviewed_by'
    AND public.account_deletion_business_claim_context(OLD.reviewed_by)THEN RETURN NEW;END IF;
   IF item IS DISTINCT FROM previous AND(NEW.status NOT IN('approved','rejected')OR NEW.reviewed_by IS DISTINCT FROM auth.uid()
    OR NEW.reviewed_at IS NULL OR NOT coalesce(public.has_role(auth.uid(),'admin'::public.app_role),false))
   THEN RAISE EXCEPTION 'Administrator review is required';END IF;
  END IF;
  FOR member IN SELECT DISTINCT m FROM unnest(ARRAY[NEW.user_id,NEW.reviewed_by,auth.uid()])m WHERE m IS NOT NULL ORDER BY m LOOP
   PERFORM public.assert_member_private_record_writer(member);
  END LOOP;
  IF auth.uid()IS NOT NULL AND NEW.reviewed_by IS NOT NULL AND NEW.reviewed_by IS DISTINCT FROM auth.uid()THEN RAISE EXCEPTION 'Reviewer identity is unavailable';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER account_deletion_business_claim_writer BEFORE INSERT OR UPDATE OR DELETE ON public.employer_claims FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_business_claim_writer();
CREATE TRIGGER account_deletion_business_claim_writer BEFORE INSERT OR UPDATE OR DELETE ON public.service_directory_claims FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_business_claim_writer();
CREATE TRIGGER account_deletion_business_claim_writer BEFORE INSERT OR UPDATE OR DELETE ON public.service_directory FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_business_claim_writer();

-- Approval and directory assignment are one transaction. A losing claimant,
-- hidden/removed business or deleting applicant cannot leave a false approval.
CREATE FUNCTION public.review_service_directory_claim(_claim_id uuid,_approve boolean)RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''SET lock_timeout='1s'AS $$
DECLARE actor uuid:=auth.uid();claim public.service_directory_claims;business public.service_directory;member uuid;BEGIN
 IF actor IS NULL OR _approve IS NULL OR NOT public.has_role(actor,'admin'::public.app_role)THEN RAISE EXCEPTION 'Administrator access required';END IF;
 SELECT * INTO claim FROM public.service_directory_claims WHERE id=_claim_id;
 IF NOT FOUND THEN RETURN false;END IF;
 FOR member IN SELECT DISTINCT m FROM unnest(ARRAY[claim.user_id,actor])m ORDER BY m LOOP PERFORM public.assert_member_private_record_writer(member);END LOOP;
 SELECT * INTO claim FROM public.service_directory_claims WHERE id=_claim_id FOR UPDATE;
 IF NOT FOUND OR claim.status<>'pending'THEN RETURN false;END IF;
 IF _approve THEN
  SELECT * INTO business FROM public.service_directory WHERE id=claim.directory_id FOR UPDATE;
  IF NOT FOUND OR business.hidden OR business.claimed_by IS NOT NULL THEN RAISE EXCEPTION 'Business is unavailable for this claim';END IF;
 END IF;
 UPDATE public.service_directory_claims SET status=CASE WHEN _approve THEN 'approved'ELSE 'rejected'END,reviewed_at=now(),reviewed_by=actor WHERE id=claim.id;
 IF _approve THEN UPDATE public.service_directory SET claimed_by=claim.user_id,claimed_at=now(),updated_at=now()WHERE id=claim.directory_id;END IF;
 RETURN true;
END $$;
CREATE FUNCTION public.review_employer_claim(_claim_id uuid,_approve boolean)RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''SET lock_timeout='1s'AS $$
DECLARE actor uuid:=auth.uid();claim public.employer_claims;member uuid;BEGIN
 IF actor IS NULL OR _approve IS NULL OR NOT public.has_role(actor,'admin'::public.app_role)THEN RAISE EXCEPTION 'Administrator access required';END IF;
 SELECT * INTO claim FROM public.employer_claims WHERE id=_claim_id;
 IF NOT FOUND THEN RETURN false;END IF;
 FOR member IN SELECT DISTINCT m FROM unnest(ARRAY[claim.user_id,actor])m ORDER BY m LOOP PERFORM public.assert_member_private_record_writer(member);END LOOP;
 PERFORM pg_advisory_xact_lock(hashtextextended('bluebird:employer-claim:'||claim.employer_key,0));
 SELECT * INTO claim FROM public.employer_claims WHERE id=_claim_id FOR UPDATE;
 IF NOT FOUND OR claim.status<>'pending'THEN RETURN false;END IF;
 IF _approve AND EXISTS(SELECT 1 FROM public.employer_claims WHERE employer_key=claim.employer_key AND status='approved'AND id<>claim.id)THEN RAISE EXCEPTION 'Business is unavailable for this claim';END IF;
 UPDATE public.employer_claims SET status=CASE WHEN _approve THEN 'approved'ELSE 'rejected'END,reviewed_at=now(),reviewed_by=actor WHERE id=claim.id;
 RETURN true;
END $$;

CREATE FUNCTION public.account_deletion_business_claim_remaining(_user uuid)RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$
 SELECT EXISTS(SELECT 1 FROM public.employer_claims WHERE user_id=_user OR reviewed_by=_user)
 OR EXISTS(SELECT 1 FROM public.service_directory_claims WHERE user_id=_user OR reviewed_by=_user)
 OR EXISTS(SELECT 1 FROM public.service_directory WHERE claimed_by=_user);
$$;
CREATE FUNCTION public.account_deletion_business_claim_scope(_id uuid,_user uuid,_lease uuid,_phase text)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''SET lock_timeout='1s'AS $$BEGIN
 PERFORM public.account_deletion_consent_scope(_id,_user,_lease,_phase);
 LOCK TABLE public.employer_claims,public.service_directory_claims,public.service_directory IN ROW EXCLUSIVE MODE;
 IF NOT public.account_deletion_business_claim_barrier_current()THEN RAISE EXCEPTION 'Business claim erasure requires schema review';END IF;
END $$;
CREATE FUNCTION public.purge_account_deletion_business_claims(_id uuid,_user uuid,_lease uuid,_limit integer DEFAULT 100)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''SET lock_timeout='1s'AS $$
DECLARE source text;mode text;changed integer:=0;previous_context text:=coalesce(current_setting('bluebird.business_claim_cleanup',true),'');BEGIN
 IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Business claim erasure unavailable';END IF;
 PERFORM public.account_deletion_business_claim_scope(_id,_user,_lease,'records');
 PERFORM set_config('bluebird.business_claim_cleanup',jsonb_build_object('id',_id,'user',_user,'lease',_lease)::text,true);
 -- Directory identity is independent provider inventory. Retire only this
 -- account's assignment; do not delete or refresh the business or other claims.
 WITH targets AS(SELECT id FROM public.service_directory WHERE claimed_by=_user ORDER BY id LIMIT _limit FOR UPDATE),
 retired AS(UPDATE public.service_directory d SET claimed_by=NULL,claimed_at=NULL,updated_at=now()FROM targets t WHERE d.id=t.id RETURNING 1)SELECT count(*)::integer INTO changed FROM retired;
 IF changed>0 THEN source:='service_directory';mode:='assignment';ELSE
  FOREACH source IN ARRAY ARRAY['employer_claims','service_directory_claims']LOOP
   EXECUTE format('WITH targets AS(SELECT id FROM public.%I WHERE user_id=$1 ORDER BY id LIMIT $2 FOR UPDATE),erased AS(DELETE FROM public.%I c USING targets t WHERE c.id=t.id RETURNING 1)SELECT count(*)::integer FROM erased',source,source)INTO changed USING _user,_limit;
   IF changed>0 THEN mode:='owned';EXIT;END IF;
   EXECUTE format('WITH targets AS(SELECT id FROM public.%I WHERE reviewed_by=$1 AND user_id<>$1 ORDER BY id LIMIT $2 FOR UPDATE),retired AS(UPDATE public.%I c SET reviewed_by=NULL FROM targets t WHERE c.id=t.id RETURNING 1)SELECT count(*)::integer FROM retired',source,source)INTO changed USING _user,_limit;
   IF changed>0 THEN mode:='reviewer';EXIT;END IF;
  END LOOP;
 END IF;
 PERFORM set_config('bluebird.business_claim_cleanup',previous_context,true);
 IF NOT public.account_deletion_lease_current(_id,_user,_lease,'records')OR NOT public.account_deletion_business_claim_barrier_current()
 OR public.account_access_coverage()IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)THEN RAISE EXCEPTION 'Business claim erasure unavailable';END IF;
 RETURN jsonb_build_object('source',CASE WHEN changed=0 THEN NULL ELSE source END,'mode',mode,'changed',changed,'pass_done',NOT public.account_deletion_business_claim_remaining(_user));
END $$;
CREATE FUNCTION public.verify_account_deletion_business_claims(_id uuid,_user uuid,_lease uuid)RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''AS $$BEGIN
 PERFORM public.account_deletion_business_claim_scope(_id,_user,_lease,'verification');
 RETURN NOT public.account_deletion_business_claim_remaining(_user)AND public.account_deletion_lease_current(_id,_user,_lease,'verification');
END $$;
CREATE FUNCTION public.guard_account_deletion_business_claim_completion()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''AS $$BEGIN
 IF NEW.status='completed'AND(NOT public.account_deletion_business_claim_barrier_current()OR public.account_deletion_business_claim_remaining(OLD.user_id))THEN RAISE EXCEPTION 'Business claim verification required';END IF;RETURN NEW;
END $$;
CREATE TRIGGER guard_account_deletion_business_claim_completion AFTER UPDATE OF status,user_id ON public.account_deletion_jobs FOR EACH ROW EXECUTE FUNCTION public.guard_account_deletion_business_claim_completion();

CREATE FUNCTION public.account_deletion_business_claim_catalog()RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''SET TimeZone='UTC'AS $$
 WITH sources AS(SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname=ANY(ARRAY['employer_claims','service_directory_claims','service_directory']))
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

CREATE TABLE public.account_deletion_business_claim_contract(id boolean PRIMARY KEY DEFAULT true CHECK(id),catalog jsonb NOT NULL,functions jsonb NOT NULL);
ALTER TABLE public.account_deletion_business_claim_contract ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_business_claim_contract FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.account_deletion_business_claim_contract TO service_role;
CREATE FUNCTION public.account_deletion_business_claim_functions()RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$
 SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_array(md5(pg_get_functiondef(p.oid)),p.prosecdef,p.proconfig,p.proacl::text))FROM pg_proc p WHERE p.oid IN(to_regprocedure('public.account_deletion_business_claim_context(uuid)'),to_regprocedure('public.guard_account_deletion_business_claim_writer()'),to_regprocedure('public.review_service_directory_claim(uuid,boolean)'),to_regprocedure('public.review_employer_claim(uuid,boolean)'),to_regprocedure('public.account_deletion_business_claim_remaining(uuid)'),to_regprocedure('public.account_deletion_business_claim_scope(uuid,uuid,uuid,text)'),to_regprocedure('public.purge_account_deletion_business_claims(uuid,uuid,uuid,integer)'),to_regprocedure('public.verify_account_deletion_business_claims(uuid,uuid,uuid)'),to_regprocedure('public.guard_account_deletion_business_claim_completion()'),to_regprocedure('public.account_deletion_business_claim_catalog()'),to_regprocedure('public.account_deletion_business_claim_functions()'),to_regprocedure('public.account_deletion_business_claim_barrier_current()'),to_regprocedure('public.assert_member_private_record_writer(uuid)'));
$$;
CREATE FUNCTION public.account_deletion_business_claim_barrier_current()RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=''AS $$
 SELECT EXISTS(SELECT 1 FROM public.account_deletion_business_claim_contract WHERE id AND catalog=public.account_deletion_business_claim_catalog()AND functions=public.account_deletion_business_claim_functions());
$$;
REVOKE ALL ON FUNCTION public.account_deletion_business_claim_context(uuid),public.guard_account_deletion_business_claim_writer(),public.review_service_directory_claim(uuid,boolean),public.review_employer_claim(uuid,boolean),public.account_deletion_business_claim_remaining(uuid),public.account_deletion_business_claim_scope(uuid,uuid,uuid,text),public.purge_account_deletion_business_claims(uuid,uuid,uuid,integer),public.verify_account_deletion_business_claims(uuid,uuid,uuid),public.guard_account_deletion_business_claim_completion(),public.account_deletion_business_claim_catalog(),public.account_deletion_business_claim_functions(),public.account_deletion_business_claim_barrier_current()FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.purge_account_deletion_business_claims(uuid,uuid,uuid,integer),public.verify_account_deletion_business_claims(uuid,uuid,uuid)TO service_role;
GRANT EXECUTE ON FUNCTION public.review_service_directory_claim(uuid,boolean),public.review_employer_claim(uuid,boolean)TO authenticated;
SELECT public.protect_account_access_boundaries();
UPDATE public.account_deletion_private_contract SET hooks=public.account_deletion_private_hooks()WHERE id;
-- The preflight verified the previous consent contract before the five reviewed
-- Auth relationship changes; update only that explicit retention projection.
UPDATE public.account_deletion_consent_contract SET retention=public.account_deletion_consent_retention_catalog()WHERE id;
INSERT INTO public.account_deletion_business_claim_contract SELECT true,public.account_deletion_business_claim_catalog(),public.account_deletion_business_claim_functions();
DO $$BEGIN IF NOT public.account_deletion_business_claim_barrier_current()OR NOT public.account_deletion_consent_barrier_current()OR NOT public.account_deletion_private_barrier_current()
 OR public.account_access_coverage()IS DISTINCT FROM jsonb_build_object('unguarded_functions',0,'unguarded_tables',0,'helper_privilege_gaps',0)THEN RAISE EXCEPTION 'Business claim boundaries require review';END IF;END $$;

COMMIT;
