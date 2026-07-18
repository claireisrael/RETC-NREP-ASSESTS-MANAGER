"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Label } from "../../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Badge } from "../../../components/ui/badge";
import {
  Download,
  FileSpreadsheet,
  FileText,
  LayoutGrid,
  RefreshCw,
} from "lucide-react";
import { getCurrentStaff, permissions } from "../../../lib/utils/auth.js";
import {
  assetsService,
  assetRequestsService,
  staffService,
  assetIssuesService,
  projectsService,
} from "../../../lib/appwrite/provider.js";
import { ENUMS } from "../../../lib/appwrite/config.js";
import { Query } from "appwrite";
import { useOrgTheme } from "../../../components/providers/org-theme-provider";
import { PageLoading } from "../../../components/ui/loading";
import {
  REPORT_PERIOD_PRESETS,
  resolveReportPeriod,
  buildReportNaming,
} from "../../../lib/utils/report-period.js";
import { buildReportAnalytics } from "../../../lib/services/report-builder.js";
import {
  exportAnalyticsPdf,
  exportTabularPdf,
  exportTabularCsv,
} from "../../../lib/services/report-export.js";

const ADMIN_PLACEHOLDER_PROJECT_ID = "ADMIN";

const REPORT_FOCUSES = [
  { id: "assets", label: "Assets" },
  { id: "admin-consumables", label: "Administrative consumables" },
  { id: "project-consumables", label: "Project consumables" },
];

function isConsumableDoc(item) {
  return item?.itemType === ENUMS.ITEM_TYPE.CONSUMABLE;
}

function isAdministrativeConsumable(item) {
  const projectId = item?.projectId;
  return !projectId || projectId === ADMIN_PLACEHOLDER_PROJECT_ID;
}

export default function AdminReports() {
  const { orgCode, theme } = useOrgTheme();
  const isNrepOrg = (orgCode || "").toUpperCase() === "NREP";
  const [staff, setStaff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [presetId, setPresetId] = useState("1m");
  const [customMonths, setCustomMonths] = useState(4);
  const [layoutMode, setLayoutMode] = useState("analytics");
  const [reportFocus, setReportFocus] = useState("assets");
  const [projectFilter, setProjectFilter] = useState("all");
  const [raw, setRaw] = useState({
    assets: [],
    requests: [],
    staffList: [],
    issues: [],
    projects: [],
  });

  const period = useMemo(
    () =>
      resolveReportPeriod({
        presetId,
        customMonths,
        endDate: new Date(),
      }),
    [presetId, customMonths]
  );

  const projectLookup = useMemo(() => {
    const map = new Map();
    (raw.projects || []).forEach((project) => {
      if (!project?.$id) return;
      map.set(
        project.$id,
        project.name || project.title || project.code || project.$id
      );
    });
    return map;
  }, [raw.projects]);

  const scopeLabel = useMemo(() => {
    if (reportFocus === "assets") return "Assets register";
    if (reportFocus === "admin-consumables") {
      return "Administrative consumables";
    }
    if (projectFilter === "all") {
      return "Project consumables · All projects";
    }
    return `Project consumables · ${
      projectLookup.get(projectFilter) || "Selected project"
    }`;
  }, [reportFocus, projectFilter, projectLookup]);

  const scopedAssets = useMemo(() => {
    const docs = raw.assets || [];
    if (reportFocus === "assets") {
      return docs.filter((item) => !isConsumableDoc(item));
    }
    if (reportFocus === "admin-consumables") {
      return docs.filter(
        (item) => isConsumableDoc(item) && isAdministrativeConsumable(item)
      );
    }
    // project consumables
    return docs.filter((item) => {
      if (!isConsumableDoc(item) || isAdministrativeConsumable(item)) {
        return false;
      }
      if (projectFilter === "all") return true;
      return item.projectId === projectFilter;
    });
  }, [raw.assets, reportFocus, projectFilter]);

  const reportDomain =
    reportFocus === "assets" ? "assets" : "consumables";

  const report = useMemo(() => {
    const built = buildReportAnalytics({
      assets: scopedAssets,
      itemCatalog: raw.assets,
      requests: raw.requests,
      staff: raw.staffList,
      issues: raw.issues,
      projects: raw.projects,
      period,
    });
    return {
      ...built,
      exportMeta: {
        focus: reportFocus,
        domain: reportDomain,
        scopeLabel,
        projectId: projectFilter,
      },
    };
  }, [
    scopedAssets,
    raw.assets,
    raw.requests,
    raw.staffList,
    raw.issues,
    raw.projects,
    period,
    reportFocus,
    reportDomain,
    scopeLabel,
    projectFilter,
  ]);

  const reportNaming = useMemo(
    () =>
      buildReportNaming({
        orgCode,
        period,
        domain: reportDomain,
        style: layoutMode === "tabular" ? "tabular" : "analytics",
        scopeLabel,
      }),
    [orgCode, period, reportDomain, layoutMode, scopeLabel]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const current = await getCurrentStaff();
      if (!current || !permissions.canViewReports(current)) {
        window.location.href = "/unauthorized";
        return;
      }
      setStaff(current);

      const [assetsRes, consumablesRes, requestsRes, staffRes, issuesRes, projectsRes] =
        await Promise.all([
          assetsService.getAssets([Query.limit(2000)]),
          assetsService.getConsumables([Query.limit(2000)]),
          assetRequestsService.list([
            Query.orderDesc("$createdAt"),
            Query.limit(500),
          ]),
          staffService.list([Query.limit(500)]),
          assetIssuesService
            .list([Query.orderDesc("$createdAt"), Query.limit(500)])
            .catch(() => ({ documents: [] })),
          projectsService
            .list([Query.orderAsc("name"), Query.limit(200)])
            .catch(() => ({ documents: [] })),
        ]);

      setRaw({
        assets: [
          ...(assetsRes.documents || []),
          ...(consumablesRes.documents || []),
        ],
        requests: requestsRes.documents || [],
        staffList: staffRes.documents || [],
        issues: issuesRes.documents || [],
        projects: projectsRes.documents || [],
      });
    } catch (err) {
      console.error(err);
      setError("Failed to load report data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (reportFocus !== "project-consumables") {
      setProjectFilter("all");
    }
  }, [reportFocus]);

  const runExport = async (kind) => {
    setExporting(true);
    setError("");
    try {
      if (kind === "analytics-pdf") {
        await exportAnalyticsPdf(report, orgCode);
      } else if (kind === "tabular-pdf") {
        await exportTabularPdf(report, orgCode);
      } else if (kind === "csv-summary") {
        exportTabularCsv(report, "summary", orgCode);
      } else if (kind === "csv-requests") {
        exportTabularCsv(report, "requests", orgCode);
      } else if (kind === "csv-assets") {
        exportTabularCsv(report, "assets", orgCode);
      } else if (kind === "csv-consumables") {
        exportTabularCsv(report, "consumables", orgCode);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <PageLoading message="Preparing reports…" />;
  }

  const kpis = report.kpis;
  const primary = theme?.colors?.primary || "#2E9ECC";
  const accent = theme?.colors?.accent || theme?.colors?.highlight || "#EFA74F";

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
            Reports
          </h1>
          <div className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 max-w-2xl">
            <p className="text-sm font-semibold text-slate-900 tracking-wide">
              {reportNaming.mainTitle}
            </p>
            <p className="text-sm text-slate-600">{reportNaming.styleLine}</p>
            <p className="text-xs text-slate-500 mt-1">
              {reportNaming.periodLine}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={loadData}
          disabled={loading || exporting}
          className="self-start"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh data
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Report controls</CardTitle>
          <CardDescription>
            Choose what to download, then pick the period and format.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Report for</Label>
              <Select value={reportFocus} onValueChange={setReportFocus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_FOCUSES.map((focus) => (
                    <SelectItem key={focus.id} value={focus.id}>
                      {focus.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {reportFocus === "project-consumables" ? (
              <div className="space-y-2">
                <Label>Project</Label>
                <Select value={projectFilter} onValueChange={setProjectFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All projects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      All projects (combined)
                    </SelectItem>
                    {(raw.projects || []).map((project) => (
                      <SelectItem key={project.$id} value={project.$id}>
                        {project.name ||
                          project.title ||
                          project.code ||
                          project.$id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Time range</Label>
              <Select value={presetId} onValueChange={setPresetId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_PERIOD_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {presetId === "custom" ? (
              <div className="space-y-2">
                <Label>Number of months</Label>
                <Select
                  value={String(customMonths)}
                  onValueChange={(v) => setCustomMonths(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} month{n === 1 ? "" : "s"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>Report style</Label>
              <Select value={layoutMode} onValueChange={setLayoutMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="analytics">Analytics</SelectItem>
                  <SelectItem value="tabular">Tabular</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {layoutMode === "analytics" ? (
              <Button
                disabled={exporting}
                onClick={() => runExport("analytics-pdf")}
                className="bg-org-gradient text-white"
              >
                <FileText className="w-4 h-4 mr-2" />
                Download analytics PDF
              </Button>
            ) : (
              <>
                <Button
                  disabled={exporting}
                  onClick={() => runExport("tabular-pdf")}
                  className="bg-org-gradient text-white"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Download tabular PDF
                </Button>
                <Button
                  disabled={exporting}
                  variant="outline"
                  onClick={() => runExport("csv-requests")}
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  CSV · requests
                </Button>
                {reportFocus === "assets" ? (
                  <Button
                    disabled={exporting}
                    variant="outline"
                    onClick={() => runExport("csv-assets")}
                  >
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    CSV · assets
                  </Button>
                ) : (
                  <Button
                    disabled={exporting}
                    variant="outline"
                    onClick={() => runExport("csv-consumables")}
                  >
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    CSV · consumables
                  </Button>
                )}
              </>
            )}
            <Button
              disabled={exporting}
              variant="outline"
              onClick={() => runExport("csv-summary")}
            >
              <Download className="w-4 h-4 mr-2" />
              CSV · KPI summary
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Requests submitted",
            value: kpis.requestsSubmitted,
            hint: "In selected period",
            tone: "primary",
          },
          {
            label: "Approved / fulfilled",
            value: `${kpis.requestsApproved} / ${kpis.requestsFulfilled}`,
            hint: "Decided positively",
            tone: "accent",
          },
          reportFocus === "assets"
            ? {
                label: "Assets available",
                value: kpis.assetsAvailable,
                hint: `of ${kpis.assetsTotal} assets`,
                tone: "primary",
              }
            : {
                label:
                  reportFocus === "admin-consumables"
                    ? "Admin consumables"
                    : "Project consumables",
                value:
                  reportFocus === "admin-consumables"
                    ? kpis.consumablesAdministrative ?? 0
                    : kpis.consumablesProject ?? 0,
                hint: `${kpis.consumablesLowStock ?? 0} low stock`,
                tone: "accent",
              },
          {
            label: "Avg days to L1",
            value: kpis.avgDaysToL1,
            hint: "First decision speed",
            tone: "primary",
          },
        ].map((card) => (
          <Card
            key={card.label}
            className="border-slate-200 shadow-none overflow-hidden"
          >
            <div
              className="h-1"
              style={{
                background:
                  card.tone === "accent"
                    ? `linear-gradient(90deg, ${accent}, ${primary})`
                    : `linear-gradient(90deg, ${primary}, ${accent})`,
              }}
            />
            <CardContent className="pt-5 pb-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {card.label}
              </p>
              <p
                className="text-2xl font-bold mt-1 tabular-nums"
                style={{
                  color: card.tone === "accent" ? accent : primary,
                }}
              >
                {card.value}
              </p>
              <p className="text-xs text-slate-500 mt-1">{card.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <LayoutGrid className="w-4 h-4" />
              Top requested items
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {report.topRequestedItems.length === 0 ? (
              <p className="text-sm text-slate-500">No requests in this period.</p>
            ) : (
              report.topRequestedItems.slice(0, 8).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between text-sm border-b border-slate-100 pb-2 last:border-0"
                >
                  <span className="text-slate-700 truncate pr-3">
                    {item.name}
                  </span>
                  <Badge variant="secondary">× {item.quantity}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top requesters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {report.topRequesters.length === 0 ? (
              <p className="text-sm text-slate-500">No requesters in this period.</p>
            ) : (
              report.topRequesters.slice(0, 8).map((row) => (
                <div
                  key={row.name}
                  className="flex items-center justify-between text-sm border-b border-slate-100 pb-2 last:border-0"
                >
                  <span className="text-slate-700 truncate pr-3">
                    {row.name}
                  </span>
                  <Badge variant="secondary">{row.count}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-slate-400 pb-6">
        Signed in as {staff?.name || "admin"} · Export focus:{" "}
        <span className="font-medium text-slate-500">{scopeLabel}</span>
        {isNrepOrg ? " · NREP branding" : ""}
      </p>
    </div>
  );
}
