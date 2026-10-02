export function scheduleIntervalMinutes(schedule: string | null): number | null {
  const value = schedule?.trim().toLowerCase() ?? "";
  if (!value) return null;
  const every = value.match(/every\s+(\d+)\s*(minute|minutes|hour|hours|day|days|week|weeks)/);
  if (every) {
    const amount = Number(every[1]);
    const unit = every[2];
    if (!Number.isFinite(amount) || amount <= 0) return null;
    if (unit.startsWith("minute")) return amount;
    if (unit.startsWith("hour")) return amount * 60;
    if (unit.startsWith("day")) return amount * 24 * 60;
    return amount * 7 * 24 * 60;
  }
  if (value === "hourly" || value === "hour") return 60;
  if (value === "daily" || value === "day") return 24 * 60;
  if (value === "weekly" || value === "week") return 7 * 24 * 60;
  if (/^daily at \d{1,2}(?::\d{2})?\s*(?:utc)?$/.test(value)) return 24 * 60;
  return null;
}

export function scheduleIsDue(
  schedule: string | null,
  lastSuccessAt: string | null,
  now: Date,
): boolean {
  const intervalMinutes = scheduleIntervalMinutes(schedule);
  if (!intervalMinutes) return false;
  const last = lastSuccessAt ? Date.parse(lastSuccessAt) : 0;
  if (last > 0 && now.getTime() - last < intervalMinutes * 60_000) return false;
  const value = schedule?.trim().toLowerCase() ?? "";
  const dailyAt = value.match(/^daily at (\d{1,2})(?::(\d{2}))?\s*(?:utc)?$/);
  if (!dailyAt) return true;
  const hour = Number(dailyAt[1]);
  const minute = Number(dailyAt[2] ?? "0");
  if (hour > 23 || minute > 59) return false;
  const scheduledToday = new Date(now);
  scheduledToday.setUTCHours(hour, minute, 0, 0);
  return now.getTime() >= scheduledToday.getTime();
}
