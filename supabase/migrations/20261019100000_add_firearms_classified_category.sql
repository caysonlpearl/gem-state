-- Add firearms as a first-class classified category so it can be browsed and
-- selected by the existing generic classified listing flow.
INSERT INTO public.categories (slug, name, position)
VALUES ('firearms', 'Firearms', 72)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    position = EXCLUDED.position;
