import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { createPrivateKey, sign } from "node:crypto";
import { connect } from "node:http2";
import { pathToFileURL } from "node:url";
import { prepareMobilePush, pushRetryDelay } from "../../src/lib/mobile-push.ts";

const b64 = (value) =>
  Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
function jwt(header, claims, key, algorithm) {
  const body = `${b64(header)}.${b64(claims)}`;
  return `${body}.${sign(algorithm, Buffer.from(body), { key: createPrivateKey(key), dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}
let googleAccess;
async function googleToken(config) {
  if (googleAccess?.expires > Date.now() + 60000) return googleAccess.token;
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt(
    { alg: "RS256", typ: "JWT" },
    {
      iss: config.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    },
    config.private_key,
    "RSA-SHA256",
  );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error("push_provider_auth_failed");
  const result = await response.json();
  googleAccess = { token: result.access_token, expires: Date.now() + result.expires_in * 1000 };
  return googleAccess.token;
}
export function createPushSender(config) {
  return async (device, payload, eventId) => {
    if (device.platform === "android") {
      if (!config.firebase) throw Error("firebase_credentials_missing");
      const token = await googleToken(config.firebase);
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.firebase.project_id)}/messages:send`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: {
              token: device.token,
              notification: { title: payload.title, body: payload.body },
              data: { url: payload.url, eventId },
              android: {
                collapse_key: eventId,
                notification: { tag: eventId, channel_id: "bluebird_updates" },
              },
            },
          }),
          signal: AbortSignal.timeout(15000),
        },
      );
      const result = await response.json().catch(() => ({}));
      const invalid = result.error?.details?.some((d) => d.errorCode === "UNREGISTERED");
      return { sent: response.ok, invalidToken: invalid === true };
    }
    if (!config.apns) throw Error("apns_credentials_missing");
    const now = Math.floor(Date.now() / 1000);
    const token = jwt(
      { alg: "ES256", kid: config.apns.keyId },
      { iss: config.apns.teamId, iat: now },
      config.apns.privateKey,
      "sha256",
    );
    return new Promise((resolve, reject) => {
      const client = connect(
        config.apns.sandbox ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com",
      );
      const timeout = setTimeout(() => {
        client.destroy();
        reject(Error("apns_timeout"));
      }, 15000);
      client.on("error", () => {
        clearTimeout(timeout);
        client.destroy();
        reject(Error("apns_connection_failed"));
      });
      const req = client.request({
        ":method": "POST",
        ":path": `/3/device/${device.token}`,
        authorization: `bearer ${token}`,
        "apns-topic": "com.onbluebird.marketplace",
        "apns-push-type": "alert",
        "apns-collapse-id": eventId,
        "apns-id": eventId,
        "apns-expiration": String(now + 3600),
      });
      let status = 0,
        body = "";
      req.on("response", (headers) => {
        status = Number(headers[":status"]);
      });
      req.setEncoding("utf8");
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("error", () => {
        clearTimeout(timeout);
        client.destroy();
        reject(Error("apns_request_failed"));
      });
      req.on("end", () => {
        clearTimeout(timeout);
        client.close();
        let reason;
        try {
          reason = JSON.parse(body).reason;
        } catch {
          /* successful responses have no body */
        }
        resolve({
          sent: status === 200,
          invalidToken: status === 410 && reason === "Unregistered",
        });
      });
      req.end(
        JSON.stringify({
          aps: { alert: { title: payload.title, body: payload.body }, sound: "default", badge: 1 },
          url: payload.url,
          eventId,
        }),
      );
    });
  };
}
async function eligiblePush(db, row, listing, now) {
  const [notification, device, account, prefs, deletion, controls, queue] = await Promise.all([
    db
      .from("notifications")
      .select("id,user_id,kind,entity_id,destination_url,read_at,created_at")
      .eq("id", row.notification_id)
      .maybeSingle(),
    db
      .from("mobile_push_devices")
      .select("id,user_id,token,platform")
      .eq("id", row.device_id)
      .maybeSingle(),
    db.from("shopping_accounts").select("shopping_alerts").eq("user_id", row.user_id).maybeSingle(),
    db
      .from("account_notification_preferences")
      .select("message_alerts")
      .eq("user_id", row.user_id)
      .maybeSingle(),
    db.from("mobile_account_deletions").select("status").eq("user_id", row.user_id).maybeSingle(),
    db.from("mobile_controls").select("push_enabled").eq("id", true).single(),
    db
      .from("mobile_push_outbox")
      .select("status,lease_id,lease_until")
      .eq("id", row.id)
      .maybeSingle(),
  ]);
  if ([notification, device, account, prefs, deletion, controls, queue].some((r) => r.error))
    throw Error("push_eligibility_unavailable");
  const n = notification.data,
    d = device.data,
    q = queue.data;
  if (
    !n ||
    !d ||
    n.user_id !== row.user_id ||
    d.user_id !== row.user_id ||
    !controls.data?.push_enabled ||
    q?.status !== "processing" ||
    q.lease_id !== row.lease_id ||
    Date.parse(q.lease_until) <= now()
  )
    return null;
  let listingId,
    blocked = false;
  if (n.kind === "message") {
    const c = await db
      .from("conversations")
      .select(
        "id,listing_id,dealer_inventory_record_id,buyer_id,seller_id,conversation_participants(user_id,blocked_at)",
      )
      .eq("id", n.entity_id)
      .maybeSingle();
    if (c.error) throw Error("push_conversation_unavailable");
    const conversation = c.data,
      participants = conversation?.conversation_participants;
    blocked =
      !conversation ||
      ![conversation.buyer_id, conversation.seller_id].includes(row.user_id) ||
      !Array.isArray(participants) ||
      !participants.some((p) => p.user_id === row.user_id) ||
      participants.some((p) => p.blocked_at);
    if (conversation)
      listingId = conversation.dealer_inventory_record_id
        ? `dealerfeed-${conversation.dealer_inventory_record_id}`
        : conversation.listing_id;
  } else {
    const path = new URL(n.destination_url, "https://onbluebird.com").pathname;
    if (path.startsWith("/listings/")) listingId = path.slice(10);
  }
  if (!listingId || (listing && listing.id !== listingId)) return null;
  // First pass resolves only the reference. Second pass repeats all mutable
  // checks after the cached listing lookup and immediately before provider I/O.
  if (!listing) return { listingId };
  const payload = prepareMobilePush(
    {
      kind: n.kind,
      readAt: n.read_at,
      createdAt: n.created_at,
      userId: row.user_id,
      deviceUserId: d.user_id,
      destination: new URL(n.destination_url, "https://onbluebird.com").href,
      listing,
      shoppingAlerts: account.data?.shopping_alerts === true,
      messageAlerts: prefs.data?.message_alerts !== false,
      blocked,
      deletionRequested: Boolean(deletion.data),
    },
    now(),
  );
  return payload ? { device: d, payload } : null;
}
export async function runMobilePushWorker({ db, send, lookupListing, now = Date.now, max = 50 }) {
  const counts = { sent: 0, suppressed: 0, retried: 0 };
  for (let i = 0; i < max; i++) {
    const claimed = await db.rpc("claim_mobile_push_delivery");
    if (claimed.error) throw Error("push_queue_unavailable");
    const row = claimed.data?.[0];
    if (!row) break;
    const finish = async (values) => {
      const result = await db
        .from("mobile_push_outbox")
        .update({ ...values, lease_until: null })
        .eq("id", row.id)
        .eq("lease_id", row.lease_id)
        .eq("status", "processing");
      if (result.error) throw Error("push_acknowledgement_failed");
    };
    try {
      const reference = await eligiblePush(db, row, null, now);
      const listing = reference ? await lookupListing(reference.listingId) : null;
      const latest = listing ? await eligiblePush(db, row, listing, now) : null;
      if (!latest?.payload) {
        await finish({ status: "suppressed" });
        counts.suppressed++;
        continue;
      }
      const outcome = await send(latest.device, latest.payload, row.id);
      if (outcome.invalidToken) {
        const removed = await db
          .from("mobile_push_devices")
          .delete()
          .eq("id", latest.device.id)
          .eq("user_id", row.user_id);
        if (removed.error) throw Error("push_device_cleanup_failed");
        counts.suppressed++;
        continue;
      }
      if (!outcome.sent) throw Error("push_provider_retry");
      await finish({ status: "sent", sent_at: new Date(now()).toISOString() });
      counts.sent++;
    } catch {
      await finish({
        status: row.attempts >= 8 ? "failed" : "pending",
        available_at: new Date(now() + pushRetryDelay(row.attempts) * 1000).toISOString(),
      });
      counts.retried++;
    }
  }
  return counts;
}
async function main() {
  const path = process.env.BLUEBIRD_MOBILE_PUSH_CONFIG;
  if (!path) throw Error("private_push_config_required");
  const config = JSON.parse(await readFile(path, "utf8"));
  const db = createClient(config.supabaseUrl, config.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const send = createPushSender(config);
  const lookupListing = async (id) => {
    const response = await fetch(
      `https://onbluebird.com/api/mobile/v1/listings/${encodeURIComponent(id)}`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (response.status === 404) return null;
    if (!response.ok) throw Error("push_listing_unavailable");
    return (await response.json()).data;
  };
  const result = await runMobilePushWorker({ db, send, lookupListing });
  console.log(JSON.stringify(result));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => {
    console.error("mobile_push_worker_failed");
    process.exitCode = 1;
  });
