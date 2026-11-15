import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { installShoppingDatabase } from "./shopping-database.mjs";
export const rankingReviewMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20261115150000_shopping_reviewed_ranking.sql",
    import.meta.url,
  ),
  "utf8",
);
export async function installRankingReview(db) {
  await installShoppingDatabase(db);
  await db.exec(`alter table auth.users add column deleted_at timestamptz,add column banned_until timestamptz;
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);
    create table public.mobile_account_deletions(user_id uuid,requested_at timestamptz default now());
    create table public.account_deletion_jobs(user_id uuid,status text,requested_at timestamptz default now());
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
    grant usage on schema auth to anon,authenticated;
    create type public.app_role as enum('admin','user');
    create table public.ranking_test_roles(user_id uuid,role public.app_role);
    create function public.has_role(_user_id uuid,_role public.app_role) returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$select exists(select 1 from public.ranking_test_roles where user_id=_user_id and role=_role)$$;
    revoke all on function public.has_role(uuid,public.app_role) from public,anon;
    grant execute on function public.has_role(uuid,public.app_role) to authenticated;`);
  await db.exec(
    readFileSync(
      new URL(
        "../../supabase/migrations/20261113120000_account_access_boundaries.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(rankingReviewMigration);
  const user = randomUUID(),
    session = randomUUID();
  await db.query("insert into auth.users(id)values($1);", [user]);
  await db.query("insert into auth.sessions(id,user_id)values($1,$2)", [session, user]);
  await db.query("insert into public.ranking_test_roles values($1,'admin')", [user]);
  return {
    user,
    session,
    async asMember(client = db) {
      await client.query("select set_config('request.jwt.claims',$1,false)", [
        JSON.stringify({ role: "authenticated", sub: user, session_id: session }),
      ]);
      await client.exec("set role authenticated");
    },
  };
}
export const candidate = (version = "rules-v1") => ({
  baseline: {
    schema: "engagement-v1",
    modelVersion: version,
    weights: { visual: 3, budget: 1, location: 0.5, freshness: 1, engagement: 0 },
    accuracy: 0.5,
  },
  challenger: {
    schema: "engagement-v1",
    eligible: true,
    weights: { visual: 3, budget: 1, location: 0.5, freshness: 1, engagement: 1 },
    accuracy: 0.6,
    trainingPairs: 300,
    testPairs: 150,
  },
  outcomes: 40,
});
export async function insertCandidate(db, week = "2026-11-09", value = candidate()) {
  await db.query(
    "insert into public.shopping_model_evaluations(week,baseline,challenger,outcomes)values($1,$2,$3,$4)",
    [week, JSON.stringify(value.baseline), JSON.stringify(value.challenger), value.outcomes],
  );
}
