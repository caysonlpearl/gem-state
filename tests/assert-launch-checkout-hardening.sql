begin;

do $$
begin
  if has_function_privilege('authenticated', 'public.request_sourcing_ask(uuid)', 'EXECUTE') then
    raise exception 'legacy unpaid sourcing Ask request remains executable';
  end if;
  if has_function_privilege('authenticated', 'public.accept_shopper_quote(uuid)', 'EXECUTE') then
    raise exception 'legacy unpaid custom shopper quote acceptance remains executable';
  end if;
  if position(
    'stripe_checkout_session_id IS NULL' in
    pg_get_functiondef('public.release_expired_reservations()'::regprocedure)
  ) = 0 then
    raise exception 'Stripe Checkout reservations can still be timer-released';
  end if;
  if position(
    'IF o.payment_authorized IS NOT TRUE' in
    pg_get_functiondef('public.open_dispute(uuid,text)'::regprocedure)
  ) = 0 then
    raise exception 'unpaid orders can still open disputes';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.reserve_shipping_label_purchase(uuid,text,integer)',
    'EXECUTE'
  ) then
    raise exception 'seller label-purchase reservation is unavailable';
  end if;
end
$$;

rollback;
