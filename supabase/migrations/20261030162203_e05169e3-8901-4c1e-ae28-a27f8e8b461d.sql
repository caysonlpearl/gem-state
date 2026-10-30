alter table public.avantlink_merchandise drop constraint if exists avantlink_merchandise_category_slug_check;
alter table public.avantlink_merchandise add constraint avantlink_merchandise_category_slug_check
  check (category_slug in ('apparel-accessories','outdoor-sporting','tools-equipment','firearms'));