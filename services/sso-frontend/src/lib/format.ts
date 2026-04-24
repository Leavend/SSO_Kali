/**
 * Shared date/time formatting utilities.
 * All dates rendered server-side use explicit locale to avoid
 * inconsistency between VPS Node.js locale and client browser.
 */

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Jakarta",
});

/**
 * Format an ISO date string to a human-readable format.
 * Example: "03 Apr 2026, 21:10"
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return dateFormatter.format(new Date(iso));
  } catch {
    return iso;
  }
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const DIVISIONS: { amount: number; name: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, name: "seconds" },
  { amount: 60, name: "minutes" },
  { amount: 24, name: "hours" },
  { amount: 7, name: "days" },
  { amount: 4.345, name: "weeks" },
  { amount: 12, name: "months" },
  { amount: Number.POSITIVE_INFINITY, name: "years" },
];

/**
 * Format an ISO date as relative time.
 * Example: "2 hours ago", "yesterday", "3 days ago"
 */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "Never";
  try {
    let seconds = (new Date(iso).getTime() - Date.now()) / 1000;
    for (const division of DIVISIONS) {
      if (Math.abs(seconds) < division.amount) {
        return rtf.format(Math.round(seconds), division.name);
      }
      seconds /= division.amount;
    }
    return formatDateTime(iso);
  } catch {
    return iso;
  }
}

/**
 * Truncate a long ID for display, preserving the full value in a title attribute.
 * Example: "366923007014207492" → "36692300…7492"
 */
export function truncateId(id: string, keep = 8): string {
  if (id.length <= keep * 2) return id;
  return `${id.slice(0, keep)}…${id.slice(-4)}`;
}
