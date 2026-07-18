"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Badge } from "../../../components/ui/badge";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { Checkbox } from "../../../components/ui/checkbox";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  UserCheck,
  UserX,
  User,
  Mail,
  Shield,
  Building,
  Phone,
  Hash,
  AlertCircle,
  X,
  Loader2,
  CheckCircle,
  Copy,
  Users,
  Filter,
  RefreshCw,
  Eye,
  AlertTriangle,
  Clock,
  FileText,
  CheckCircle2,
  XCircle,
  Pause,
  Archive,
  Zap,
  Target,
  Briefcase,
  Settings,
} from "lucide-react";
import {
  aggregateResolvedItems,
  formatItemQuantityLabel,
} from "../../../lib/utils/requested-items.js";
import {
  assetRequestsService,
  assetsService,
  assetIssuesService,
  staffService,
  departmentsService,
} from "../../../lib/appwrite/provider.js";
// import {
//   NotificationTriggers,
//   notifyRequestApproved,
//   notifyRequestRejected,
// } from "../../../lib/services/notification-triggers.js";
import { getCurrentStaff, permissions } from "../../../lib/utils/auth.js";
import {
  notifyL1Approved,
  notifyFinalApproved,
  notifyConsumablesIssued,
  notifyDenied,
} from "../../../lib/services/approval-notifications.js";
import { ENUMS } from "../../../lib/appwrite/config.js";
import { Query } from "appwrite";
import Link from "next/link";
import { PageLoading, SectionLoading } from "../../../components/ui/loading";

// Helper function to format date
const formatDate = (dateString) => {
  if (!dateString) return "N/A";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

// Helper function to get status badge color
const getStatusBadgeColor = (status) => {
  switch (status) {
    case ENUMS.REQUEST_STATUS.PENDING:
      return "bg-orange-100 text-orange-800";
    case ENUMS.REQUEST_STATUS.APPROVED:
      return "bg-primary-100 text-primary-800";
    case ENUMS.REQUEST_STATUS.DENIED:
      return "bg-red-100 text-red-800";
    case ENUMS.REQUEST_STATUS.FULFILLED:
      return "bg-sidebar-100 text-sidebar-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

// Helper function to get priority level
const getPriorityLevel = (priority) => {
  switch (priority) {
    case "HIGH":
      return "bg-red-100 text-red-800";
    case "MEDIUM":
      return "bg-orange-100 text-orange-800";
    case "LOW":
      return "bg-primary-100 text-primary-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

export default function RequestQueue() {
  const [currentStaff, setCurrentStaff] = useState(null);
  const [requests, setRequests] = useState([]);
  const [assets, setAssets] = useState([]);
  const [staff, setStaff] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedRequester, setSelectedRequester] = useState("all");
  const [selectedPriority, setSelectedPriority] = useState("all");
  const [dateRange, setDateRange] = useState("all");
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("asset");
  const [showDenialDialog, setShowDenialDialog] = useState(false);
  const [requestToDeny, setRequestToDeny] = useState(null);
  const [denialReason, setDenialReason] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedTab = window.localStorage.getItem("adminRequestsTab");
    if (storedTab === "asset" || storedTab === "consumable") {
      setActiveTab(storedTab);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("adminRequestsTab", activeTab);
  }, [activeTab]);

  useEffect(() => {
    initializeData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const assetMap = useMemo(() => {
    const map = new Map();
    (assets || []).forEach((asset) => {
      if (!asset?.$id) return;
      map.set(asset.$id, asset);
    });
    return map;
  }, [assets]);

  const enrichedRequests = useMemo(() => {
    return (requests || []).map((request) => {
      const resolvedItems = (request.requestedItems || [])
        .map((itemId) => assetMap.get(itemId))
        .filter(Boolean);

      const fallbackItems =
        request.assets && request.assets.length ? request.assets : [];

      const combinedItems =
        resolvedItems.length > 0 ? resolvedItems : fallbackItems;

      const requestType =
        combinedItems.length > 0 &&
        combinedItems.every(
          (item) => item?.itemType === ENUMS.ITEM_TYPE.CONSUMABLE
        )
          ? "consumable"
          : "asset";

      return {
        ...request,
        resolvedItems: combinedItems,
        requestType,
      };
    });
  }, [requests, assetMap]);

  // Load requester names when both requests and staff data are available
  useEffect(() => {
    if (requests.length > 0 && staff.length > 0) {
      // Both requests and staff loaded, requester names will be resolved
    }
  }, [requests, staff]);

  const initializeData = async () => {
    try {
      setError(null); // Clear any existing errors
      // Get current staff for permission checking
      const staff = await getCurrentStaff();
      if (!staff || !permissions.canManageRequests(staff)) {
        window.location.href = "/unauthorized";
        return;
      }
      setCurrentStaff(staff);

      // Load all data
      await Promise.all([
        loadRequests(),
        loadAssets(),
        loadStaff(),
        loadDepartments(),
      ]);
    } catch (error) {
      setError("Failed to load data. Please refresh the page.");
    } finally {
      setLoading(false);
    }
  };

  const loadRequests = async () => {
    try {
      // Sort by creation date descending (newest first)
      const queries = [Query.orderDesc("$createdAt")];
      const response = await assetRequestsService.list(queries);
      const requests = response.documents || [];
      setRequests(requests);
      setError("");
    } catch (error) {
      console.error("Failed to load admin requests", error);
      setError(
        error?.message ||
          "Unable to load requests right now. Please check your connection and try again."
      );
    }
  };

  const loadAssets = async () => {
    try {
      const response = await assetsService.list();
      setAssets(response.documents || []);
    } catch (error) {
      throw error;
    }
  };

  const loadStaff = async () => {
    try {
      const response = await staffService.list();
      const staff = response.documents || [];
      setStaff(staff);
      setStaffList(staff);
    } catch (error) {
      throw error;
    }
  };

  const loadDepartments = async () => {
    try {
      const response = await departmentsService.list();
      setDepartments(response.documents || []);
    } catch (error) {
      throw error;
    }
  };

  // Resolve the current approval stage, defaulting legacy requests sensibly.
  const getStage = (request) =>
    request?.approvalStage ||
    (request?.status === ENUMS.REQUEST_STATUS.PENDING
      ? ENUMS.APPROVAL_STAGE.L1
      : request?.status);

  const handleApprove = async (request) => {
    setDecisionLoading(true);
    setError(null);
    try {
      if (!request) throw new Error("Request not found");

      // Always resolve requester email (staff list can be incomplete).
      let requester =
        staff.find((s) => s.$id === request.requesterStaffId) || null;
      if (!requester?.email && request.requesterStaffId) {
        requester = await staffService
          .get(request.requesterStaffId)
          .catch(() => null);
      }

      // Resolve requested items by ID so consumables are included even if
      // they were missing from the cached assets list.
      let items = request.resolvedItems || [];
      if (
        items.length === 0 &&
        Array.isArray(request.requestedItems) &&
        request.requestedItems.length > 0
      ) {
        const loaded = await Promise.all(
          request.requestedItems.map((id) =>
            assetsService.get(id).catch(() => null)
          )
        );
        items = loaded.filter(Boolean);
      }

      const stage = getStage(request);
      const now = new Date().toISOString();

      if (stage === ENUMS.APPROVAL_STAGE.L1) {
        if (!permissions.canApproveL1(currentStaff)) {
          throw new Error(
            "You don't have permission to give first-level approval."
          );
        }
        const updateData = {
          status: ENUMS.REQUEST_STATUS.PENDING,
          approvalStage: ENUMS.APPROVAL_STAGE.L2,
          l1ApproverStaffId: currentStaff.$id,
          l1DecisionAt: now,
        };
        await assetRequestsService.update(request.$id, updateData, {
          sendNotification: false,
        });
        await notifyL1Approved(
          { ...request, ...updateData },
          requester,
          currentStaff,
          items
        );
        if (!requester?.email) {
          console.warn(
            "L1 approved but requester email missing — no user email sent"
          );
        }
      } else if (stage === ENUMS.APPROVAL_STAGE.L2) {
        if (!permissions.canApproveL2(currentStaff)) {
          throw new Error("Only a superadmin can give final approval.");
        }

        // Consumables are auto-issued on final approval.
        const consumableItems = items.filter(
          (item) => item?.itemType === ENUMS.ITEM_TYPE.CONSUMABLE
        );
        const assetItems = items.filter(
          (item) => item?.itemType !== ENUMS.ITEM_TYPE.CONSUMABLE
        );
        let finalStatus = ENUMS.REQUEST_STATUS.APPROVED;
        if (consumableItems.length > 0) {
          // Consumables don't need a return date; only require it when assets remain.
          if (assetItems.length > 0 && !request.expectedReturnDate) {
            throw new Error(
              "This request includes assets and has no expected return date."
            );
          }
          const consumableLines = aggregateResolvedItems(consumableItems);
          for (const { item: consumable, quantity } of consumableLines) {
            const qty = Math.max(1, quantity || 1);
            try {
              await assetsService.adjustConsumableStock(
                consumable.$id,
                -qty,
                currentStaff.$id,
                `Consumable auto-issued for approved request #${request.$id.slice(
                  -8
                )}`
              );

              // Record who received the consumable so it shows in the item view.
              await assetIssuesService.create({
                requestId: request.$id,
                assetId: consumable.$id,
                requesterStaffId: request.requesterStaffId,
                requesterName: requester?.name || null,
                quantity: qty,
                issuedByStaffId: currentStaff.$id,
                issuedAt: now,
                dueAt: request.expectedReturnDate || null,
              });
            } catch (stockError) {
              console.error(
                `Failed to adjust stock for ${consumable.name}:`,
                stockError
              );
            }
          }
          // Pure consumable requests are fulfilled immediately.
          if (assetItems.length === 0) {
            finalStatus = ENUMS.REQUEST_STATUS.FULFILLED;
          }
        }

        const updateData = {
          status: finalStatus,
          approvalStage: ENUMS.APPROVAL_STAGE.APPROVED,
          l2ApproverStaffId: currentStaff.$id,
          l2DecisionAt: now,
          decisionByStaffId: currentStaff.$id,
        };
        await assetRequestsService.update(request.$id, updateData, {
          sendNotification: false,
        });

        // Consumables: send "issued to you" email. Assets: send "approved, awaiting issue".
        if (finalStatus === ENUMS.REQUEST_STATUS.FULFILLED) {
          const mail = await notifyConsumablesIssued(
            { ...request, ...updateData },
            requester,
            currentStaff,
            consumableItems.length > 0 ? consumableItems : items
          );
          if (mail?.sent === false) {
            console.warn("Consumable issued email was not sent:", mail);
          }
        } else {
          const mail = await notifyFinalApproved(
            { ...request, ...updateData },
            requester,
            currentStaff,
            items
          );
          if (mail?.sent === false) {
            console.warn("Final approval email was not sent:", mail);
          }
        }
      } else {
        throw new Error("This request is not awaiting approval.");
      }

      await loadRequests();
      setSelectedRequest(null);
    } catch (error) {
      setError(error.message || "Failed to approve request. Please try again.");
      console.error("Approve error:", error);
    } finally {
      setDecisionLoading(false);
    }
  };

  const handleDeny = async (request, reason) => {
    setDecisionLoading(true);
    setError(null);
    try {
      if (!request) throw new Error("Request not found");
      if (!reason || reason.trim() === "") {
        throw new Error("Please provide a reason for denying this request.");
      }
      const requester =
        staff.find((s) => s.$id === request.requesterStaffId) ||
        (request.requesterStaffId
          ? await staffService.get(request.requesterStaffId).catch(() => null)
          : null);
      if (!requester?.email) {
        console.warn(
          "Denial saved, but requester email was missing — notification skipped"
        );
      }
      const items = request.resolvedItems || [];
      const stage = getStage(request);
      const now = new Date().toISOString();

      if (
        stage === ENUMS.APPROVAL_STAGE.L2 &&
        !permissions.canApproveL2(currentStaff)
      ) {
        throw new Error(
          "Only a superadmin can act on a request awaiting final approval."
        );
      }
      if (
        stage === ENUMS.APPROVAL_STAGE.L1 &&
        !permissions.canApproveL1(currentStaff)
      ) {
        throw new Error("You don't have permission to act on this request.");
      }

      const updateData = {
        status: ENUMS.REQUEST_STATUS.DENIED,
        approvalStage: ENUMS.APPROVAL_STAGE.DENIED,
        decisionNotes: reason.trim(),
        decisionByStaffId: currentStaff.$id,
        ...(stage === ENUMS.APPROVAL_STAGE.L2
          ? { l2ApproverStaffId: currentStaff.$id, l2DecisionAt: now }
          : { l1ApproverStaffId: currentStaff.$id, l1DecisionAt: now }),
      };
      await assetRequestsService.update(request.$id, updateData, {
        sendNotification: false,
      });
      const mailResult = await notifyDenied(
        { ...request, ...updateData },
        requester,
        currentStaff,
        reason.trim(),
        items
      );
      if (mailResult?.sent === false) {
        console.warn("Denial email was not sent:", mailResult);
        setError(
          `Request denied, but the rejection email could not be sent${
            mailResult?.error ? `: ${mailResult.error}` : "."
          } Please tell the requester manually.`
        );
      }

      await loadRequests();
      setSelectedRequest(null);
      setShowDenialDialog(false);
      setDenialReason("");
      setRequestToDeny(null);
    } catch (error) {
      setError(error.message || "Failed to deny request. Please try again.");
      console.error("Deny error:", error);
    } finally {
      setDecisionLoading(false);
    }
  };

  const handleDenyClick = (request) => {
    setRequestToDeny(request);
    setDenialReason("");
    setShowDenialDialog(true);
  };

  const handleConfirmDenial = async () => {
    if (!requestToDeny) return;
    if (!denialReason || denialReason.trim() === "") {
      setError("Please provide a reason for denying this request.");
      return;
    }
    await handleDeny(requestToDeny, denialReason);
  };

  const getRequesterName = (requesterStaffId) => {
    if (!requesterStaffId) return "Unknown User";
    const requester = staff.find((s) => s.$id === requesterStaffId);
    return requester ? requester.name : "Unknown User";
  };

  const getDepartmentName = (departmentId) => {
    if (!departmentId) return "Unassigned";
    const dept = departments.find((d) => d.$id === departmentId);
    return dept ? dept.name : "Unknown Department";
  };

  // Filter requests based on all filters and active tab
  const filteredRequests = useMemo(() => {
    const isL1OnlyApprover =
      currentStaff &&
      permissions.canApproveL1(currentStaff) &&
      !permissions.canApproveL2(currentStaff);

    const requestsByTab = enrichedRequests.filter((request) =>
      activeTab === "asset"
        ? request.requestType !== "consumable"
        : request.requestType === "consumable"
    );

    return requestsByTab.filter((request) => {
      // L1 admins only see requests still awaiting their approval.
      // Once they approve (moves to L2) or the request is decided, it leaves their queue.
      if (isL1OnlyApprover) {
        const stage = getStage(request);
        if (
          request.status !== ENUMS.REQUEST_STATUS.PENDING ||
          stage !== ENUMS.APPROVAL_STAGE.L1
        ) {
          return false;
        }
      }

      // Superadmins: strict order — do not show L1 requests in the default queue.
      // They only see items awaiting final (L2) approval, or approved and ready to issue.
      // Explicit status filters can still surface history.
      const isSuperAdmin =
        currentStaff && permissions.canApproveL2(currentStaff);
      if (isSuperAdmin && selectedStatus === "all") {
        const stage = getStage(request);
        const awaitingL2 =
          request.status === ENUMS.REQUEST_STATUS.PENDING &&
          stage === ENUMS.APPROVAL_STAGE.L2;
        const readyToIssue =
          request.status === ENUMS.REQUEST_STATUS.APPROVED;
        if (!awaitingL2 && !readyToIssue) return false;
      }

      const resolvedItems = request.resolvedItems || [];

      const matchesSearch =
        !searchTerm ||
        request.purpose?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        getRequesterName(request.requesterStaffId)
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        resolvedItems.some((item) =>
          item?.name?.toLowerCase().includes(searchTerm.toLowerCase())
        ) ||
        request.$id.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus =
        selectedStatus === "all" || request.status === selectedStatus;

      const matchesRequester =
        selectedRequester === "all" ||
        request.requesterStaffId === selectedRequester;

      const matchesPriority =
        selectedPriority === "all" || request.priority === selectedPriority;

      const matchesDateRange = (() => {
        if (dateRange === "all") return true;

        const requestDate = new Date(request.$createdAt);
        const now = new Date();

        switch (dateRange) {
          case "today":
            return requestDate.toDateString() === now.toDateString();
          case "week":
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            return requestDate >= weekAgo;
          case "month":
            const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            return requestDate >= monthAgo;
          case "quarter":
            const quarterAgo = new Date(
              now.getTime() - 90 * 24 * 60 * 60 * 1000
            );
            return requestDate >= quarterAgo;
          case "year":
            const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
            return requestDate >= yearAgo;
          default:
            return true;
        }
      })();

      return (
        matchesSearch &&
        matchesStatus &&
        matchesRequester &&
        matchesPriority &&
        matchesDateRange
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enrichedRequests,
    activeTab,
    searchTerm,
    selectedStatus,
    selectedRequester,
    selectedPriority,
    dateRange,
    staff,
    currentStaff,
  ]);

  if (loading) {
    return <PageLoading message="Loading requests..." />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-primary-50/30 to-primary-100/40">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="text-red-600 mb-4">Error loading requests</div>
            <div className="text-gray-600 mb-4">{error}</div>
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
                initializeData();
              }}
              className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--org-background)" }}>
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23e2e8f0' fill-opacity='0.3'%3E%3Ccircle cx='7' cy='7' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            backgroundSize: "60px 60px",
          }}
        ></div>
      </div>

      <div className="relative container mx-auto p-6 space-y-8 max-w-7xl">
        {/* Enhanced Header */}
        <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-gray-200/60 shadow-xl p-8">
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center space-y-4 lg:space-y-0">
            <div className="space-y-2">
              <div className="flex items-center space-x-4">
                <div className="p-3 rounded-xl shadow-lg bg-[var(--org-primary)]/15">
                  <Clock className="w-7 h-7 text-[var(--org-primary)]" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold text-gray-900">
                    Request Queue
                  </h1>
                  <p className="text-gray-700 font-medium text-lg">
                    Manage and process asset requests
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => loadRequests()}
                variant="outline"
                disabled={loading}
                className="bg-white/80 border border-[var(--org-primary)]/30 text-[var(--org-primary)] hover:bg-[var(--org-primary)]/10 hover:border-[var(--org-primary)]/60 transition-all duration-300 disabled:opacity-60 rounded-xl shadow-sm hover:shadow-md"
              >
                <RefreshCw
                  className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <div className="inline-flex items-center bg-white/80 border border-[var(--org-primary)]/20 rounded-full p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setActiveTab("asset")}
                className={`request-tab ${
                  activeTab === "asset"
                    ? "request-tab-active"
                    : "request-tab-inactive"
                }`}
              >
                Asset Requests
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("consumable")}
                className={`request-tab ${
                  activeTab === "consumable"
                    ? "request-tab-active"
                    : "request-tab-inactive"
                }`}
              >
                Consumable Requests
              </button>
            </div>
          </div>
        </div>

        {/* Enhanced Filters */}
        <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-gray-200/60 shadow-xl p-6 relative z-20">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl shadow-lg bg-[var(--org-primary)]/15">
                <Filter className="w-5 h-5 text-[var(--org-primary)]" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Filter Requests
                </h2>
                <p className="text-sm text-slate-600">
                  Refine your search with advanced filters
                </p>
              </div>
            </div>
            <Button
              onClick={() => {
                setSearchTerm("");
                setSelectedStatus("all");
                setSelectedPriority("all");
              }}
              variant="outline"
              className="text-[var(--org-primary)] hover:bg-[var(--org-primary)]/10 border-[var(--org-primary)]/30"
            >
              <X className="w-4 h-4 mr-2" />
              Clear All
            </Button>
          </div>

          {/* Primary Filters Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {/* Search Input */}
            <div className="lg:col-span-2">
              <Label className="text-sm font-semibold text-slate-700 mb-2 block">
                Search Requests
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search by ID, purpose, or requester..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-12 border-gray-300 focus:border-[var(--org-primary)] focus:ring-[var(--org-primary)]/20 rounded-lg shadow-sm"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div>
              <Label className="text-sm font-semibold text-slate-700 mb-2 block">
                Status
              </Label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="h-12 border-gray-300 focus:border-[var(--org-primary)] focus:ring-[var(--org-primary)]/20 rounded-lg shadow-sm">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent className="z-30">
                  <SelectItem value="all">Active queue</SelectItem>
                  <SelectItem value={ENUMS.REQUEST_STATUS.PENDING}>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                      <span>Pending</span>
                    </div>
                  </SelectItem>
                  <SelectItem value={ENUMS.REQUEST_STATUS.APPROVED}>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span>Approved</span>
                    </div>
                  </SelectItem>
                  <SelectItem value={ENUMS.REQUEST_STATUS.DENIED}>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                      <span>Denied</span>
                    </div>
                  </SelectItem>
                  <SelectItem value={ENUMS.REQUEST_STATUS.FULFILLED}>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <span>Fulfilled</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Priority Filter */}
            <div>
              <Label className="text-sm font-semibold text-slate-700 mb-2 block">
                Priority
              </Label>
              <Select
                value={selectedPriority}
                onValueChange={setSelectedPriority}
              >
                <SelectTrigger className="h-12 border-gray-300 focus:border-[var(--org-primary)] focus:ring-[var(--org-primary)]/20 rounded-lg shadow-sm">
                  <SelectValue placeholder="All Priority" />
                </SelectTrigger>
                <SelectContent className="z-30">
                  <SelectItem value="all">All Priority</SelectItem>
                  <SelectItem value="high">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                      <span>High</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="medium">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                      <span>Medium</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="low">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span>Low</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Active Filters Display */}
          {(searchTerm ||
            selectedStatus !== "all" ||
            selectedPriority !== "all") && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex items-center space-x-2 flex-wrap gap-2">
                <span className="text-sm font-medium text-slate-600">
                  Active filters:
                </span>
                {searchTerm && (
                  <Badge className="bg-primary-100 text-primary-700 border-primary-200">
                    Search: "{searchTerm}"
                    <button
                      onClick={() => setSearchTerm("")}
                      className="ml-2 hover:bg-primary-200 rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                )}
                {selectedStatus !== "all" && (
                  <Badge className="bg-[var(--org-primary)]/15 text-[var(--org-primary)] border-[var(--org-primary)]/30">
                    Status: {selectedStatus}
                    <button
                      onClick={() => setSelectedStatus("all")}
                      className="ml-2 hover:bg-[var(--org-primary)]/20 rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                )}
                {selectedPriority !== "all" && (
                  <Badge className="bg-[var(--org-primary)]/15 text-[var(--org-primary)] border-[var(--org-primary)]/30">
                    Priority: {selectedPriority}
                    <button
                      onClick={() => setSelectedPriority("all")}
                      className="ml-2 hover:bg-[var(--org-primary)]/20 rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="space-y-6">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="bg-white/90 backdrop-blur-md rounded-2xl border border-gray-200/60 shadow-xl p-6 animate-pulse"
              >
                <div className="space-y-4">
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Loading Staff State */}
        {!loading && staff.length === 0 && (
          <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-gray-200/60 shadow-xl">
            <SectionLoading message="Loading staff data..." className="py-12" />
          </div>
        )}

        {/* Empty State */}
        {!loading && staff.length > 0 && filteredRequests.length === 0 && (
          <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-gray-200/60 shadow-xl p-12">
            <div className="text-center">
              <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No Requests Found
              </h3>
              <p className="text-gray-600">
                {searchTerm || selectedStatus !== "all"
                  ? "No requests match your current filters."
                  : "No asset requests have been submitted yet."}
              </p>
            </div>
          </div>
        )}

        {/* Requests List */}
        {!loading && staff.length > 0 && filteredRequests.length > 0 && (
          <div className="space-y-6">
            {filteredRequests.map((request) => (
              <Card
                key={request.$id}
                className="bg-white/90 backdrop-blur-md rounded-2xl border border-gray-200/60 shadow-xl hover:shadow-2xl transition-shadow duration-200"
              >
                <CardContent className="p-6">
                  <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start space-y-4 lg:space-y-0">
                    <div className="flex-1 space-y-4">
                      {/* Request Header */}
                      <div className="flex items-start justify-between">
                        <div>
                          <h3
                            className="text-lg font-semibold tracking-tight"
                            style={{
                              color: "color-mix(in srgb, var(--org-primary) 82%, #0f172a 18%)",
                              textShadow: "0 8px 18px rgba(14, 99, 112, 0.18)",
                            }}
                          >
                            Request #{request.$id.slice(-8).toUpperCase()}
                          </h3>
                          <p
                            className="text-sm font-medium flex items-center gap-2"
                            style={{
                              color: "color-mix(in srgb, var(--org-primary) 70%, #1f2937 30%)",
                            }}
                          >
                            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--org-primary)]"></span>
                            by {getRequesterName(request.requesterStaffId)}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {request.status === ENUMS.REQUEST_STATUS.PENDING ? (
                            <Badge className="bg-amber-50 text-amber-700 border-amber-200">
                              {getStage(request) === ENUMS.APPROVAL_STAGE.L2
                                ? "Awaiting final approval"
                                : "Awaiting L1 approval"}
                            </Badge>
                          ) : (
                            <Badge className={getStatusBadgeColor(request.status)}>
                              {request.status}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Request Details */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-sm font-medium text-slate-700 mb-2">
                            Purpose
                          </h4>
                          <p className="text-sm text-slate-600">
                            {request.purpose}
                          </p>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-slate-700 mb-2">
                            Duration
                          </h4>
                          <p className="text-sm text-slate-600">
                            {formatDate(request.issueDate)} -{" "}
                            {formatDate(request.expectedReturnDate)}
                          </p>
                        </div>
                      </div>

                      {/* Requested Items — name × quantity (not one pill per unit) */}
                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-slate-700 mb-2">
                          Requested Items
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {aggregateResolvedItems(request.resolvedItems || []).map(
                            ({ item, quantity, id }) => (
                              <Badge
                                key={id}
                                className="bg-sidebar-50 text-sidebar-700 border-sidebar-200 hover:bg-sidebar-100"
                              >
                                {formatItemQuantityLabel(item, quantity)}
                              </Badge>
                            )
                          )}
                          {(request.resolvedItems || []).length === 0 && (
                            <span className="text-sm text-gray-500">
                              No items specified
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="border-[var(--org-primary)]/30 text-[var(--org-primary)] hover:bg-[var(--org-primary)]/10"
                      >
                        <Link href={`/requests/${request.$id}`}>
                          View Details
                        </Link>
                      </Button>

                      {request.status === ENUMS.REQUEST_STATUS.PENDING &&
                        (() => {
                          const stage = getStage(request);
                          const canAct =
                            stage === ENUMS.APPROVAL_STAGE.L2
                              ? permissions.canApproveL2(currentStaff)
                              : permissions.canApproveL1(currentStaff);

                          if (!canAct) {
                            return (
                              <span className="text-sm text-slate-500 self-center px-1">
                                {stage === ENUMS.APPROVAL_STAGE.L2
                                  ? "Awaiting final approval by a superadmin"
                                  : "Awaiting first-level approval"}
                              </span>
                            );
                          }

                          const isFinal = stage === ENUMS.APPROVAL_STAGE.L2;
                          return (
                            <>
                              <Button
                                size="sm"
                                disabled={decisionLoading}
                                onClick={() => handleApprove(request)}
                                className="bg-org-gradient text-white border-0 shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50"
                              >
                                {decisionLoading ? (
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                  <CheckCircle className="w-4 h-4 mr-2" />
                                )}
                                {isFinal ? "Final Approve" : "Approve (L1)"}
                              </Button>
                              <Button
                                size="sm"
                                disabled={decisionLoading}
                                onClick={() => handleDenyClick(request)}
                                className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50"
                              >
                                <XCircle className="w-4 h-4 mr-2" />
                                Deny
                              </Button>
                            </>
                          );
                        })()}

                      {request.status === ENUMS.REQUEST_STATUS.APPROVED &&
                        request.requestType !== "consumable" && (
                        <Button
                          asChild
                          size="sm"
                          className="bg-org-gradient text-white border-0 shadow-lg hover:shadow-xl transition-all duration-200"
                        >
                          <Link href={`/admin/issue/${request.$id}`}>
                            <Zap className="w-4 h-4 mr-2" />
                            Issue Assets
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Denial Reason Dialog */}
      <Dialog open={showDenialDialog} onOpenChange={setShowDenialDialog}>
        <DialogContent className="sm:max-w-[440px] p-0 overflow-hidden border-0 shadow-none">
          <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                  <XCircle className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-lg font-semibold text-slate-900">
                    Deny this request?
                  </DialogTitle>
                  <DialogDescription className="mt-1 text-sm text-slate-500 leading-relaxed">
                    The requester will get an email with your reason. This cannot be undone from here.
                  </DialogDescription>
                </div>
              </div>
            </div>

            <div className="px-6 pb-5 space-y-4">
              {requestToDeny && (
                <div
                  className="rounded-xl px-4 py-3 text-sm"
                  style={{
                    background:
                      "color-mix(in srgb, var(--org-background) 85%, white)",
                    border:
                      "1px solid color-mix(in srgb, var(--org-primary) 18%, transparent)",
                  }}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                    Request
                  </p>
                  <p className="font-mono text-slate-800">
                    #{requestToDeny.$id.slice(-8).toUpperCase()}
                  </p>
                  {(() => {
                    const lines = aggregateResolvedItems(
                      requestToDeny.resolvedItems || []
                    );
                    if (lines.length === 0) return null;
                    const first = formatItemQuantityLabel(
                      lines[0].item,
                      lines[0].quantity
                    );
                    return (
                      <p className="text-slate-600 mt-0.5 truncate">
                        {first}
                        {lines.length > 1
                          ? ` +${lines.length - 1} more`
                          : ""}
                      </p>
                    );
                  })()}
                </div>
              )}

              <div className="space-y-2">
                <Label
                  htmlFor="denialReason"
                  className="text-sm font-medium text-slate-700"
                >
                  Reason <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="denialReason"
                  placeholder="e.g. Item already allocated / insufficient stock / not justified for this period…"
                  value={denialReason}
                  onChange={(e) => setDenialReason(e.target.value)}
                  className="min-h-[110px] resize-none rounded-xl border-slate-200 focus-visible:ring-[var(--org-primary)]"
                  required
                  autoFocus
                />
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDenialDialog(false);
                  setDenialReason("");
                  setRequestToDeny(null);
                  setError("");
                }}
                disabled={decisionLoading}
                className="min-w-[96px]"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmDenial}
                disabled={
                  decisionLoading ||
                  !denialReason ||
                  denialReason.trim() === ""
                }
                className="min-w-[140px]"
              >
                {decisionLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Denying…
                  </>
                ) : (
                  "Deny request"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
