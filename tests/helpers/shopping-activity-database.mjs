import { createClient } from "@supabase/supabase-js";
import { shoppingDatabaseFixture } from "./shopping-database.mjs";
const tables = new Set([
  "shopping_events",
  "shopping_favorites",
  "shopping_choices",
  "shopping_privacy",
  "shopping_controls",
  "mobile_account_deletions",
]);
const fields = new Set([
  "id",
  "subject",
  "user_id",
  "listing_id",
  "session_id",
  "kind",
  "search",
  "context",
  "occurred_at",
  "saved_at",
  "personalization",
  "advertising",
  "history_after",
  "status",
]);
export async function shoppingActivityDatabase(override) {
  const f = await shoppingDatabaseFixture();
  await f.db.exec("create table mobile_account_deletions(user_id uuid primary key,status text)");
  await f.db.query("select set_shopping_privacy($1,$2,true,false,'test')", [f.subject, f.user]);
  const calls = [];
  const client = createClient("https://activity.fixture.invalid", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (url, init) => {
        const u = new URL(url),
          q = u.searchParams,
          name = u.pathname.split("/").at(-1),
          rpc = u.pathname.includes("/rpc/");
        const call = { name, rpc, q, init };
        calls.push(call);
        const replacement = await override?.(call, f, calls);
        if (replacement) return replacement;
        const args = [],
          conditions = [];
        for (const [key, value] of q) {
          if (!fields.has(key) || key === "select" || key === "order") continue;
          const match = /^(eq|gte|gt)\.(.*)$/.exec(value);
          if (!match) throw Error("Unsupported fixture predicate");
          args.push(match[2]);
          conditions.push(
            `"${key}" ${match[1] === "eq" ? "=" : match[1] === "gt" ? ">" : ">="} $${args.length}`,
          );
        }
        let from;
        if (rpc) {
          const body = JSON.parse(init.body);
          if (name === "has_role") return Response.json(false);
          if (name !== "shopping_saved_interests") throw Error("Unreviewed fixture RPC");
          args.push(body.member_id);
          from = `public.shopping_saved_interests($${args.length})`;
        } else {
          if (!tables.has(name)) throw Error("Unreviewed fixture table");
          from = `public."${name}"`;
        }
        const where = conditions.length ? " where " + conditions.join(" and ") : "";
        if (!rpc && init.method === "POST") {
          const inserted = [];
          const body = JSON.parse(init.body);
          for (const row of Array.isArray(body) ? body : [body]) {
            const keys = Object.keys(row);
            if (keys.some((k) => !fields.has(k))) throw Error("Unreviewed fixture field");
            const values = keys.map((k) =>
              typeof row[k] === "object" && row[k] !== null ? JSON.stringify(row[k]) : row[k],
            );
            const conflict =
              name === "shopping_events"
                ? "(id) do nothing"
                : "(subject,listing_id) do update set saved_at=excluded.saved_at";
            inserted.push(
              ...(
                await f.db.query(
                  `insert into ${from} (${keys.map((k) => '"' + k + '"').join(",")}) values (${keys.map((_, i) => "$" + (i + 1)).join(",")}) on conflict ${conflict} returning *`,
                  values,
                )
              ).rows,
            );
          }
          return Response.json(inserted);
        }
        if (!rpc && init.method === "DELETE") {
          await f.db.query("delete from " + from + where, args);
          return new Response(null, { status: 204 });
        }
        const total = Number(
          (await f.db.query("select count(*) n from " + from + where, args)).rows[0].n,
        );
        const order = (q.get("order") || "")
          .split(",")
          .filter(Boolean)
          .map((part) => {
            const [field, dir] = part.split(".");
            if (!fields.has(field) || !["asc", "desc"].includes(dir))
              throw Error("Unreviewed fixture order");
            return '"' + field + '" ' + dir;
          });
        const offset = Number(q.get("offset") || 0),
          limit = Number(q.get("limit") || 100000);
        const rows = (
          await f.db.query(
            "select * from " +
              from +
              where +
              (order.length ? " order by " + order.join(",") : "") +
              ` offset ${offset} limit ${limit}`,
            args,
          )
        ).rows;
        const headers = {
          "content-range": `${offset}-${Math.max(offset, offset + rows.length - 1)}/${total}`,
        };
        if (init.method === "HEAD") return new Response(null, { headers });
        return Response.json(
          new Headers(init.headers).get("accept")?.includes("object+json")
            ? (rows[0] ?? null)
            : rows,
          { headers },
        );
      },
    },
  });
  return { ...f, client, calls };
}
