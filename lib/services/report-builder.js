/**
 * Build analytics-ready report data for a date period.
 */
import { ENUMS } from "../appwrite/config.js";
import { isInPeriod } from "../utils/report-period.js";
import {
  aggregateRequestedItems,
} from "../utils/requested-items.js";
import { formatCategory } from "../utils/mappings.js";

const ADMIN_PLACEHOLDER_PROJECT_ID = "ADMIN";

function countBy(list, keyFn) {
  const map = {};
  for (const item of list) {
    const key = keyFn(item) || "Unknown";
    map[key] = (map[key] || 0) + 1;
  }
  return Object.entries(map)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function avgDays(pairs) {
  if (!pairs.length) return 0;
  const sum = pairs.reduce((s, n) => s + n, 0);
  return Math.round((sum / pairs.length) * 10) / 10;
}

function isAdministrativeConsumable(item) {
  const projectId = item?.projectId;
  return !projectId || projectId === ADMIN_PLACEHOLDER_PROJECT_ID;
}

function buildProjectLookup(projects = []) {
  const map = new Map();
  (projects || []).forEach((project) => {
    if (!project?.$id) return;
    map.set(
      project.$id,
      project.name || project.title || project.code || project.$id
    );
  });
  return map;
}

function mapConsumableRow(c, projectLookup) {
  const administrative = isAdministrativeConsumable(c);
  const projectId = administrative ? null : c.projectId;
  const projectName = administrative
    ? "Administrative"
    : projectLookup.get(c.projectId) || "Unknown project";

  return {
    name: c.name,
    stock: c.currentStock ?? 0,
    unit: c.unit || "—",
    status: (c.status || "—").replace(/_/g, " "),
    category: formatCategory(c.subcategory || c.category || "—"),
    scope: administrative ? "Administrative" : "Project",
    projectId: projectId || "",
    projectName,
  };
}

/**
 * @param {{
 *  assets: object[],
 *  itemCatalog?: object[]|null,
 *  requests: object[],
 *  staff: object[],
 *  issues?: object[],
 *  projects?: object[],
 *  period: { start: Date, end: Date, label: string, months: number, presetId?: string }
 * }} input
 */
export function buildReportAnalytics({
  assets = [],
  itemCatalog = null,
  requests = [],
  staff = [],
  issues = [],
  projects = [],
  period,
}) {
  const projectLookup = buildProjectLookup(projects);
  // Full register for name lookups (scoped `assets` alone often excludes the other type)
  const catalog = Array.isArray(itemCatalog) && itemCatalog.length
    ? itemCatalog
    : assets;
  const itemById = new Map();
  for (const item of catalog) {
    if (item?.$id) itemById.set(item.$id, item);
  }
  const scopedIds = new Set(
    (assets || []).map((item) => item?.$id).filter(Boolean)
  );

  const assetItems = assets.filter(
    (a) => a.itemType !== ENUMS.ITEM_TYPE.CONSUMABLE
  );
  const consumables = assets.filter(
    (a) => a.itemType === ENUMS.ITEM_TYPE.CONSUMABLE
  );
  const adminConsumables = consumables.filter(isAdministrativeConsumable);
  const projectConsumables = consumables.filter(
    (c) => !isAdministrativeConsumable(c)
  );

  const requestsInPeriod = requests.filter((r) =>
    isInPeriod(r.$createdAt, period.start, period.end)
  );
  const issuesInPeriod = (issues || []).filter((i) =>
    isInPeriod(i.issuedAt || i.$createdAt, period.start, period.end)
  );

  const staffById = new Map((staff || []).map((s) => [s.$id, s]));

  const approvedInPeriod = requestsInPeriod.filter(
    (r) =>
      r.status === ENUMS.REQUEST_STATUS.APPROVED ||
      r.status === ENUMS.REQUEST_STATUS.FULFILLED
  );
  const deniedInPeriod = requestsInPeriod.filter(
    (r) => r.status === ENUMS.REQUEST_STATUS.DENIED
  );
  const fulfilledInPeriod = requestsInPeriod.filter(
    (r) => r.status === ENUMS.REQUEST_STATUS.FULFILLED
  );
  const pendingOpen = requests.filter(
    (r) => r.status === ENUMS.REQUEST_STATUS.PENDING
  );

  const approvalDurations = requestsInPeriod
    .filter((r) => r.l1DecisionAt && r.$createdAt)
    .map((r) => {
      const ms =
        new Date(r.l1DecisionAt).getTime() - new Date(r.$createdAt).getTime();
      return ms / (1000 * 60 * 60 * 24);
    })
    .filter((d) => d >= 0 && d < 365);

  // Most requested items in period (by qty from duplicated IDs)
  const itemDemand = new Map();
  for (const req of requestsInPeriod) {
    const rawIds = (req.requestedItems || [])
      .map((entry) => {
        if (!entry) return null;
        if (typeof entry === "string") return entry;
        return entry.$id || entry.id || null;
      })
      .filter(Boolean);

    const lines = aggregateRequestedItems(rawIds, (id) => itemById.get(id));
    for (const { id, quantity, item } of lines) {
      // Keep the section aligned with the current report focus when scoped
      if (scopedIds.size > 0 && !scopedIds.has(id)) continue;

      const resolved = item || itemById.get(id);
      const name =
        resolved?.name ||
        resolved?.title ||
        resolved?.assetTag ||
        id;
      const prev = itemDemand.get(id) || { id, name, quantity: 0 };
      prev.quantity += quantity;
      // Prefer a real name if a later request resolves it
      if (resolved?.name || resolved?.title || resolved?.assetTag) {
        prev.name = name;
      }
      itemDemand.set(id, prev);
    }
  }
  const topRequestedItems = Array.from(itemDemand.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  const topRequesters = countBy(requestsInPeriod, (r) => {
    const s = staffById.get(r.requesterStaffId);
    return s?.name || "Unknown";
  }).slice(0, 10);

  const isLowStock = (c) => {
    const stock = Number(c.currentStock ?? 0);
    const min = Number(c.minStock ?? c.minimumStock ?? 0);
    return stock <= 0 || (min > 0 && stock <= min);
  };

  const lowStock = consumables.filter(isLowStock);
  const lowStockAdmin = adminConsumables.filter(isLowStock);
  const lowStockProject = projectConsumables.filter(isLowStock);

  const assetsInUse = assetItems.filter(
    (a) => a.availableStatus === ENUMS.AVAILABLE_STATUS.IN_USE
  ).length;
  const assetsAvailable = assetItems.filter(
    (a) => a.availableStatus === ENUMS.AVAILABLE_STATUS.AVAILABLE
  ).length;
  const assetsMaintenance = assetItems.filter((a) =>
    [
      ENUMS.AVAILABLE_STATUS.MAINTENANCE,
      ENUMS.AVAILABLE_STATUS.REPAIR_REQUIRED,
      ENUMS.AVAILABLE_STATUS.OUT_FOR_SERVICE,
    ].includes(a.availableStatus)
  ).length;

  const administrativeConsumableRows = adminConsumables.map((c) =>
    mapConsumableRow(c, projectLookup)
  );
  const projectConsumableRows = projectConsumables
    .map((c) => mapConsumableRow(c, projectLookup))
    .sort((a, b) =>
      `${a.projectName} ${a.name}`.localeCompare(`${b.projectName} ${b.name}`)
    );

  // Combined rows keep scope/project so CSV consumers can filter correctly
  const consumableRows = [
    ...administrativeConsumableRows,
    ...projectConsumableRows,
  ];

  return {
    period,
    generatedAt: new Date().toISOString(),
    kpis: {
      requestsSubmitted: requestsInPeriod.length,
      requestsApproved: approvedInPeriod.length,
      requestsDenied: deniedInPeriod.length,
      requestsFulfilled: fulfilledInPeriod.length,
      pendingOpen: pendingOpen.length,
      assetsTotal: assetItems.length,
      assetsAvailable,
      assetsInUse,
      assetsMaintenance,
      consumablesTotal: consumables.length,
      consumablesAdministrative: adminConsumables.length,
      consumablesProject: projectConsumables.length,
      consumablesLowStock: lowStock.length,
      consumablesLowStockAdministrative: lowStockAdmin.length,
      consumablesLowStockProject: lowStockProject.length,
      issuesInPeriod: issuesInPeriod.length,
      avgDaysToL1: avgDays(approvalDurations),
      activeStaff: (staff || []).filter((s) => s.active !== false).length,
    },
    requestsByStatus: countBy(requestsInPeriod, (r) => r.status || "UNKNOWN"),
    assetsByCategory: countBy(assetItems, (a) =>
      formatCategory(a.category || "Uncategorised")
    ),
    assetsByStatus: countBy(assetItems, (a) =>
      (a.availableStatus || "UNKNOWN").replace(/_/g, " ")
    ),
    consumablesByStatus: countBy(consumables, (c) =>
      (c.status || "UNKNOWN").replace(/_/g, " ")
    ),
    consumablesByScope: [
      { name: "Administrative", count: adminConsumables.length },
      { name: "Project", count: projectConsumables.length },
    ].filter((row) => row.count > 0),
    consumablesByProject: countBy(projectConsumables, (c) =>
      projectLookup.get(c.projectId) || "Unknown project"
    ),
    topRequestedItems,
    topRequesters,
    lowStockItems: lowStock.slice(0, 20).map((c) => {
      const row = mapConsumableRow(c, projectLookup);
      return {
        name: row.name,
        stock: row.stock,
        unit: row.unit,
        status: row.status,
        scope: row.scope,
        projectName: row.projectName,
      };
    }),
    lowStockAdministrative: lowStockAdmin.slice(0, 15).map((c) => {
      const row = mapConsumableRow(c, projectLookup);
      return {
        name: row.name,
        stock: row.stock,
        unit: row.unit,
        status: row.status,
      };
    }),
    lowStockProject: lowStockProject.slice(0, 15).map((c) => {
      const row = mapConsumableRow(c, projectLookup);
      return {
        name: row.name,
        stock: row.stock,
        unit: row.unit,
        status: row.status,
        projectName: row.projectName,
      };
    }),
    requestRows: requestsInPeriod.map((r) => ({
      id: r.$id,
      shortId: r.$id?.slice(-8)?.toUpperCase(),
      requester: staffById.get(r.requesterStaffId)?.name || "—",
      status: r.status,
      stage: r.approvalStage || "—",
      purpose: (r.purpose || "").slice(0, 120),
      createdAt: r.$createdAt,
      items: (r.requestedItems || []).length,
    })),
    assetRows: assetItems.map((a) => ({
      name: a.name,
      tag: a.assetTag || "—",
      category: formatCategory(a.category || "—"),
      status: (a.availableStatus || "—").replace(/_/g, " "),
      condition: (a.currentCondition || "—").replace(/_/g, " "),
      location: a.locationName || a.roomOrArea || "—",
    })),
    consumableRows,
    administrativeConsumableRows,
    projectConsumableRows,
  };
}
