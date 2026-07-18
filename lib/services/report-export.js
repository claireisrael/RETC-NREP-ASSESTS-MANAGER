/**
 * Org-branded PDF / CSV report exports (analytics + tabular).
 * Mixes primary + accent (e.g. NREP blue + orange), embeds org logo, and uses
 * period-aware titles (Monthly / Quarterly / Mid-Year / …).
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { resolveOrgTheme } from "../constants/org-branding.js";
import {
  formatPeriodLabel,
  buildReportNaming,
} from "../utils/report-period.js";

function hexToRgb(hex, fallback = [46, 158, 204]) {
  if (!hex || typeof hex !== "string") return fallback;
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) return fallback;
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return fallback;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function brandingForOrg(orgCode) {
  const theme = resolveOrgTheme(orgCode);
  const colors = theme?.colors || {};
  return {
    orgCode: theme?.code || orgCode || "RETC",
    orgName: theme?.name || "Asset Management",
    logoPath: theme?.branding?.logoProxy || theme?.branding?.logo || null,
    primary: hexToRgb(colors.primary, [46, 158, 204]),
    primaryDark: hexToRgb(colors.primaryDark || colors.primary, [53, 124, 157]),
    accent: hexToRgb(
      colors.accent || colors.highlight || colors.primary,
      [239, 167, 79]
    ),
    accentDark: hexToRgb(
      colors.accentDark || colors.highlightDark || colors.accent,
      [224, 142, 42]
    ),
  };
}

async function loadLogoDataUrl(brand) {
  if (!brand?.logoPath || typeof window === "undefined") return null;
  try {
    const raw = String(brand.logoPath).split("?")[0];
    const url = raw.startsWith("http")
      ? raw
      : `${window.location.origin}${raw.startsWith("/") ? "" : "/"}${raw}`;
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result || null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function drawHeader(doc, brand, naming, logoDataUrl) {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Deep blue band
  doc.setFillColor(...brand.primaryDark);
  doc.rect(0, 0, pageWidth, 30, "F");
  // Orange accent stripe (brand mix)
  doc.setFillColor(...brand.accent);
  doc.rect(0, 30, pageWidth, 4, "F");
  // Soft primary wash under stripe
  doc.setFillColor(...brand.primary);
  doc.rect(0, 34, pageWidth, 3, "F");

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", pageWidth - 28, 5, 16, 16);
    } catch {
      // Ignore logo draw failures — text header still works
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(naming.mainTitle, 14, 11, { maxWidth: pageWidth - 48 });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(255, 248, 235);
  doc.text(naming.styleLine, 14, 18, { maxWidth: pageWidth - 48 });

  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text(naming.periodLine, 14, 25, { maxWidth: pageWidth - 48 });

  return 44;
}

function drawFooter(doc, brand, logoDataUrl) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    // Dual-tone footer rule: blue then orange
    doc.setDrawColor(...brand.primary);
    doc.setLineWidth(0.4);
    doc.line(14, pageHeight - 16, pageWidth / 2, pageHeight - 16);
    doc.setDrawColor(...brand.accent);
    doc.line(pageWidth / 2, pageHeight - 16, pageWidth - 14, pageHeight - 16);

    if (logoDataUrl && i === pageCount) {
      try {
        doc.addImage(logoDataUrl, "PNG", pageWidth - 22, pageHeight - 14, 8, 8);
      } catch {
        // ignore
      }
    }

    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${brand.orgName} · Confidential · Page ${i} of ${pageCount}`,
      14,
      pageHeight - 9
    );
  }
}

function drawClosingBlock(doc, brand, naming, logoDataUrl) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = (doc.lastAutoTable?.finalY || 40) + 16;

  if (y > pageHeight - 48) {
    doc.addPage();
    y = 36;
  }

  doc.setDrawColor(...brand.accent);
  doc.setLineWidth(0.6);
  doc.line(14, y, pageWidth - 14, y);
  y += 10;

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", pageWidth / 2 - 10, y, 20, 20);
      y += 24;
    } catch {
      // ignore
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...brand.primaryDark);
  doc.text("End of report", pageWidth / 2, y, { align: "center" });
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...brand.accentDark);
  doc.text(
    `Prepared by ${brand.orgName} · Stores & Operations`,
    pageWidth / 2,
    y,
    { align: "center" }
  );
  y += 5;
  doc.setTextColor(100, 116, 139);
  doc.text(naming.periodLine, pageWidth / 2, y, { align: "center" });
}

function sectionHeading(doc, y, title, brand, { accent = false } = {}) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y > pageHeight - 55) {
    doc.addPage();
    y = 20;
  }

  const barColor = accent ? brand.accent : brand.primary;
  doc.setFillColor(...barColor);
  doc.roundedRect(14, y - 4, 3, 8, 1, 1, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...(accent ? brand.accentDark : brand.primaryDark));
  doc.text(title, 20, y + 2);
  return y + 8;
}

function kpiBlock(doc, y, kpis, brand) {
  const rows = [
    ["Requests submitted", String(kpis.requestsSubmitted)],
    [
      "Approved / fulfilled",
      `${kpis.requestsApproved} / ${kpis.requestsFulfilled}`,
    ],
    ["Denied", String(kpis.requestsDenied)],
    ["Still pending (open)", String(kpis.pendingOpen)],
    [
      "Assets (available / in use)",
      `${kpis.assetsAvailable} / ${kpis.assetsInUse}`,
    ],
    ["Assets in maintenance", String(kpis.assetsMaintenance)],
    [
      "Consumables · admin / project",
      `${kpis.consumablesAdministrative ?? 0} / ${kpis.consumablesProject ?? 0}`,
    ],
    [
      "Low stock · admin / project",
      `${kpis.consumablesLowStockAdministrative ?? 0} / ${kpis.consumablesLowStockProject ?? 0}`,
    ],
    ["Issues in period", String(kpis.issuesInPeriod)],
    ["Avg days to L1 decision", String(kpis.avgDaysToL1)],
    ["Active staff", String(kpis.activeStaff)],
  ];

  autoTable(doc, {
    startY: y,
    head: [["Metric", "Value"]],
    body: rows,
    theme: "striped",
    headStyles: {
      fillColor: brand.primary,
      textColor: 255,
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [255, 248, 235] },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 60 } },
    margin: { left: 14, right: 14 },
  });
  return doc.lastAutoTable.finalY + 10;
}

function simpleTable(doc, y, title, head, body, brand, { accent = false } = {}) {
  if (!body?.length) return y;
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y > pageHeight - 50) {
    doc.addPage();
    y = 20;
  }

  y = sectionHeading(doc, y, title, brand, { accent });

  autoTable(doc, {
    startY: y,
    head: [head],
    body,
    theme: "striped",
    headStyles: {
      fillColor: accent ? brand.accentDark : brand.primary,
      textColor: 255,
      fontStyle: "bold",
      fontSize: 8,
    },
    alternateRowStyles: accent
      ? { fillColor: [255, 248, 235] }
      : { fillColor: [240, 249, 255] },
    styles: { fontSize: 8, cellPadding: 3 },
    margin: { left: 14, right: 14 },
  });
  return doc.lastAutoTable.finalY + 12;
}

/**
 * Analytics-style PDF: KPIs + ranked charts-as-tables.
 */
export async function exportAnalyticsPdf(report, orgCode) {
  const brand = brandingForOrg(orgCode);
  const meta = report.exportMeta || {};
  const focus = meta.focus || "assets";
  const naming = buildReportNaming({
    orgCode: brand.orgCode,
    period: report.period,
    domain: meta.domain || "assets",
    style: "analytics",
    scopeLabel: meta.scopeLabel || "",
  });
  const logoDataUrl = await loadLogoDataUrl(brand);
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  let y = drawHeader(doc, brand, naming, logoDataUrl);

  doc.setTextColor(51, 65, 85);
  doc.setFontSize(9);
  doc.text(
    `Generated ${new Date(report.generatedAt).toLocaleString("en-GB")}`,
    14,
    y
  );
  y += 8;

  y = kpiBlock(doc, y, report.kpis, brand);

  y = simpleTable(
    doc,
    y,
    "Requests by status",
    ["Status", "Count"],
    report.requestsByStatus.map((r) => [r.name, String(r.count)]),
    brand
  );
  y = simpleTable(
    doc,
    y,
    "Top requested items",
    ["Item", "Qty requested"],
    report.topRequestedItems.map((r) => [r.name, String(r.quantity)]),
    brand,
    { accent: true }
  );
  y = simpleTable(
    doc,
    y,
    "Top requesters",
    ["Staff", "Requests"],
    report.topRequesters.map((r) => [r.name, String(r.count)]),
    brand
  );

  if (focus === "assets") {
    y = simpleTable(
      doc,
      y,
      "Assets by category",
      ["Category", "Count"],
      report.assetsByCategory.slice(0, 12).map((r) => [r.name, String(r.count)]),
      brand
    );
  }

  if (focus === "admin-consumables" || focus === "project-consumables") {
    y = sectionHeading(doc, y, naming.mainTitle, brand, { accent: true });
    if (meta.scopeLabel) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(meta.scopeLabel, 20, y);
      y += 6;
    }

    if (focus === "admin-consumables") {
      y = simpleTable(
        doc,
        y,
        "Administrative consumables",
        ["Name", "Stock", "Unit", "Status", "Category"],
        (report.administrativeConsumableRows || []).map((r) => [
          r.name,
          String(r.stock),
          r.unit,
          r.status,
          r.category,
        ]),
        brand,
        { accent: true }
      );
      simpleTable(
        doc,
        y,
        "Low / out-of-stock · Administrative",
        ["Item", "Stock", "Unit", "Status"],
        (report.lowStockAdministrative || []).map((r) => [
          r.name,
          String(r.stock),
          r.unit || "—",
          r.status || "—",
        ]),
        brand,
        { accent: true }
      );
    } else {
      y = simpleTable(
        doc,
        y,
        "Project consumables by project",
        ["Project", "Count"],
        (report.consumablesByProject || []).map((r) => [r.name, String(r.count)]),
        brand,
        { accent: true }
      );
      y = simpleTable(
        doc,
        y,
        "Project consumables",
        ["Name", "Project", "Stock", "Unit", "Status", "Category"],
        (report.projectConsumableRows || []).map((r) => [
          r.name,
          r.projectName,
          String(r.stock),
          r.unit,
          r.status,
          r.category,
        ]),
        brand,
        { accent: true }
      );
      simpleTable(
        doc,
        y,
        "Low / out-of-stock · Project",
        ["Item", "Project", "Stock", "Unit", "Status"],
        (report.lowStockProject || []).map((r) => [
          r.name,
          r.projectName || "—",
          String(r.stock),
          r.unit || "—",
          r.status || "—",
        ]),
        brand,
        { accent: true }
      );
    }
  }

  drawClosingBlock(doc, brand, naming, logoDataUrl);
  drawFooter(doc, brand, logoDataUrl);

  const filename = `${naming.filenameBase}.pdf`;
  doc.save(filename);
  return filename;
}

/**
 * Tabular PDF: detailed request / asset / consumable tables for the period.
 */
export async function exportTabularPdf(report, orgCode) {
  const brand = brandingForOrg(orgCode);
  const meta = report.exportMeta || {};
  const focus = meta.focus || "assets";
  const naming = buildReportNaming({
    orgCode: brand.orgCode,
    period: report.period,
    domain: meta.domain || "assets",
    style: "tabular",
    scopeLabel: meta.scopeLabel || "",
  });
  const logoDataUrl = await loadLogoDataUrl(brand);
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });

  let y = drawHeader(doc, brand, naming, logoDataUrl);

  y = simpleTable(
    doc,
    y,
    "Requests in period",
    ["ID", "Requester", "Status", "Stage", "Items", "Created", "Purpose"],
    report.requestRows.map((r) => [
      r.shortId,
      r.requester,
      r.status,
      r.stage,
      String(r.items),
      r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-GB") : "—",
      r.purpose || "—",
    ]),
    brand
  );

  if (focus === "assets") {
    simpleTable(
      doc,
      y,
      "Asset register snapshot",
      ["Name", "Tag", "Category", "Status", "Condition", "Location"],
      report.assetRows.map((r) => [
        r.name,
        r.tag,
        r.category,
        r.status,
        r.condition,
        r.location,
      ]),
      brand
    );
  } else if (focus === "admin-consumables") {
    simpleTable(
      doc,
      y,
      "Administrative consumables",
      ["Name", "Stock", "Unit", "Status", "Category"],
      (report.administrativeConsumableRows || []).map((r) => [
        r.name,
        String(r.stock),
        r.unit,
        r.status,
        r.category,
      ]),
      brand,
      { accent: true }
    );
  } else {
    simpleTable(
      doc,
      y,
      meta.scopeLabel || "Project consumables",
      ["Name", "Project", "Stock", "Unit", "Status", "Category"],
      (report.projectConsumableRows || []).map((r) => [
        r.name,
        r.projectName,
        String(r.stock),
        r.unit,
        r.status,
        r.category,
      ]),
      brand,
      { accent: true }
    );
  }

  drawClosingBlock(doc, brand, naming, logoDataUrl);
  drawFooter(doc, brand, logoDataUrl);

  const filename = `${naming.filenameBase}-Tabular.pdf`;
  doc.save(filename);
  return filename;
}

function toCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const v = String(cell ?? "");
          if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
          return v;
        })
        .join(",")
    )
    .join("\n");
}

/**
 * Download CSV (tabular). section: requests | assets | consumables | summary
 */
export function exportTabularCsv(report, section = "summary", orgCode = "ORG") {
  const brand = brandingForOrg(orgCode);
  const meta = report.exportMeta || {};
  let domain = meta.domain || "operations";
  if (section === "assets") domain = "assets";
  if (section === "consumables") domain = "consumables";
  if (section === "requests") domain = meta.domain || "operations";

  const naming = buildReportNaming({
    orgCode: brand.orgCode,
    period: report.period,
    domain,
    style: "tabular",
    scopeLabel: meta.scopeLabel || "",
  });

  let rows = [];
  if (section === "requests") {
    rows = [
      ["ID", "Requester", "Status", "Stage", "Items", "Created", "Purpose"],
      ...report.requestRows.map((r) => [
        r.shortId,
        r.requester,
        r.status,
        r.stage,
        r.items,
        r.createdAt || "",
        r.purpose || "",
      ]),
    ];
  } else if (section === "assets") {
    rows = [
      ["Name", "Tag", "Category", "Status", "Condition", "Location"],
      ...report.assetRows.map((r) => [
        r.name,
        r.tag,
        r.category,
        r.status,
        r.condition,
        r.location,
      ]),
    ];
  } else if (section === "consumables") {
    rows = [
      ["Scope", "Project", "Name", "Stock", "Unit", "Status", "Category"],
      ...(report.administrativeConsumableRows || []).map((r) => [
        "Administrative",
        "Administrative",
        r.name,
        r.stock,
        r.unit,
        r.status,
        r.category,
      ]),
      ...(report.projectConsumableRows || []).map((r) => [
        "Project",
        r.projectName,
        r.name,
        r.stock,
        r.unit,
        r.status,
        r.category,
      ]),
    ];
  } else {
    rows = [
      ["Metric", "Value"],
      ["Report", naming.mainTitle],
      ["Period", formatPeriodLabel(report.period.start, report.period.end)],
      ...Object.entries(report.kpis).map(([k, v]) => [k, v]),
    ];
  }

  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const sectionSlug =
    section === "summary"
      ? "KPI-Summary"
      : section.charAt(0).toUpperCase() + section.slice(1);
  a.download = `${naming.filenameBase}-${sectionSlug}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
