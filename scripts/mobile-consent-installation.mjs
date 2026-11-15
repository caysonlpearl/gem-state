import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Keep the reviewed migration and its exact history in one transaction. */
export function mobileConsentInstallation(source) {
  const tag = "$bluebird_mobile_consent_source$";
  if (source.includes(tag) || !/\bBEGIN;/.test(source) || !/COMMIT;\s*$/.test(source))
    throw Error("Unexpected consent migration envelope");
  const hash = createHash("md5").update(source).digest("hex");
  const sql = source.replace(
    /COMMIT;\s*$/,
    () => `INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
VALUES('20261114190000','mobile_shopping_consent',ARRAY[${tag}${source}${tag}]) ON CONFLICT(version) DO NOTHING;
DO $history$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261114190000' AND name='mobile_shopping_consent' AND cardinality(statements)=1 AND md5(statements[1])='${hash}')
 THEN RAISE EXCEPTION 'Mobile consent migration history differs'; END IF;
END $history$;
COMMIT;\n`,
  );
  return { sql, sourceMd5: hash, version: "20261114190000", applied: false };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const directory = resolve(process.argv[2] ?? "output/mobile-consent-installation");
  const source = await readFile(
    new URL("../supabase/migrations/20261114190000_mobile_shopping_consent.sql", import.meta.url),
    "utf8",
  );
  const prepared = mobileConsentInstallation(source);
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, "apply-reviewed-mobile-consent.sql"), prepared.sql);
  const { sql, ...metadata } = prepared;
  await writeFile(
    resolve(directory, "prepared-consent-installation.json"),
    JSON.stringify(metadata, null, 2) + "\n",
  );
  console.log(JSON.stringify(metadata));
}
