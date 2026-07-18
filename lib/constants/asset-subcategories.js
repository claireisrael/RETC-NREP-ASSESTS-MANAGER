import { ENUMS } from "../appwrite/config.js";

/**
 * Predefined subcategories, grouped by asset category. When a category is
 * listed here, the asset form shows a dropdown of these subcategories; when it
 * isn't, the form falls back to a free-text subcategory input (backward
 * compatible with existing data).
 *
 * Stored values are stable UPPER_SNAKE tokens; labels are for display.
 */
export const ASSET_SUBCATEGORIES = {
  [ENUMS.CATEGORY.IT_EQUIPMENT]: [
    { value: "LAPTOP", label: "Laptop" },
    { value: "TABLET", label: "Tablet" },
    { value: "CAMERA", label: "Camera" },
    { value: "PROJECTOR", label: "Projector" },
    { value: "TV_SCREEN", label: "TV Screen" },
    { value: "CHARGER", label: "Charger" },
    { value: "PHONE", label: "Phone" },
  ],
  [ENUMS.CATEGORY.AV_EQUIPMENT]: [
    { value: "CAMERA", label: "Camera" },
    { value: "PROJECTOR", label: "Projector" },
    { value: "TV_SCREEN", label: "TV Screen" },
  ],
};

// Flat lookup of value -> label for formatting anywhere in the app.
const SUBCATEGORY_LABELS = Object.values(ASSET_SUBCATEGORIES)
  .flat()
  .reduce((acc, { value, label }) => {
    acc[value] = label;
    return acc;
  }, {});

/** Subcategory option list for a given category (empty when none defined). */
export function getSubcategoriesForCategory(category) {
  if (!category) return [];
  return ASSET_SUBCATEGORIES[category] || [];
}

/** True when a category has a predefined subcategory list. */
export function hasPredefinedSubcategories(category) {
  return getSubcategoriesForCategory(category).length > 0;
}

/** Human-friendly label for a stored subcategory value. */
export function formatSubcategory(value) {
  if (!value) return "";
  if (SUBCATEGORY_LABELS[value]) return SUBCATEGORY_LABELS[value];
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Normalize a subcategory-ish string for comparison.
 * "TV Screen" / "tv_screen" / "TV_SCREEN" → "tvscreen"
 */
function normalizeSubcategoryToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_-\s]+/g, "")
    .trim();
}

/**
 * Match an asset against a selected subcategory filter token (e.g. "LAPTOP").
 * Supports:
 * - exact stored token (LAPTOP)
 * - free-text subcategory ("Laptop", "laptop")
 * - older assets with empty subcategory but the type in the name / tag
 */
export function assetMatchesSubcategory(asset, filterValue) {
  if (!filterValue || filterValue === "all") return true;

  const filterNorm = normalizeSubcategoryToken(filterValue);
  const filterLabel = SUBCATEGORY_LABELS[filterValue] || formatSubcategory(filterValue);
  const filterLabelNorm = normalizeSubcategoryToken(filterLabel);

  const stored = asset?.subcategory || "";
  const storedNorm = normalizeSubcategoryToken(stored);

  // Exact / case-insensitive match on the stored subcategory field
  if (storedNorm) {
    if (
      storedNorm === filterNorm ||
      storedNorm === filterLabelNorm ||
      storedNorm.includes(filterNorm) ||
      storedNorm.includes(filterLabelNorm) ||
      filterNorm.includes(storedNorm) ||
      filterLabelNorm.includes(storedNorm)
    ) {
      return true;
    }
  }

  // Fallback for legacy assets that never got a subcategory set:
  // match against name, asset tag, or serial number.
  const haystack = normalizeSubcategoryToken(
    [asset?.name, asset?.assetTag, asset?.serialNumber, asset?.model]
      .filter(Boolean)
      .join(" ")
  );

  if (!haystack) return false;

  // Prefer the human label keywords (e.g. "laptop", "tv screen" → "tvscreen")
  // and also common aliases.
  const aliases = {
    laptop: ["laptop", "laptops", "notebook"],
    tablet: ["tablet", "tablets", "tab", "tabs", "ipad"],
    camera: ["camera", "cameras", "cam"],
    projector: ["projector", "projectors", "epson"],
    tvscreen: ["tvscreen", "tv", "screen", "monitor", "display"],
    charger: ["charger", "chargers", "adapter"],
    phone: ["phone", "phones", "mobile", "smartphone"],
  };

  const key = filterLabelNorm || filterNorm;
  const terms = aliases[key] || [key, filterNorm, filterLabelNorm].filter(Boolean);

  return terms.some((term) => term && haystack.includes(term));
}
