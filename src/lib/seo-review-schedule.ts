export type SeoReviewPeriod = { key: string; days: number; until: number };

/** Closed UTC periods, released after 9am in Boise. Weekly on Mondays;
 * calendar-month reports on the first. No partial period is called complete. */
export function dueSeoReviewPeriods(now = Date.now()): SeoReviewPeriod[] {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Boise",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(now));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const year = Number(value("year")),
    month = Number(value("month")),
    day = Number(value("day"));
  const end = Date.UTC(year, month - 1, day);
  const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
  const beforeMorning = Number(value("hour")) < 9;
  let weekEnd = end - ((new Date(end).getUTCDay() + 6) % 7) * 86_400_000;
  if (value("weekday") === "Mon" && beforeMorning) weekEnd -= 7 * 86_400_000;
  const monthEnd = Date.UTC(year, month - 1 - (day === 1 && beforeMorning ? 1 : 0), 1);
  const monthEndDate = new Date(monthEnd);
  const monthStart = Date.UTC(monthEndDate.getUTCFullYear(), monthEndDate.getUTCMonth() - 1, 1);
  // Reconsider the latest eligible periods on later maintenance runs. An
  // outage at the scheduled time can catch up; immutable keys prevent repeats.
  return [
    { key: `weekly-${iso(weekEnd)}`, days: 7, until: weekEnd },
    {
      key: `monthly-${iso(monthEnd)}`,
      days: Math.round((monthEnd - monthStart) / 86_400_000),
      until: monthEnd,
    },
  ];
}
