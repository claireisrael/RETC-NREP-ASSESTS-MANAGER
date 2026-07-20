"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../ui/dialog";
import {
  returnReportsService,
  needsReturnExceptionL2,
} from "../../lib/appwrite/provider.js";
import { ENUMS } from "../../lib/appwrite/config.js";
import { getCurrentStaff } from "../../lib/utils/auth.js";
import { notifyReturnReportSubmitted } from "../../lib/services/return-availability-notifications.js";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Loader2,
  Package,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";

const CONDITION_OPTIONS = [
  {
    value: ENUMS.RETURN_REPORT_CONDITION.GOOD,
    label: "Good",
    hint: "Ready to go back into stock",
    icon: CheckCircle2,
    activeRing: "ring-emerald-500/40",
    activeBg: "bg-emerald-50 border-emerald-300",
    iconBg: "bg-emerald-100 text-emerald-700",
  },
  {
    value: ENUMS.RETURN_REPORT_CONDITION.FAIR,
    label: "Fair",
    hint: "Usable with minor wear",
    icon: Sparkles,
    activeRing: "ring-sky-500/40",
    activeBg: "bg-sky-50 border-sky-300",
    iconBg: "bg-sky-100 text-sky-700",
  },
  {
    value: ENUMS.RETURN_REPORT_CONDITION.POOR,
    label: "Poor",
    hint: "Needs repair or write-off review",
    icon: AlertTriangle,
    activeRing: "ring-amber-500/40",
    activeBg: "bg-amber-50 border-amber-300",
    iconBg: "bg-amber-100 text-amber-700",
  },
  {
    value: ENUMS.RETURN_REPORT_CONDITION.LOST,
    label: "Lost",
    hint: "Item was not returned",
    icon: X,
    activeRing: "ring-red-500/40",
    activeBg: "bg-red-50 border-red-300",
    iconBg: "bg-red-100 text-red-700",
  },
];

/**
 * Holder submits a digital return report for an open issue.
 */
export function ReturnReportDialog({
  open,
  onOpenChange,
  issue,
  item,
  onSuccess,
}) {
  const [condition, setCondition] = useState(
    ENUMS.RETURN_REPORT_CONDITION.GOOD
  );
  const [reason, setReason] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [returned, setReturned] = useState([]);
  const [missing, setMissing] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const accessoryOptions = useMemo(() => {
    const fromIssue = Array.isArray(issue?.accessories)
      ? issue.accessories
      : [];
    const fromItem = Array.isArray(item?.accessories) ? item.accessories : [];
    return [...new Set([...fromIssue, ...fromItem].map(String).filter(Boolean))];
  }, [issue, item]);

  useEffect(() => {
    if (!open) return;
    setCondition(ENUMS.RETURN_REPORT_CONDITION.GOOD);
    setReason("");
    setRecommendation("");
    setReturned([...accessoryOptions]);
    setMissing([]);
    setError("");
  }, [open, accessoryOptions]);

  const needsDetail = needsReturnExceptionL2(condition);
  const isConsumable = item?.itemType === ENUMS.ITEM_TYPE.CONSUMABLE;
  const qty = Math.max(1, Number(issue?.quantity) || 1);

  const setAccessoryStatus = (name, status) => {
    if (status === "returned") {
      setReturned((prev) =>
        prev.includes(name) ? prev : [...prev, name]
      );
      setMissing((prev) => prev.filter((a) => a !== name));
    } else if (status === "missing") {
      setMissing((prev) =>
        prev.includes(name) ? prev : [...prev, name]
      );
      setReturned((prev) => prev.filter((a) => a !== name));
    }
  };

  const getAccessoryStatus = (name) => {
    if (returned.includes(name)) return "returned";
    if (missing.includes(name)) return "missing";
    return null;
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!issue?.$id || !item?.$id) return;

    if (needsDetail && !reason.trim()) {
      setError("Please explain why the item is poor or lost.");
      return;
    }
    if (needsDetail && !recommendation.trim()) {
      setError("Please add a recommendation for poor or lost items.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const staff = await getCurrentStaff();
      if (!staff?.$id) {
        throw new Error("You must be signed in to submit a return.");
      }

      const report = await returnReportsService.create({
        assetId: item.$id,
        issueId: issue.$id,
        requestId: issue.requestId || "",
        submittedByStaffId: staff.$id,
        reportedCondition: condition,
        reason: reason.trim(),
        recommendation: recommendation.trim(),
        accessoriesReturned: returned,
        accessoriesMissing: missing,
        assignedL2StaffId: "",
        status: ENUMS.RETURN_REPORT_STATUS.SUBMITTED,
      });

      await notifyReturnReportSubmitted({
        report,
        item,
        requester: staff,
        orgId: item.orgId || staff.orgId,
      });

      onOpenChange?.(false);
      onSuccess?.(report);
    } catch (err) {
      console.error("Failed to submit return report:", err);
      setError(err?.message || "Failed to submit return report");
    } finally {
      setSubmitting(false);
    }
  };

  if (!item || !issue) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] p-0 overflow-hidden border-0 shadow-none bg-transparent max-w-[calc(100vw-2rem)]">
        <div className="border border-slate-200/90 rounded-2xl overflow-hidden bg-white shadow-2xl">
          {/* Header */}
          <div
            className="px-6 pt-6 pb-5 border-b border-slate-100"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--org-background) 90%, white), white 70%)",
            }}
          >
            <div className="flex items-start gap-4">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-md"
                style={{
                  background:
                    "linear-gradient(135deg, var(--org-primary), var(--org-primary-dark))",
                }}
              >
                <RotateCcw className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-xl font-semibold text-slate-900 tracking-tight">
                  Submit return report
                </DialogTitle>
                <DialogDescription className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                  Tell stores the condition of this item so they can confirm
                  intake when you hand it back.
                </DialogDescription>
              </div>
            </div>

            {/* Item summary */}
            <div
              className="mt-4 rounded-xl px-4 py-3.5 flex items-start gap-3"
              style={{
                background:
                  "color-mix(in srgb, var(--org-background) 80%, white)",
                border:
                  "1px solid color-mix(in srgb, var(--org-primary) 16%, transparent)",
              }}
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{
                  background:
                    "color-mix(in srgb, var(--org-highlight) 18%, white)",
                  color: "var(--org-highlight-dark)",
                }}
              >
                <Package className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900 truncate">
                  {item.name}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <Badge
                    variant="secondary"
                    className="text-[11px] font-medium px-2 py-0"
                  >
                    {isConsumable ? "Consumable" : "Asset"}
                  </Badge>
                  {item.assetTag && (
                    <span className="font-mono text-slate-500">
                      {item.assetTag}
                    </span>
                  )}
                  <span>Qty {qty}</span>
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="px-6 py-5 space-y-6 max-h-[min(52vh,480px)] overflow-y-auto">
              {/* Condition picker */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold text-slate-800">
                  Condition on return
                </Label>
                <div className="grid grid-cols-2 gap-2.5">
                  {CONDITION_OPTIONS.map((opt) => {
                    const selected = condition === opt.value;
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setCondition(opt.value)}
                        className={[
                          "relative flex flex-col items-start gap-2 rounded-xl border-2 p-3.5 text-left transition-all duration-200",
                          "hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                          selected
                            ? `${opt.activeBg} ${opt.activeRing} ring-2 shadow-sm`
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80",
                        ].join(" ")}
                        style={
                          selected
                            ? {
                                focusVisibleRingColor: "var(--org-primary)",
                              }
                            : undefined
                        }
                      >
                        {selected && (
                          <span className="absolute top-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm">
                            <Check
                              className="h-3 w-3"
                              style={{ color: "var(--org-primary)" }}
                            />
                          </span>
                        )}
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-lg ${opt.iconBg}`}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span>
                          <span className="block text-sm font-semibold text-slate-900">
                            {opt.label}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                            {opt.hint}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Accessories */}
              {accessoryOptions.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-sm font-semibold text-slate-800">
                      Accessories
                    </Label>
                    <button
                      type="button"
                      onClick={() => {
                        setReturned([...accessoryOptions]);
                        setMissing([]);
                      }}
                      className="text-xs font-medium transition-colors hover:underline"
                      style={{ color: "var(--org-primary)" }}
                    >
                      Mark all returned
                    </button>
                  </div>
                  <div className="space-y-2">
                    {accessoryOptions.map((name) => {
                      const status = getAccessoryStatus(name);
                      return (
                        <div
                          key={name}
                          className="flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <span className="text-sm font-medium text-slate-800">
                            {name}
                          </span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setAccessoryStatus(name, "returned")
                              }
                              className={[
                                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                                status === "returned"
                                  ? "bg-emerald-600 text-white shadow-sm"
                                  : "bg-white border border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-700",
                              ].join(" ")}
                            >
                              <Check className="h-3.5 w-3.5" />
                              Returned
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setAccessoryStatus(name, "missing")
                              }
                              className={[
                                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                                status === "missing"
                                  ? "bg-red-600 text-white shadow-sm"
                                  : "bg-white border border-slate-200 text-slate-600 hover:border-red-300 hover:text-red-700",
                              ].join(" ")}
                            >
                              <X className="h-3.5 w-3.5" />
                              Missing
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Poor / lost details */}
              {needsDetail && (
                <div
                  className="space-y-4 rounded-xl border px-4 py-4"
                  style={{
                    borderColor:
                      "color-mix(in srgb, var(--org-highlight) 35%, transparent)",
                    background:
                      "color-mix(in srgb, var(--org-highlight) 8%, white)",
                  }}
                >
                  <p className="text-sm font-medium text-slate-800 flex items-center gap-2">
                    <AlertTriangle
                      className="h-4 w-4 shrink-0"
                      style={{ color: "var(--org-highlight-dark)" }}
                    />
                    Additional details required
                  </p>
                  <div className="space-y-2">
                    <Label
                      htmlFor="return-reason"
                      className="text-sm font-medium text-slate-700"
                    >
                      What happened? <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      id="return-reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={3}
                      placeholder="Describe damage, loss, or circumstances…"
                      className="resize-none rounded-xl border-slate-200 bg-white focus-visible:ring-[var(--org-primary)]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="return-recommendation"
                      className="text-sm font-medium text-slate-700"
                    >
                      Your recommendation{" "}
                      <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      id="return-recommendation"
                      value={recommendation}
                      onChange={(e) => setRecommendation(e.target.value)}
                      rows={2}
                      placeholder="e.g. Repair, write-off, replace…"
                      className="resize-none rounded-xl border-slate-200 bg-white focus-visible:ring-[var(--org-primary)]"
                    />
                  </div>
                </div>
              )}

              {error && (
                <div
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                  role="alert"
                >
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange?.(false)}
                disabled={submitting}
                className="min-w-[96px] rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="min-w-[140px] rounded-xl text-white shadow-md hover:shadow-lg transition-shadow"
                style={{
                  background:
                    "linear-gradient(135deg, var(--org-primary), var(--org-primary-dark))",
                }}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  "Submit report"
                )}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
