import { staffService } from "../appwrite/provider.js";
import { ENUMS } from "../appwrite/config.js";

/** Final (L2) approvers: Mukisa Nicholas & Paul Nduhuura only. */
export const L2_FINAL_APPROVER_EMAILS = [
  "mukisanic@nrep.ug",
  "pnduhuura@nrep.ug",
];

export function isL2FinalApprover(staff) {
  if (!staff?.email) return false;
  const email = String(staff.email).trim().toLowerCase();
  return L2_FINAL_APPROVER_EMAILS.includes(email);
}

export function filterL2FinalApprovers(staff = []) {
  const allowed = new Set(L2_FINAL_APPROVER_EMAILS);
  return (staff || [])
    .filter((s) => {
      const email = String(s?.email || "").trim().toLowerCase();
      return allowed.has(email);
    })
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

// Which roles act at each approval level. Managed entirely via Appwrite staff
// roles - to change who approves, change their role in Appwrite (no code/env).
export const APPROVER_ROLES = {
  L1: [ENUMS.ROLES.ASSET_ADMIN, ENUMS.ROLES.SENIOR_MANAGER],
  L2: [ENUMS.ROLES.SYSTEM_ADMIN],
};

/**
 * Resolve the current approvers for a given level from Appwrite staff roles.
 * Runs client-side using the authenticated session (no server API key needed).
 *
 * @param {"L1"|"L2"} level
 * @returns {Promise<{emails: string[], staff: object[]}>}
 */
export async function getApproverRecipients(level) {
  const roles = APPROVER_ROLES[level] || [];
  if (roles.length === 0) return { emails: [], staff: [] };

  try {
    const res = await staffService.list();
    const docs = res?.documents || [];

    const matched = docs.filter(
      (s) =>
        s &&
        s.active !== false &&
        Array.isArray(s.roles) &&
        s.roles.some((r) => roles.includes(r)) &&
        // L1 emails go only to L1 roles — never to superadmins (even if dual-roled).
        (level !== "L1" ||
          !s.roles.includes(ENUMS.ROLES.SYSTEM_ADMIN)) &&
        typeof s.email === "string" &&
        s.email.trim() !== ""
    );

    const staff =
      level === "L2" ? filterL2FinalApprovers(matched) : matched;

    const emails = [
      ...new Set(staff.map((s) => s.email.toLowerCase().trim())),
    ];

    return { emails, staff };
  } catch (error) {
    console.warn(`Failed to resolve ${level} approver recipients:`, error);
    return { emails: [], staff: [] };
  }
}

/** Active L2 final approvers (Paul & Nicholas only) for assignment pickers. */
export async function listSuperadminStaff() {
  const { staff } = await getApproverRecipients("L2");
  return staff;
}

/** Label an item as asset or consumable for plain-language emails. */
function itemKindLabel(item) {
  if (!item) return "item";
  if (item.itemType === ENUMS.ITEM_TYPE.CONSUMABLE) return "consumable";
  return "asset";
}

/** Single item display name: "HP-LAPTOP (NREP-JKAID-LP-002)" when tag exists. */
export function formatItemLabel(item) {
  if (!item) return null;
  const name = item.name || item.title || null;
  const tag = item.assetTag || item.tag || null;
  if (name && tag) return `${name} (${tag})`;
  return name || tag || null;
}

/**
 * Collapse duplicated item docs (qty stored as repeated IDs) into unique rows.
 */
function aggregateItemsWithQty(items = []) {
  const byKey = new Map();
  for (const item of items || []) {
    if (!item) continue;
    const key = item.$id || item.id || formatItemLabel(item) || "item";
    const existing = byKey.get(key);
    if (existing) {
      existing.quantity += 1;
    } else {
      byKey.set(key, { item, quantity: 1 });
    }
  }
  return Array.from(byKey.values());
}

/**
 * Build a short human-readable summary of the items in a request.
 * e.g. "Aprons × 22, Projector (RETC-…)"
 */
export function buildItemsSummary(items = []) {
  const rows = aggregateItemsWithQty(items);
  const labels = rows
    .map(({ item, quantity }) => {
      const label = formatItemLabel(item);
      if (!label) return null;
      return quantity > 1 ? `${label} × ${quantity}` : label;
    })
    .filter(Boolean);
  if (labels.length === 0) return null;
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

/**
 * HTML list of requested items for emails (plain language, no jargon).
 */
export function buildItemsListHtml(items = []) {
  const rows = aggregateItemsWithQty(items)
    .map(({ item, quantity }) => {
      const label = formatItemLabel(item);
      if (!label) return null;
      const kind = itemKindLabel(item);
      const qtyBit =
        quantity > 1
          ? ` <span style="color:#0f172a;">× ${quantity}</span>`
          : "";
      return `<li style="margin:4px 0;"><strong>${label}</strong>${qtyBit} <span style="color:#64748b;">(${kind})</span></li>`;
    })
    .filter(Boolean);

  if (rows.length === 0) {
    return `<p style="margin:8px 0;color:#64748b;">(Item details were not available)</p>`;
  }

  return `<ul style="margin:8px 0 8px 18px;padding:0;">${rows.join("")}</ul>`;
}

/**
 * Opening phrase for requester emails, e.g.
 * "your request for the asset HP-LAPTOP (TAG)"
 */
export function buildRequestSubjectPhrase(items = []) {
  const list = (items || []).filter(Boolean);
  const summary = buildItemsSummary(list);
  if (!summary) return "your request";

  const allConsumable =
    list.length > 0 &&
    list.every((i) => i.itemType === ENUMS.ITEM_TYPE.CONSUMABLE);
  const allAsset =
    list.length > 0 &&
    list.every((i) => i.itemType !== ENUMS.ITEM_TYPE.CONSUMABLE);

  if (list.length === 1) {
    const kind = allConsumable ? "consumable" : "asset";
    return `your request for the ${kind} <strong>${summary}</strong>`;
  }

  if (allConsumable) {
    return `your request for these consumables: <strong>${summary}</strong>`;
  }
  if (allAsset) {
    return `your request for these assets: <strong>${summary}</strong>`;
  }
  return `your request for <strong>${summary}</strong>`;
}
