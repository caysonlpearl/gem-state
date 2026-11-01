import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {directoryHomeCards} from "../src/lib/service-directory.server.ts";
import {servicesShowcaseRows} from "../src/config/landing-service-rows.ts";
import {buildHomepageSnapshot} from "../src/lib/homepage-snapshot-build.server.ts";
import {HOME_SOURCE_KEYS,HOME_MAX_STALE_MS} from "../src/lib/homepage-snapshot-contract.ts";

const read = p => readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration = read('supabase/migrations/20261101090000_bulk_homepage_previews.sql');
test("bulk sampling keeps active/age, visibility and privilege boundaries", () => {
  assert.match(migration,/m\.active/);
  assert.match(migration,/source_refreshed_at >= now\(\) - interval '7 days'/);
  assert.match(migration,/where not d\.hidden and d\.state = 'ID'/);
  assert.match(migration,/d\.trades @> array\[wanted\.trade\]/);
  assert.doesNotMatch(migration,/accepted_count|security definer|txtLongDescription|strProductContentWidgetScript/i);
  for (const signature of ['homepage_merchandise_previews\\(integer\\)','homepage_service_previews\\(text\\[\\], integer\\)']) {
    assert.match(migration,new RegExp('revoke all on function public\\.'+signature+' from public, anon, authenticated'));
    assert.match(migration,new RegExp('grant execute on function public\\.'+signature+' to service_role'));
  }
});

test("every service trade is read in a single background request without external calls", async t => {
  t.mock.method(globalThis,'fetch',()=>{throw Error('must not call a provider');});
  const trades=servicesShowcaseRows.map(r=>new URL(r.href,'https://onbluebird.com').searchParams.get('serviceSubcategory'));
  const calls=[];
  const db={rpc(name,args){calls.push({name,args});const q=Promise.resolve({data:trades.map((trade,n)=>({id:'fsq-'+String(n).padStart(24,'0'),name:'Business '+n,trade,trades:[trade],city:'Boise',state:'ID',imported_at:'2026-10-31T00:00:00Z'})),error:null});q.select=()=>q;q.abortSignal=()=>q;q.retry=()=>q;return q;}};
  const cards=await directoryHomeCards([...trades,trades[0]],db);
  assert.equal(calls.length,1);
  assert.equal(calls[0].name,'homepage_service_previews');
  assert.deepEqual(calls[0].args.p_trades,trades);
  assert.equal(cards.length,14);
  assert.equal(new Set(cards.flatMap(c=>c.directory.trades)).size,14);
});

test("repeated background refreshes preserve coverage beyond the old six-hour fallback", async () => {
  let now=Date.now();
  const sources=Object.fromEntries(HOME_SOURCE_KEYS.map(k=>[k,async()=>({cards:[]})]));
  const saved={id:'saved',title:'Available',priceCents:1000,categorySlug:'tools-equipment',createdAt:new Date(now).toISOString(),isFeatured:false,city:'',state:'',vehicle:null};
  sources.merchandise=async()=>({cards:[saved]});
  sources.services=async()=>({cards:[{...saved,id:'service',categorySlug:'services',city:'Boise',state:'ID',service:{subcategory:'Plumbers'}}]});
  const first=await buildHomepageSnapshot(null,{sources,removed:async()=>new Set(),now});
  now+=HOME_MAX_STALE_MS+60_000;
  const next=await buildHomepageSnapshot(first,{sources,removed:async()=>new Set(),now});
  assert.equal(next.sections.merchandise.cards[0].id,'saved');
  assert.equal(next.sections.services.cards[0].id,'service');
  assert.equal(next.sections.merchandise.updatedAt,now);
  assert.deepEqual(next.sourceFailures,{});
  sources.merchandise=async()=>{throw Error('Too many subrequests secret-must-not-be-published');};
  const failed=await buildHomepageSnapshot(next,{sources,removed:async()=>new Set(),now:now+1000});
  assert.equal(failed.sections.merchandise.updatedAt,now);
  assert.equal(failed.sourceFailures.merchandise.reason,'request_limit');
  assert.ok(!JSON.stringify(failed).includes('secret-must-not-be-published'));
});
