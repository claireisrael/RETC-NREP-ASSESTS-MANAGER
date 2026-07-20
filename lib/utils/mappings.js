import { ENUMS } from "../appwrite/config.js";

// Map internal condition to public condition label
export function mapToPublicCondition(internalCondition) {
  const mapping = {
    [ENUMS.CURRENT_CONDITION.NEW]: ENUMS.PUBLIC_CONDITION_LABEL.NEW,
    [ENUMS.CURRENT_CONDITION.LIKE_NEW]: ENUMS.PUBLIC_CONDITION_LABEL.GOOD,
    [ENUMS.CURRENT_CONDITION.GOOD]: ENUMS.PUBLIC_CONDITION_LABEL.GOOD,
    [ENUMS.CURRENT_CONDITION.FAIR]: ENUMS.PUBLIC_CONDITION_LABEL.FAIR,
    [ENUMS.CURRENT_CONDITION.POOR]: ENUMS.PUBLIC_CONDITION_LABEL.OUT_OF_SERVICE,
    [ENUMS.CURRENT_CONDITION.DAMAGED]:
      ENUMS.PUBLIC_CONDITION_LABEL.OUT_OF_SERVICE,
    [ENUMS.CURRENT_CONDITION.LOST]:
      ENUMS.PUBLIC_CONDITION_LABEL.OUT_OF_SERVICE,
    [ENUMS.CURRENT_CONDITION.SCRAP]:
      ENUMS.PUBLIC_CONDITION_LABEL.OUT_OF_SERVICE,
  };

  return (
    mapping[internalCondition] || ENUMS.PUBLIC_CONDITION_LABEL.OUT_OF_SERVICE
  );
}

// Map internal status to public status label
export function mapToPublicStatusLabel(internalStatus) {
  const mapping = {
    [ENUMS.AVAILABLE_STATUS.AVAILABLE]: "Available",
    [ENUMS.AVAILABLE_STATUS.IN_USE]: "On Loan",
    [ENUMS.AVAILABLE_STATUS.RESERVED]: "On Loan",
    [ENUMS.AVAILABLE_STATUS.AWAITING_RETURN]: "On Loan",
    [ENUMS.AVAILABLE_STATUS.MAINTENANCE]: "Out of Service",
    [ENUMS.AVAILABLE_STATUS.REPAIR_REQUIRED]: "Out of Service",
    [ENUMS.AVAILABLE_STATUS.OUT_FOR_SERVICE]: "Out of Service",
    [ENUMS.AVAILABLE_STATUS.AWAITING_DEPLOY]: "Available",
    [ENUMS.AVAILABLE_STATUS.PENDING_AVAILABILITY]: null, // Hidden until L2 confirms
    [ENUMS.AVAILABLE_STATUS.RETIRED]: null, // Hidden from public
    [ENUMS.AVAILABLE_STATUS.DISPOSED]: null, // Hidden from public
  };

  return mapping[internalStatus];
}

// Get status badge color for UI
export function getStatusBadgeColor(status) {
  const colors = {
    [ENUMS.AVAILABLE_STATUS.AVAILABLE]: "bg-green-100 text-green-800",
    [ENUMS.AVAILABLE_STATUS.RESERVED]: "bg-yellow-100 text-yellow-800",
    [ENUMS.AVAILABLE_STATUS.IN_USE]: "bg-amber-100 text-amber-700",
    [ENUMS.AVAILABLE_STATUS.AWAITING_RETURN]: "bg-orange-100 text-orange-800",
    [ENUMS.AVAILABLE_STATUS.MAINTENANCE]: "bg-purple-100 text-purple-700",
    [ENUMS.AVAILABLE_STATUS.REPAIR_REQUIRED]: "bg-red-100 text-red-800",
    [ENUMS.AVAILABLE_STATUS.OUT_FOR_SERVICE]: "bg-gray-100 text-gray-800",
    [ENUMS.AVAILABLE_STATUS.AWAITING_DEPLOY]: "bg-cyan-100 text-cyan-800",
    [ENUMS.AVAILABLE_STATUS.PENDING_AVAILABILITY]: "bg-amber-100 text-amber-800",
    [ENUMS.AVAILABLE_STATUS.RETIRED]: "bg-gray-100 text-gray-800",
    [ENUMS.AVAILABLE_STATUS.DISPOSED]: "bg-black text-white",
  };

  return colors[status] || "bg-gray-100 text-gray-800";
}

// Get condition badge color for UI
export function getConditionBadgeColor(condition) {
  const colors = {
    [ENUMS.CURRENT_CONDITION.NEW]: "bg-green-100 text-green-800",
    [ENUMS.CURRENT_CONDITION.LIKE_NEW]: "bg-green-100 text-green-800",
    [ENUMS.CURRENT_CONDITION.GOOD]: "bg-blue-100 text-blue-800",
    [ENUMS.CURRENT_CONDITION.FAIR]: "bg-yellow-100 text-yellow-800",
    [ENUMS.CURRENT_CONDITION.POOR]: "bg-orange-100 text-orange-800",
    [ENUMS.CURRENT_CONDITION.DAMAGED]: "bg-red-100 text-red-800",
    [ENUMS.CURRENT_CONDITION.SCRAP]: "bg-red-100 text-red-800",
  };

  return colors[condition] || "bg-gray-100 text-gray-800";
}

// Format category for display
const CATEGORY_LABELS = {
  [ENUMS.CONSUMABLE_CATEGORY.ADMIN_TP]: "TP",
  [ENUMS.CONSUMABLE_CATEGORY.ADMIN_SUGAR]: "Sugar",
  [ENUMS.CONSUMABLE_CATEGORY.ADMIN_WATER]: "Water",
  [ENUMS.CONSUMABLE_CATEGORY.ADMIN_MISC]: "Admin Essentials",
  [ENUMS.CONSUMABLE_CATEGORY.PROJECT_TEARDROPS]: "Teardrops",
  [ENUMS.CONSUMABLE_CATEGORY.PROJECT_BANNERS]: "Banners",
  [ENUMS.CONSUMABLE_CATEGORY.PROJECT_BOOTH_MATERIALS]: "Booth Materials",
};

export function formatCategory(category) {
  if (!category) return "";
  if (CATEGORY_LABELS[category]) return CATEGORY_LABELS[category];
  return category.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

// Format role for display
export function formatRole(role) {
  return role.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

export const USER_ROLES = {
  SYSTEM_ADMIN: "System Administrator",
  ASSET_ADMIN: "Asset Administrator",
  SENIOR_MANAGER: "Senior Manager",
  STAFF: "Staff",
  CONSUMABLE_ADMIN: "Consumable Administrator",
};

// ================================
// Consumable Helper Functions
// ================================
// NOTE: These functions maintain backward compatibility with the hacky storage mechanism
// while providing a migration path to proper data structure.

import {
  extractCurrentStock,
  extractMinStock,
  extractConsumableStatus,
  extractConsumableUnit,
  extractConsumableCategory,
  getConsumableData,
} from "./consumable-data-migration.js";

// Backward-compatible functions that work with both old and new data formats
export function getCurrentStock(consumable) {
  // Try proper data structure first (new field name)
  if (consumable.currentStock !== undefined) {
    return consumable.currentStock;
  }
  // Fall back to hacky extraction
  return extractCurrentStock(consumable);
}

export function getMinStock(consumable) {
  // Try proper data structure first (new field name)
  if (consumable.minimumStock !== undefined) {
    return consumable.minimumStock;
  }
  // Fall back to hacky extraction
  return extractMinStock(consumable);
}

export function getMaxStock(consumable) {
  // Try proper data structure first (new field name if added in future)
  if (consumable.maximumStock !== undefined) {
    return consumable.maximumStock;
  }
  // Fall back to hacky extraction from manufacturer field
  if (consumable.manufacturer && consumable.manufacturer.startsWith("MAX:")) {
    return parseInt(consumable.manufacturer.replace("MAX:", "")) || 0;
  }
  return 0;
}

/**
 * Get consumable status - returns formatted display text
 * Uses saved status if available, otherwise calculates from stock levels
 */
export function getConsumableStatus(consumable) {
  if (!consumable || consumable.itemType !== ENUMS.ITEM_TYPE.CONSUMABLE) {
    return null;
  }
  
  // Use saved status if available and valid
  if (consumable.status && Object.values(ENUMS.CONSUMABLE_STATUS).includes(consumable.status)) {
    return formatCategory(consumable.status);
  }
  
  // Calculate status from stock if status not set
  const current = getCurrentStock(consumable);
  const min = getMinStock(consumable);

  if (current === 0) return formatCategory(ENUMS.CONSUMABLE_STATUS.OUT_OF_STOCK);
  if (current <= min && min > 0) return formatCategory(ENUMS.CONSUMABLE_STATUS.LOW_STOCK);
  return formatCategory(ENUMS.CONSUMABLE_STATUS.IN_STOCK);
}

/**
 * Get consumable status enum value (not formatted)
 * For admin pages that need the raw enum value
 */
export function getConsumableStatusEnum(consumable) {
  if (!consumable || consumable.itemType !== ENUMS.ITEM_TYPE.CONSUMABLE) {
    return null;
  }
  
  // Use saved status if available and valid
  if (consumable.status && Object.values(ENUMS.CONSUMABLE_STATUS).includes(consumable.status)) {
    return consumable.status;
  }
  
  // Calculate status from stock if status not set
  const current = getCurrentStock(consumable);
  const min = getMinStock(consumable);

  if (current === 0) return ENUMS.CONSUMABLE_STATUS.OUT_OF_STOCK;
  if (current <= min && min > 0) return ENUMS.CONSUMABLE_STATUS.LOW_STOCK;
  return ENUMS.CONSUMABLE_STATUS.IN_STOCK;
}

export function getConsumableUnit(consumable) {
  // Try proper data structure first (new field name)
  if (consumable.unit) {
    return consumable.unit;
  }
  // Fall back to hacky extraction
  return extractConsumableUnit(consumable) || ENUMS.CONSUMABLE_UNIT.PIECE;
}

export function getConsumableCategory(consumable) {
  // Use subcategory directly if it's a valid category (new format)
  if (consumable.subcategory && !consumable.subcategory.includes("|")) {
    return consumable.subcategory;
  }
  // Fall back to hacky extraction
  return (
    extractConsumableCategory(consumable) ||
    ENUMS.CONSUMABLE_CATEGORY.FLIERS
  );
}

// Get consumable status badge color
export function getConsumableStatusBadgeColor(status) {
  const colors = {
    [ENUMS.CONSUMABLE_STATUS.IN_STOCK]:
      "bg-green-100 text-green-800 border-green-200",
    [ENUMS.CONSUMABLE_STATUS.LOW_STOCK]:
      "bg-yellow-100 text-yellow-800 border-yellow-200",
    [ENUMS.CONSUMABLE_STATUS.OUT_OF_STOCK]:
      "bg-red-100 text-red-800 border-red-200",
    [ENUMS.CONSUMABLE_STATUS.DISCONTINUED]:
      "bg-gray-100 text-gray-800 border-gray-200",
  };
  return colors[status] || "bg-gray-100 text-gray-800 border-gray-200";
}

// Utility: Convert hex color to rgba
export function hexToRgba(hex, alpha = 1) {
  if (!hex) return `rgba(247, 144, 30, ${alpha})`;
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) {
    return `rgba(247, 144, 30, ${alpha})`;
  }
  const bigint = parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Extract denial reason from purpose field
export function extractDenialReason(purpose) {
  if (!purpose) return null;
  const match = purpose.match(/\[Denial Reason:\s*(.+?)\]/);
  return match ? match[1].trim() : null;
}

// Note: Icon components should be imported directly in components
// These functions return icon names for reference only
// For actual icon rendering, import icons directly in components
