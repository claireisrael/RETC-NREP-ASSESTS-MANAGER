/**
 * Local calendar date helpers for <input type="date"> and Appwrite datetimes.
 * Avoid toISOString().split("T")[0] — that uses UTC and can show the wrong day.
 */

/** Format a Date as YYYY-MM-DD in the user's local timezone. */
export function toLocalDateInputValue(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD (or ISO prefix) as a local calendar date at noon. */
export function parseLocalDateInput(value) {
  if (!value) return null;
  const [y, m, d] = String(value).split("T")[0].split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addLocalDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Store a date input value as ISO (local noon → stable across timezones). */
export function localDateInputToIso(value) {
  const d = parseLocalDateInput(value);
  return d ? d.toISOString() : null;
}

/** Stored ISO/datetime → value for <input type="date">. */
export function isoToLocalDateInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return toLocalDateInputValue(d);
}

export function startOfLocalDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}
