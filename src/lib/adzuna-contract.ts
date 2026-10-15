import { z } from "zod";
import { usStates } from "../config/classifieds.ts";

export const adzunaSearchSchema = z.object({
  what: z.string().trim().max(120).default(""),
  where: z.string().trim().min(2).max(100).default("Idaho"),
  category: z.string().max(80).optional(),
  employment: z.enum(["full_time", "part_time", "contract"]).optional(),
  page: z.number().int().min(1).max(5).default(1),
});
export type AdzunaSearch = z.infer<typeof adzunaSearchSchema>;
export type AdzunaJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  city: string;
  state: string;
  createdAt: string;
  category: string;
  employmentType: "Full-time" | "Part-time" | "Contract" | "Not specified";
  description: string;
  url: string;
};
export type AdzunaResult = {
  status: "ok" | "unavailable" | "limited";
  jobs: AdzunaJob[];
  total: number;
};

// Treat all provider content as untrusted. Render plain text and accept only
// Adzuna application destinations; never pass through HTML or arbitrary URLs.
const plain = (value: unknown, max = 1000) =>
  typeof value === "string" ? value.replace(/<[^>]*>/g, "").slice(0, max) : "";

export function normalizeAdzunaResult(value: unknown): AdzunaResult {
  const source = value as { results?: unknown; count?: unknown } | null;
  if (!source || !Array.isArray(source.results)) throw new Error("Invalid job response");
  const jobs: AdzunaJob[] = [];
  const seen = new Set<string>();
  for (const item of source.results.slice(0, 50)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, any>;
    const id = plain(String(row.id ?? ""), 100);
    const title = plain(row.title, 240);
    let url: URL;
    try {
      url = new URL(row.redirect_url);
    } catch {
      continue;
    }
    if (
      !/^https?:$/.test(url.protocol) ||
      url.username ||
      url.password ||
      !(url.hostname === "adzuna.com" || url.hostname.endsWith(".adzuna.com"))
    )
      continue;
    url.protocol = "https:";
    if (!id || !title || seen.has(id)) continue;
    const area = Array.isArray(row.location?.area)
      ? row.location.area.map((v: unknown) => plain(v, 100))
      : [];
    const display = plain(row.location?.display_name, 200)
      .split(",")
      .map((v) => v.trim());
    const state = usStates.find(([code, name]) =>
      [...area, ...display].some((v) => v.toLowerCase() === name.toLowerCase() || v === code),
    )?.[0];
    // US hierarchy ends with the locality. A county-only result is not a city.
    const candidate = area.length >= 3 ? area[area.length - 1] : display[0];
    const city =
      candidate &&
      !/\b(county|parish)\b/i.test(candidate) &&
      !usStates.some(([code, name]) => candidate === code || candidate === name)
        ? candidate
        : "";
    if (!city || !state || !Number.isFinite(Date.parse(row.created))) continue;
    seen.add(id);
    jobs.push({
      id,
      title,
      company: plain(row.company?.display_name, 160),
      location: `${city}, ${state}`,
      city,
      state,
      createdAt: new Date(row.created).toISOString(),
      category: plain(row.category?.tag, 80),
      employmentType:
        row.contract_type === "contract"
          ? "Contract"
          : row.contract_time === "part_time"
            ? "Part-time"
            : row.contract_time === "full_time"
              ? "Full-time"
              : "Not specified",
      description: plain(row.description),
      url: url.toString(),
    });
  }
  return {
    status: "ok",
    jobs,
    total:
      typeof source.count === "number" && Number.isFinite(source.count)
        ? Math.max(jobs.length, Math.floor(source.count))
        : jobs.length,
  };
}
