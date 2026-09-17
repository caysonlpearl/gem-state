// TEMPORARY one-off restore endpoint — deleted after migration.
import { createFileRoute } from "@tanstack/react-router";

const RESTORE_TOKEN = "gsc-restore-9f2b7c4e1a8d";

export const Route = createFileRoute("/api/public/db-restore")({
  server: {
    handlers: {
      GET: async () => {
        const names = Object.keys(process.env).filter((k) =>
          /SUPABASE|PGHOST|PGUSER|PGDATABASE|PGPORT|DB_URL/i.test(k),
        );
        return new Response(JSON.stringify({ envNames: names }), {
          headers: { "Content-Type": "application/json" },
        });
      },
      POST: async ({ request }) => {
        if (request.headers.get("x-restore-token") !== RESTORE_TOKEN) {
          return new Response("Forbidden", { status: 403 });
        }
        const body = await request.text();
        if (!body.trim()) {
          return new Response("Empty body", { status: 400 });
        }
        let dbUrl = process.env["SUPABASE_DB_URL"] ?? "";
        if (!dbUrl) {
          return new Response(JSON.stringify({ error: "no db url in server env" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        const { Client } = await import("pg");
        const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
        try {
          await client.connect();
          if (new URL(request.url).searchParams.get("action") === "run") {
            const who = await client.query("select current_user as u");
            let remaining = -1;
            for (let i = 0; i < 40 && remaining !== 0; i += 1) {
              const res = await client.query("select public._run_restore(300) as r");
              remaining = Number(res.rows[0].r);
            }
            return new Response(
              JSON.stringify({ ok: true, user: who.rows[0].u, remaining }),
              { headers: { "Content-Type": "application/json" } },
            );
          }
          await client.query("DELETE FROM public._restore_chunks");
          await client.query("INSERT INTO public._restore_chunks (id, body) VALUES (1, $1)", [body]);
          return new Response(JSON.stringify({ ok: true, bytes: body.length }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          return new Response(
            JSON.stringify({ error: String((err as Error).message).slice(0, 2000) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        } finally {
          await client.end().catch(() => {});
        }
      },
    },
  },
});
