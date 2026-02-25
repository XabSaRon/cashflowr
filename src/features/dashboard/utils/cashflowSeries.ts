import type { IncomeFrequency } from "../../incomes/api/incomes.service";

type TimestampLike = { toDate: () => Date };
type Dateish = Date | string | number | TimestampLike | null | undefined;

export type IncomeRowLite = {
  amountCents?: number;
  frequency?: IncomeFrequency;
  scope?: "shared" | "personal";
  createdByUid?: string;
  date?: Dateish;
  endDate?: Dateish;
};

function isTimestampLike(v: unknown): v is TimestampLike {
  if (typeof v !== "object" || v === null) return false;

  const maybe = v as { toDate?: unknown };
  return typeof maybe.toDate === "function";
}

function toDateSafe(d: Dateish): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  if (isTimestampLike(d)) return d.toDate();
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function addMonthsClamped(d: Date, monthsToAdd: number) {
  const y0 = d.getFullYear();
  const m0 = d.getMonth();
  const target = new Date(y0, m0 + monthsToAdd, 1);
  const ty = target.getFullYear();
  const tm = target.getMonth();
  const day = Math.min(d.getDate(), daysInMonth(ty, tm));
  return new Date(ty, tm, day);
}

function nextOccurrence(d: Date, freq: IncomeFrequency) {
  switch (freq) {
    case "monthly":
      return addMonthsClamped(d, 1);
    case "quarterly":
      return addMonthsClamped(d, 3);
    case "yearly":
      return addMonthsClamped(d, 12);
    default:
      return d;
  }
}

// “fecha de cobro”
function payDateForOccurrence(d: Date, freq: IncomeFrequency) {
  if (freq === "monthly" || freq === "quarterly") {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  }
  return new Date(d.getTime());
}

function firstOnOrAfter(start: Date, target: Date, freq: IncomeFrequency) {
  if (start >= target) return start;

  const stepMonths =
    freq === "monthly"
      ? 1
      : freq === "quarterly"
        ? 3
        : freq === "yearly"
          ? 12
          : 0;
  if (stepMonths === 0) return start;

  const diffMonths =
    (target.getFullYear() - start.getFullYear()) * 12 +
    (target.getMonth() - start.getMonth());
  const k = Math.floor(diffMonths / stepMonths) * stepMonths;

  let cur = addMonthsClamped(start, k);
  while (cur < target) {
    const next = addMonthsClamped(cur, stepMonths);
    if (next.getTime() === cur.getTime()) break;
    cur = next;
  }
  return cur;
}

export function buildMonthlyIncomeSeries(
  rows: IncomeRowLite[],
  now = new Date(),
  monthsBack = 12,
  locale = "es-ES",
) {
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  const start = addMonthsClamped(end, -(monthsBack - 1));

  const buckets = new Array(monthsBack).fill(0);
  const labels: string[] = [];

  for (let i = 0; i < monthsBack; i++) {
    const d = addMonthsClamped(start, i);
    const raw = d.toLocaleDateString(locale, { month: "short" });
    labels.push(raw.charAt(0).toUpperCase() + raw.slice(1));
  }

  for (const r of rows) {
    const cents = r.amountCents ?? 0;
    if (cents <= 0) continue;

    const freq = r.frequency;
    const startDate = toDateSafe(r.date);
    if (!startDate || !freq) continue;

    const endDateRaw = toDateSafe(r.endDate);
    const endDate = endDateRaw ? endOfDay(endDateRaw) : null;

    if (freq === "once") {
      if (startDate > now) continue;
      const monthKey = new Date(
        startDate.getFullYear(),
        startDate.getMonth(),
        1,
      );
      if (monthKey < start || monthKey > end) continue;

      const idx =
        (monthKey.getFullYear() - start.getFullYear()) * 12 +
        (monthKey.getMonth() - start.getMonth());
      if (idx >= 0 && idx < monthsBack) buckets[idx] += cents;
      continue;
    }

    if (startDate > now) continue;

    const effectiveEnd = endDate && endDate < now ? endDate : now;

    let cur = firstOnOrAfter(startDate, start, freq);
    let guard = 0;

    while (cur <= effectiveEnd && guard < 600) {
      const payDate = payDateForOccurrence(cur, freq);

      if (payDate <= effectiveEnd) {
        const monthKey = new Date(payDate.getFullYear(), payDate.getMonth(), 1);
        if (monthKey >= start && monthKey <= end) {
          const idx =
            (monthKey.getFullYear() - start.getFullYear()) * 12 +
            (monthKey.getMonth() - start.getMonth());
          if (idx >= 0 && idx < monthsBack) buckets[idx] += cents;
        }
      }

      const nxt = nextOccurrence(cur, freq);
      if (nxt.getTime() === cur.getTime()) break;
      cur = nxt;
      guard++;
    }
  }

  return { labels, cents: buckets };
}

export function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
