// Operator-only setup. All dealership/contact values come from a private file.
import { readFile, writeFile, rename } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { onboardDealer } from "../../src/lib/dealer-onboarding.server.ts";
import { dealerOnboardingSchema } from "../../src/lib/dealer-onboarding-contract.ts";

const credential = JSON.parse(await readFile("/etc/bluebird/inventory.json", "utf8"));
const setup = JSON.parse(await readFile(process.argv[2], "utf8"));
const profile = dealerOnboardingSchema.parse(setup.profile);
const admin = createClient(credential.url, credential.serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const check = (result) => {
  if (result.error) throw Error(result.error.message);
  return result.data;
};
if (!check(await admin.rpc("has_role", { _user_id: setup.actorId, _role: "admin" })))
  throw Error("An existing inventory administrator must perform onboarding.");
let sources = check(
  await admin
    .from("dealer_inventory_sources")
    .select("id,mapping_profile,source_type")
    .eq("provider_name", setup.providerName),
);
if (sources.length > 1) throw Error("Review duplicate source configuration.");
let source = sources[0];
if (
  source &&
  (source.source_type !== "sftp" || source.mapping_profile?.__dealer_id !== setup.providerDealerId)
)
  throw Error("Existing feed does not match this dealer/transport.");
if (!source)
  source = check(
    await admin
      .from("dealer_inventory_sources")
      .insert({
        owner_user_id: setup.actorId,
        name: setup.sourceName,
        provider_name: setup.providerName,
        source_type: "sftp",
        file_format: "csv",
        schedule: "every 4 hours",
        mapping_profile: { __provider: "overfuel", __dealer_id: setup.providerDealerId },
        minimum_row_count: setup.minimumRows,
        deactivation_grace_runs: 2,
        status: "paused",
      })
      .select("id")
      .single(),
  );
const publication = check(
  await admin
    .from("dealer_feed_publications")
    .select("slug,revoked_at,enabled")
    .eq("source_id", source.id)
    .maybeSingle(),
);
if (publication && (publication.slug !== profile.slug || publication.revoked_at))
  throw Error("Existing publication permission needs operator review.");
if (!publication)
  check(
    await admin.from("dealer_feed_publications").insert({
      source_id: source.id,
      slug: profile.slug,
      display_name: profile.displayName,
      website: profile.website,
      phone: profile.phone,
      address_line1: profile.address,
      city: profile.city,
      state: profile.state,
      postal_code: profile.postalCode,
      authorized_by: setup.actorId,
      authorization_reference: setup.permissionReference,
      enabled: false,
    }),
  );
const account = await onboardDealer(admin, setup.actorId, { ...profile, sourceId: source.id });
if (account.accountCreated)
  check(
    await admin.auth.admin.updateUserById(account.ownerUserId, {
      user_metadata: {
        display_name: profile.displayName,
        contact_name: setup.ownerName,
        contact_role: setup.ownerRole,
      },
    }),
  );
const configPath = "/etc/bluebird/sftp-inventory.json";
let configuration;
try {
  configuration = JSON.parse(await readFile(configPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  configuration = { sources: [] };
}
if (configuration.sources.some((s) => s.path === setup.incomingPath && s.sourceId !== source.id))
  throw Error("This incoming file is already assigned to another source.");
configuration.sources = [
  ...configuration.sources.filter((s) => s.sourceId !== source.id),
  { sourceId: source.id, path: setup.incomingPath },
];
await writeFile(configPath + ".tmp", JSON.stringify(configuration), { mode: 0o600 });
await rename(configPath + ".tmp", configPath);
check(
  await admin.from("dealer_inventory_sources").update({ status: "active" }).eq("id", source.id),
);
console.log(
  JSON.stringify({
    sourceId: source.id,
    ...account,
    publicationEnabled: publication?.enabled ?? false,
  }),
);
