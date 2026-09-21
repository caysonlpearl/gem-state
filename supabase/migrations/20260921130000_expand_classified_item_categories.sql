-- Give the generic Item flow a useful marketplace taxonomy while preserving
-- the existing top-level category slugs and listing records.
INSERT INTO public.categories (slug, name, position)
VALUES
  ('apparel-accessories', 'Apparel & Accessories', 61),
  ('baby-kids', 'Baby & Kids', 62),
  ('books-media', 'Books & Media', 63),
  ('collectibles', 'Collectibles', 64),
  ('crafts-hobbies', 'Crafts & Hobbies', 65),
  ('health-beauty', 'Health & Beauty', 66),
  ('home-garden', 'Home & Garden', 67),
  ('jewelry-watches', 'Jewelry & Watches', 68),
  ('musical-instruments', 'Musical Instruments', 69),
  ('office-business', 'Office & Business', 70),
  ('tickets-events', 'Tickets & Events', 71)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, position = EXCLUDED.position;
