/**
 * Helpers for request `requestedItems` (often stores duplicated IDs for qty).
 */

/**
 * Count occurrences of each item id.
 * @param {string[]} ids
 * @returns {Map<string, number>}
 */
export function countRequestedItemIds(ids = []) {
  const counts = new Map();
  for (const id of ids || []) {
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

/**
 * Aggregate resolved item documents (may contain duplicates) into
 * [{ item, quantity, id }].
 */
export function aggregateResolvedItems(items = []) {
  const byId = new Map();

  for (const item of items || []) {
    if (!item) continue;
    const id = item.$id || item.id || item.assetTag || null;
    const key = id || `anon-${item.name || "item"}`;
    const existing = byId.get(key);
    if (existing) {
      existing.quantity += 1;
    } else {
      byId.set(key, { id: id || key, item, quantity: 1 });
    }
  }

  return Array.from(byId.values());
}

/**
 * Aggregate from raw id list + a lookup map/function.
 * @param {string[]} ids
 * @param {Map|Function|Object} resolveById - Map, object, or (id) => item
 */
export function aggregateRequestedItems(ids = [], resolveById) {
  const counts = countRequestedItemIds(ids);
  const resolve =
    typeof resolveById === "function"
      ? resolveById
      : resolveById instanceof Map
        ? (id) => resolveById.get(id)
        : (id) => resolveById?.[id];

  return Array.from(counts.entries()).map(([id, quantity]) => ({
    id,
    quantity,
    item: resolve?.(id) || null,
  }));
}

/**
 * Display label: "Aprons × 22" (or just the name when qty is 1 for assets).
 */
export function formatItemQuantityLabel(item, quantity = 1, { alwaysShowQty = true } = {}) {
  const name =
    item?.name ||
    item?.title ||
    item?.assetTag ||
    "Unknown item";
  const qty = Number(quantity) || 1;
  if (!alwaysShowQty && qty === 1) return name;
  return `${name} × ${qty}`;
}
