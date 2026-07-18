"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  CheckCircle,
  Users,
  Settings,
  DollarSign,
  MapPin,
  FileText,
  UserCheck,
  Clock,
  Image,
  List,
  Grid3X3,
} from "lucide-react";
import {
  assetsService,
  projectsService,
  staffService,
  assetIssuesService,
} from "../../../lib/appwrite/provider.js";
import { buildRecipientsMap } from "../../../lib/utils/holders.js";
import { Query } from "appwrite";
import { getCurrentStaff, permissions } from "../../../lib/utils/auth.js";
import { useToastContext } from "../../../components/providers/toast-provider";
import { useConfirmation } from "../../../components/ui/confirmation-dialog";
import { ENUMS, OPTIONAL_ASSET_IMAGE_PLACEHOLDER } from "../../../lib/appwrite/config.js";
import {
  formatCategory,
  getStatusBadgeColor,
  getConditionBadgeColor,
} from "../../../lib/utils/mappings.js";
import {
  ASSET_SUBCATEGORIES,
  getSubcategoriesForCategory,
  assetMatchesSubcategory,
} from "../../../lib/constants/asset-subcategories.js";
import { useOrgTheme } from "../../../components/providers/org-theme-provider";
import { PageLoading } from "../../../components/ui/loading";
import { buildAssetTag } from "../../../lib/utils/asset-tag.js";
import {
  ListPagination,
  paginateItems,
} from "../../../components/ui/list-pagination";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const PAGE_SIZE = 15;

export default function AdminAssetManagement() {
  const router = useRouter();
  const toast = useToastContext();
  const { confirm } = useConfirmation();
  const { theme, orgCode } = useOrgTheme();
  const [staff, setStaff] = useState(null);
  const [assets, setAssets] = useState([]);
  const [staffMap, setStaffMap] = useState(() => new Map());
  const [recipientsMap, setRecipientsMap] = useState(() => new Map());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterSubcategory, setFilterSubcategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCondition, setFilterCondition] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [assetToDelete, setAssetToDelete] = useState(null);
  const [viewMode, setViewMode] = useState("table");
  const [currentPage, setCurrentPage] = useState(1);

  // Export functionality state
  const [exporting, setExporting] = useState(false);

  // Manual ID assignment state
  const [manualIdAssignment, setManualIdAssignment] = useState(false);
  const [projects, setProjects] = useState([]);

  // New asset form state - matching Appwrite collection attributes
  const [newAsset, setNewAsset] = useState({
    assetTag: "",
    serialNumber: "",
    name: "",
    category: ENUMS.CATEGORY.IT_EQUIPMENT,
    subcategory: "",
    model: "",
    manufacturer: "",
    departmentId: "",
    custodianStaffId: "",
    availableStatus: ENUMS.AVAILABLE_STATUS.AVAILABLE,
    currentCondition: ENUMS.CURRENT_CONDITION.NEW,
    locationName: "",
    roomOrArea: "",
    purchaseDate: "",
    warrantyExpiryDate: "",
    lastMaintenanceDate: "",
    nextMaintenanceDue: "",
    lastInventoryCheck: "",
    retirementDate: "",
    disposalDate: "",
    attachmentFileIds: [],
    isPublic: false,
    publicSummary: "",
    publicImages: [],
    publicLocationLabel: "",
    publicConditionLabel: ENUMS.PUBLIC_CONDITION_LABEL.NEW,
  });

  useEffect(() => {
    checkPermissionsAndLoadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedMode = window.localStorage.getItem("assetViewMode");
    if (storedMode === "table" || storedMode === "grid") {
      setViewMode(storedMode);
    }
  }, []);

  const isNrepOrg = orgCode === "NREP";

  const allowedProjectIds = useMemo(() => {
    const ids = theme?.projects?.allowedIds;
    return Array.isArray(ids)
      ? ids
          .map((id) => id?.toString().toLowerCase())
          .filter((id) => typeof id === "string" && id.length > 0)
      : [];
  }, [theme?.projects?.allowedIds]);
  const defaultProjectId = theme?.projects?.defaultId;

  const filterGridClasses = isNrepOrg
    ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6"
    : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6";

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

  const projectLookup = useMemo(() => {
    const map = new Map();
    (projects || []).forEach((project) => {
      if (!project || !project.$id) return;
      const label = project.name || project.title || project.code || project.$id;
      map.set(project.$id, label);
      map.set(project.$id.toLowerCase(), label);
    });
    return map;
  }, [projects]);

  const extractProjectId = (asset) => {
    if (!asset) return "";
    if (typeof asset.projectId === "string" && asset.projectId.trim()) {
      // Filter out RETC placeholder value
      if (asset.projectId === "RETC_NO_PROJECT") return "";
      return asset.projectId;
    }
    if (asset.projectId && typeof asset.projectId === "object") {
      if (typeof asset.projectId.$id === "string") {
        return asset.projectId.$id;
      }
    }
    if (asset.project && typeof asset.project === "object") {
      if (typeof asset.project.$id === "string") {
        return asset.project.$id;
      }
      if (typeof asset.project.id === "string") {
        return asset.project.id;
      }
    }
    if (typeof asset.project === "string") {
      return asset.project;
    }
    return "";
  };

  const resolveProjectName = (asset) => {
    if (!isNrepOrg) return "-";
    const explicitName =
      asset?.projectName || asset?.project?.name || asset?.project?.title;
    const projectId = extractProjectId(asset);
    if (explicitName) return explicitName;
    if (projectId) {
      const lookupName =
        projectLookup.get(projectId) ||
        projectLookup.get(projectId.toLowerCase());
      if (lookupName) return lookupName;
    }
    return "Unassigned";
  };

  const checkPermissionsAndLoadData = async () => {
    try {
      const currentStaff = await getCurrentStaff();
      if (!currentStaff || !permissions.canManageAssets(currentStaff)) {
        window.location.href = "/unauthorized";
        return;
      }
      setStaff(currentStaff);
      await loadAssets();
      await loadProjects();
      await loadStaffMap();
    } catch (error) {
      // Silent fail for data loading
    } finally {
      setLoading(false);
    }
  };

  const loadStaffMap = async () => {
    try {
      const [staffResult, issuesResult] = await Promise.all([
        staffService.list(),
        assetIssuesService.list([Query.orderDesc("issuedAt")]),
      ]);
      const map = new Map();
      (staffResult?.documents || []).forEach((member) => {
        if (member?.$id) map.set(member.$id, member.name || "Unknown");
      });
      setStaffMap(map);
      setRecipientsMap(buildRecipientsMap(issuesResult?.documents || []));
    } catch (error) {
      console.error("Failed to load staff/holders for lookup:", error);
    }
  };

  // Name of the person currently holding an asset, or null when available.
  // Uses the captured recipient name from the latest issue record.
  const getHeldByName = (asset) => {
    if (!asset || asset.availableStatus === ENUMS.AVAILABLE_STATUS.AVAILABLE) {
      return null;
    }
    const rows = recipientsMap.get(asset.$id);
    const latest = rows && rows.length > 0 ? rows[0] : null;
    if (latest?.name) return latest.name;
    if (latest?.staffId) return staffMap.get(latest.staffId) || "Unknown";
    // Fallback to the asset's custodian only if no issue record exists.
    if (asset.custodianStaffId) return staffMap.get(asset.custodianStaffId) || "Unknown";
    return null;
  };

  const loadAssets = async () => {
    try {
      // Same pattern as consumables: getAssets() sends limit + itemType (avoids 400 from server)
      const result = await assetsService.getAssets();
      setAssets(result?.documents ?? []);
    } catch (error) {
      console.error("Failed to load assets:", error?.message || error);
      setAssets([]);
    }
  };

  const handleCreateAsset = async () => {
    try {
      // Generate asset tag if not manually provided (format: NREP-MECS-LAPTOP-001 or RETC-LAPTOP-001)
      const orgCodeForTag = (orgCode || theme?.code || "RETC").toUpperCase();
      const selectedProject = isNrepOrg && (defaultProjectId || projects[0])
        ? (projects.find((p) => p.$id === defaultProjectId) || projects[0] || null)
        : null;
      const autoTag = buildAssetTag(orgCodeForTag, selectedProject, newAsset.category, newAsset.name);
      const assetTag = manualIdAssignment && newAsset.assetTag
        ? newAsset.assetTag
        : (autoTag || `${orgCodeForTag}-${Date.now()}`);

      // Get current organization ID - try multiple sources in order of reliability
      const { getCurrentOrgId, getCurrentOrgIdAsync } = await import("../../../lib/utils/org.js");
      let currentOrgId = 
        staff?.orgId ||                  // First: staff record (most reliable)
        theme?.appwriteOrgId;            // Second: theme from useOrgTheme (available immediately)
      
      // Third: Try API endpoint (works in production - server-side reads env vars at runtime)
      if (!currentOrgId || currentOrgId.trim() === "") {
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

      // Prepare asset data matching Appwrite collection schema
      const assetData = {
        // Explicitly set orgId to ensure it's always included
        orgId: currentOrgId,
        // NREP requires projectId; RETC omits (provider will delete)
        projectId: isNrepOrg ? (defaultProjectId || projects[0]?.$id || "") : null,
        assetTag,
        serialNumber: newAsset.serialNumber || "",
        name: newAsset.name,
        category: newAsset.category,
        subcategory: newAsset.subcategory || "",
        model: newAsset.model || "",
        manufacturer: newAsset.manufacturer || "",
        departmentId: newAsset.departmentId || "",
        custodianStaffId: newAsset.custodianStaffId || "",
        availableStatus: newAsset.availableStatus,
        currentCondition: newAsset.currentCondition,
        locationName: newAsset.locationName || "",
        roomOrArea: newAsset.roomOrArea || "",
        purchaseDate: newAsset.purchaseDate || null,
        warrantyExpiryDate: newAsset.warrantyExpiryDate || null,
        lastMaintenanceDate: newAsset.lastMaintenanceDate || null,
        nextMaintenanceDue: newAsset.nextMaintenanceDue || null,
        lastInventoryCheck: newAsset.lastInventoryCheck || null,
        retirementDate: newAsset.retirementDate || null,
        disposalDate: newAsset.disposalDate || null,
        attachmentFileIds: newAsset.attachmentFileIds || [],
        isPublic: newAsset.isPublic || false,
        publicSummary: newAsset.publicSummary || "",
        publicImages: JSON.stringify(newAsset.publicImages || []),
        publicLocationLabel: newAsset.publicLocationLabel || "",
        publicConditionLabel:
          newAsset.publicConditionLabel || ENUMS.PUBLIC_CONDITION_LABEL.NEW,
        // Asset image is optional; use placeholder when none so Appwrite URL attribute is valid
        assetImage:
          newAsset.publicImages && newAsset.publicImages.length > 0
            ? assetImageService.getPublicImageUrl(newAsset.publicImages[0])
            : OPTIONAL_ASSET_IMAGE_PLACEHOLDER,
        // Mark as asset type
        itemType: ENUMS.ITEM_TYPE.ASSET,
      };

      await assetsService.create(assetData, staff.$id);

      // Reset form and refresh assets
      setNewAsset({
        assetTag: "",
        serialNumber: "",
        name: "",
        category: ENUMS.CATEGORY.IT_EQUIPMENT,
        subcategory: "",
        model: "",
        manufacturer: "",
        departmentId: "",
        custodianStaffId: "",
        availableStatus: ENUMS.AVAILABLE_STATUS.AVAILABLE,
        currentCondition: ENUMS.CURRENT_CONDITION.NEW,
        locationName: "",
        roomOrArea: "",
        purchaseDate: "",
        warrantyExpiryDate: "",
        lastMaintenanceDate: "",
        nextMaintenanceDue: "",
        lastInventoryCheck: "",
        retirementDate: "",
        disposalDate: "",
        attachmentFileIds: [],
        isPublic: false,
        publicSummary: "",
        publicImages: "",
        publicLocationLabel: "",
        publicConditionLabel: ENUMS.PUBLIC_CONDITION_LABEL.NEW,
      });
      setManualIdAssignment(false);

      setShowAddDialog(false);
      await loadAssets();
      toast.success("Asset created successfully!");
    } catch (error) {
      console.error("Asset create failed:", error);
      const msg = error?.message || error?.toString?.() || "Please try again.";
      toast.error(`Failed to create asset: ${msg}`);
    }
  };

  const handleDeleteAsset = (asset) => {
    setAssetToDelete(asset);
    setShowDeleteDialog(true);
  };

  const handleViewModeChange = (mode) => {
    if (mode === "table" || mode === "grid") {
      setViewMode(mode);
    }
  };

  const confirmDeleteAsset = async () => {
    if (!assetToDelete) return;

    try {
      await assetsService.delete(assetToDelete.$id);
      await loadAssets();
      setShowDeleteDialog(false);
      setAssetToDelete(null);
      toast.success("Asset deleted successfully!");
    } catch (error) {
      toast.error("Failed to delete asset. Please try again.");
    }
  };

  const cancelDeleteAsset = () => {
    setShowDeleteDialog(false);
    setAssetToDelete(null);
  };

  /**
   * Download assets data as a PDF report with comprehensive metadata
   *
   * Modes:
   * 1. "Assets" - downloads ALL assets from the database
   * 2. "FilteredAssets" - downloads only the filtered/displayed assets
   */
  const exportAssetsData = async (type = "Assets") => {
    try {
      setExporting(true);

      let dataToExport = [];

      if (type === "FilteredAssets") {
        dataToExport = filteredAssets;
      } else {
        const result = await assetsService.getAssets();
        dataToExport = result?.documents ?? [];
      }

      if (!Array.isArray(dataToExport) || dataToExport.length === 0) {
        toast.warning("No assets available for download.");
        return;
      }

      const exportLabel =
        type === "FilteredAssets" ? "Filtered Assets" : "Asset Inventory";
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
          filterCondition !== "all"
            ? `Condition: ${formatCategory(filterCondition)}`
            : null,
          isNrepOrg && projectFilter !== "all"
            ? `Project: ${
                projectFilter === "unassigned"
                  ? "Unassigned"
                  : projectLookup.get(projectFilter) || projectFilter
              }`
            : null,
        ]
          .filter(Boolean)
          .join(" | ") || "No filters applied";

      doc.setFontSize(16);
      doc.text(`${exportLabel} Report`, 40, 40);
      doc.setFontSize(10);
      doc.text(`Organization: ${theme?.name || orgCode || "N/A"}`, 40, 60);
      doc.text(`Generated by: ${staff?.name || "Unknown"}`, 40, 74);
      doc.text(`Generated on: ${now.toLocaleString()}`, 40, 88);
      doc.text(`Filters: ${filtersLine}`, 40, 102);
      doc.text(`Total assets: ${dataToExport.length}`, 40, 116);

      const tableRows = dataToExport.map((asset, index) => {
        const projectId = extractProjectId(asset);
        const projectLabel =
          projectLookup.get(projectId) ||
          projectLookup.get(projectId?.toLowerCase?.()) ||
          projectId ||
          "—";
        const monetaryValue =
          typeof asset.purchaseCost === "number"
            ? `$${asset.purchaseCost.toLocaleString()}`
            : asset.purchaseCost
            ? `$${Number(asset.purchaseCost).toLocaleString()}`
            : "—";

        return [
          index + 1,
          asset.assetTag || asset.serialNumber || asset.$id,
          asset.name || "Unnamed Asset",
          formatCategory(asset.category || "Unknown"),
          (asset.availableStatus || "UNKNOWN").replace(/_/g, " "),
          (asset.currentCondition || "UNKNOWN").replace(/_/g, " "),
          monetaryValue,
          asset.locationName ||
            asset.roomOrArea ||
            asset.publicLocationLabel ||
            "Not specified",
          projectLabel,
        ];
      });

      autoTable(doc, {
        startY: 140,
        head: [
          [
            "#",
            "Asset Code",
            "Asset Name",
            "Category",
            "Status",
            "Condition",
            "Value",
            "Location",
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
          fillColor: [5, 150, 105],
          textColor: 255,
        },
        alternateRowStyles: {
          fillColor: [249, 250, 251],
        },
        margin: { left: 40, right: 40 },
        didDrawPage: () => {
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
        `${
          type === "FilteredAssets" ? "filtered_assets" : "assets"
        }_${now.toISOString().split("T")[0]}.pdf`
      );
      toast.success("Asset PDF downloaded successfully.");
    } catch (error) {
      console.error("Download failed:", error);
      toast.error("Download failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  // Filter assets based on search and filters
  const filteredAssets = (assets || []).filter((asset) => {
    const matchesSearch =
      asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.serialNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.manufacturer?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.assetTag?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory =
      filterCategory === "all" || asset.category === filterCategory;
    const matchesSubcategory = assetMatchesSubcategory(
      asset,
      filterSubcategory
    );
    const matchesStatus =
      filterStatus === "all" || asset.availableStatus === filterStatus;
    const matchesCondition =
      filterCondition === "all" || asset.currentCondition === filterCondition;

    const assetProjectId = extractProjectId(asset);
    const normalizedAssetProjectId = assetProjectId
      ? assetProjectId.toLowerCase()
      : "";
    const normalizedProjectFilter = projectFilter
      ? projectFilter.toLowerCase()
      : "";
    const matchesProject =
      !isNrepOrg ||
      projectFilter === "all" ||
      (projectFilter === "unassigned" && !assetProjectId) ||
      assetProjectId === projectFilter ||
      normalizedAssetProjectId === normalizedProjectFilter;

    return (
      matchesSearch &&
      matchesCategory &&
      matchesSubcategory &&
      matchesStatus &&
      matchesCondition &&
      matchesProject
    );
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    filterCategory,
    filterSubcategory,
    filterStatus,
    filterCondition,
    projectFilter,
  ]);

  const pagination = useMemo(
    () => paginateItems(filteredAssets, currentPage, PAGE_SIZE),
    [filteredAssets, currentPage]
  );
  const pagedAssets = pagination.items;
  const clearFilters = () => {
    setSearchTerm("");
    setFilterCategory("all");
    setFilterSubcategory("all");
    setFilterStatus("all");
    setFilterCondition("all");
    setProjectFilter(defaultProjectId && isNrepOrg ? defaultProjectId : "all");
  };

  // Subcategory options for the filter: the selected category's predefined list,
  // or a de-duplicated union of all predefined subcategories.
  const subcategoryFilterOptions = (() => {
    if (filterCategory && filterCategory !== "all") {
      return getSubcategoriesForCategory(filterCategory);
    }
    const seen = new Set();
    return Object.values(ASSET_SUBCATEGORIES)
      .flat()
      .filter(({ value }) => {
        if (seen.has(value)) return false;
        seen.add(value);
        return true;
      });
  })();

  if (loading) {
    return <PageLoading message="Loading assets..." />;
  }

  const categoryBadgeClass = isNrepOrg
    ? "bg-slate-100 text-slate-700 border-slate-200"
    : "bg-sidebar-50 text-sidebar-700 border-sidebar-200";
  const headerBadgeClass = isNrepOrg
    ? "bg-[var(--org-primary)]/18 text-[var(--org-primary)] border-[var(--org-primary)]/25"
    : "bg-sidebar-500/20 text-sidebar-600 border-sidebar-500/30";
  // Action icon buttons use Button variants (view=default/sidebar, edit=highlight/orange, delete=destructive/red)
  const actionIconClass =
    "h-10 w-10 p-0 transition-all duration-200 group/btn shadow-sm";
  const actionIconClassLg =
    "h-11 w-11 p-0 transition-all duration-200 group/btn rounded-lg shadow-sm";

  const rowHoverClass = isNrepOrg
    ? "hover:bg-[var(--org-primary)]/7"
    : "hover:bg-gray-50/50";

  const iconBackgroundClass = isNrepOrg
    ? "bg-gradient-to-br from-[var(--org-primary)]/16 via-[var(--org-highlight)]/12 to-[var(--org-primary-dark)]/10"
    : "bg-gradient-to-br from-sidebar-100 to-sidebar-200";

  const nameHoverClass = isNrepOrg
    ? "group-hover:text-[var(--org-primary)]"
    : "group-hover:text-sidebar-700";

  const locationIconClass = "text-red-600";
  const locationTextClass = isNrepOrg
    ? "text-[var(--org-primary-dark)]"
    : "text-slate-700";

  return (
    <div
      className="admin-assets-page min-h-screen"
      style={{ background: "var(--org-background)" }}
    >
      <div className="container mx-auto p-6 space-y-8 max-w-7xl">
        {/* Header */}
        <div className="rounded-2xl border border-slate-200/80 bg-white px-7 py-8 sm:px-8 sm:py-9">
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-6">
            <div className="max-w-xl space-y-3">
              <h1
                className="text-3xl sm:text-[2rem] font-bold tracking-tight leading-tight"
                style={{
                  color:
                    "color-mix(in srgb, var(--org-primary-dark) 72%, #0f172a 28%)",
                }}
              >
                Asset Management
              </h1>
              <p className="text-[15px] text-slate-500 leading-relaxed">
                Manage system assets, inventory, and equipment
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {/* Download All Assets Button */}
              <Button
                onClick={() => exportAssetsData("Assets")}
                disabled={exporting}
                title="Download all assets from the database as a PDF file"
                variant="outline"
                className="border-[var(--org-primary)] text-[var(--org-primary)] hover:bg-[var(--org-primary)]/10"
              >
                <Download
                  className={`w-4 h-4 mr-2 ${exporting ? "animate-spin" : ""}`}
                />
                {exporting ? "Generating PDF..." : "Download PDF"}
              </Button>

              {/* Download Filtered Results Button */}
              {(searchTerm ||
                filterCategory !== "all" ||
                filterStatus !== "all" ||
                filterCondition !== "all") && (
                <Button
                  onClick={() => exportAssetsData("FilteredAssets")}
                  disabled={exporting}
                  title="Download only the currently filtered/displayed assets as a PDF file"
                  variant="outline"
                  className="border-[var(--org-primary)]/40 text-[var(--org-primary-dark)] hover:bg-[var(--org-primary)]/10"
                >
                  <Download
                    className={`w-4 h-4 mr-2 ${exporting ? "animate-spin" : ""}`}
                  />
                  {exporting ? "Generating PDF..." : "Download PDF (Filtered)"}
                </Button>
              )}

              <Button
                onClick={() => router.push("/admin/assets/new")}
                className="bg-org-gradient text-white border-0"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Asset
              </Button>

              {/* Removed Dialog - Now using dedicated page at /admin/assets/new */}
              {false && <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogTrigger asChild>
                  <Button className="relative bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white border-0 shadow-lg hover:shadow-2xl transition-all duration-300 ease-out group overflow-hidden hover:scale-105">
                    <div className="flex items-center justify-center relative z-10">
                      <Plus className="w-4 h-4 mr-2 group-hover:rotate-90 group-hover:scale-110 transition-all duration-300" />
                      <span className="group-hover:translate-x-0.5 transition-transform duration-300">
                        Add Asset
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
                <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto">
                  <DialogHeader className="sticky top-0 bg-white border-b pb-4 mb-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <DialogTitle className="text-xl font-semibold">
                          Add New Asset
                        </DialogTitle>
                        <DialogDescription className="text-gray-600 mt-1">
                          Create a new asset record in the system with detailed
                          information
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

                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="space-y-3">
                          <div className="flex items-center space-x-2 mb-2">
                            <input
                              type="checkbox"
                              id="manualIdAssignment"
                              checked={manualIdAssignment}
                              onChange={(e) => {
                                setManualIdAssignment(e.target.checked);
                                if (!e.target.checked) {
                                  setNewAsset({ ...newAsset, assetTag: "" });
                                }
                              }}
                              className="rounded"
                            />
                            <Label
                              htmlFor="manualIdAssignment"
                              className="text-sm font-medium text-gray-700 cursor-pointer"
                            >
                              Manually assign ID
                            </Label>
                          </div>
                          <Label
                            htmlFor="assetTag"
                            className="text-sm font-medium text-gray-700"
                          >
                            Asset Tag {manualIdAssignment && "*"}
                          </Label>
                          <Input
                            id="assetTag"
                            value={newAsset.assetTag}
                            onChange={(e) =>
                              setNewAsset({
                                ...newAsset,
                                assetTag: e.target.value,
                              })
                            }
                            placeholder={
                              manualIdAssignment
                                ? "e.g. NREP-MECS-LAPTOP-001 or RETC-LAPTOP-001"
                                : "Auto-generated (e.g. NREP-MECS-LAPTOP-001)"
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
                            Asset Name *
                          </Label>
                          <Input
                            id="name"
                            value={newAsset.name}
                            onChange={(e) =>
                              setNewAsset({ ...newAsset, name: e.target.value })
                            }
                            placeholder="e.g., Dell Laptop XPS 13"
                            className="h-11"
                            required
                          />
                        </div>
                        <div className="space-y-3">
                          <Label
                            htmlFor="category"
                            className="text-sm font-medium text-gray-700"
                          >
                            Category *
                          </Label>
                          <Select
                            value={newAsset.category}
                            onValueChange={(value) =>
                              setNewAsset({ ...newAsset, category: value })
                            }
                          >
                            <SelectTrigger className="h-11">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.values(ENUMS.CATEGORY).map((category) => (
                                <SelectItem key={category} value={category}>
                                  {formatCategory(category)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <Label
                            htmlFor="subcategory"
                            className="text-sm font-medium text-gray-700"
                          >
                            Subcategory
                          </Label>
                          <Input
                            id="subcategory"
                            value={newAsset.subcategory}
                            onChange={(e) =>
                              setNewAsset({
                                ...newAsset,
                                subcategory: e.target.value,
                              })
                            }
                            placeholder="e.g., Laptop, Desktop, Server"
                            className="h-11"
                          />
                        </div>
                        <div className="space-y-3">
                          <Label
                            htmlFor="serialNumber"
                            className="text-sm font-medium text-gray-700"
                          >
                            Manufacturer Serial Number
                          </Label>
                          <Input
                            id="serialNumber"
                            value={newAsset.serialNumber}
                            onChange={(e) =>
                              setNewAsset({
                                ...newAsset,
                                serialNumber: e.target.value,
                              })
                            }
                            placeholder="e.g., ABC123456"
                            className="h-11"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Technical Details */}
                    <div className="bg-blue-50 p-6 rounded-lg space-y-6">
                      <div className="flex items-center space-x-2">
                        <Settings className="h-5 w-5 text-blue-600" />
                        <h3 className="text-lg font-semibold text-gray-900">
                          Technical Details
                        </h3>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <Label
                            htmlFor="model"
                            className="text-sm font-medium text-gray-700"
                          >
                            Model
                          </Label>
                          <Input
                            id="model"
                            value={newAsset.model}
                            onChange={(e) =>
                              setNewAsset({
                                ...newAsset,
                                model: e.target.value,
                              })
                            }
                            placeholder="e.g., XPS-13-9310"
                            className="h-11"
                          />
                        </div>
                        <div className="space-y-3">
                          <Label
                            htmlFor="manufacturer"
                            className="text-sm font-medium text-gray-700"
                          >
                            Manufacturer
                          </Label>
                          <Input
                            id="manufacturer"
                            value={newAsset.manufacturer}
                            onChange={(e) =>
                              setNewAsset({
                                ...newAsset,
                                manufacturer: e.target.value,
                              })
                            }
                            placeholder="e.g., Dell Technologies"
                            className="h-11"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Purchase & Warranty Information */}
                    <div className="bg-green-50 p-6 rounded-lg space-y-6">
                      <div className="flex items-center space-x-2">
                        <DollarSign className="h-5 w-5 text-green-600" />
                        <h3 className="text-lg font-semibold text-gray-900">
                          Purchase & Warranty Information
                        </h3>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <Label
                            htmlFor="purchaseDate"
                            className="text-sm font-medium text-gray-700"
                          >
                            Purchase Date
                          </Label>
                          <Input
                            id="purchaseDate"
                            type="datetime-local"
                            value={newAsset.purchaseDate}
                            onChange={(e) =>
                              setNewAsset({
                                ...newAsset,
                                purchaseDate: e.target.value,
                              })
                            }
                            className="h-11"
                          />
                        </div>
                        <div className="space-y-3">
                          <Label
                            htmlFor="warrantyExpiryDate"
                            className="text-sm font-medium text-gray-700"
                          >
                            Warranty Expiry Date
                          </Label>
                          <Input
                            id="warrantyExpiryDate"
                            type="datetime-local"
                            value={newAsset.warrantyExpiryDate}
                            onChange={(e) =>
                              setNewAsset({
                                ...newAsset,
                                warrantyExpiryDate: e.target.value,
                              })
                            }
                            className="h-11"
                          />
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
                            htmlFor="currentCondition"
                            className="text-sm font-medium text-gray-700"
                          >
                            Current Condition
                          </Label>
                          <Select
                            value={newAsset.currentCondition}
                            onValueChange={(value) =>
                              setNewAsset({
                                ...newAsset,
                                currentCondition: value,
                              })
                            }
                          >
                            <SelectTrigger className="h-11">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.values(ENUMS.CURRENT_CONDITION).map(
                                (condition) => (
                                  <SelectItem key={condition} value={condition}>
                                    {condition.replace(/_/g, " ")}
                                  </SelectItem>
                                )
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-3">
                          <Label
                            htmlFor="availableStatus"
                            className="text-sm font-medium text-gray-700"
                          >
                            Available Status
                          </Label>
                          <Select
                            value={newAsset.availableStatus}
                            onValueChange={(value) =>
                              setNewAsset({
                                ...newAsset,
                                availableStatus: value,
                              })
                            }
                          >
                            <SelectTrigger className="h-11">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.values(ENUMS.AVAILABLE_STATUS).map(
                                (status) => (
                                  <SelectItem key={status} value={status}>
                                    {status.replace(/_/g, " ")}
                                  </SelectItem>
                                )
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <Label
                            htmlFor="locationName"
                            className="text-sm font-medium text-gray-700"
                          >
                            Location Name
                          </Label>
                          <Input
                            id="locationName"
                            value={newAsset.locationName}
                            onChange={(e) =>
                              setNewAsset({
                                ...newAsset,
                                locationName: e.target.value,
                              })
                            }
                            placeholder="e.g., Building A"
                            className="h-11"
                          />
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
                            value={newAsset.roomOrArea}
                            onChange={(e) =>
                              setNewAsset({
                                ...newAsset,
                                roomOrArea: e.target.value,
                              })
                            }
                            placeholder="e.g., Room 101"
                            className="h-11"
                          />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <Label
                          htmlFor="publicLocationLabel"
                          className="text-sm font-medium text-gray-700"
                        >
                          Public Location Label
                        </Label>
                        <Input
                          id="publicLocationLabel"
                          value={newAsset.publicLocationLabel}
                          onChange={(e) =>
                            setNewAsset({
                              ...newAsset,
                              publicLocationLabel: e.target.value,
                            })
                          }
                          placeholder="e.g., Main Lab (visible to guests)"
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
                            checked={newAsset.isPublic}
                            onChange={(e) =>
                              setNewAsset({
                                ...newAsset,
                                isPublic: e.target.checked,
                              })
                            }
                            className="rounded"
                          />
                          <Label
                            htmlFor="isPublic"
                            className="text-sm font-medium text-gray-700"
                          >
                            Make this asset visible in guest portal
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
                            value={newAsset.publicSummary}
                            onChange={(e) =>
                              setNewAsset({
                                ...newAsset,
                                publicSummary: e.target.value,
                              })
                            }
                            placeholder="Brief description visible to guests and public viewers"
                            rows={3}
                            className="resize-none"
                          />
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <Label
                              htmlFor="publicConditionLabel"
                              className="text-sm font-medium text-gray-700"
                            >
                              Public Condition Label
                            </Label>
                            <Select
                              value={newAsset.publicConditionLabel}
                              onValueChange={(value) =>
                                setNewAsset({
                                  ...newAsset,
                                  publicConditionLabel: value,
                                })
                              }
                            >
                              <SelectTrigger className="h-11">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.values(
                                  ENUMS.PUBLIC_CONDITION_LABEL
                                ).map((condition) => (
                                  <SelectItem key={condition} value={condition}>
                                    {condition.replace(/_/g, " ")}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Asset Images Section removed: assets no longer use images */}
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
                          onClick={handleCreateAsset}
                          disabled={
                            !newAsset.name ||
                            !newAsset.category ||
                            (manualIdAssignment && !newAsset.assetTag)
                          }
                          className="px-6 bg-blue-600 hover:bg-blue-700"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Create Asset
                        </Button>
                      </div>
                    </div>
                  </DialogFooter>
                </DialogContent>
              </Dialog>}
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 pt-1">
            {/* Total Assets */}
            <button
              type="button"
              className="text-left rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 min-h-[172px] flex flex-col transition-colors duration-200 hover:bg-slate-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--org-primary)]/25"
              style={{
                borderLeft: "4px solid var(--org-primary)",
                boxShadow: "none",
              }}
              onClick={() => setFilterStatus("all")}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-slate-700 leading-snug">
                  Total Assets
                </p>
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                  style={{
                    background:
                      "color-mix(in srgb, var(--org-primary) 12%, white)",
                    color: "var(--org-primary)",
                  }}
                >
                  <Package className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-auto pt-8">
                <p
                  className="text-[2.35rem] font-bold tracking-tight tabular-nums leading-none"
                  style={{ color: "var(--org-primary-dark)" }}
                >
                  {assets.length}
                </p>
                <p className="text-sm text-slate-500 mt-3 leading-relaxed">
                  {
                    assets.filter(
                      (a) =>
                        a.availableStatus === ENUMS.AVAILABLE_STATUS.AVAILABLE
                    ).length
                  }{" "}
                  available ·{" "}
                  {
                    assets.filter(
                      (a) => a.availableStatus === ENUMS.AVAILABLE_STATUS.IN_USE
                    ).length
                  }{" "}
                  in use
                </p>
              </div>
            </button>

            {/* Available */}
            <button
              type="button"
              className="text-left rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 min-h-[172px] flex flex-col transition-colors duration-200 hover:bg-slate-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--org-primary)]/25"
              style={{
                borderLeft: "4px solid var(--org-primary-dark)",
                boxShadow: "none",
              }}
              onClick={() => setFilterStatus(ENUMS.AVAILABLE_STATUS.AVAILABLE)}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-slate-700 leading-snug">
                  Available
                </p>
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                  style={{
                    background:
                      "color-mix(in srgb, var(--org-primary-dark) 12%, white)",
                    color: "var(--org-primary-dark)",
                  }}
                >
                  <CheckCircle className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-auto pt-8">
                <p
                  className="text-[2.35rem] font-bold tracking-tight tabular-nums leading-none"
                  style={{ color: "var(--org-primary-dark)" }}
                >
                  {
                    assets.filter(
                      (a) =>
                        a.availableStatus === ENUMS.AVAILABLE_STATUS.AVAILABLE
                    ).length
                  }
                </p>
                <p className="text-sm text-slate-500 mt-3 leading-relaxed">
                  Ready for deployment
                </p>
              </div>
            </button>

            {/* In Use */}
            <button
              type="button"
              className="text-left rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 min-h-[172px] flex flex-col transition-colors duration-200 hover:bg-slate-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--org-highlight)]/30"
              style={{
                borderLeft: "4px solid var(--org-highlight)",
                boxShadow: "none",
              }}
              onClick={() => setFilterStatus(ENUMS.AVAILABLE_STATUS.IN_USE)}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-slate-700 leading-snug">
                  In Use
                </p>
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                  style={{
                    background:
                      "color-mix(in srgb, var(--org-highlight) 16%, white)",
                    color: "var(--org-highlight-dark)",
                  }}
                >
                  <UserCheck className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-auto pt-8">
                <p
                  className="text-[2.35rem] font-bold tracking-tight tabular-nums leading-none"
                  style={{ color: "var(--org-highlight-dark)" }}
                >
                  {
                    assets.filter(
                      (a) => a.availableStatus === ENUMS.AVAILABLE_STATUS.IN_USE
                    ).length
                  }
                </p>
                <p className="text-sm text-slate-500 mt-3 leading-relaxed">
                  Currently assigned
                </p>
              </div>
            </button>

            {/* Maintenance */}
            <button
              type="button"
              className="text-left rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 min-h-[172px] flex flex-col transition-colors duration-200 hover:bg-red-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/25"
              style={{
                borderLeft: "4px solid #dc2626",
                boxShadow: "none",
              }}
              onClick={() =>
                setFilterStatus(ENUMS.AVAILABLE_STATUS.MAINTENANCE)
              }
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-slate-700 leading-snug">
                  Maintenance
                </p>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-auto pt-8">
                <p className="text-[2.35rem] font-bold tracking-tight tabular-nums leading-none text-red-600">
                  {
                    assets.filter(
                      (a) =>
                        a.availableStatus ===
                          ENUMS.AVAILABLE_STATUS.MAINTENANCE ||
                        a.availableStatus ===
                          ENUMS.AVAILABLE_STATUS.REPAIR_REQUIRED
                    ).length
                  }
                </p>
                <p className="text-sm text-slate-500 mt-3 leading-relaxed">
                  Needs{" "}
                  <span className="font-semibold text-red-600">attention</span>
                </p>
              </div>
            </button>

            {/* Staff */}
            <div
              className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 min-h-[172px] flex flex-col"
              style={{
                borderLeft: "4px solid var(--org-primary)",
                boxShadow: "none",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-slate-700 leading-snug">
                  Staff
                </p>
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                  style={{
                    background:
                      "color-mix(in srgb, var(--org-primary) 12%, white)",
                    color: "var(--org-primary)",
                  }}
                >
                  <Users className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-auto pt-8">
                <p
                  className="text-[2.35rem] font-bold tracking-tight tabular-nums leading-none"
                  style={{ color: "var(--org-primary-dark)" }}
                >
                  {staffMap.size || 0}
                </p>
                <p className="text-sm text-slate-500 mt-3 leading-relaxed">
                  Linked custodians
                </p>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 relative z-20 shadow-none">
            <div className="flex items-center space-x-3 mb-5">
              <div
                className="p-2 rounded-xl"
                style={{
                  background:
                    "linear-gradient(135deg, var(--org-primary), var(--org-primary-dark))",
                }}
              >
                <Filter className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">
                Filters & Search
              </h2>
            </div>

            <div className={filterGridClasses}>
              <div className="space-y-3">
                <Label className="text-sm font-medium text-slate-700">
                  Search Assets
                </Label>
                <div className="relative group">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-primary-500 transition-colors duration-200" />
                  <Input
                    placeholder="Search by name, tag, or serial..."
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
                  onValueChange={(value) => {
                    setFilterCategory(value);
                    setFilterSubcategory("all");
                  }}
                >
                  <SelectTrigger className="h-11 border-gray-200 focus:border-primary-500 focus:ring-primary-500/20 transition-all duration-200">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent className="z-30">
                    <SelectItem value="all">All Categories</SelectItem>
                    {Object.values(ENUMS.CATEGORY).map((category) => (
                      <SelectItem key={category} value={category}>
                        {formatCategory(category)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {subcategoryFilterOptions.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-sm font-medium text-slate-700">
                    Subcategory
                  </Label>
                  <Select
                    value={filterSubcategory}
                    onValueChange={setFilterSubcategory}
                  >
                    <SelectTrigger className="h-11 border-gray-200 focus:border-primary-500 focus:ring-primary-500/20 transition-all duration-200">
                      <SelectValue placeholder="All Subcategories" />
                    </SelectTrigger>
                    <SelectContent className="z-30">
                      <SelectItem value="all">All Subcategories</SelectItem>
                      {subcategoryFilterOptions.map((sub) => (
                        <SelectItem key={sub.value} value={sub.value}>
                          {sub.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-3">
                <Label className="text-sm font-medium text-slate-700">
                  Status
                </Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-11 border-gray-200 focus:border-primary-500 focus:ring-primary-500/20 transition-all duration-200">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent className="z-30">
                    <SelectItem value="all">All Statuses</SelectItem>
                    {Object.values(ENUMS.AVAILABLE_STATUS).map((status) => (
                      <SelectItem key={status} value={status}>
                        {status.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium text-slate-700">
                  Condition
                </Label>
                <Select
                  value={filterCondition}
                  onValueChange={setFilterCondition}
                >
                  <SelectTrigger className="h-11 border-gray-200 focus:border-primary-500 focus:ring-primary-500/20 transition-all duration-200">
                    <SelectValue placeholder="All Conditions" />
                  </SelectTrigger>
                  <SelectContent className="z-30">
                    <SelectItem value="all">All Conditions</SelectItem>
                    {Object.values(ENUMS.CURRENT_CONDITION).map((condition) => (
                      <SelectItem key={condition} value={condition}>
                        {condition.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isNrepOrg && (
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

          {/* Assets Table */}
          <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden relative z-10 shadow-none">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div
                    className="p-2 rounded-xl"
                    style={{
                      background:
                        "linear-gradient(135deg, var(--org-primary-dark), var(--org-primary))",
                    }}
                  >
                    <FileText className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">
                      Assets
                    </h2>
                    <p className="text-sm text-slate-600">
                      Manage and track all system assets
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge className={`${headerBadgeClass} px-3 py-1`}>
                    {filteredAssets.length}{" "}
                    {filteredAssets.length === 1 ? "Asset" : "Assets"}
                  </Badge>
                  <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-1.5 py-1 shadow-sm">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewModeChange("table")}
                      className={`h-8 px-3 rounded-full flex items-center gap-2 transition-all font-medium ${
                        viewMode === "table"
                          ? "bg-[var(--org-primary)] text-white shadow-sm hover:bg-[var(--org-primary)]/90"
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
                          ? "bg-[var(--org-primary)] text-white shadow-sm hover:bg-[var(--org-primary)]/90"
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
                  <TableRow className="bg-gray-50">
                    <TableHead className="py-4 px-6 text-sm font-semibold text-gray-700">
                      Asset
                    </TableHead>
                    <TableHead className="py-4 px-6 text-sm font-semibold text-gray-700">
                      Category
                    </TableHead>
                    <TableHead className="py-4 px-6 text-sm font-semibold text-gray-700">
                      Status
                    </TableHead>
                    <TableHead className="py-4 px-6 text-sm font-semibold text-gray-700">
                      Condition
                    </TableHead>
                    {isNrepOrg && (
                      <TableHead className="py-4 px-6 text-sm font-semibold text-gray-700">
                        Project
                      </TableHead>
                    )}
                    <TableHead className="py-4 px-6 text-sm font-semibold text-gray-700">
                      Location
                    </TableHead>
                    <TableHead className="py-4 px-6 text-sm font-semibold text-gray-700">
                      Held By
                    </TableHead>
                    <TableHead className="py-4 px-6 text-sm font-semibold text-gray-700 text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssets.length > 0 ? (
                    pagedAssets.map((asset, index) => (
                      <TableRow
                        key={asset.$id}
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
                                {asset.name}
                              </p>
                              {asset.serialNumber && (
                                <p className="text-sm text-slate-500">
                                  S/N: {asset.serialNumber}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-4 px-6">
                          <Badge
                            variant="outline"
                            className={`${categoryBadgeClass} hover:brightness-110 transition-colors duration-200`}
                          >
                            {formatCategory(asset.category)}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-4 px-6">
                          <Badge
                            className={`${getStatusBadgeColor(
                              asset.availableStatus
                            )} shadow-sm`}
                          >
                            {asset.availableStatus.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-4 px-6">
                          <Badge
                            className={`${getConditionBadgeColor(
                              asset.currentCondition
                            )} shadow-sm`}
                          >
                            {asset.currentCondition.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        {isNrepOrg && (
                          <TableCell className="py-4 px-6">
                            <Badge className="bg-[var(--org-highlight)]/15 text-[var(--org-highlight)] border-[var(--org-highlight)]/25">
                              {resolveProjectName(asset)}
                            </Badge>
                          </TableCell>
                        )}
                        <TableCell className="py-4 px-6">
                          <div className="flex items-center space-x-2">
                            <MapPin className={`h-4 w-4 ${locationIconClass}`} />
                            <span className={locationTextClass}>
                              {asset.locationName ||
                                asset.roomOrArea ||
                                "Not specified"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-4 px-6">
                          {getHeldByName(asset) ? (
                            <div className="flex items-center space-x-2">
                              <UserCheck className="h-4 w-4 text-amber-600" />
                              <span className="text-sm font-medium text-slate-700">
                                {getHeldByName(asset)}
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
                              <Link href={`/assets/${asset.$id}?view=admin`}>
                                <Eye className="h-5 w-5 group-hover/btn:scale-110 transition-transform duration-200" />
                              </Link>
                            </Button>
                            <Button
                              asChild
                              variant="highlight"
                              size="sm"
                              className={actionIconClass}
                            >
                              <Link href={`/admin/assets/${asset.$id}/edit`}>
                                <Edit className="h-5 w-5 group-hover/btn:scale-110 transition-transform duration-200" />
                              </Link>
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteAsset(asset)}
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
                      <TableCell colSpan={isNrepOrg ? 8 : 7} className="text-center py-12">
                        <div className="flex flex-col items-center space-y-4">
                          <div className="p-4 bg-gray-100 rounded-full">
                            <Package className="h-8 w-8 text-gray-400" />
                          </div>
                          <div className="space-y-2">
                            <p className="text-lg font-medium text-slate-600">
                              No assets found
                            </p>
                            <p className="text-sm text-slate-400">
                              Try adjusting your search or filters
                            </p>
                          </div>
                          <Button
                            onClick={() => router.push("/admin/assets/new")}
                            className="mt-4 bg-org-gradient text-white shadow-md hover:shadow-lg transition-transform hover:-translate-y-0.5"
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Add First Asset
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
                {filteredAssets.length > 0 ? (
                  <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {pagedAssets.map((asset) => {
                      const updatedAtLabel = asset.$updatedAt
                        ? new Date(asset.$updatedAt).toLocaleDateString()
                        : "–";
                      return (
                        <div
                          key={`${asset.$id}-card`}
                          className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white !shadow-none hover:border-[var(--org-primary)]/35 transition-all duration-200"
                        >
                          <div className="absolute inset-0 bg-gradient-to-br from-[var(--org-primary)]/12 via-[var(--org-highlight)]/8 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                          <div className="relative z-10 p-6 space-y-5">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`p-3 rounded-xl shadow-sm ${iconBackgroundClass}`}
                                >
                                  <Package
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
                                    {asset.name}
                                  </h3>
                                  {asset.serialNumber && (
                                    <p className="text-sm text-slate-500">
                                      S/N: {asset.serialNumber}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <Badge className={`${categoryBadgeClass} px-3 py-1`}>
                                {formatCategory(asset.category)}
                              </Badge>
                            </div>

                            <div className="flex items-center gap-4">
                              <div className="w-14 h-14 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center">
                                <Image className="w-6 h-6 text-gray-400" aria-hidden="true" />
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Badge
                                  className={`${getStatusBadgeColor(
                                    asset.availableStatus
                                  )} shadow-sm`}
                                >
                                  {asset.availableStatus.replace(/_/g, " ")}
                                </Badge>
                                <Badge
                                  className={`${getConditionBadgeColor(
                                    asset.currentCondition
                                  )} shadow-sm`}
                                >
                                  {asset.currentCondition.replace(/_/g, " ")}
                                </Badge>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-600 mb-3">
                              <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-red-600" />
                                <span>
                                  {asset.locationName ||
                                    asset.roomOrArea ||
                                    "Not specified"}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-gray-400" />
                                <span>
                                  Updated{" "}
                                  <span className="font-medium text-gray-800">
                                    {asset.$updatedAt
                                      ? new Date(
                                          asset.$updatedAt
                                        ).toLocaleDateString()
                                      : "–"}
                                  </span>
                                </span>
                              </div>
                            </div>

                            {isNrepOrg && (
                              <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                                <Badge className="bg-[var(--org-highlight)]/15 text-[var(--org-highlight)] border-[var(--org-highlight)]/25">
                                  Project
                                </Badge>
                                <span>{resolveProjectName(asset)}</span>
                              </div>
                            )}

                            <div className="flex items-center justify-between">
                              <div className="text-xs uppercase tracking-wide text-slate-400">
                                Asset ID: {asset.assetTag || "—"}
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  asChild
                                  variant="default"
                                  size="sm"
                                  className={actionIconClassLg}
                                >
                                  <Link href={`/assets/${asset.$id}?view=admin`}>
                                    <Eye className="h-5 w-5 group-hover/btn:scale-110 transition-transform duration-200" />
                                  </Link>
                                </Button>
                                <Button
                                  asChild
                                  variant="highlight"
                                  size="sm"
                                  className={actionIconClassLg}
                                >
                                  <Link href={`/admin/assets/${asset.$id}/edit`}>
                                    <Edit className="h-5 w-5 group-hover/btn:scale-110 transition-transform duration-200" />
                                  </Link>
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleDeleteAsset(asset)}
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
                    No assets found. Try adjusting your filters.
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
                itemLabel="assets"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Custom Delete Confirmation Dialog */}
      {showDeleteDialog && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={cancelDeleteAsset}
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
                  Delete Asset
                </h3>
                <p className="text-gray-600">
                  Are you sure you want to delete this asset? This action cannot
                  be undone.
                </p>

                {/* Asset Details */}
                {assetToDelete && (
                  <div className="bg-gray-50 rounded-lg p-4 mt-4">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-gradient-to-br from-primary-100 to-primary-200 rounded-lg">
                        <Package className="h-5 w-5 text-primary-600" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-gray-900">
                          {assetToDelete.name}
                        </p>
                        {assetToDelete.serialNumber && (
                          <p className="text-sm text-gray-500">
                            S/N: {assetToDelete.serialNumber}
                          </p>
                        )}
                        <p className="text-sm text-gray-500">
                          {formatCategory(assetToDelete.category)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center space-x-3 w-full pt-4">
                  <Button
                    onClick={cancelDeleteAsset}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white border-0 shadow-md hover:shadow-lg transition-all duration-200"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={confirmDeleteAsset}
                    variant="destructive"
                    className="flex-1 shadow-md hover:shadow-lg transition-all duration-200"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Asset
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
