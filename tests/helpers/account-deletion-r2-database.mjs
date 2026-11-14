import { readFileSync } from "node:fs";
import { storageProviderDatabase } from "./account-deletion-storage-provider-database.mjs";
export const r2InventoryMigration = () =>
  readFileSync(
    new URL(
      "../../supabase/migrations/20261114090000_account_deletion_r2_inventory.sql",
      import.meta.url,
    ),
    "utf8",
  );
export async function r2InventoryDatabase() {
  const db = await storageProviderDatabase();
  await db.exec(r2InventoryMigration());
  return db;
}
export const r2FixtureConfig = () => ({
  accountId: "a".repeat(32),
  accessKeyId: "b".repeat(32),
  secretAccessKey: "c".repeat(64),
  buckets: { "listing-media": "fixture-listing-media", "ask-evidence": "fixture-ask-evidence" },
});
const escape = (value) =>
  String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
export function r2ListXml(url, hashes = [], { next = null, bytes = 100 } = {}) {
  const prefix = url.searchParams.get("prefix");
  return `<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
<Name>${url.pathname.slice(1)}</Name><Prefix>${encodeURIComponent(prefix)}</Prefix><EncodingType>url</EncodingType>
<MaxKeys>${url.searchParams.get("max-keys")}</MaxKeys><KeyCount>${hashes.length}</KeyCount><IsTruncated>${next !== null}</IsTruncated>
${url.searchParams.has("continuation-token") ? `<ContinuationToken>${escape(url.searchParams.get("continuation-token"))}</ContinuationToken>` : ""}
${next === null ? "" : `<NextContinuationToken>${escape(next)}</NextContinuationToken>`}
${hashes.map((hash) => `<Contents><Key>${encodeURIComponent(prefix + hash)}</Key><Size>${bytes}</Size><ETag>"${"e".repeat(32)}"</ETag><LastModified>2026-11-13T12:00:00.000Z</LastModified><Owner><DisplayName>PRIVATE-NAME</DisplayName></Owner></Contents>`).join("")}
</ListBucketResult>`;
}
export const r2XmlResponse = (xml) =>
  new Response(xml, { headers: { "content-type": "application/xml" } });
