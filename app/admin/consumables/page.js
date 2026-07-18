"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Input } from "../../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "../../../components/ui/dialog";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Eye,
  Filter,
  Download,
  Upload,
  X,
  Package,
  AlertTriangle,
  Settings,
  DollarSign,
  MapPin,
  FileText,
  Users,
  UserCheck,
  CheckCircle,
  Clock,
  ShoppingCart,
  List,
  Grid3X3,
  RefreshCw,
} from "lucide-react";
import {
  assetsService,
  projectsService,
  assetIssuesService,
  staffService,
} from "../../../lib/appwrite/provider.js";
import { buildRecipientsMap } from "../../../lib/utils/holders.js";
import { getCurrentStaff, permissions } from "../../../lib/utils/auth.js";
import { useToastContext } from "../../../components/providers/toast-provider";
import { useConfirmation } from "../../../components/ui/confirmation-dialog";
import { ENUMS } from "../../../lib/appwrite/config.js";
import { Query } from "appwrite";
import {
  formatCategory,
  getStatusBadgeColor,
  getConditionBadgeColor,
  getConsumableStatusEnum,
  getConsumableCategory,
  getConsumableUnit,
  getCurrentStock,
  getMinStock,
  getMaxStock,
} from "../../../lib/utils/mappings.js";
import { useOrgTheme } from "../../../components/providers/org-theme-provider";
import { getConsumableCategoriesForOrg } from "../../../lib/constants/consumable-categories.js";
import { getCurrentOrgId } from "../../../lib/utils/org.js";
import { PageLoading } from "../../../components/ui/loading";
import {
  ListPagination,
  paginateItems,
} from "../../../components/ui/list-pagination";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

function createDebounce(fn, wait = 300) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), wait);
  };
}

const PAGE_SIZE = 15;

export default function AdminConsumablesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToastContext();
  const { confirm } = useConfirmation();
  const { theme, orgCode } = useOrgTheme();
  const [staff, setStaff] = useState(null);
  const [consumables, setConsumables] = useState([]);
  const [recipientsMap, setRecipientsMap] = useState(() => new Map());
  const [staffMap, setStaffMap] = useState(() => new Map());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [consumableToDelete, setConsumableToDelete] = useState(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Export functionality state
  const [exporting, setExporting] = useState(false);

  // Manual ID assignment state
  const [manualIdAssignment, setManualIdAssignment] = useState(false);
  const normalizedOrgCode = (orgCode || theme?.code || "").toUpperCase();
  const isNrepOrg = normalizedOrgCode === "NREP";
  const ADMIN_PLACEHOLDER_PROJECT_ID = "ADMIN";
  const [viewMode, setViewMode] = useState("table");
  const [currentPage, setCurrentPage] = useState(1);
  const [scopeFilter, setScopeFilter] = useState(() =>
    isNrepOrg ? ENUMS.CONSUMABLE_SCOPE.PROJECT : ENUMS.CONSUMABLE_SCOPE.ADMIN
  );
  // When opened from dashboard stock alerts, show both Admin + Project scopes
  const [ignoreScopeFilter, setIgnoreScopeFilter] = useState(false);

  // Project filter state
  const [projectFilter, setProjectFilter] = useState("all");
  const [projects, setProjects] = useState([]);
  const allowedProjectIds = useMemo(() => {
    if (!isNrepOrg) return [];
    const ids = theme?.projects?.allowedIds;
    return Array.isArray(ids)
      ? ids
          .map((id) => id?.toString().toLowerCase())
          .filter((id) => typeof id === "string" && id.length > 0)
      : [];
  }, [isNrepOrg, theme?.projects?.allowedIds]);
  const defaultProjectId = useMemo(() => {
    if (!isNrepOrg) return null;
    return theme?.projects?.defaultId || null;
  }, [isNrepOrg, theme?.projects?.defaultId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedMode = window.localStorage.getItem("consumablesViewMode");
    if (storedMode === "table" || storedMode === "grid") {
      setViewMode(storedMode);
    }
  }, []);

  useEffect(() => {
    setScopeFilter(
      isNrepOrg ? ENUMS.CONSUMABLE_SCOPE.PROJECT : ENUMS.CONSUMABLE_SCOPE.ADMIN
    );
  }, [isNrepOrg]);

  // Deep-link from dashboard stock alerts: ?status=LOW_STOCK|OUT_OF_STOCK
  useEffect(() => {
    const statusParam = (searchParams?.get("status") || "").toUpperCase();
    const validStatuses = Object.values(ENUMS.CONSUMABLE_STATUS);
    if (statusParam && validStatuses.includes(statusParam)) {
      setFilterStatus(statusParam);
      // Show matching items across Admin + Project so alert counts match the list
      setIgnoreScopeFilter(true);
      setProjectFilter("all");
      setCurrentPage(1);
    }
  }, [searchParams]);

  const handleViewModeChange = (mode) => {
    if (mode === "table" || mode === "grid") {
      setViewMode(mode);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("consumablesViewMode", mode);
      }
    }
  };

  const handleFormScopeChange = (scope) => {
    if (!isNrepOrg) return;
    setNewConsumable((prev) => ({
      ...prev,
      consumableScope: scope,
    }));
  };

  const handleScopeFilterChange = (scope) => {
    if (!isNrepOrg) return;
    setIgnoreScopeFilter(false);
    setScopeFilter(scope);
    setFilterCategory("all");
    setFilterStatus("all");
    setProjectFilter(
      scope === ENUMS.CONSUMABLE_SCOPE.PROJECT
        ? defaultProjectId || "all"
        : "all"
    );
    // Clear deep-link query so scope chips stay in control
    if (searchParams?.get("status")) {
      router.replace("/admin/consumables");
    }
  };

  const rowHoverClass = isNrepOrg
    ? "hover:bg-[var(--org-primary)]/7"
    : "hover:bg-gray-50/50";

  const iconBackgroundClass = isNrepOrg
    ? "bg-gradient-to-br from-[var(--org-primary)]/16 via-[var(--org-highlight)]/12 to-[var(--org-primary-dark)]/10"
    : "bg-gradient-to-br from-sidebar-100 to-sidebar-200";

  const nameHoverClass = isNrepOrg
    ? "group-hover:text-[var(--org-primary)]"
    : "group-hover:text-sidebar-700";
  const categoryBadgeClass = isNrepOrg
    ? "bg-[var(--org-highlight)]/15 text-[var(--org-highlight)] border-[var(--org-highlight)]/25"
    : "bg-sidebar-50 text-sidebar-700 border-sidebar-200";
  const headerBadgeClass = isNrepOrg
    ? "bg-[var(--org-primary)]/18 text-[var(--org-primary)] border-[var(--org-primary)]/25"
    : "bg-primary-500/20 text-primary-600 border-primary-500/30";
  // Action icon buttons use Button variants (view=default/sidebar, edit=highlight/orange, delete=destructive/red)
  const actionIconClass =
    "h-11 w-11 p-0 transition-all duration-200 group/btn rounded-lg";
  const actionIconClassLg = actionIconClass;
  const locationIconClass = "text-red-600";
  const locationTextClass = isNrepOrg
    ? "text-[var(--org-primary-dark)]"
    : "text-slate-700";
  const metricBadgeClass = isNrepOrg
    ? "bg-[var(--org-highlight)]/15 text-[var(--org-highlight)] border-[var(--org-highlight)]/25"
    : "bg-primary-500/20 text-primary-600 border-primary-500/30";

  const badgeForStatus = (status) => {
    switch (status) {
      case ENUMS.CONSUMABLE_STATUS.IN_STOCK:
        return isNrepOrg
          ? "bg-[var(--org-primary)]/18 text-[var(--org-primary)] border-[var(--org-primary)]/25"
          : "bg-green-100 text-green-700 border-green-200";
      case ENUMS.CONSUMABLE_STATUS.LOW_STOCK:
        return isNrepOrg
          ? "bg-[var(--org-highlight)]/18 text-[var(--org-highlight)] border-[var(--org-highlight)]/25"
          : "bg-yellow-100 text-yellow-700 border-yellow-200";
      case ENUMS.CONSUMABLE_STATUS.OUT_OF_STOCK:
        return "bg-red-100 text-red-700 border-red-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  // Stock functions are imported from mappings.js

  // Use utility function for status - returns enum value
  const getStatus = (consumable) => {
    return getConsumableStatusEnum(consumable) || ENUMS.CONSUMABLE_STATUS.IN_STOCK;
  };

  // Unit and category functions are imported from mappings.js

  // New consumable form state - matching Appwrite collection attributes
  const [newConsumable, setNewConsumable] = useState({
    assetTag: "",
    name: "",
    category: ENUMS.CATEGORY.CONSUMABLE,
    consumableCategory: ENUMS.CONSUMABLE_CATEGORY.FLIERS,
    currentStock: 0,
    minStock: 0,
    maxStock: 0,
    unit: ENUMS.CONSUMABLE_UNIT.PIECE,
    status: ENUMS.CONSUMABLE_STATUS.IN_STOCK,
    locationName: "",
    roomOrArea: "",
    isPublic: false,
    publicSummary: "",
    projectId: "",
    consumableScope: isNrepOrg
      ? ENUMS.CONSUMABLE_SCOPE.PROJECT
      : ENUMS.CONSUMABLE_SCOPE.ADMIN,
  });

  useEffect(() => {
    if (!isNrepOrg) return;
    const options = getConsumableCategoriesForOrg(
      orgCode,
      newConsumable.consumableScope
    );
    setNewConsumable((prev) => {
      let nextCategory = prev.consumableCategory;
      let nextProjectId = prev.projectId;

      if (
        Array.isArray(options) &&
        options.length > 0 &&
        !options.includes(prev.consumableCategory)
      ) {
        nextCategory = options[0];
      }

      if (prev.consumableScope === ENUMS.CONSUMABLE_SCOPE.PROJECT) {
        nextProjectId =
          prev.projectId || defaultProjectId || projects[0]?.$id || "";
      } else {
        nextProjectId = ADMIN_PLACEHOLDER_PROJECT_ID;
      }

      if (
        nextCategory === prev.consumableCategory &&
        nextProjectId === prev.projectId
      ) {
        return prev;
      }

      return {
        ...prev,
        consumableCategory: nextCategory,
        projectId: nextProjectId,
      };
    });
  }, [
    isNrepOrg,
    orgCode,
    newConsumable.consumableScope,
    defaultProjectId,
    projects,
  ]);

  useEffect(() => {
    checkPermissionsAndLoadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkPermissionsAndLoadData = async () => {
    try {
      const currentStaff = await getCurrentStaff();
      if (!currentStaff || !permissions.canManageConsumables(currentStaff)) {
        window.location.href = "/unauthorized";
        return;
      }
      setStaff(currentStaff);
      await loadConsumables();
      await loadProjects(); // Load projects here
      await loadRecipients();
    } catch (error) {
      // Silent fail for data loading
    } finally {
      setLoading(false);
    }
  };

  const loadConsumables = async () => {
    try {
      const result = await assetsService.getConsumables();
      setConsumables(result.documents);
    } catch (error) {
      // Silent fail for consumables loading
    }
  };

  // Load issue records + staff once, and build a per-consumable recipients map.
  const loadRecipients = async () => {
    try {
      const [issuesResult, staffResult] = await Promise.all([
        assetIssuesService.list([Query.orderDesc("issuedAt")]),
        staffService.list(),
      ]);
      setRecipientsMap(buildRecipientsMap(issuesResult?.documents || []));
      const map = new Map();
      (staffResult?.documents || []).forEach((member) => {
        if (member?.$id) map.set(member.$id, member.name || "Unknown");
      });
      setStaffMap(map);
    } catch (error) {
      console.error("Failed to load consumable recipients:", error);
    }
  };

  // Most recent recipient name for a consumable (or null if none recorded).
  const getLatestRecipientName = (consumableId) => {
    const rows = recipientsMap.get(consumableId);
    if (!rows || rows.length === 0) return null;
    const latest = rows[0];
    if (latest.name) return latest.name;
    if (latest.staffId) return staffMap.get(latest.staffId) || "Unknown";
    return "Unknown";
  };

  const getRecipientCount = (consumableId) => {
    const rows = recipientsMap.get(consumableId);
    return rows ? rows.length : 0;
  };

  const loadProjects = useCallback(async () => {
    if (!isNrepOrg) return;
    try {
      const result = await projectsService.list();
      let docs = Array.isArray(result?.documents) ? result.documents : [];
      docs = docs.map((project) => ({
        ...project,
        $id: project?.$id || project?.id || "",
      }));
      if (allowedProjectIds.length > 0) {
        docs = docs.filter((project) =>
          allowedProjectIds.includes((project.$id || "").toLowerCase())
        );
      }
      setProjects(docs);
      if (
        defaultProjectId &&
        docs.some((project) => project.$id === defaultProjectId)
      ) {
        setProjectFilter((prev) =>
          prev === "all" ? defaultProjectId : prev
        );
      }
    } catch (error) {
      console.warn("Failed to load projects", error);
      setProjects([]);
    }
  }, [allowedProjectIds, defaultProjectId, isNrepOrg]);

  const handleCreateConsumable = async () => {
    try {
      const isProjectScope =
        isNrepOrg &&
        newConsumable.consumableScope === ENUMS.CONSUMABLE_SCOPE.PROJECT;
      if (isProjectScope && !newConsumable.projectId) {
        toast.error("Please select a project for this consumable.");
        return;
      }

      // Get current organization ID - try multiple sources in order of reliability
      let currentOrgId = 
        staff?.orgId ||                  // First: staff record (most reliable)
        theme?.appwriteOrgId;            // Second: theme from useOrgTheme (available immediately)
      
      // Third: Try API endpoint (works in production - server-side reads env vars at runtime)
      if (!currentOrgId || currentOrgId.trim() === "") {
        const { getCurrentOrgIdAsync } = await import("../../../lib/utils/org.js");
        const apiOrgId = await getCurrentOrgIdAsync();
        if (apiOrgId) {
          currentOrgId = apiOrgId;
        }
      }
      
      // Fourth: Fallback to sync function (may not work in production if env vars weren't in build)
      if (!currentOrgId || currentOrgId.trim() === "") {
        currentOrgId = getCurrentOrgId();
      }
      
      if (!currentOrgId || currentOrgId.trim() === "") {
        toast.error("Unable to determine organization. Please refresh the page.");
        return;
      }
      currentOrgId = currentOrgId.trim();

      //Consumables do not have images - they are internal inventory items
      const consumableData = {
        // Explicitly set orgId to ensure it's always included
        orgId: currentOrgId,
        // Basic information - use existing ASSETS collection fields
        assetTag: manualIdAssignment && newConsumable.assetTag
          ? newConsumable.assetTag
          : `CONS-${Date.now()}`, // Generate unique tag for consumables
        name: newConsumable.name,
        category: ENUMS.CATEGORY.CONSUMABLE, // Use the correct CONSUMABLE category
        subcategory: newConsumable.consumableCategory, // Store consumable category directly
        itemType: ENUMS.ITEM_TYPE.CONSUMABLE,

        // Stock information - use new proper database fields
        currentStock: newConsumable.currentStock || 0,
        minimumStock: newConsumable.minStock || 0,
        unit: newConsumable.unit,
        
        // Status - save the admin-selected status
        status: newConsumable.status || ENUMS.CONSUMABLE_STATUS.IN_STOCK,

        // Legacy fields - keep empty for backward compatibility
        serialNumber: "", // No longer needed
        model: "", // No longer needed
        manufacturer: "", // No longer needed

        // Location information
        locationName: newConsumable.locationName || "",
        roomOrArea: newConsumable.roomOrArea || "",

        // Public information
        isPublic: newConsumable.isPublic || false,
        publicSummary: newConsumable.publicSummary || "",
        publicImages: JSON.stringify([]),
        publicLocationLabel: "", // Empty string for consumables
        publicConditionLabel: ENUMS.PUBLIC_CONDITION_LABEL.NEW, // Default for consumables
        assetImage:
          "https://via.placeholder.com/400x300.png?text=Consumable",

        // Required fields for ASSETS collection (already set above for stock data)
        departmentId: "", // Empty for consumables
        custodianStaffId: "", // Empty for consumables
        availableStatus: ENUMS.AVAILABLE_STATUS.AVAILABLE, // Default for consumables
        currentCondition: ENUMS.CURRENT_CONDITION.NEW, // Default for consumables
        purchaseDate: null, // Empty for consumables
        warrantyExpiryDate: null, // Empty for consumables
        lastMaintenanceDate: null, // Empty for consumables
        nextMaintenanceDue: null, // Empty for consumables
        lastInventoryCheck: null, // Empty for consumables
        retirementDate: null, // Empty for consumables
        disposalDate: null, // Empty for consumables
        attachmentFileIds: [], // Empty array for consumables
        projectId: isNrepOrg
          ? isProjectScope
            ? newConsumable.projectId || defaultProjectId || projects[0]?.$id || ""
            : ADMIN_PLACEHOLDER_PROJECT_ID
          : null,
        consumableScope: isProjectScope
          ? ENUMS.CONSUMABLE_SCOPE.PROJECT
          : ENUMS.CONSUMABLE_SCOPE.ADMIN,
      };

      const result = await assetsService.create(consumableData, staff.$id);

      // Reset form and refresh consumables
      setNewConsumable({
        assetTag: "",
        name: "",
        category: ENUMS.CATEGORY.CONSUMABLE,
        consumableCategory: isNrepOrg
          ? (getConsumableCategoriesForOrg(
              orgCode,
              newConsumable.consumableScope
            )[0] || ENUMS.CONSUMABLE_CATEGORY.FLIERS)
          : ENUMS.CONSUMABLE_CATEGORY.FLIERS,
        currentStock: 0,
        minStock: 0,
        maxStock: 0,
        unit: ENUMS.CONSUMABLE_UNIT.PIECE,
        status: ENUMS.CONSUMABLE_STATUS.IN_STOCK,
        locationName: "",
        roomOrArea: "",
        isPublic: false,
        publicSummary: "",
        projectId: isNrepOrg
          ? newConsumable.consumableScope === ENUMS.CONSUMABLE_SCOPE.PROJECT
            ? defaultProjectId || projects[0]?.$id || ""
            : ADMIN_PLACEHOLDER_PROJECT_ID
          : ADMIN_PLACEHOLDER_PROJECT_ID,
        consumableScope: isNrepOrg
          ? newConsumable.consumableScope
          : ENUMS.CONSUMABLE_SCOPE.ADMIN,
      });
      setManualIdAssignment(false);

      setShowAddDialog(false);
      await loadConsumables();
      toast.success("Consumable created successfully!");
      setShowSuccessModal(true);
    } catch (error) {
      console.error("Failed to create consumable:", error);
      toast.error(
        `Failed to create consumable: ${error.message || "Please try again."}`
      );
    }
  };

  const handleDeleteConsumable = (consumable) => {
    setConsumableToDelete(consumable);
    setShowDeleteDialog(true);
  };

  const confirmDeleteConsumable = async () => {
    if (!consumableToDelete) return;

    try {
      await assetsService.delete(consumableToDelete.$id);
      await loadConsumables();
      setShowDeleteDialog(false);
      setConsumableToDelete(null);
      toast.success("Consumable deleted successfully!");
    } catch (error) {
      toast.error("Failed to delete consumable. Please try again.");
    }
  };

  const cancelDeleteConsumable = () => {
    setShowDeleteDialog(false);
    setConsumableToDelete(null);
  };

  /**
   * Download consumables data to a PDF file with comprehensive metadata
   */
  const exportConsumablesData = async (type = "Consumables") => {
    try {
      setExporting(true);

      let dataToExport = [];

      if (type === "FilteredConsumables") {
        // Export only the currently filtered/displayed consumables
        dataToExport = filteredConsumables;
      } else {
        // Export all consumables from the database
        const result = await assetsService.getConsumables();
        dataToExport = result.documents;
      }

      if (!dataToExport || dataToExport.length === 0) {
        toast.warning("No consumables available for download.");
        return;
      }

      const exportLabel =
        type === "FilteredConsumables"
          ? "Filtered Consumables"
          : "All Consumables";
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const now = new Date();
      const filtersLine =
        [
          searchTerm ? `Search: ${searchTerm}` : null,
          filterCategory !== "all"
            ? `Category: ${formatCategory(filterCategory)}`
            : null,
          filterStatus !== "all"
            ? `Status: ${formatCategory(filterStatus)}`
            : null,
        ]
          .filter(Boolean)
          .join(" | ") || "No filters applied";

      doc.setFontSize(16);
      doc.text(`${exportLabel} Report`, 40, 40);
      doc.setFontSize(10);
      doc.text(
        `Organization: ${theme?.name || orgCode || "N/A"}`,
        40,
        60
      );
      doc.text(`Generated by: ${staff?.name || "Unknown"}`, 40, 74);
      doc.text(`Generated on: ${now.toLocaleString()}`, 40, 88);
      doc.text(`Filters: ${filtersLine}`, 40, 102);

      const tableRows = dataToExport.map((item, index) => [
        index + 1,
        item.itemCode || item.assetTag || item.$id,
        item.name || item.assetName || "Unnamed Consumable",
        formatCategory(getConsumableCategory(item) || "Unknown"),
        getStatus(item).replace(/_/g, " "),
        formatCategory(getConsumableUnit(item) || "pieces"),
        `${getCurrentStock(item) ?? 0}/${getMinStock(item) ?? 0}`,
        getMaxStock(item) ? `${getMaxStock(item)}` : "—",
        item.projectName || item.projectId || "—",
      ]);

      autoTable(doc, {
        startY: 120,
        head: [
          [
            "#",
            "Code",
            "Name",
            "Category",
            "Status",
            "Unit",
            "Current/Min",
            "Max Stock",
            "Project",
          ],
        ],
        body: tableRows,
        styles: {
          fontSize: 9,
          cellPadding: 4,
          lineColor: [230, 230, 230],
          lineWidth: 0.3,
        },
        headStyles: {
          fillColor: [14, 99, 112],
          textColor: 255,
        },
        alternateRowStyles: {
          fillColor: [249, 250, 251],
        },
        margin: { left: 40, right: 40 },
        didDrawPage: (data) => {
          const pageSize = doc.internal.pageSize;
          doc.setFontSize(9);
          doc.text(
            `Page ${doc.internal.getNumberOfPages()}`,
            pageSize.getWidth() - 80,
            pageSize.getHeight() - 30
          );
        },
      });

      doc.save(
        `${type === "FilteredConsumables" ? "filtered_consumables" : "consumables"}_${
          now.toISOString().split("T")[0]
        }.pdf`
      );
      toast.success("Consumables PDF downloaded successfully.");
    } catch (error) {
      console.error("Download failed:", error);
      toast.error("Download failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  // Filter consumables based on search and filters
  const activeScopeFilter = isNrepOrg ? scopeFilter : ENUMS.CONSUMABLE_SCOPE.ADMIN;

  const filterCategoryOptions = useMemo(() => {
    if (!isNrepOrg) {
      return Object.values(ENUMS.CONSUMABLE_CATEGORY);
    }
    return getConsumableCategoriesForOrg(orgCode, activeScopeFilter);
  }, [activeScopeFilter, isNrepOrg, orgCode]);

  const formCategoryOptions = useMemo(() => {
    if (!isNrepOrg) {
      return Object.values(ENUMS.CONSUMABLE_CATEGORY);
    }
    return getConsumableCategoriesForOrg(orgCode, newConsumable.consumableScope);
  }, [isNrepOrg, orgCode, newConsumable.consumableScope]);

  function resolveConsumableScope(item) {
    if (item?.consumableScope) return item.consumableScope;
    if (item?.projectId && item.projectId !== ADMIN_PLACEHOLDER_PROJECT_ID) {
      return ENUMS.CONSUMABLE_SCOPE.PROJECT;
    }
    return ENUMS.CONSUMABLE_SCOPE.ADMIN;
  }

  useEffect(() => {
    if (!isNrepOrg) return;
    if (
      filterCategory !== "all" &&
      !filterCategoryOptions.includes(filterCategory)
    ) {
      setFilterCategory("all");
    }
  }, [filterCategory, filterCategoryOptions, isNrepOrg]);

  const filteredConsumables = (consumables || []).filter((consumable) => {
    const matchesSearch =
      consumable.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getConsumableCategory(consumable)
        .toLowerCase()
        .includes(searchTerm.toLowerCase());

    const matchesCategory =
      filterCategory === "all" ||
      getConsumableCategory(consumable) === filterCategory;
    const matchesStatus =
      filterStatus === "all" || getStatus(consumable) === filterStatus;

    const itemScope = resolveConsumableScope(consumable);
    const matchesScope =
      !isNrepOrg ||
      ignoreScopeFilter ||
      itemScope === scopeFilter;

    const itemProjectId = consumable.projectId; // Use consumable.projectId
    const normalizedItemProjectId = itemProjectId
      ? itemProjectId.toLowerCase()
      : "";
    const normalizedProjectFilter = projectFilter
      ? projectFilter.toLowerCase()
      : "";
    const matchesProject =
      !isNrepOrg ||
      scopeFilter !== ENUMS.CONSUMABLE_SCOPE.PROJECT ||
      projectFilter === "all" ||
      itemProjectId === projectFilter ||
      normalizedItemProjectId === normalizedProjectFilter;

    return (
      matchesSearch &&
      matchesCategory &&
      matchesStatus &&
      matchesProject &&
      matchesScope
    );
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    filterCategory,
    filterStatus,
    scopeFilter,
    projectFilter,
    ignoreScopeFilter,
  ]);

  const pagination = useMemo(
    () => paginateItems(filteredConsumables, currentPage, PAGE_SIZE),
    [filteredConsumables, currentPage]
  );
  const pagedConsumables = pagination.items;

  if (loading) {
    return <PageLoading message="Loading consumables..." />;
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--org-background)" }}
    >
      <div className="container mx-auto p-6 space-y-6 max-w-7xl">
        {/* Header */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6">
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
            <div>
              <h1
                className="text-3xl font-bold tracking-tight"
                style={{
                  color:
                    "color-mix(in srgb, var(--org-primary-dark) 72%, #0f172a 28%)",
                }}
              >
                Consumable Management
              </h1>
              <p className="text-slate-600 mt-1">
                Manage consumable inventory and stock levels
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {/* Download All Consumables Button */}
              <Button
                onClick={() => exportConsumablesData("Consumables")}
                disabled={exporting}
                variant="outline"
                title="Download all consumables from the database as PDF file"
                className="border-[var(--org-primary)] text-[var(--org-primary)] hover:bg-[var(--org-primary)]/10"
              >
                <Download
                  className={`w-4 h-4 mr-2 ${exporting ? "animate-spin" : ""}`}
                />
                {exporting ? "Generating PDF..." : "Download PDF"}
              </Button>

              {/* Download Filtered Results Button - Only show if filters are applied */}
              {(searchTerm ||
                filterCategory !== "all" ||
                filterStatus !== "all") && (
                <Button
                  onClick={() => exportConsumablesData("FilteredConsumables")}
                  disabled={exporting}
                  variant="outline"
                  title="Download only the currently filtered/displayed consumables as PDF file"
                  className="border-[var(--org-primary)]/40 text-[var(--org-primary-dark)] hover:bg-[var(--org-primary)]/10"
                >
                  <Download
                    className={`w-4 h-4 mr-2 ${exporting ? "animate-spin" : ""}`}
                  />
                  {exporting ? "Generating PDF..." : "Download PDF (Filtered)"}
                </Button>
              )}

              <Button
                onClick={() => router.push("/admin/consumables/new")}
                className="bg-org-gradient text-white border-0"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Consumable
              </Button>

              {/* Removed Dialog - Now using dedicated page at /admin/consumables/new */}
              {false && <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogTrigger asChild>
                  <Button className="relative bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white border-0 shadow-lg hover:shadow-2xl transition-all duration-300 ease-out group overflow-hidden hover:scale-105">
                    <div className="flex items-center justify-center relative z-10">
                      <Plus className="w-4 h-4 mr-2 group-hover:rotate-90 group-hover:scale-110 transition-all duration-300" />
                      <span className="group-hover:translate-x-0.5 transition-transform duration-300">
                        Add Consumable
                      </span>
                    </div>
                    {/* Animated background gradient */}
                    <div className="absolute inset-0 bg-gradient-to-r from-primary-400 to-primary-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    {/* Ripple effect */}
                    <div className="absolute inset-0 bg-white/20 rounded-md scale-0 group-hover:scale-100 transition-transform duration-300 origin-center" />
                    {/* Shimmer effect */}
                    <div className="absolute inset-0 -top-1 -left-1 w-0 h-full bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover:w-full transition-all duration-500 ease-out" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto">
                  <DialogHeader className="sticky top-0 bg-white border-b pb-4 mb-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <DialogTitle className="text-xl font-semibold">
                          Add New Consumable
                        </DialogTitle>
                        <DialogDescription className="text-gray-600 mt-1">
                          Create a new consumable item in the system with
                          detailed information
                        </DialogDescription>
                      </div>
                      <DialogClose asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-gray-100"
                        >
                          <X className="h-4 w-4" />
                          <span className="sr-only">Close</span>
                        </Button>
                      </DialogClose>
                    </div>
                  </DialogHeader>

                  <div className="space-y-8 pb-4">
                    {/* Basic Information */}
                    <div className="bg-gray-50 p-6 rounded-lg space-y-6">
                      <div className="flex items-center space-x-2">
                        <Package className="h-5 w-5 text-blue-600" />
                        <h3 className="text-lg font-semibold text-gray-900">
                          Basic Information
                        </h3>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <div className="flex items-center space-x-2 mb-2">
                            <input
                              type="checkbox"
                              id="manualIdAssignmentConsumable"
                              checked={manualIdAssignment}
                              onChange={(e) => {
                                setManualIdAssignment(e.target.checked);
                                if (!e.target.checked) {
                                  setNewConsumable({
                                    ...newConsumable,
                                    assetTag: "",
                                  });
                                }
                              }}
                              className="rounded"
                            />
                            <Label
                              htmlFor="manualIdAssignmentConsumable"
                              className="text-sm font-medium text-gray-700 cursor-pointer"
                            >
                              Manually assign ID
                            </Label>
                          </div>
                          <Label
                            htmlFor="assetTag"
                            className="text-sm font-medium text-gray-700"
                          >
                            Consumable ID {manualIdAssignment && "*"}
                          </Label>
                          <Input
                            id="assetTag"
                            value={newConsumable.assetTag}
                            onChange={(e) =>
                              setNewConsumable({
                                ...newConsumable,
                                assetTag: e.target.value,
                              })
                            }
                            placeholder={
                              manualIdAssignment
                                ? "Enter custom ID (e.g., CONS-PAPER-001)"
                                : "Auto-generated (e.g., CONS-1234567890)"
                            }
                            className="h-11"
                            disabled={!manualIdAssignment}
                            required={manualIdAssignment}
                          />
                        </div>
                        <div className="space-y-3">
                          <Label
                            htmlFor="name"
                            className="text-sm font-medium text-gray-700"
                          >
                            Consumable Name *
                          </Label>
                          <Input
                            id="name"
                            value={newConsumable.name}
                            onChange={(e) =>
                              setNewConsumable({
                                ...newConsumable,
                                name: e.target.value,
                              })
                            }
                            placeholder="e.g., A4 Paper, Office Pens"
                            className="h-11"
                            required
                          />
                        </div>
                        <div className="space-y-3">
                          <Label
                            htmlFor="consumableCategory"
                            className="text-sm font-medium text-gray-700"
                          >
                            Category *
                          </Label>
                          <Select
                            value={newConsumable.consumableCategory}
                            onValueChange={(value) =>
                              setNewConsumable({
                                ...newConsumable,
                                consumableCategory: value,
                              })
                            }
                          >
                            <SelectTrigger className="h-11">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {formCategoryOptions.map((category) => (
                                <SelectItem key={category} value={category}>
                                  {formatCategory(category)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* Stock Information */}
                    <div className="bg-blue-50 p-6 rounded-lg space-y-6">
                      <div className="flex items-center space-x-2">
                        <Settings className="h-5 w-5 text-blue-600" />
                        <h3 className="text-lg font-semibold text-gray-900">
                          Stock Information
                        </h3>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="space-y-3">
                          <Label
                            htmlFor="currentStock"
                            className="text-sm font-medium text-gray-700"
                          >
                            Current Stock *
                          </Label>
                          <Input
                            id="currentStock"
                            type="number"
                            value={newConsumable.currentStock}
                            onChange={(e) =>
                              setNewConsumable({
                                ...newConsumable,
                                currentStock: parseInt(e.target.value) || 0,
                              })
                            }
                            placeholder="0"
                            className="h-11"
                            required
                          />
                        </div>
                        <div className="space-y-3">
                          <Label
                            htmlFor="minStock"
                            className="text-sm font-medium text-gray-700"
                          >
                            Minimum Stock
                          </Label>
                          <Input
                            id="minStock"
                            type="number"
                            value={newConsumable.minStock}
                            onChange={(e) =>
                              setNewConsumable({
                                ...newConsumable,
                                minStock: parseInt(e.target.value) || 0,
                              })
                            }
                            placeholder="0"
                            className="h-11"
                          />
                        </div>
                        <div className="space-y-3">
                          <Label
                            htmlFor="unit"
                            className="text-sm font-medium text-gray-700"
                          >
                            Unit *
                          </Label>
                          <Select
                            value={newConsumable.unit}
                            onValueChange={(value) =>
                              setNewConsumable({
                                ...newConsumable,
                                unit: value,
                              })
                            }
                          >
                            <SelectTrigger className="h-11">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.values(ENUMS.CONSUMABLE_UNIT).map(
                                (unit) => (
                                  <SelectItem key={unit} value={unit}>
                                    {formatCategory(unit)}
                                  </SelectItem>
                                )
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* Status & Location */}
                    <div className="bg-purple-50 p-6 rounded-lg space-y-6">
                      <div className="flex items-center space-x-2">
                        <MapPin className="h-5 w-5 text-red-600" />
                        <h3 className="text-lg font-semibold text-gray-900">
                          Status & Location
                        </h3>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <Label
                            htmlFor="status"
                            className="text-sm font-medium text-gray-700"
                          >
                            Availability Status *
                          </Label>
                          <Select
                            value={newConsumable.status}
                            onValueChange={(value) =>
                              setNewConsumable({
                                ...newConsumable,
                                status: value,
                              })
                            }
                            required
                          >
                            <SelectTrigger className="h-11">
                              <SelectValue placeholder="Select availability status" />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.values(ENUMS.CONSUMABLE_STATUS).map(
                                (status) => (
                                  <SelectItem key={status} value={status}>
                                    {formatCategory(status)}
                                  </SelectItem>
                                )
                              )}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-gray-500">
                            This status will be visible to requesters when browsing consumables
                          </p>
                        </div>
                        <div className="space-y-3">
                          <Label
                            htmlFor="locationName"
                            className="text-sm font-medium text-gray-700"
                          >
                            Location Name
                          </Label>
                          <Input
                            id="locationName"
                            value={newConsumable.locationName}
                            onChange={(e) =>
                              setNewConsumable({
                                ...newConsumable,
                                locationName: e.target.value,
                              })
                            }
                            placeholder="e.g., Storage Room A"
                            className="h-11"
                          />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <Label
                          htmlFor="roomOrArea"
                          className="text-sm font-medium text-gray-700"
                        >
                          Room/Area
                        </Label>
                        <Input
                          id="roomOrArea"
                          value={newConsumable.roomOrArea}
                          onChange={(e) =>
                            setNewConsumable({
                              ...newConsumable,
                              roomOrArea: e.target.value,
                            })
                          }
                          placeholder="e.g., Shelf 1, Cabinet B"
                          className="h-11"
                        />
                      </div>
                    </div>

                    {/* Public Information */}
                    <div className="bg-orange-50 p-6 rounded-lg space-y-6">
                      <div className="flex items-center space-x-2">
                        <FileText className="h-5 w-5 text-orange-600" />
                        <h3 className="text-lg font-semibold text-gray-900">
                          Public Information
                        </h3>
                      </div>

                      <div className="space-y-6">
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="isPublic"
                            checked={newConsumable.isPublic}
                            onChange={(e) =>
                              setNewConsumable({
                                ...newConsumable,
                                isPublic: e.target.checked,
                              })
                            }
                            className="rounded"
                          />
                          <Label
                            htmlFor="isPublic"
                            className="text-sm font-medium text-gray-700"
                          >
                            Make this consumable visible in guest portal
                          </Label>
                        </div>

                        <div className="space-y-3">
                          <Label
                            htmlFor="publicSummary"
                            className="text-sm font-medium text-gray-700"
                          >
                            Public Summary
                          </Label>
                          <Textarea
                            id="publicSummary"
                            value={newConsumable.publicSummary}
                            onChange={(e) =>
                              setNewConsumable({
                                ...newConsumable,
                                publicSummary: e.target.value,
                              })
                            }
                            placeholder="Brief description visible to guests and public viewers"
                            rows={3}
                            className="resize-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <DialogFooter className="sticky bottom-0 bg-white border-t pt-4 mt-6">
                    <div className="flex items-center justify-between w-full">
                      <p className="text-sm text-gray-500">
                        Fields marked with * are required
                      </p>
                      <div className="flex items-center space-x-3">
                        <DialogClose asChild>
                          <Button variant="outline" className="px-6">
                            Cancel
                          </Button>
                        </DialogClose>
                        <Button
                          onClick={handleCreateConsumable}
                          disabled={
                            !newConsumable.name ||
                            !newConsumable.consumableCategory ||
                            !newConsumable.status ||
                            (manualIdAssignment && !newConsumable.assetTag) ||
                            (isNrepOrg && !newConsumable.projectId)
                          }
                          className="px-6 bg-blue-600 hover:bg-blue-700"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Create Consumable
                        </Button>
                      </div>
                    </div>
                  </DialogFooter>
                </DialogContent>
              </Dialog>}
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
            {/* Total Consumables */}
            <Card
              className="bg-white border border-slate-200/80 !shadow-none cursor-pointer transition-all duration-200 hover:border-[var(--org-primary)]/35"
              style={{ borderLeft: "4px solid var(--org-primary)" }}
              onClick={() => {
                setFilterStatus("all");
                setIgnoreScopeFilter(false);
                router.replace("/admin/consumables");
              }}
            >
              <CardContent className="p-6 min-h-[148px] flex flex-col justify-between">
                <div className="flex items-start justify-between gap-3">
                  <p
                    className="text-[13px] font-semibold leading-snug tracking-wide"
                    style={{ color: "var(--org-primary-dark)" }}
                  >
                    Total Consumables
                  </p>
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{
                      background:
                        "color-mix(in srgb, var(--org-primary) 14%, white)",
                      color: "var(--org-primary)",
                    }}
                  >
                    <Package className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4">
                  <div
                    className="text-4xl font-bold tracking-tight tabular-nums leading-none"
                    style={{ color: "var(--org-primary-dark)" }}
                  >
                    {consumables.length}
                  </div>
                  <p className="text-sm text-slate-500 mt-2.5 leading-relaxed">
                    {
                      consumables.filter(
                        (c) => getStatus(c) === ENUMS.CONSUMABLE_STATUS.IN_STOCK
                      ).length
                    }{" "}
                    in stock ·{" "}
                    {
                      consumables.filter(
                        (c) =>
                          getStatus(c) === ENUMS.CONSUMABLE_STATUS.LOW_STOCK
                      ).length
                    }{" "}
                    low stock
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* In Stock */}
            <Card
              className="bg-white border border-slate-200/80 !shadow-none cursor-pointer transition-all duration-200 hover:border-[var(--org-primary-dark)]/40"
              style={{ borderLeft: "4px solid var(--org-primary-dark)" }}
              onClick={() => {
                setFilterStatus(ENUMS.CONSUMABLE_STATUS.IN_STOCK);
                setIgnoreScopeFilter(true);
                setProjectFilter("all");
                router.replace(
                  `/admin/consumables?status=${encodeURIComponent(
                    ENUMS.CONSUMABLE_STATUS.IN_STOCK
                  )}`
                );
              }}
            >
              <CardContent className="p-6 min-h-[148px] flex flex-col justify-between">
                <div className="flex items-start justify-between gap-3">
                  <p
                    className="text-[13px] font-semibold leading-snug tracking-wide"
                    style={{ color: "var(--org-primary-dark)" }}
                  >
                    In Stock
                  </p>
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{
                      background:
                        "color-mix(in srgb, var(--org-primary-dark) 14%, white)",
                      color: "var(--org-primary-dark)",
                    }}
                  >
                    <CheckCircle className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4">
                  <div
                    className="text-4xl font-bold tracking-tight tabular-nums leading-none"
                    style={{ color: "var(--org-primary-dark)" }}
                  >
                    {
                      consumables.filter(
                        (c) => getStatus(c) === ENUMS.CONSUMABLE_STATUS.IN_STOCK
                      ).length
                    }
                  </div>
                  <p className="text-sm text-slate-500 mt-2.5 leading-relaxed">
                    Available for use
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Low Stock */}
            <Card
              className="bg-white border border-slate-200/80 !shadow-none cursor-pointer transition-all duration-200 hover:border-[var(--org-highlight)]/45"
              style={{ borderLeft: "4px solid var(--org-highlight)" }}
              onClick={() => {
                setFilterStatus(ENUMS.CONSUMABLE_STATUS.LOW_STOCK);
                setIgnoreScopeFilter(true);
                setProjectFilter("all");
                router.replace(
                  `/admin/consumables?status=${encodeURIComponent(
                    ENUMS.CONSUMABLE_STATUS.LOW_STOCK
                  )}`
                );
              }}
            >
              <CardContent className="p-6 min-h-[148px] flex flex-col justify-between">
                <div className="flex items-start justify-between gap-3">
                  <p
                    className="text-[13px] font-semibold leading-snug tracking-wide"
                    style={{ color: "var(--org-highlight-dark)" }}
                  >
                    Low Stock
                  </p>
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{
                      background:
                        "color-mix(in srgb, var(--org-highlight) 18%, white)",
                      color: "var(--org-highlight-dark)",
                    }}
                  >
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4">
                  <div
                    className="text-4xl font-bold tracking-tight tabular-nums leading-none"
                    style={{ color: "var(--org-highlight-dark)" }}
                  >
                    {
                      consumables.filter(
                        (c) =>
                          getStatus(c) === ENUMS.CONSUMABLE_STATUS.LOW_STOCK
                      ).length
                    }
                  </div>
                  <p className="text-sm text-slate-500 mt-2.5 leading-relaxed">
                    Needs restocking
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Out of Stock */}
            <Card
              className="bg-white border border-slate-200/80 !shadow-none cursor-pointer transition-all duration-200 hover:border-[var(--org-highlight-dark)]/45"
              style={{ borderLeft: "4px solid var(--org-highlight-dark)" }}
              onClick={() => {
                setFilterStatus(ENUMS.CONSUMABLE_STATUS.OUT_OF_STOCK);
                setIgnoreScopeFilter(true);
                setProjectFilter("all");
                router.replace(
                  `/admin/consumables?status=${encodeURIComponent(
                    ENUMS.CONSUMABLE_STATUS.OUT_OF_STOCK
                  )}`
                );
              }}
            >
              <CardContent className="p-6 min-h-[148px] flex flex-col justify-between">
                <div className="flex items-start justify-between gap-3">
                  <p
                    className="text-[13px] font-semibold leading-snug tracking-wide"
                    style={{ color: "var(--org-highlight-dark)" }}
                  >
                    Out of Stock
                  </p>
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{
                      background:
                        "color-mix(in srgb, var(--org-highlight-dark) 16%, white)",
                      color: "var(--org-highlight-dark)",
                    }}
                  >
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4">
                  <div
                    className="text-4xl font-bold tracking-tight tabular-nums leading-none"
                    style={{ color: "var(--org-highlight-dark)" }}
                  >
                    {
                      consumables.filter(
                        (c) =>
                          getStatus(c) === ENUMS.CONSUMABLE_STATUS.OUT_OF_STOCK
                      ).length
                    }
                  </div>
                  <p className="text-sm text-slate-500 mt-2.5 leading-relaxed">
                    Needs immediate attention
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Categories */}
            <Card
              className="bg-white border border-slate-200/80 !shadow-none"
              style={{ borderLeft: "4px solid var(--org-primary)" }}
            >
              <CardContent className="p-6 min-h-[148px] flex flex-col justify-between">
                <div className="flex items-start justify-between gap-3">
                  <p
                    className="text-[13px] font-semibold leading-snug tracking-wide"
                    style={{ color: "var(--org-primary-dark)" }}
                  >
                    Categories
                  </p>
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{
                      background:
                        "color-mix(in srgb, var(--org-primary) 14%, white)",
                      color: "var(--org-primary)",
                    }}
                  >
                    <ShoppingCart className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4">
                  <div
                    className="text-4xl font-bold tracking-tight tabular-nums leading-none"
                    style={{ color: "var(--org-primary-dark)" }}
                  >
                    {
                      new Set(consumables.map((c) => getConsumableCategory(c)))
                        .size
                    }
                  </div>
                  <p className="text-sm text-slate-500 mt-2.5 leading-relaxed">
                    Different types
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 relative z-20 shadow-none">
            <div className="flex items-center gap-3 mb-5 flex-wrap">
              <div
                className="p-2 rounded-xl"
                style={{
                  background:
                    "linear-gradient(135deg, var(--org-primary), var(--org-primary-dark))",
                }}
              >
                <Filter className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">
                Search & Filter
              </h3>
              {isNrepOrg && (
                <div className="ml-auto flex items-center gap-2 border border-slate-200 rounded-full px-1.5 py-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      handleScopeFilterChange(ENUMS.CONSUMABLE_SCOPE.PROJECT)
                    }
                    className={`h-8 px-3 rounded-full flex items-center gap-2 transition-all ${
                      !ignoreScopeFilter &&
                      scopeFilter === ENUMS.CONSUMABLE_SCOPE.PROJECT
                        ? "bg-[var(--org-primary)] text-white hover:bg-[var(--org-primary-dark)] hover:text-white"
                        : "text-slate-600 hover:text-[var(--org-primary)] hover:bg-slate-50"
                    }`}
                  >
                    Projects
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      handleScopeFilterChange(ENUMS.CONSUMABLE_SCOPE.ADMIN)
                    }
                    className={`h-8 px-3 rounded-full flex items-center gap-2 transition-all ${
                      !ignoreScopeFilter &&
                      scopeFilter === ENUMS.CONSUMABLE_SCOPE.ADMIN
                        ? "bg-[var(--org-primary)] text-white hover:bg-[var(--org-primary-dark)] hover:text-white"
                        : "text-slate-600 hover:text-[var(--org-primary)] hover:bg-slate-50"
                    }`}
                  >
                    Administrative
                  </Button>
                </div>
              )}
            </div>

            {(filterStatus === ENUMS.CONSUMABLE_STATUS.OUT_OF_STOCK ||
              filterStatus === ENUMS.CONSUMABLE_STATUS.LOW_STOCK) && (
              <div
                className={`mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border px-4 py-3 ${
                  filterStatus === ENUMS.CONSUMABLE_STATUS.OUT_OF_STOCK
                    ? "bg-[var(--org-highlight)]/10 border-[var(--org-highlight-dark)]/35 text-slate-800"
                    : "bg-[var(--org-highlight)]/10 border-[var(--org-highlight)]/35 text-slate-800"
                }`}
              >
                <p className="text-sm font-medium">
                  Showing{" "}
                  {filterStatus === ENUMS.CONSUMABLE_STATUS.OUT_OF_STOCK
                    ? "out of stock"
                    : "low stock"}{" "}
                  items only
                  {ignoreScopeFilter ? " (all scopes)" : ""}.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="!bg-white !text-slate-700 shrink-0"
                  onClick={() => {
                    setFilterStatus("all");
                    setIgnoreScopeFilter(false);
                    router.replace("/admin/consumables");
                  }}
                >
                  Clear status filter
                </Button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="space-y-3">
                <Label className="text-sm font-medium text-slate-700">
                  Search Consumables
                </Label>
                <div className="relative group">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-primary-500 transition-colors duration-200" />
                  <Input
                    placeholder="Search by name or category..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 h-11 border-gray-200 focus:border-primary-500 focus:ring-primary-500/20 transition-all duration-200"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium text-slate-700">
                  Category
                </Label>
                <Select
                  value={filterCategory}
                  onValueChange={setFilterCategory}
                >
                  <SelectTrigger className="h-11 border-gray-200 focus:border-primary-500 focus:ring-primary-500/20 transition-all duration-200">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent className="z-30">
                    <SelectItem value="all">All Categories</SelectItem>
                    {filterCategoryOptions.map((category) => (
                      <SelectItem key={category} value={category}>
                        {formatCategory(category)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium text-slate-700">
                  Status
                </Label>
                <Select
                  value={filterStatus}
                  onValueChange={(value) => {
                    setFilterStatus(value);
                    if (value === "all") {
                      setIgnoreScopeFilter(false);
                      if (searchParams?.get("status")) {
                        router.replace("/admin/consumables");
                      }
                    } else {
                      // Keep alert-style cross-scope view while a stock status is selected
                      setIgnoreScopeFilter(true);
                      setProjectFilter("all");
                      router.replace(
                        `/admin/consumables?status=${encodeURIComponent(value)}`
                      );
                    }
                  }}
                >
                  <SelectTrigger className="h-11 border-gray-200 focus:border-primary-500 focus:ring-primary-500/20 transition-all duration-200">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent className="z-30">
                    <SelectItem value="all">All Statuses</SelectItem>
                    {Object.values(ENUMS.CONSUMABLE_STATUS).map((status) => (
                      <SelectItem key={status} value={status}>
                        {formatCategory(status)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isNrepOrg && scopeFilter === ENUMS.CONSUMABLE_SCOPE.PROJECT && (
                <div className="space-y-3">
                  <Label className="text-sm font-medium text-slate-700">
                    Project
                  </Label>
                  <Select
                    value={projectFilter}
                    onValueChange={setProjectFilter}
                  >
                    <SelectTrigger className="h-11 border-gray-200 focus:border-[var(--org-primary)] focus:ring-[var(--org-primary)]/20 transition-all duration-200">
                      <SelectValue placeholder="Project" />
                    </SelectTrigger>
                    <SelectContent className="z-30">
                      <SelectItem value="all">All Projects</SelectItem>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.$id} value={project.$id}>
                          {project.name || project.title || project.code || project.$id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          {/* Consumables Table */}
          <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden relative z-10 shadow-none">
            <div className="p-6 border-b border-slate-200/80">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div
                    className="p-2 rounded-xl"
                    style={{
                      background:
                        "linear-gradient(135deg, var(--org-primary), var(--org-primary-dark))",
                    }}
                  >
                    <FileText className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      Consumables
                    </h2>
                    <p className="text-sm text-slate-600">
                      Manage and track all consumable inventory
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className={`${headerBadgeClass} px-3 py-1`}>
                    {filteredConsumables.length}{" "}
                    {filteredConsumables.length === 1
                      ? "Consumable"
                      : "Consumables"}
                  </Badge>
                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-full px-1.5 py-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewModeChange("table")}
                      className={`h-8 px-3 rounded-full flex items-center gap-2 transition-all font-medium ${
                        viewMode === "table"
                          ? "bg-[var(--org-primary)] text-white hover:bg-[var(--org-primary)]/90"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                      }`}
                    >
                      <List className="w-4 h-4" />
                      <span className="hidden sm:inline">Table</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewModeChange("grid")}
                      className={`h-8 px-3 rounded-full flex items-center gap-2 transition-all font-medium ${
                        viewMode === "grid"
                          ? "bg-[var(--org-primary)] text-white hover:bg-[var(--org-primary)]/90"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                      }`}
                    >
                      <Grid3X3 className="w-4 h-4" />
                      <span className="hidden sm:inline">Cards</span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table className={viewMode === "grid" ? "hidden" : ""}>
                <TableHeader>
                  <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                    <TableHead className="font-semibold text-slate-700 py-4 px-6">
                      Consumable
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 py-4 px-6">
                      Category
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 py-4 px-6">
                      Stock
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 py-4 px-6">
                      Status
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 py-4 px-6">
                      Location
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 py-4 px-6">
                      Issued To
                    </TableHead>
                    <TableHead className="font-semibold text-slate-700 py-4 px-6 text-center">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredConsumables.length > 0 ? (
                    pagedConsumables.map((consumable, index) => (
                      <TableRow
                        key={consumable.$id}
                        className={`${rowHoverClass} transition-colors duration-200 group border-b border-gray-100/50`}
                      >
                        <TableCell className="py-4 px-6">
                          <div className="flex items-center space-x-3">
                            <div
                              className={`p-2 rounded-lg transition-all duration-200 ${iconBackgroundClass}`}
                            >
                              <Package
                                className={`h-4 w-4 ${
                                  isNrepOrg
                                    ? "text-[var(--org-primary)]"
                                    : "text-sidebar-600"
                                }`}
                              />
                            </div>
                            <div>
                              <p
                                className={`font-medium text-slate-900 ${nameHoverClass} transition-colors duration-200`}
                              >
                                {consumable.name}
                              </p>
                              <p className="text-sm text-slate-500">
                                {formatCategory(getConsumableUnit(consumable))}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-4 px-6">
                          <Badge
                            variant="outline"
                            className={`${categoryBadgeClass} hover:brightness-110 transition-colors duration-200`}
                          >
                            {formatCategory(getConsumableCategory(consumable))}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-4 px-6">
                          <div className="flex items-center space-x-2">
                            <span className="font-medium text-slate-900">
                              {getCurrentStock(consumable)}
                            </span>
                            {getMinStock(consumable) > 0 && (
                              <span className="text-sm text-slate-500">
                                (min: {getMinStock(consumable)})
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-4 px-6">
                          <Badge
                            className={`${badgeForStatus(
                              getStatus(consumable)
                            )}`}
                          >
                            {getStatus(consumable).replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-4 px-6">
                          <div className="flex items-center space-x-2">
                            <MapPin className={`h-4 w-4 ${locationIconClass}`} />
                            <span className={locationTextClass}>
                              {consumable.locationName ||
                                consumable.roomOrArea ||
                                "Not specified"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-4 px-6">
                          {getLatestRecipientName(consumable.$id) ? (
                            <div className="flex items-center space-x-2">
                              <UserCheck className="h-4 w-4 text-amber-600" />
                              <span className="text-sm font-medium text-slate-700">
                                {getLatestRecipientName(consumable.$id)}
                                {getRecipientCount(consumable.$id) > 1 && (
                                  <span className="text-xs text-slate-400">
                                    {" "}
                                    +{getRecipientCount(consumable.$id) - 1} more
                                  </span>
                                )}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-slate-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-4 px-6">
                          <div className="flex items-center justify-center space-x-2">
                            <Button
                              asChild
                              variant="default"
                              size="sm"
                              className={actionIconClass}
                            >
                              <Link
                                href={`/admin/consumables/${consumable.$id}`}
                              >
                                <Eye className="h-5 w-5 group-hover/btn:scale-110 transition-transform duration-200" />
                              </Link>
                            </Button>
                            <Button
                              asChild
                              variant="highlight"
                              size="sm"
                              className={actionIconClass}
                            >
                              <Link
                                href={`/admin/consumables/${consumable.$id}/edit`}
                              >
                                <Edit className="h-5 w-5 group-hover/btn:scale-110 transition-transform duration-200" />
                              </Link>
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteConsumable(consumable)}
                              className={actionIconClass}
                            >
                              <Trash2 className="h-5 w-5 group-hover/btn:scale-110 transition-transform duration-200" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12">
                        <div className="flex flex-col items-center space-y-4">
                          <div className="p-4 bg-gray-100 rounded-full">
                            <Package className="h-8 w-8 text-gray-400" />
                          </div>
                          <div className="space-y-2">
                            <p className="text-lg font-medium text-slate-600">
                              No consumables found
                            </p>
                            <p className="text-sm text-slate-400">
                              Try adjusting your search or filters
                            </p>
                          </div>
                          <Button
                            onClick={() => router.push("/admin/consumables/new")}
                            className="mt-4 bg-org-gradient text-white"
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Add First Consumable
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {viewMode === "grid" && (
              <div className="p-6">
                {filteredConsumables.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {pagedConsumables.map((consumable) => {
                      const status = getStatus(consumable);
                      const updatedAtLabel = consumable.$updatedAt
                        ? new Date(consumable.$updatedAt).toLocaleDateString()
                        : "–";
                      return (
                        <div
                          key={`${consumable.$id}-card`}
                          className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white !shadow-none hover:border-[var(--org-primary)]/35 transition-all duration-200"
                        >
                          <div className="absolute inset-0 bg-gradient-to-br from-[var(--org-primary)]/12 via-[var(--org-highlight)]/8 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                          <div className="relative z-10 p-6 space-y-5">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`p-3 rounded-xl ${iconBackgroundClass}`}
                                >
                                  <ShoppingCart
                                    className={`h-5 w-5 ${
                                      isNrepOrg
                                        ? "text-[var(--org-primary)]"
                                        : "text-sidebar-600"
                                    }`}
                                  />
                                </div>
                                <div>
                                  <h3
                                    className={`text-lg font-semibold text-slate-900 ${nameHoverClass}`}
                                  >
                                    {consumable.name}
                                  </h3>
                                  <p className="text-sm text-slate-500">
                                    Unit: {formatCategory(getConsumableUnit(consumable))}
                                  </p>
                                </div>
                              </div>
                              <Badge className={`${categoryBadgeClass} px-3 py-1`}>
                                {formatCategory(getConsumableCategory(consumable))}
                              </Badge>
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                              <Badge className={`${badgeForStatus(status)}`}>
                                {status.replace(/_/g, " ")}
                              </Badge>
                              <div className="flex items-center gap-2 text-sm text-slate-600">
                                <CheckCircle className="h-4 w-4" />
                                <span>
                                  Stock:{" "}
                                  <span className="font-semibold">
                                    {getCurrentStock(consumable)}
                                  </span>
                                  {getMinStock(consumable) > 0 && (
                                    <span className="text-xs text-slate-400 ml-2">
                                      min {getMinStock(consumable)}
                                    </span>
                                  )}
                                </span>
                              </div>
                              {getMaxStock(consumable) > 0 && (
                                <Badge variant="outline" className="text-xs text-slate-500 border-slate-200">
                                  Max {getMaxStock(consumable)}
                                </Badge>
                              )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                              <div className="flex items-center gap-2">
                                <MapPin className={`h-4 w-4 ${locationIconClass}`} />
                                <span className={locationTextClass}>
                                  {consumable.locationName ||
                                    consumable.roomOrArea ||
                                    "Not specified"}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-slate-500">
                                <Clock className="h-4 w-4" />
                                <span>
                                  Updated <span className="font-medium">{updatedAtLabel}</span>
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between">
                              <div className="text-xs uppercase tracking-wide text-slate-400">
                                Item Code: {consumable.assetTag || "—"}
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  asChild
                                  variant="default"
                                  size="sm"
                                  className={actionIconClassLg}
                                >
                                  <Link href={`/admin/consumables/${consumable.$id}`}>
                                    <Eye className="h-5 w-5 group-hover/btn:scale-110 transition-transform duration-200" />
                                  </Link>
                                </Button>
                                <Button
                                  asChild
                                  variant="highlight"
                                  size="sm"
                                  className={actionIconClassLg}
                                >
                                  <Link href={`/admin/consumables/${consumable.$id}/edit`}>
                                    <Edit className="h-5 w-5 group-hover/btn:scale-110 transition-transform duration-200" />
                                  </Link>
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleDeleteConsumable(consumable)}
                                  className={actionIconClassLg}
                                >
                                  <Trash2 className="h-5 w-5 group-hover/btn:scale-110 transition-transform duration-200" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-500">
                    No consumables found. Try adjusting your filters.
                  </div>
                )}
              </div>
            )}

            <div className="px-6 pb-6">
              <ListPagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                totalItems={pagination.totalItems}
                pageSize={PAGE_SIZE}
                onPageChange={setCurrentPage}
                itemLabel="consumables"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Custom Delete Confirmation Dialog */}
      {showDeleteDialog && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={cancelDeleteConsumable}
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            isolation: "isolate",
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md mx-auto w-full m-4 hover:bg-white"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "white !important",
              position: "relative",
              zIndex: 51,
            }}
          >
            <div
              className="flex flex-col items-center space-y-6 p-6 hover:bg-white"
              style={{
                backgroundColor: "white !important",
                position: "relative",
                zIndex: 52,
              }}
            >
              {/* Warning Icon */}
              <div className="p-4 bg-gradient-to-br from-red-50 to-red-100 rounded-full">
                <AlertTriangle className="h-12 w-12 text-red-500" />
              </div>

              {/* Dialog Content */}
              <div className="text-center space-y-4 p-6">
                <h3 className="text-xl font-semibold text-gray-900">
                  Delete Consumable
                </h3>
                <p className="text-gray-600">
                  Are you sure you want to delete this consumable? This action
                  cannot be undone.
                </p>

                {/* Consumable Details */}
                {consumableToDelete && (
                  <div className="bg-gray-50 rounded-lg p-4 mt-4">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-gradient-to-br from-primary-100 to-primary-200 rounded-lg">
                        <Package className="h-5 w-5 text-primary-600" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-gray-900">
                          {consumableToDelete.name}
                        </p>
                        <p className="text-sm text-gray-500">
                          {formatCategory(
                            getConsumableCategory(consumableToDelete)
                          )}
                        </p>
                        <p className="text-sm text-gray-500">
                          Stock: {getCurrentStock(consumableToDelete)}{" "}
                      {formatCategory(getConsumableUnit(consumableToDelete))}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center space-x-3 w-full pt-4">
                  <Button
                    onClick={cancelDeleteConsumable}
                    variant="outline"
                    className="flex-1 border-2 border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={confirmDeleteConsumable}
                    variant="destructive"
                    className="flex-1 shadow-md hover:shadow-lg transition-all duration-200"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Consumable
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Beautiful Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-gradient-to-br from-black/40 via-primary-900/20 to-sidebar-900/20 backdrop-blur-md z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full relative z-[10000] animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
            {/* Close Button */}
            <button
              onClick={() => setShowSuccessModal(false)}
              className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors duration-200"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>

            {/* Success Content */}
            <div className="p-8 text-center">
              {/* Success Icon */}
              <div className="mx-auto mb-6 w-20 h-20 bg-gradient-to-br from-primary-500 to-primary-600 rounded-full flex items-center justify-center shadow-lg">
                <CheckCircle className="w-10 h-10 text-white" />
              </div>

              {/* Success Message */}
              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                Success!
              </h3>
              <p className="text-gray-600 text-lg mb-8">
                Consumable created successfully!
              </p>

              {/* Action Button */}
              <Button
                onClick={() => setShowSuccessModal(false)}
                className="w-full bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-semibold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
              >
                Continue
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
