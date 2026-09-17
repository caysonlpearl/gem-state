CREATE OR REPLACE FUNCTION public._run_restore(batch integer DEFAULT 200)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  blob text;
  chunks_arr text[];
  i int;
  cur_row record;
  left_count int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public._restore_chunks WHERE id > 1) THEN
    SELECT body INTO blob FROM public._restore_chunks WHERE id = 1;
    IF blob IS NULL OR blob = '' THEN
      RETURN 0;
    END IF;
    chunks_arr := string_to_array(blob, E'\n<<>>\n');
    FOR i IN 1 .. array_length(chunks_arr, 1) LOOP
      INSERT INTO public._restore_chunks(id, body) VALUES (i + 1000000, chunks_arr[i]);
    END LOOP;
    DELETE FROM public._restore_chunks WHERE id = 1;
  END IF;
  FOR i IN 1 .. batch LOOP
    SELECT id, body INTO cur_row FROM public._restore_chunks WHERE id > 1 ORDER BY id LIMIT 1;
    EXIT WHEN NOT FOUND;
    BEGIN
      EXECUTE cur_row.body;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public._restore_errors(seq, stmt, err, state) VALUES (cur_row.id, left(cur_row.body, 500), SQLERRM, SQLSTATE);
    END;
    DELETE FROM public._restore_chunks WHERE id = cur_row.id;
  END LOOP;
  SELECT count(*) INTO left_count FROM public._restore_chunks WHERE id > 1;
  RETURN left_count;
END
$function$
