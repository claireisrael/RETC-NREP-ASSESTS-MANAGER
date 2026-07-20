"use client";

import { useEffect, useState } from "react";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Textarea } from "../../../components/ui/textarea";
import { Label } from "../../../components/ui/label";
import { PageLoading } from "../../../components/ui/loading";
import {
  returnReportsService,
  assetsService,
  assetReturnsService,
  staffService,
  needsReturnExceptionL2,
  mapReportConditionToDelta,
  mapReportConditionToPostCondition,
} from "../../../lib/appwrite/provider.js";
import { getCurrentStaff, permissions } from "../../../lib/utils/auth.js";
import { ENUMS } from "../../../lib/appwrite/config.js";
import {
  notifyReturnReportAwareness,
  notifyReturnReportNeedsL2,
} from "../../../lib/services/return-availability-notifications.js";
import { RotateCcw, ShieldAlert } from "lucide-react";

export default function AdminReturnsPage() {
  const [staff, setStaff] = useState(null);
  const [pending, setPending] = useState([]);
  const [l2Queue, setL2Queue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState({});
  const [busyId, setBusyId] = useState("");

  const canAdmin =
    staff &&
    (permissions.canManageAssets(staff) || permissions.canIssueAssets(staff));
  const canL2 = staff && permissions.canApproveL2(staff);

  const enrichReports = async (docs) => {
    return Promise.all(
      (docs || []).map(async (report) => {
        let item = null;
        let submitter = null;
        try {
          item = await assetsService.get(report.assetId);
        } catch {
          item = { name: "Unknown item", $id: report.assetId };
        }
        try {
          if (report.submittedByStaffId) {
            submitter = await staffService.get(report.submittedByStaffId);
          }
        } catch {
          /* ignore */
        }
        return { report, item, submitter };
      })
    );
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const current = await getCurrentStaff();
      setStaff(current);
      if (!current) {
        setError("Please sign in.");
        return;
      }

      const adminOk =
        permissions.canManageAssets(current) ||
        permissions.canIssueAssets(current);
      const l2Ok = permissions.canApproveL2(current);

      if (!adminOk && !l2Ok) {
        setError("You do not have access to return reports.");
        setPending([]);
        setL2Queue([]);
        return;
      }

      if (adminOk) {
        const res = await returnReportsService.listPendingAdmin();
        setPending(await enrichReports(res.documents));
      } else {
        setPending([]);
      }

      if (l2Ok) {
        const openAssigned = await returnReportsService.listAwaitingL2();
        const mine = (openAssigned.documents || []).filter(
          (r) =>
            !r.assignedL2StaffId || r.assignedL2StaffId === current.$id
        );
        setL2Queue(await enrichReports(mine));
      } else {
        setL2Queue([]);
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to load return reports");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const confirmAdmin = async (row) => {
    const { report, item } = row;
    setBusyId(report.$id);
    setError("");
    try {
      const adminNotes = (notes[report.$id] || "").trim();
      const condition = report.reportedCondition;
      const exception = needsReturnExceptionL2(condition);

      await assetReturnsService.processReturn({
        assetId: report.assetId,
        issueId: report.issueId,
        receivedByStaffId: staff.$id,
        postCondition: mapReportConditionToPostCondition(condition),
        delta: mapReportConditionToDelta(condition),
        remarks: [adminNotes, report.reason, report.recommendation]
          .filter(Boolean)
          .join(" | "),
        missingAccessories: report.accessoriesMissing || [],
      });

      if (exception) {
        const assignedL2 =
          report.assignedL2StaffId ||
          item?.assignedAvailabilityL2StaffId ||
          "";
        await returnReportsService.update(report.$id, {
          status: ENUMS.RETURN_REPORT_STATUS.AWAITING_L2,
          adminConfirmedByStaffId: staff.$id,
          adminConfirmedAt: new Date().toISOString(),
          adminNotes,
          assignedL2StaffId: assignedL2,
        });
        const updated = await returnReportsService.get(report.$id);
        await notifyReturnReportNeedsL2({
          report: updated,
          item,
          adminStaff: staff,
          orgId: report.orgId,
        });
      } else {
        await returnReportsService.update(report.$id, {
          status: ENUMS.RETURN_REPORT_STATUS.CLOSED,
          adminConfirmedByStaffId: staff.$id,
          adminConfirmedAt: new Date().toISOString(),
          adminNotes,
        });
        await notifyReturnReportAwareness({
          report,
          item,
          adminStaff: staff,
          orgId: report.orgId,
        });
      }
      await load();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to confirm return");
    } finally {
      setBusyId("");
    }
  };

  const acknowledgeL2 = async (row) => {
    const { report } = row;
    setBusyId(report.$id);
    setError("");
    try {
      await returnReportsService.update(report.$id, {
        status: ENUMS.RETURN_REPORT_STATUS.CLOSED,
        l2AcknowledgedByStaffId: staff.$id,
        l2AcknowledgedAt: new Date().toISOString(),
      });
      await load();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to acknowledge");
    } finally {
      setBusyId("");
    }
  };

  if (loading) return <PageLoading message="Loading return reports…" />;

  return (
    <div
      className="min-h-screen"
      style={{
        background:
          "linear-gradient(160deg, var(--org-background), #ffffff 55%)",
      }}
    >
      <div className="mx-auto max-w-5xl space-y-8 p-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Return reports
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Review holder-submitted returns, confirm intake, and acknowledge
            exceptions when condition is poor or lost.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {canAdmin && (
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
              <RotateCcw className="h-5 w-5 text-[var(--org-primary)]" />
              Awaiting admin confirmation
            </h2>
            {pending.length === 0 ? (
              <Card className="border-slate-200 shadow-none">
                <CardContent className="py-10 text-center text-sm text-slate-500">
                  No submitted return reports.
                </CardContent>
              </Card>
            ) : (
              pending.map((row) => (
                <ReportCard
                  key={row.report.$id}
                  row={row}
                  note={notes[row.report.$id] || ""}
                  onNoteChange={(v) =>
                    setNotes((prev) => ({ ...prev, [row.report.$id]: v }))
                  }
                  actionLabel={
                    needsReturnExceptionL2(row.report.reportedCondition)
                      ? "Confirm & escalate to L2"
                      : "Confirm intake"
                  }
                  busy={busyId === row.report.$id}
                  onAction={() => confirmAdmin(row)}
                />
              ))
            )}
          </section>
        )}

        {canL2 && (
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
              Exceptions awaiting L2 acknowledgement
            </h2>
            {l2Queue.length === 0 ? (
              <Card className="border-slate-200 shadow-none">
                <CardContent className="py-10 text-center text-sm text-slate-500">
                  No exceptions waiting for you.
                </CardContent>
              </Card>
            ) : (
              l2Queue.map((row) => (
                <ReportCard
                  key={row.report.$id}
                  row={row}
                  busy={busyId === row.report.$id}
                  actionLabel="Acknowledge write-off"
                  onAction={() => acknowledgeL2(row)}
                  hideNotes
                />
              ))
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function ReportCard({
  row,
  note,
  onNoteChange,
  actionLabel,
  onAction,
  busy,
  hideNotes,
}) {
  const { report, item, submitter } = row;
  return (
    <Card className="border-slate-200/80 shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {item?.name || "Item"}
          <Badge variant="secondary">{report.reportedCondition}</Badge>
          <Badge variant="outline">{report.status}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-slate-600">
        <p>
          Submitted by {submitter?.name || "staff"}
          {report.submittedAt
            ? ` on ${new Date(report.submittedAt).toLocaleString()}`
            : ""}
        </p>
        {report.reason && (
          <p>
            <span className="font-medium text-slate-800">Reason:</span>{" "}
            {report.reason}
          </p>
        )}
        {report.recommendation && (
          <p>
            <span className="font-medium text-slate-800">Recommendation:</span>{" "}
            {report.recommendation}
          </p>
        )}
        {(report.accessoriesMissing || []).length > 0 && (
          <p>
            <span className="font-medium text-slate-800">Missing:</span>{" "}
            {report.accessoriesMissing.join(", ")}
          </p>
        )}
        {!hideNotes && (
          <div className="space-y-1.5">
            <Label htmlFor={`notes-${report.$id}`}>Admin notes</Label>
            <Textarea
              id={`notes-${report.$id}`}
              value={note}
              onChange={(e) => onNoteChange?.(e.target.value)}
              rows={2}
              placeholder="Optional intake notes"
            />
          </div>
        )}
        <Button onClick={onAction} disabled={busy}>
          {busy ? "Working…" : actionLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
