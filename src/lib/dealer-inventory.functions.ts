/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  calculateInventoryDiff,
  defaultInventoryMapping,
  parseAndNormalizeInventoryJson,
  parseAndNormalizeInventoryCsv,
  parseAndNormalizeInventoryXml,
  recordsForDatabase,
  type InventoryFileFormat,
  type InventoryMapping,
} from "@/lib/dealer-inventory";

const sourceInput = z.object({
  name: z.string().trim().min(2).max(120),
  providerName: z.string().trim().max(120).optional().nullable(),
  sourceType: z
    .enum(["manual_upload", "file_url", "sftp", "api", "webhook"])
    .default("manual_upload"),
  fileFormat: z.enum(["csv", "xml", "json"]).default("csv"),
  feedUrl: z.string().trim().url().optional().nullable(),
  schedule: z.string().trim().max(120).optional().nullable(),
  minimumRowCount: z.number().int().positive().max(1_000_000).default(1),
  deactivationGraceRuns: z.number().int().positive().max(30).default(2),
  mappingProfile: z.record(z.string(), z.string()).default({}),
  dealerId: z.string().uuid().optional().nullable(),
});

export type DealerInventorySourceSummary = {
  id: string;
  dealer_id: string | null;
  name: string;
  provider_name: string | null;
  source_type: string;
  file_format: string;
  feed_url: string | null;
  schedule: string | null;
  mapping_profile: Record<string, string>;
  minimum_row_count: number;
  deactivation_grace_runs: number;
  status: string;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
  created_at: string;
};

export type DealerInventorySyncRunSummary = {
  id: string;
  source_id: string;
  actor_user_id: string | null;
  mode: "dry_run" | "apply";
  status: "running" | "completed" | "failed" | "rejected";
  source_filename: string | null;
  started_at: string;
  finished_at: string | null;
  received_row_count: number;
  valid_row_count: number;
  invalid_row_count: number;
  created_count: number;
  updated_count: number;
  unchanged_count: number;
  stale_count: number;
  error_summary: Array<{ rowNumber?: number; field?: string; message?: string }>;
};

export type DealerInventoryRecordSummary = {
  id: string;
  source_record_key: string;
  title: string;
  vin: string | null;
  stock_number: string | null;
  inventory_status: string;
  price_cents: number | null;
  listing_id: string | null;
};

const feedInput = z.object({
  sourceId: z.string().uuid(),
  payload: z.string().min(1).max(5_000_000),
  filename: z.string().trim().max(255).optional(),
  dryRun: z.boolean().default(true),
});

function parseInventoryFeed(
  format: InventoryFileFormat,
  payload: string,
  mapping: InventoryMapping,
) {
  if (format === "json") return parseAndNormalizeInventoryJson(payload, mapping);
  if (format === "xml") return parseAndNormalizeInventoryXml(payload, mapping);
  return parseAndNormalizeInventoryCsv(payload, mapping);
}

async function requireAdmin(context: { supabase: unknown; userId: string }) {
  const { data, error } = await (context.supabase as any).rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Administrator access required.");
}

export const getDealerInventorySources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DealerInventorySourceSummary[]> => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("dealer_inventory_sources")
      .select(
        "id,dealer_id,name,provider_name,source_type,file_format,feed_url,schedule,mapping_profile,minimum_row_count,deactivation_grace_runs,status,last_success_at,last_error_at,last_error,created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as DealerInventorySourceSummary[];
  });

export const createDealerInventorySource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => sourceInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: source, error } = await (supabaseAdmin as any)
      .from("dealer_inventory_sources")
      .insert({
        owner_user_id: context.userId,
        dealer_id: data.dealerId || null,
        name: data.name,
        provider_name: data.providerName || null,
        source_type: data.sourceType,
        file_format: data.fileFormat,
        feed_url: data.feedUrl || null,
        schedule: data.schedule || null,
        minimum_row_count: data.minimumRowCount,
        deactivation_grace_runs: data.deactivationGraceRuns,
        mapping_profile: data.mappingProfile,
      })
      .select("id,name")
      .single();
    if (error) throw new Error(error.message);
    await (supabaseAdmin as any).from("dealer_audit_events").insert({
      dealer_id: data.dealerId || null,
      actor_user_id: context.userId,
      action: "inventory_source_created",
      target_type: "inventory_source",
      target_id: source.id,
      metadata: { fileFormat: data.fileFormat, sourceType: data.sourceType },
    });
    return source;
  });

export const getDealerInventorySyncRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ sourceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<DealerInventorySyncRunSummary[]> => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: runs, error } = await (supabaseAdmin as any)
      .from("dealer_inventory_sync_runs")
      .select(
        "id,source_id,actor_user_id,mode,status,source_filename,started_at,finished_at,received_row_count,valid_row_count,invalid_row_count,created_count,updated_count,unchanged_count,stale_count,error_summary",
      )
      .eq("source_id", data.sourceId)
      .order("started_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (runs ?? []) as DealerInventorySyncRunSummary[];
  });

export const setDealerInventorySourceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ sourceId: z.string().uuid(), status: z.enum(["active", "paused"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("dealer_inventory_sources")
      .update({ status: data.status })
      .eq("id", data.sourceId);
    if (error) throw new Error(error.message);
    const { data: source } = await (supabaseAdmin as any)
      .from("dealer_inventory_sources")
      .select("dealer_id")
      .eq("id", data.sourceId)
      .maybeSingle();
    await (supabaseAdmin as any).from("dealer_audit_events").insert({
      dealer_id: source?.dealer_id ?? null,
      actor_user_id: context.userId,
      action: "inventory_source_status_changed",
      target_type: "inventory_source",
      target_id: data.sourceId,
      metadata: { status: data.status },
    });
    return { sourceId: data.sourceId, status: data.status };
  });

export const getDealerInventoryRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ sourceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<DealerInventoryRecordSummary[]> => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: records, error } = await (supabaseAdmin as any)
      .from("dealer_inventory_records")
      .select("id,source_record_key,title,vin,stock_number,inventory_status,price_cents,dealer_inventory_listing_links(listing_id)")
      .eq("source_id", data.sourceId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (records ?? []).map((row: any) => ({ ...row, listing_id: row.dealer_inventory_listing_links?.[0]?.listing_id ?? null }));
  });

export const linkDealerInventoryRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ recordId: z.string().uuid(), listingId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const [{ data: record, error: recordError }, { data: listing, error: listingError }] = await Promise.all([
      admin.from("dealer_inventory_records").select("id").eq("id", data.recordId).maybeSingle(),
      admin.from("asks").select("id,status").eq("id", data.listingId).maybeSingle(),
    ]);
    if (recordError) throw new Error(recordError.message);
    if (listingError) throw new Error(listingError.message);
    if (!record) throw new Error("Inventory record not found.");
    if (!listing) throw new Error("Listing not found.");
    const { data: source, error: sourceError } = await admin
      .from("dealer_inventory_records")
      .select("source_id,dealer_inventory_sources(dealer_id)")
      .eq("id", data.recordId)
      .maybeSingle();
    if (sourceError) throw new Error(sourceError.message);
    const dealerId = source?.dealer_inventory_sources?.dealer_id ?? null;
    if (!dealerId) throw new Error("Associate the inventory source with a ready dealership before linking listings.");
    const { data: dealer, error: dealerError } = await admin
      .from("dealer_profiles")
      .select("id,status,agreements_accepted_at")
      .eq("id", dealerId)
      .maybeSingle();
    if (dealerError) throw new Error(dealerError.message);
    if (!dealer || dealer.status !== "ready" || !dealer.agreements_accepted_at) throw new Error("The dealership must be ready and agreement-accepted before inventory can go public.");
    const { error } = await admin.from("dealer_inventory_listing_links").upsert({ record_id: data.recordId, listing_id: data.listingId, link_type: "manual" }, { onConflict: "record_id" });
    if (error) throw new Error(error.message);
    const { error: listingErrorUpdate } = await admin.from("asks").update({ dealer_id: dealerId }).eq("id", data.listingId);
    if (listingErrorUpdate) throw new Error(listingErrorUpdate.message);
    await admin.from("dealer_audit_events").insert({
      dealer_id: dealerId,
      actor_user_id: context.userId,
      action: "inventory_listing_linked",
      target_type: "listing",
      target_id: data.listingId,
      metadata: { recordId: data.recordId, listingStatus: listing.status },
    });
    return { ok: true, listingStatus: listing.status, dealerId };
  });

export const previewDealerInventoryFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => feedInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: source, error } = await (supabaseAdmin as any)
      .from("dealer_inventory_sources")
      .select("id,file_format,mapping_profile,minimum_row_count")
      .eq("id", data.sourceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!source) throw new Error("Inventory source not found.");

    const result = parseInventoryFeed(source.file_format as InventoryFileFormat, data.payload, {
      ...defaultInventoryMapping,
      ...(source.mapping_profile ?? {}),
    } as InventoryMapping);
    const { data: existing, error: existingError } = await (supabaseAdmin as any)
      .from("dealer_inventory_records")
      .select("source_record_key,vin,content_hash,inventory_status")
      .eq("source_id", data.sourceId);
    if (existingError) throw new Error(existingError.message);

    const diff = calculateInventoryDiff(result.records, existing ?? []);
    const rejected = result.records.length < Number(source.minimum_row_count ?? 1);
    const { data: previewRun, error: previewRunError } = await (supabaseAdmin as any)
      .from("dealer_inventory_sync_runs")
      .insert({
        source_id: data.sourceId,
        actor_user_id: context.userId,
        mode: "dry_run",
        status: rejected ? "rejected" : "completed",
        source_filename: data.filename ?? null,
        source_checksum: result.records.map((record) => record.contentHash).join(":"),
        raw_payload: data.payload,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        received_row_count: result.rows.length,
        valid_row_count: result.records.length,
        invalid_row_count: result.errors.length,
        created_count: diff.created,
        updated_count: diff.updated,
        unchanged_count: diff.unchanged,
        stale_count: diff.stale,
        error_summary: result.errors.slice(0, 100),
      })
      .select("id")
      .single();
    if (previewRunError) throw new Error(previewRunError.message);
    return {
      runId: previewRun.id,
      filename: data.filename ?? null,
      headers: result.headers,
      receivedRowCount: result.rows.length,
      validRowCount: result.records.length,
      invalidRowCount: result.errors.length,
      errors: result.errors.slice(0, 100),
      duplicateKeys: result.duplicateKeys,
      duplicateVins: result.duplicateVins,
      rejected,
      rejectReason: rejected
        ? `Feed must contain at least ${source.minimum_row_count} valid row(s).`
        : null,
      diff,
      preview: result.records.slice(0, 25).map((record) => ({
        sourceRecordKey: record.sourceRecordKey,
        title: record.title,
        priceCents: record.priceCents,
        inventoryStatus: record.inventoryStatus,
        city: record.city,
        state: record.state,
        photoCount: record.media.length,
      })),
    };
  });

async function applyInventoryPayload(
  admin: any,
  context: { userId: string },
  data: { sourceId: string; filename?: string; dryRun: false },
  source: { id: string; dealer_id?: string | null; file_format: string; mapping_profile?: Record<string, string>; minimum_row_count?: number },
  payload: string,
) {
  const result = parseInventoryFeed(source.file_format as InventoryFileFormat, payload, {
    ...defaultInventoryMapping,
    ...(source.mapping_profile ?? {}),
  } as InventoryMapping);
  if (result.records.length < Number(source.minimum_row_count ?? 1)) {
    throw new Error(`Feed rejected: at least ${source.minimum_row_count} valid row(s) are required.`);
  }
  const checksum = result.records.map((record) => record.contentHash).join(":");
  const { data: run, error: runError } = await admin
    .from("dealer_inventory_sync_runs")
    .insert({
      source_id: data.sourceId,
      actor_user_id: context.userId,
      mode: "apply",
      status: "running",
      source_filename: data.filename ?? null,
      source_checksum: checksum,
      raw_payload: payload,
      received_row_count: result.rows.length,
      valid_row_count: result.records.length,
      invalid_row_count: result.errors.length,
      error_summary: result.errors.slice(0, 100),
    })
    .select("id")
    .single();
  if (runError) throw new Error(runError.message);
  const { data: reconciliation, error: reconciliationError } = await admin.rpc(
    "reconcile_dealer_inventory_records",
    { _source_id: data.sourceId, _run_id: run.id, _records: recordsForDatabase(result.records) },
  );
  if (reconciliationError) {
    await admin.from("dealer_inventory_sync_runs").update({ status: "failed", finished_at: new Date().toISOString(), error_summary: [{ message: reconciliationError.message }] }).eq("id", run.id);
    await admin.rpc("touch_dealer_inventory_source", { _source_id: data.sourceId, _ok: false, _error: reconciliationError.message });
    throw new Error(reconciliationError.message);
  }
  const summary = reconciliation ?? {};
  const { error: finishError } = await admin.from("dealer_inventory_sync_runs").update({
    status: "completed",
    finished_at: new Date().toISOString(),
    created_count: summary.createdCount ?? 0,
    updated_count: summary.updatedCount ?? 0,
    unchanged_count: summary.unchangedCount ?? 0,
    stale_count: summary.staleCount ?? 0,
  }).eq("id", run.id);
  if (finishError) throw new Error(finishError.message);
  await admin.rpc("touch_dealer_inventory_source", { _source_id: data.sourceId, _ok: true });
  await admin.from("dealer_audit_events").insert({
    dealer_id: source.dealer_id ?? null,
    actor_user_id: context.userId,
    action: "inventory_sync_applied",
    target_type: "inventory_sync_run",
    target_id: run.id,
    metadata: { created: summary.createdCount ?? 0, updated: summary.updatedCount ?? 0, stale: summary.staleCount ?? 0 },
  });
  return { runId: run.id, ...summary, validRowCount: result.records.length };
}

export const applyDealerInventoryFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => feedInput.extend({ dryRun: z.literal(false) }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: source, error: sourceError } = await admin
      .from("dealer_inventory_sources")
      .select("id,dealer_id,file_format,mapping_profile,minimum_row_count")
      .eq("id", data.sourceId)
      .maybeSingle();
    if (sourceError) throw new Error(sourceError.message);
    if (!source) throw new Error("Inventory source not found.");
    return applyInventoryPayload(admin, context, data, source, data.payload);
  });

export const runConfiguredDealerInventorySource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ sourceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: source, error } = await admin
      .from("dealer_inventory_sources")
      .select("id,dealer_id,file_format,mapping_profile,minimum_row_count,status,feed_url")
      .eq("id", data.sourceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!source) throw new Error("Inventory source not found.");
    if (!source.feed_url) throw new Error("Add an HTTPS feed URL before running a configured source.");
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(source.feed_url);
    } catch {
      throw new Error("The configured feed URL is invalid.");
    }
    if (parsedUrl.protocol !== "https:") throw new Error("Configured inventory sources must use HTTPS.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let response: Response;
    try {
      response = await fetch(parsedUrl, { signal: controller.signal, redirect: "error" });
    } catch (fetchError) {
      throw new Error(fetchError instanceof Error && fetchError.name === "AbortError" ? "The feed timed out after 15 seconds." : "The feed could not be reached.");
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}.`);
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > 5_000_000) throw new Error("Feed exceeds the 5 MB safety limit.");
    const payload = await response.text();
    if (payload.length === 0 || payload.length > 5_000_000) throw new Error("Feed is empty or exceeds the 5 MB safety limit.");
    const filename = parsedUrl.pathname.split("/").filter(Boolean).pop() || `remote-${source.file_format}`;
    return applyInventoryPayload(admin, context, { sourceId: data.sourceId, filename, dryRun: false }, source, payload);
  });
