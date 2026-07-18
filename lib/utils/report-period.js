/**
 * Report period helpers (month-based ranges for analytics exports).
 */

export const REPORT_PERIOD_PRESETS = [
  { id: "1m", label: "1 month", months: 1 },
  { id: "2m", label: "2 months", months: 2 },
  { id: "quarter", label: "Quarter (3 months)", months: 3 },
  { id: "6m", label: "6 months", months: 6 },
  { id: "custom", label: "Custom months", months: null },
];

/** Start of month for a Date. */
export function startOfMonth(date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** End of month for a Date. */
export function endOfMonth(date) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Resolve inclusive date range for a preset or custom month span.
 * @param {{ presetId: string, customMonths?: number, endDate?: Date }} opts
 */
export function resolveReportPeriod({
  presetId = "1m",
  customMonths = 1,
  endDate = new Date(),
} = {}) {
  const end = endOfMonth(endDate);
  const preset = REPORT_PERIOD_PRESETS.find((p) => p.id === presetId);
  const months =
    presetId === "custom"
      ? Math.max(1, Math.min(24, Number(customMonths) || 1))
      : preset?.months || 1;

  const start = startOfMonth(end);
  start.setMonth(start.getMonth() - (months - 1));

  return {
    start,
    end,
    months,
    label:
      presetId === "custom"
        ? `${months} month${months === 1 ? "" : "s"}`
        : preset?.label || `${months} months`,
    presetId,
  };
}

export function isInPeriod(isoOrDate, start, end) {
  if (!isoOrDate) return false;
  const t = new Date(isoOrDate).getTime();
  if (Number.isNaN(t)) return false;
  return t >= start.getTime() && t <= end.getTime();
}

export function formatPeriodLabel(start, end) {
  const opts = { month: "short", year: "numeric" };
  return `${start.toLocaleDateString("en-GB", opts)} – ${end.toLocaleDateString(
    "en-GB",
    opts
  )}`;
}

/**
 * Human cadence name from the selected period (Monthly, Quarterly, Mid-Year, …).
 */
export function getReportCadence(period = {}) {
  const months = Number(period.months) || 1;
  const id = period.presetId;

  if (id === "1m" || months === 1) {
    return { key: "monthly", label: "Monthly", uppercase: "MONTHLY" };
  }
  if (id === "2m" || months === 2) {
    return { key: "bi-monthly", label: "Bi-Monthly", uppercase: "BI-MONTHLY" };
  }
  if (id === "quarter" || months === 3) {
    return { key: "quarterly", label: "Quarterly", uppercase: "QUARTERLY" };
  }
  if (id === "6m" || months === 6) {
    return { key: "mid-year", label: "Mid-Year", uppercase: "MID-YEAR" };
  }
  if (months === 12) {
    return { key: "annual", label: "Annual", uppercase: "ANNUAL" };
  }
  if (months === 9) {
    return { key: "nine-month", label: "Nine-Month", uppercase: "NINE-MONTH" };
  }
  return {
    key: "custom",
    label: `${months}-Month`,
    uppercase: `${months}-MONTH`,
  };
}

function slugPart(value) {
  return String(value || "")
    .replace(/[^\w]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Org-aware report naming for PDFs / CSVs / UI.
 * @param {{
 *  orgCode?: string,
 *  period: object,
 *  domain?: 'assets'|'consumables'|'operations',
 *  style?: 'analytics'|'tabular',
 *  scopeLabel?: string,
 * }} opts
 */
export function buildReportNaming({
  orgCode = "ORG",
  period,
  domain = "assets",
  style = "analytics",
  scopeLabel = "",
} = {}) {
  const org = String(orgCode || "ORG").toUpperCase();
  const cadence = getReportCadence(period);
  const domainWord =
    domain === "consumables"
      ? "CONSUMABLES"
      : domain === "operations"
        ? "OPERATIONS"
        : "ASSETS";
  const domainTitleCase =
    domain === "consumables"
      ? "Consumables"
      : domain === "operations"
        ? "Operations"
        : "Assets";

  const mainTitle = `${org} ${cadence.uppercase} ${domainWord} MANAGEMENT REPORT`;
  const styleLine = scopeLabel
    ? scopeLabel
    : style === "tabular"
      ? "Stores & Operations tabular report"
      : "Stores & Operations analytics report";
  const periodLine = `${formatPeriodLabel(period.start, period.end)} · ${cadence.label}`;

  const endLabel = period?.end
    ? period.end.toLocaleDateString("en-GB", {
        month: "short",
        year: "numeric",
      })
    : "Period";

  const filenameBase = [
    org,
    slugPart(cadence.label),
    domainTitleCase,
    scopeLabel ? slugPart(scopeLabel) : null,
    "Management-Report",
    slugPart(endLabel),
  ]
    .filter(Boolean)
    .join("-");

  return {
    org,
    cadence,
    mainTitle,
    styleLine,
    periodLine,
    filenameBase,
    displayLines: [mainTitle, styleLine, periodLine],
  };
}
