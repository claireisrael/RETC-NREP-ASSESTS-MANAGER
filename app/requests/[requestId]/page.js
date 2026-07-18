"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
// Removed MainLayout to eliminate navbar
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Textarea } from "../../../components/ui/textarea";
import { Label } from "../../../components/ui/label";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import {
  Avatar,
  AvatarFallback,
} from "../../../components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
  DialogFooter,
  DialogDescription,
} from "../../../components/ui/dialog";
import {
  Calendar,
  Clock,
  User,
  FileText,
  Download,
  Package,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Edit3,
  Trash2,
  RotateCcw,
  Eye,
  MessageSquare,
  X,
} from "lucide-react";
import {
  assetRequestsService,
  assetsService,
  staffService,
  assetEventsService,
} from "../../../lib/appwrite/provider.js";
import { assetImageService } from "../../../lib/appwrite/image-service.js";
import {
  getCurrentStaff,
  permissions,
  getCurrentViewMode,
} from "../../../lib/utils/auth.js";
import { ENUMS } from "../../../lib/appwrite/config.js";
import { notifyRequestCreated } from "../../../lib/services/approval-notifications.js";
import { useOrgTheme } from "../../../components/providers/org-theme-provider";
import { useToastContext } from "../../../components/providers/toast-provider";
import { Query } from "appwrite";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  formatCategory,
  getConsumableStatus,
  extractDenialReason,
} from "../../../lib/utils/mappings.js";
import {
  aggregateResolvedItems,
} from "../../../lib/utils/requested-items.js";

export default function RequestDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToastContext();
  const [request, setRequest] = useState(null);
  const [assets, setAssets] = useState([]);
  const [requester, setRequester] = useState(null);
  const [approver, setApprover] = useState(null);
  const [currentStaff, setCurrentStaff] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  // Dialog states
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [resubmitDialogOpen, setResubmitDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [resubmitReason, setResubmitReason] = useState("");
  const { theme, orgCode } = useOrgTheme();

  const aggregatedItems = useMemo(
    () => aggregateResolvedItems(assets || []),
    [assets]
  );

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.requestId]);

  const loadData = async () => {
    try {
      const [requestData, staff] = await Promise.all([
        assetRequestsService.get(params.requestId),
        getCurrentStaff(),
      ]);

      setRequest(requestData);
      setCurrentStaff(staff);

      // Load requester details
      const requesterData = await staffService.get(
        requestData.requesterStaffId
      );
      setRequester(requesterData);

      // Load approver details if exists
      if (requestData.approverStaffId) {
        try {
          const approverData = await staffService.get(
            requestData.approverStaffId
          );
          setApprover(approverData);
        } catch (error) {
          console.warn("Could not load approver data:", error);
        }
      }

      // Load assets details
      const assetsData = await Promise.all(
        requestData.requestedItems.map(async (itemId) => {
          try {
            return await assetsService.get(itemId);
          } catch {
            return { name: "Asset not found", $id: itemId, notFound: true };
          }
        })
      );
      setAssets(assetsData);

      // Load timeline/history
      await loadTimeline(requestData);
    } catch (err) {
      setError("Failed to load request details");
      console.error("Error loading request:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadTimeline = async (requestData) => {
    try {
      // Get related asset events for this request
      const eventsResult = await assetEventsService.list([
        Query.orderDesc("at"),
      ]);

      const timelineItems = [
        {
          id: "created",
          type: "created",
          timestamp: requestData.$createdAt,
          title: "Request Submitted",
          description: `Request submitted by ${requester?.name || "Unknown"}`,
          icon: FileText,
          color: "blue",
        },
      ];

      // Add status changes
      if (
        requestData.status === ENUMS.REQUEST_STATUS.APPROVED &&
        requestData.approvedAt
      ) {
        timelineItems.push({
          id: "approved",
          type: "approved",
          timestamp: requestData.approvedAt,
          title: "Request Approved",
          description: `Approved by ${approver?.name || "Admin"}`,
          notes: requestData.notes || "Request approved",
          icon: CheckCircle,
          color: "green",
        });
      }

      if (
        requestData.status === ENUMS.REQUEST_STATUS.DENIED
      ) {
        timelineItems.push({
          id: "denied",
          type: "denied",
          timestamp: requestData.deniedAt || requestData.$updatedAt,
          title: "Request Denied",
          description: `Denied by ${approver?.name || "Admin"}`,
          notes: extractDenialReason(requestData.purpose) || requestData.denialReason || requestData.notes,
          icon: XCircle,
          color: "red",
        });
      }

      if (requestData.status === ENUMS.REQUEST_STATUS.FULFILLED) {
        timelineItems.push({
          id: "fulfilled",
          type: "fulfilled",
          timestamp: requestData.fulfilledAt || requestData.$updatedAt,
          title: "Assets Issued",
          description: "Assets have been issued and are ready for pickup",
          icon: Package,
          color: "blue",
        });
      }

      // Add asset events
      eventsResult.documents.forEach((event) => {
        timelineItems.push({
          id: event.$id,
          type: "asset_event",
          timestamp: event.at,
          title: `Asset ${event.eventType.replace(/_/g, " ")}`,
          description: event.notes,
          icon: Package,
          color: "gray",
        });
      });

      // Sort by timestamp descending
      timelineItems.sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
      );
      setTimeline(timelineItems);
    } catch (error) {
      console.warn("Could not load timeline:", error);
    }
  };

  const handleCancelRequest = async () => {
    setActionLoading(true);
    setError("");
    try {
      const updateData = {
        status: ENUMS.REQUEST_STATUS.CANCELLED,
      };

      await assetRequestsService.update(request.$id, updateData);

      // Notification sending can be added here if needed
      setCancelDialogOpen(false);
      setCancelReason("");
      await loadData();
    } catch (error) {
      console.error("Cancel request error:", error);
      setError(`Failed to cancel request: ${error.message || "Unknown error"}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteRequest = async () => {
    setActionLoading(true);
    try {
      await assetRequestsService.delete(request.$id);
      setDeleteDialogOpen(false);
      router.push("/requests?deleted=true");
    } catch (error) {
      setError("Failed to delete request");
      setActionLoading(false);
    }
  };

  const handleResubmitRequest = async () => {
    setActionLoading(true);
    try {
      // Create a new request based on the current one
      const newRequestData = {
        requesterStaffId: request.requesterStaffId,
        requestedItems: request.requestedItems,
        requestedAccessories: request.requestedAccessories || [],
        purpose: request.purpose,
        issueDate: request.issueDate,
        expectedReturnDate: request.expectedReturnDate,
        status: ENUMS.REQUEST_STATUS.PENDING,
        approvalStage: ENUMS.APPROVAL_STAGE.L1,
        resubmissionReason: resubmitReason,
        originalRequestId: request.$id,
      };

      const newRequest = await assetRequestsService.create(newRequestData);

      // Notify first-level (L1) approvers about the resubmitted request.
      await notifyRequestCreated(newRequest, requester, assets);

      setResubmitDialogOpen(false);
      setResubmitReason("");
      router.push(`/requests/${newRequest.$id}`);
    } catch (error) {
      setError("Failed to resubmit request");
      setActionLoading(false);
    }
  };

  const getStatusBadgeColor = (status) => {
    const colors = {
      [ENUMS.REQUEST_STATUS.PENDING]:
        "bg-orange-100 text-orange-800 border-orange-200",
      [ENUMS.REQUEST_STATUS.APPROVED]:
        "bg-primary-100 text-primary-800 border-primary-200",
      [ENUMS.REQUEST_STATUS.DENIED]: "bg-red-100 text-red-800 border-red-200",
      [ENUMS.REQUEST_STATUS.CANCELLED]:
        "bg-gray-100 text-gray-800 border-gray-200",
      [ENUMS.REQUEST_STATUS.FULFILLED]:
        "bg-sidebar-100 text-sidebar-800 border-sidebar-200",
    };
    return colors[status] || "bg-gray-100 text-gray-800 border-gray-200";
  };

  const getStatusIcon = (status) => {
    const icons = {
      [ENUMS.REQUEST_STATUS.PENDING]: Clock,
      [ENUMS.REQUEST_STATUS.APPROVED]: CheckCircle,
      [ENUMS.REQUEST_STATUS.DENIED]: XCircle,
      [ENUMS.REQUEST_STATUS.CANCELLED]: XCircle,
      [ENUMS.REQUEST_STATUS.FULFILLED]: Package,
    };
    const IconComponent = icons[status] || AlertTriangle;
    return <IconComponent className="w-4 h-4" />;
  };

  // Permission checks
  const isRequester = currentStaff?.$id === request?.requesterStaffId;
  const isAdmin = currentStaff && permissions.canApproveRequests(currentStaff);
  const viewMode = getCurrentViewMode();
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatDateTime = (dateString) => {
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const canEditRequest =
    isRequester &&
    request?.status === ENUMS.REQUEST_STATUS.PENDING &&
    viewMode === "user";
  const canCancelRequest =
    isRequester &&
    [ENUMS.REQUEST_STATUS.PENDING, ENUMS.REQUEST_STATUS.APPROVED].includes(
      request?.status
    ) &&
    viewMode === "user";
  const canDeleteRequest =
    isRequester &&
    request?.status === ENUMS.REQUEST_STATUS.PENDING &&
    viewMode === "user";
  const canResubmitRequest =
    isRequester &&
    request?.status === ENUMS.REQUEST_STATUS.DENIED &&
    viewMode === "user";

  const hexToRgb = (hex) => {
    if (!hex) return [14, 99, 112];
    let sanitized = hex.replace("#", "");
    if (sanitized.length === 3) {
      sanitized = sanitized
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const intVal = parseInt(sanitized, 16);
    return [
      (intVal >> 16) & 255,
      (intVal >> 8) & 255,
      intVal & 255,
    ];
  };

  const handleDownloadRequest = async () => {
    if (!request) return;
    try {
      setDownloading(true);
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 40;
      const contentWidth = pageWidth - margin * 2;

      const colors = theme?.colors || {};
      const primaryHex = colors.primary || "#2E9ECC";
      const primaryDarkHex = colors.primaryDark || "#357C9D";
      const highlightHex = colors.highlight || "#EFA74F";
      const primaryRgb = hexToRgb(primaryHex);
      const primaryDarkRgb = hexToRgb(primaryDarkHex);
      const highlightRgb = hexToRgb(highlightHex);
      const slateRgb = [71, 85, 105];
      const orgName = theme?.name || orgCode || "Asset Workspace";

      // Header banner
      doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
      doc.rect(0, 0, pageWidth, 78, "F");
      doc.setFillColor(highlightRgb[0], highlightRgb[1], highlightRgb[2]);
      doc.rect(0, 78, pageWidth, 4, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text(`${orgName}`, margin, 34);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text("Asset Request Summary", margin, 54);
      doc.setFontSize(9);
      doc.text(`Generated ${formatDateTime(new Date().toISOString())}`, pageWidth - margin, 54, {
        align: "right",
      });

      let y = 108;

      // Request ID + status pill row
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(primaryDarkRgb[0], primaryDarkRgb[1], primaryDarkRgb[2]);
      doc.text(`Request #${request.$id.slice(-8)}`, margin, y);

      const statusText = (request.status || "PENDING").replace(/_/g, " ");
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      const statusWidth = doc.getTextWidth(statusText) + 16;
      doc.setFillColor(highlightRgb[0], highlightRgb[1], highlightRgb[2]);
      doc.roundedRect(pageWidth - margin - statusWidth, y - 11, statusWidth, 16, 3, 3, "F");
      doc.setTextColor(255, 255, 255);
      doc.text(statusText, pageWidth - margin - statusWidth / 2, y, { align: "center" });
      y += 28;

      // Meta info box
      const metaRows = [
        ["Request ID", request.$id],
        ["Requester", requester?.name || request.requesterName || "—"],
        ["Department", requester?.department || "Not specified"],
        ["Submitted", request.$createdAt ? formatDateTime(request.$createdAt) : "—"],
        ["Issue Date", request.issueDate ? formatDate(request.issueDate) : "—"],
        [
          "Expected Return",
          request.expectedReturnDate ? formatDate(request.expectedReturnDate) : "—",
        ],
      ];

      doc.setFillColor(248, 250, 252);
      doc.roundedRect(margin, y, contentWidth, metaRows.length * 18 + 16, 6, 6, "F");
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, y, contentWidth, metaRows.length * 18 + 16, 6, 6, "S");

      let metaY = y + 18;
      metaRows.forEach(([label, value]) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
        doc.text(label, margin + 12, metaY);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(slateRgb[0], slateRgb[1], slateRgb[2]);
        doc.text(String(value), margin + 130, metaY);
        metaY += 18;
      });
      y = metaY + 18;

      if (request.purpose) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(primaryDarkRgb[0], primaryDarkRgb[1], primaryDarkRgb[2]);
        doc.text("Purpose", margin, y);
        y += 14;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(slateRgb[0], slateRgb[1], slateRgb[2]);
        const wrappedPurpose = doc.splitTextToSize(request.purpose, contentWidth);
        doc.text(wrappedPurpose, margin, y);
        y += wrappedPurpose.length * 13 + 18;
      }

      if (
        Array.isArray(request.requestedAccessories) &&
        request.requestedAccessories.length > 0
      ) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(primaryDarkRgb[0], primaryDarkRgb[1], primaryDarkRgb[2]);
        doc.text("Attached Accessories", margin, y);
        y += 14;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(slateRgb[0], slateRgb[1], slateRgb[2]);
        request.requestedAccessories.forEach((line) => {
          const wrapped = doc.splitTextToSize(`• ${line}`, contentWidth);
          doc.text(wrapped, margin, y);
          y += wrapped.length * 12 + 2;
        });
        y += 12;
      }

      const assetsForExport =
        aggregatedItems.length > 0
          ? aggregatedItems
          : (assets || []).map((item) => ({ item, quantity: 1 }));

      if (assetsForExport.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(primaryDarkRgb[0], primaryDarkRgb[1], primaryDarkRgb[2]);
        doc.text("Requested Items", margin, y);
        y += 8;

        autoTable(doc, {
          startY: y,
          head: [["#", "Item", "Category", "Type", "Qty", "Status"]],
          body: assetsForExport.map(({ item, quantity }, index) => [
            index + 1,
            item?.name || item?.assetName || item?.itemName || "—",
            formatCategory(
              item?.category || item?.itemCategory || item?.categoryLabel || "Unknown"
            ),
            (item?.itemType || "ASSET").toString().replace(/_/g, " "),
            quantity || 1,
            (item?.availableStatus || item?.status || request.status || "Pending")
              .toString()
              .replace(/_/g, " "),
          ]),
          styles: {
            fontSize: 9,
            cellPadding: 6,
            textColor: slateRgb,
            lineColor: [226, 232, 240],
            lineWidth: 0.4,
          },
          headStyles: {
            fillColor: primaryRgb,
            textColor: 255,
            fontStyle: "bold",
          },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          margin: { left: margin, right: margin },
        });
        y = doc.lastAutoTable.finalY + 22;
      }

      if (timeline.length > 0) {
        if (y > pageHeight - 160) {
          doc.addPage();
          y = margin;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(primaryDarkRgb[0], primaryDarkRgb[1], primaryDarkRgb[2]);
        doc.text("Timeline", margin, y);
        y += 8;

        autoTable(doc, {
          startY: y,
          head: [["#", "Event", "Description", "When"]],
          body: timeline.map((item, index) => [
            index + 1,
            item.title || "Event",
            item.description || item.notes || "—",
            item.timestamp ? formatDateTime(item.timestamp) : "—",
          ]),
          styles: {
            fontSize: 9,
            cellPadding: 6,
            textColor: slateRgb,
            lineColor: [226, 232, 240],
            lineWidth: 0.4,
          },
          headStyles: {
            fillColor: highlightRgb,
            textColor: 255,
            fontStyle: "bold",
          },
          alternateRowStyles: { fillColor: [255, 251, 245] },
          margin: { left: margin, right: margin },
        });
      }

      // Footer on every page
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, pageHeight - 36, pageWidth - margin, pageHeight - 36);
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.setFont("helvetica", "normal");
        doc.text(
          `${orgName} • Request #${request.$id.slice(-8)}`,
          margin,
          pageHeight - 22
        );
        doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 22, {
          align: "right",
        });
      }

      doc.save(`request_${request.$id}_${new Date().toISOString().split("T")[0]}.pdf`);
      toast?.success?.("Request PDF downloaded successfully.");
    } catch (error) {
      console.error("Download failed:", error);
      toast?.error?.("Unable to download request PDF.");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-6 p-6">
        <div className="h-8 bg-gray-200 rounded w-1/3"></div>
        <div className="h-64 bg-gray-200 rounded"></div>
        <div className="h-32 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error || "Request not found"}</AlertDescription>
        </Alert>
        <div className="mt-4">
          <Button asChild variant="outline">
            <Link
              href={
                currentStaff && permissions.canManageRequests(currentStaff)
                  ? "/admin/requests"
                  : "/requests"
              }
            >
              Back to Requests
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: theme?.colors?.background || "#eaf6fb" }}
    >
      <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
        {/* Header */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="mb-2 -ml-2 text-[var(--org-primary-dark)] hover:bg-[var(--org-primary)]/10 hover:text-[var(--org-primary-dark)]"
              >
                <Link
                  href={
                    currentStaff && permissions.canManageRequests(currentStaff)
                      ? "/admin/requests"
                      : "/requests"
                  }
                >
                  ← Back to Requests
                </Link>
              </Button>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold text-slate-700 sm:text-3xl">
                  Request #{request.$id.slice(-8)}
                </h1>
                <Badge
                  className={`${getStatusBadgeColor(
                    request.status
                  )} flex items-center gap-1 border px-3 py-1`}
                >
                  {getStatusIcon(request.status)}
                  {request.status.replace(/_/g, " ")}
                </Badge>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-slate-500 sm:text-base">
                {request.purpose}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {isRequester && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadRequest}
                  disabled={downloading || !request}
                  className="border-[var(--org-primary)] text-[var(--org-primary-dark)] hover:bg-[var(--org-primary)]/10"
                >
                  <Download
                    className={`mr-2 h-4 w-4 ${downloading ? "animate-spin" : ""}`}
                  />
                  {downloading ? "Preparing PDF..." : "Download Request"}
                </Button>
              )}
              {canEditRequest && (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  <Link href={`/requests/${request.$id}/edit`}>
                    <Edit3 className="mr-2 h-4 w-4" />
                    Edit
                  </Link>
                </Button>
              )}

              {canCancelRequest && (
                <Dialog
                  open={cancelDialogOpen}
                  onOpenChange={setCancelDialogOpen}
                >
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-[var(--org-highlight)]/40 text-[var(--org-highlight-dark)] hover:bg-[var(--org-highlight)]/10"
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Cancel
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="z-[99999] max-w-lg">
                    <DialogHeader className="pb-4 text-center">
                      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--org-highlight)]/15">
                        <X className="h-8 w-8 text-[var(--org-highlight-dark)]" />
                      </div>
                      <DialogTitle className="mb-2 text-2xl font-bold text-slate-700">
                        Cancel Request
                      </DialogTitle>
                      <DialogDescription className="text-base leading-relaxed text-slate-500">
                        Are you sure you want to cancel this request? This
                        action cannot be undone and will notify the admin team.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6 py-4">
                      <div className="space-y-3">
                        <Label
                          htmlFor="cancelReason"
                          className="flex items-center gap-2 text-sm font-semibold text-slate-600"
                        >
                          <FileText className="h-4 w-4 text-[var(--org-primary)]" />
                          Cancellation Reason
                        </Label>
                        <Textarea
                          id="cancelReason"
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          placeholder="Please provide a detailed reason for cancellation..."
                          rows={4}
                          className="resize-none border-slate-200 focus:border-[var(--org-primary)] focus:ring-[var(--org-primary)]/20"
                        />
                      </div>
                    </div>

                    <DialogFooter className="flex flex-col gap-3 border-t border-slate-200 pt-6 sm:flex-row">
                      <DialogClose asChild>
                        <Button
                          variant="outline"
                          className="w-full border-slate-200 text-slate-600 sm:w-auto"
                        >
                          <X className="mr-2 h-4 w-4" />
                          Keep Request
                        </Button>
                      </DialogClose>
                      <Button
                        onClick={handleCancelRequest}
                        disabled={actionLoading || !cancelReason.trim()}
                        className="w-full bg-[var(--org-highlight)] text-white hover:bg-[var(--org-highlight-dark)] sm:w-auto"
                      >
                        {actionLoading ? "Cancelling..." : "Cancel Request"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}

              {canDeleteRequest && (
                <Dialog
                  open={deleteDialogOpen}
                  onOpenChange={setDeleteDialogOpen}
                >
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="z-[99999]">
                    <DialogHeader>
                      <DialogTitle>Delete Request</DialogTitle>
                      <DialogDescription>
                        Are you sure you want to permanently delete this
                        request? This action cannot be undone.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline">Cancel</Button>
                      </DialogClose>
                      <Button
                        onClick={handleDeleteRequest}
                        disabled={actionLoading}
                        variant="destructive"
                      >
                        {actionLoading ? "Deleting..." : "Delete Request"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}

              {canResubmitRequest && (
                <Dialog
                  open={resubmitDialogOpen}
                  onOpenChange={setResubmitDialogOpen}
                >
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-[var(--org-primary)]/40 text-[var(--org-primary-dark)] hover:bg-[var(--org-primary)]/10"
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Resubmit
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="z-[99999]">
                    <DialogHeader>
                      <DialogTitle>Resubmit Request</DialogTitle>
                      <DialogDescription>
                        Provide any additional context for your resubmission.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-2">
                      <Label htmlFor="resubmitReason">Reason / notes</Label>
                      <Textarea
                        id="resubmitReason"
                        value={resubmitReason}
                        onChange={(e) => setResubmitReason(e.target.value)}
                        rows={4}
                      />
                    </div>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline">Cancel</Button>
                      </DialogClose>
                      <Button
                        onClick={handleResubmitRequest}
                        disabled={actionLoading}
                        className="bg-[var(--org-primary)] text-white hover:bg-[var(--org-primary-dark)]"
                      >
                        {actionLoading ? "Resubmitting..." : "Resubmit Request"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}

              {isAdmin && request.status === ENUMS.REQUEST_STATUS.APPROVED && (
                <Button
                  asChild
                  size="sm"
                  className="bg-[var(--org-primary)] text-white hover:bg-[var(--org-primary-dark)]"
                >
                  <Link href={`/admin/issue/${request.$id}`}>
                    <Package className="mr-2 h-4 w-4" />
                    Issue Assets
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            {/* Request Details */}
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-none">
              <CardHeader className="border-b border-slate-100 bg-[var(--org-primary)]/5">
                <CardTitle className="flex items-center gap-3 text-base font-semibold text-slate-700">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--org-primary)]/15">
                    <FileText className="h-4 w-4 text-[var(--org-primary-dark)]" />
                  </div>
                  Request Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 p-6">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Requester
                    </Label>
                    <div className="mt-2 flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-[var(--org-primary)]/12 text-xs font-semibold text-[var(--org-primary-dark)]">
                          {requester?.name
                            ?.split(" ")
                            .map((n) => n[0])
                            .join("") || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium text-slate-700">
                        {requester?.name || "Unknown"}
                      </span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Department
                    </Label>
                    <p className="mt-2 text-sm text-slate-600">
                      {requester?.department || "Not specified"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Issue Date
                    </Label>
                    <p className="mt-2 text-sm text-slate-600">
                      {formatDate(request.issueDate)}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Expected Return
                    </Label>
                    <p className="mt-2 text-sm text-slate-600">
                      {formatDate(request.expectedReturnDate)}
                    </p>
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Purpose
                  </Label>
                  <p className="mt-2 rounded-xl border border-slate-100 bg-slate-50/80 p-4 text-sm text-slate-600">
                    {request.purpose}
                  </p>
                </div>

                {Array.isArray(request.requestedAccessories) &&
                  request.requestedAccessories.length > 0 && (
                    <div>
                      <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Attached Accessories
                      </Label>
                      <ul className="mt-2 list-inside list-disc space-y-1 rounded-xl border border-slate-100 bg-slate-50/80 p-4 text-sm text-slate-600">
                        {request.requestedAccessories.map((line, index) => (
                          <li key={index}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                {request.resubmissionReason && (
                  <div>
                    <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Resubmission Context
                    </Label>
                    <p className="mt-2 rounded-xl border border-[var(--org-primary)]/15 bg-[var(--org-primary)]/5 p-4 text-sm text-slate-600">
                      {request.resubmissionReason}
                    </p>
                  </div>
                )}

                {((request.status === ENUMS.REQUEST_STATUS.DENIED &&
                  extractDenialReason(request.purpose)) ||
                  (request.status === ENUMS.REQUEST_STATUS.APPROVED &&
                    request.notes) ||
                  request.denialReason ||
                  request.decisionNotes) && (
                  <div>
                    <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {request.status === ENUMS.REQUEST_STATUS.APPROVED
                        ? "Approval Notes"
                        : request.status === ENUMS.REQUEST_STATUS.DENIED
                        ? "Denial Reason"
                        : "Decision Notes"}
                    </Label>
                    <div
                      className={`mt-2 rounded-xl border p-4 text-sm ${
                        request.status === ENUMS.REQUEST_STATUS.APPROVED
                          ? "border-[var(--org-primary)]/20 bg-[var(--org-primary)]/5 text-slate-600"
                          : request.status === ENUMS.REQUEST_STATUS.DENIED
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-slate-100 bg-slate-50 text-slate-600"
                      }`}
                    >
                      {request.status === ENUMS.REQUEST_STATUS.DENIED
                        ? extractDenialReason(request.purpose) ||
                          request.denialReason ||
                          request.decisionNotes ||
                          request.notes
                        : request.status === ENUMS.REQUEST_STATUS.APPROVED
                        ? request.notes || request.decisionNotes
                        : request.denialReason || request.decisionNotes}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Requested Assets */}
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-none">
              <CardHeader className="border-b border-slate-100 bg-slate-50/80">
                <CardTitle className="flex items-center gap-3 text-base font-semibold text-slate-700">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--org-highlight)]/15">
                    <Package className="h-4 w-4 text-[var(--org-highlight-dark)]" />
                  </div>
                  Requested Items ({aggregatedItems.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-5">
                {aggregatedItems.map(({ item: asset, quantity, id }) => {
                  const assetName =
                    asset.name ||
                    asset.assetName ||
                    asset.itemName ||
                    "Unnamed item";
                  const initial = assetName.charAt(0).toUpperCase();
                  const assetType = (asset.itemType || "")
                    .toString()
                    .toUpperCase();

                  const resolveImageUrl = (path) => {
                    if (!path) return "";
                    if (path.startsWith("http")) return path;
                    try {
                      return assetImageService.getPublicImageUrl(path);
                    } catch {
                      return "";
                    }
                  };

                  let primaryImage =
                    resolveImageUrl(asset.assetImage) ||
                    resolveImageUrl(asset.imageUrl) ||
                    resolveImageUrl(asset.image) ||
                    resolveImageUrl(asset.thumbnail) ||
                    resolveImageUrl(asset.thumbnailUrl) ||
                    "";

                  if (!primaryImage) {
                    try {
                      const urls = assetImageService.getAssetImageUrls(
                        asset.publicImages
                      );
                      if (urls?.length) primaryImage = urls[0];
                    } catch {
                      // ignore
                    }
                  }

                  return (
                    <div
                      key={id}
                      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--org-primary)]/10">
                          {primaryImage ? (
                            <img
                              src={primaryImage}
                              alt={assetName}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="text-base font-semibold text-[var(--org-primary-dark)]">
                              {initial}
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="truncate font-medium text-slate-700">
                              {assetName}
                            </h4>
                            {asset.assetTag && (
                              <span className="rounded-md bg-[var(--org-highlight)]/15 px-2 py-0.5 text-[11px] font-medium text-[var(--org-highlight-dark)]">
                                {asset.assetTag}
                              </span>
                            )}
                            {asset.notFound && (
                              <span className="rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600">
                                Not Found
                              </span>
                            )}

                            <span className="rounded-md bg-[var(--org-primary)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--org-primary-dark)]">
                              Qty {quantity}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-slate-500">
                            {asset.category?.replace(/_/g, " ")}
                            {asset.locationName ? ` • ${asset.locationName}` : ""}
                            {asset.roomOrArea ? ` - ${asset.roomOrArea}` : ""}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <span className="rounded-md bg-[var(--org-primary)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--org-primary-dark)]">
                              {assetType === ENUMS.ITEM_TYPE.CONSUMABLE
                                ? getConsumableStatus(asset) || "In Stock"
                                : asset.availableStatus?.replace(/_/g, " ") ||
                                  "Available"}
                            </span>
                            {asset.currentCondition && (
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                {asset.currentCondition.replace(/_/g, " ")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {!asset.notFound && (
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="border-slate-200 text-slate-600 hover:bg-[var(--org-primary)]/10 hover:text-[var(--org-primary-dark)]"
                        >
                          <Link href={`/assets/${asset.$id}`}>
                            <Eye className="mr-1 h-4 w-4" />
                            View
                          </Link>
                        </Button>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-5">
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-none">
              <CardHeader className="border-b border-slate-100 bg-[var(--org-primary)]/5">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--org-primary)]/15">
                    <Clock className="h-4 w-4 text-[var(--org-primary-dark)]" />
                  </div>
                  Quick Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Created</span>
                  <span className="text-slate-600">
                    {formatDateTime(request.$createdAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Last Updated</span>
                  <span className="text-slate-600">
                    {formatDateTime(request.$updatedAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Duration</span>
                  <span className="font-medium text-[var(--org-primary-dark)]">
                    {Math.ceil(
                      (new Date(request.expectedReturnDate) -
                        new Date(request.issueDate)) /
                        (1000 * 60 * 60 * 24)
                    )}{" "}
                    days
                  </span>
                </div>
                {approver && (
                  <div className="border-t border-slate-100 pt-4">
                    <span className="text-xs font-medium text-slate-500">
                      {request.status === ENUMS.REQUEST_STATUS.APPROVED
                        ? "Approved by"
                        : request.status === ENUMS.REQUEST_STATUS.DENIED
                        ? "Denied by"
                        : "Reviewed by"}
                    </span>
                    <div className="mt-2 flex items-center gap-3">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="bg-[var(--org-primary)]/12 text-[10px] font-semibold text-[var(--org-primary-dark)]">
                          {approver.name
                            ?.split(" ")
                            .map((n) => n[0])
                            .join("") || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-medium text-slate-600">
                        {approver.name}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border border-slate-200 bg-white shadow-none">
              <CardHeader className="border-b border-slate-100 bg-slate-50/80">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-200/70">
                    <Clock className="h-4 w-4 text-slate-600" />
                  </div>
                  Timeline
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5">
                <div className="space-y-5">
                  {timeline.map((item, index) => {
                    const IconComponent = item.icon;
                    const isLast = index === timeline.length - 1;
                    return (
                      <div key={item.id} className="relative flex gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--org-primary)]/20 bg-[var(--org-primary)]/10">
                          <IconComponent className="h-4 w-4 text-[var(--org-primary-dark)]" />
                        </div>
                        <div className="min-w-0 flex-1 pb-4">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-sm font-semibold text-slate-700">
                              {item.title}
                            </h4>
                            <time className="shrink-0 text-[11px] text-slate-400">
                              {formatDateTime(item.timestamp)}
                            </time>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {item.description}
                          </p>
                          {item.notes && (
                            <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs text-slate-600">
                              <MessageSquare className="mr-1 inline h-3 w-3 text-slate-400" />
                              {item.notes}
                            </div>
                          )}
                        </div>
                        {!isLast && (
                          <div className="absolute bottom-0 left-[17px] top-9 w-px bg-slate-200" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
