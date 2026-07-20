"use client";

import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent } from "../../components/ui/card";
import { PageLoading } from "../../components/ui/loading";
import {
  assetIssuesService,
  assetsService,
} from "../../lib/appwrite/provider.js";
import { getCurrentStaff } from "../../lib/utils/auth.js";
import { ENUMS } from "../../lib/appwrite/config.js";
import { ReturnReportDialog } from "../../components/assets/return-report-dialog.js";
import { Package, RotateCcw, Calendar } from "lucide-react";
import { useOrgTheme } from "../../components/providers/org-theme-provider";
import { hexToRgba } from "../../lib/utils/mappings.js";

export default function MyIssuedItemsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const { theme } = useOrgTheme();
  const highlight =
    theme?.colors?.highlight || theme?.colors?.accent || "#EFA74F";

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const current = await getCurrentStaff();
      if (!current?.$id) {
        setError("Please sign in to view issued items.");
        setRows([]);
        return;
      }
      const issues = await assetIssuesService.listOpenReturnableForRequester(
        current.$id
      );
      const enriched = await Promise.all(
        issues.map(async (issue) => {
          let item = null;
          try {
            item = await assetsService.get(issue.assetId);
          } catch {
            item = { $id: issue.assetId, name: "Unknown item" };
          }
          return { issue, item };
        })
      );
      setRows(enriched);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to load issued items");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <PageLoading message="Loading your issued items…" />;

  return (
    <div
      className="min-h-screen"
      style={{ background: theme?.colors?.background || "#f5f5f5" }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            My issued items
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Assets and returnable consumables currently checked out to you.
            Submit a return report when you hand them back.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!error && rows.length === 0 && (
          <Card className="border-slate-200/80 shadow-none">
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center text-slate-600">
              <Package className="h-10 w-10 text-slate-300" />
              <p>You have no open returnable items.</p>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {rows.map(({ issue, item }) => {
            const due = issue.dueAt ? new Date(issue.dueAt) : null;
            const overdue =
              due && !Number.isNaN(due.getTime()) && due < new Date();
            return (
              <Card
                key={issue.$id}
                className="border-slate-200/80 shadow-none bg-white"
                style={{
                  borderColor: overdue
                    ? hexToRgba("#dc2626", 0.35)
                    : hexToRgba(highlight, 0.25),
                }}
              >
                <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-slate-900">
                        {item.name}
                      </h2>
                      <Badge variant="secondary">
                        {item.itemType === ENUMS.ITEM_TYPE.CONSUMABLE
                          ? "Consumable"
                          : "Asset"}
                      </Badge>
                      {overdue && (
                        <Badge className="bg-red-600 text-white">Overdue</Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-600">
                      {item.assetTag ? `Tag ${item.assetTag} · ` : ""}
                      Qty {Math.max(1, Number(issue.quantity) || 1)}
                      {issue.issuedAt
                        ? ` · Issued ${new Date(
                            issue.issuedAt
                          ).toLocaleDateString()}`
                        : ""}
                    </p>
                    {due && !Number.isNaN(due.getTime()) && (
                      <p className="flex items-center gap-1.5 text-sm text-slate-500">
                        <Calendar className="h-3.5 w-3.5" />
                        Return by {due.toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={() => setSelected({ issue, item })}
                    className="shrink-0 gap-2"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Return report
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <ReturnReportDialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        issue={selected?.issue}
        item={selected?.item}
        onSuccess={() => {
          setSelected(null);
          load();
        }}
      />
    </div>
  );
}
