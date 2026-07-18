/**
 * Apron color variants for field requests (green / orange / cream).
 * Catalog items can be separate consumables per color, or one Aprons item
 * with these colors offered as addable lines in the request cart.
 */

export const APRON_COLOR_OPTIONS = [
  { key: "green", label: "Green", pattern: /\bgreen\b/i },
  { key: "orange", label: "Orange", pattern: /\borange\b/i },
  { key: "cream", label: "Cream", pattern: /\bcream\b/i },
];

export function isApronItem(item) {
  if (!item) return false;
  const sub = String(item.subcategory || "").toUpperCase();
  const name = String(item.name || "").toLowerCase();
  const category = String(item.category || "").toUpperCase();
  return (
    sub === "APRONS" ||
    sub.includes("APRON") ||
    name.includes("apron") ||
    category === "APRONS"
  );
}

export function detectApronColor(item) {
  if (!item) return null;
  const text = `${item.name || ""} ${item.subcategory || ""}`;
  return APRON_COLOR_OPTIONS.find((c) => c.pattern.test(text)) || null;
}

/**
 * Color choices for an apron line: accessories (if set), else standard three.
 */
export function getApronColorChoices(item) {
  const fromAccessories = (item?.accessories || [])
    .map((a) => String(a || "").trim())
    .filter(Boolean);

  if (fromAccessories.length > 0) {
    return fromAccessories.map((label) => {
      const known = APRON_COLOR_OPTIONS.find((c) => c.pattern.test(label));
      return {
        key: known?.key || label.toLowerCase().replace(/\s+/g, "-"),
        label: known?.label || label,
        pattern: known?.pattern || new RegExp(label, "i"),
      };
    });
  }

  return APRON_COLOR_OPTIONS.map((c) => ({ ...c }));
}

export function apronCartKey(itemId, colorKey) {
  return colorKey ? `${itemId}::${colorKey}` : itemId;
}
