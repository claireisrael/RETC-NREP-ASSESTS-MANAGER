"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Textarea } from "../../../../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../components/ui/select";
import {
  ArrowLeft,
  Package,
  Save,
  Info,
  MapPin,
  BarChart3,
  Eye,
} from "lucide-react";
import { getCurrentStaff, permissions } from "../../../../lib/utils/auth.js";
import { assetsService, projectsService } from "../../../../lib/appwrite/provider.js";
import { useToastContext } from "../../../../components/providers/toast-provider";
import { ENUMS } from "../../../../lib/appwrite/config.js";
import { formatCategory } from "../../../../lib/utils/mappings.js";
import { useOrgTheme } from "../../../../components/providers/org-theme-provider";
import { getConsumableCategoriesForOrg } from "../../../../lib/constants/consumable-categories.js";
import { getCurrentOrgId } from "../../../../lib/utils/org.js";
import { AccessoriesEditor } from "../../../../components/assets/accessories-editor";
import { L2AvailabilityPicker } from "../../../../components/assets/l2-availability-picker";
import { Checkbox } from "../../../../components/ui/checkbox";

export default function NewConsumablePage() {
  const router = useRouter();
  const toast = useToastContext();
  const { orgCode, theme } = useOrgTheme();
  const normalizedOrgCode = (orgCode || theme?.code || "").toUpperCase();
  const isNrepOrg = normalizedOrgCode === "NREP";
  const ADMIN_PLACEHOLDER_PROJECT_ID = "ADMIN";
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
    if (!isNrepOrg) return "";
    return theme?.projects?.defaultId || "";
  }, [isNrepOrg, theme?.projects?.defaultId]);
  const [currentStaff, setCurrentStaff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState([]);

  // Manual ID assignment state
  const [manualIdAssignment, setManualIdAssignment] = useState(false);

  // Consumable form state
  const [consumable, setConsumable] = useState({
    assetTag: "",
    name: "",
    consumableCategory: ENUMS.CONSUMABLE_CATEGORY.FLIERS,
    currentStock: 0,
    minStock: 0,
    maxStock: 0,
    unit: ENUMS.CONSUMABLE_UNIT.PIECE,
    locationName: "",
    roomOrArea: "",
    isPublic: false,
    publicSummary: "",
    accessories: [],
    canBeReturnable: false,
    assignedAvailabilityL2StaffId: "",
    availabilityNote: "",
    consumableScope: isNrepOrg
      ? ENUMS.CONSUMABLE_SCOPE.PROJECT
      : ENUMS.CONSUMABLE_SCOPE.ADMIN,
    projectId: "",
  });

  useEffect(() => {
    checkPermissions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep projectId in sync with available projects but DO NOT auto-select a project.
  // This forces the user to explicitly choose a project for project-scope consumables.
  useEffect(() => {
    if (!isNrepOrg) {
      // Non-NREP orgs don't use projects
      setConsumable((prev) => ({ ...prev, projectId: "" }));
      return;
    }

    setConsumable((prev) => {
      if (!prev.projectId) {
        // No project selected yet – leave it empty
        return prev;
      }

      const stillExists = projects.some((p) => p.$id === prev.projectId);
      if (stillExists) return prev;

      // Previously selected project no longer exists – clear selection
      return { ...prev, projectId: "" };
    });
  }, [defaultProjectId, isNrepOrg, projects]);

  const formCategoryOptions = useMemo(() => {
    if (!isNrepOrg) {
      return Object.values(ENUMS.CONSUMABLE_CATEGORY);
    }
    return getConsumableCategoriesForOrg(orgCode, consumable.consumableScope);
  }, [isNrepOrg, orgCode, consumable.consumableScope]);

  useEffect(() => {
    if (!isNrepOrg) return;
    const categories = formCategoryOptions;
    setConsumable((prev) => {
      let nextCategory = prev.consumableCategory;
      let nextProjectId = prev.projectId;

      if (
        Array.isArray(categories) &&
        categories.length > 0 &&
        !categories.includes(prev.consumableCategory)
      ) {
        nextCategory = categories[0];
      }

      if (prev.consumableScope === ENUMS.CONSUMABLE_SCOPE.PROJECT) {
        // For project-scope consumables, require explicit selection – do not auto-fill
        nextProjectId = prev.projectId || "";
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
    formCategoryOptions,
    defaultProjectId,
    projects,
    consumable.consumableScope,
  ]);

  const checkPermissions = async () => {
    try {
      const staff = await getCurrentStaff();
      setCurrentStaff(staff);

      if (!staff || !permissions.canManageConsumables(staff)) {
        router.push("/unauthorized");
        return;
      }

      if (isNrepOrg) {
        await loadProjects();
      }
    } catch (error) {
      console.error("Failed to check permissions:", error);
      router.push("/login");
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async () => {
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
      setConsumable((prev) => ({
        ...prev,
        projectId:
          prev.projectId || defaultProjectId || docs[0]?.$id || "",
      }));
    } catch (error) {
      console.error("Failed to load projects", error);
      setProjects([]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const isProjectScope =
        isNrepOrg &&
        consumable.consumableScope === ENUMS.CONSUMABLE_SCOPE.PROJECT;
      if (isProjectScope && !consumable.projectId) {
        toast.error("Please select a project for this consumable.");
        setSaving(false);
        return;
      }
      if (!consumable.assignedAvailabilityL2StaffId) {
        toast.error("Please select an L2 superadmin to confirm availability.");
        setSaving(false);
        return;
      }

      const isAdminScope =
        !isNrepOrg ||
        consumable.consumableScope === ENUMS.CONSUMABLE_SCOPE.ADMIN;

      const consumableData = {
        assetTag:
          manualIdAssignment && consumable.assetTag
            ? consumable.assetTag
            : `CONS-${Date.now()}`,
        name: consumable.name,
        category: ENUMS.CATEGORY.CONSUMABLE,
        subcategory: consumable.consumableCategory,
        itemType: ENUMS.ITEM_TYPE.CONSUMABLE,

        // Stock information - use new proper database fields
        currentStock: consumable.currentStock || 0,
        minimumStock: consumable.minStock || 0,
        unit: consumable.unit,

        // Legacy fields - keep empty for backward compatibility
        serialNumber: "",
        model: "",
        manufacturer: "",

        // Location information
        locationName: consumable.locationName || "",
        roomOrArea: consumable.roomOrArea || "",

        // Accessories (optional)
        accessories: Array.isArray(consumable.accessories)
          ? consumable.accessories.map((a) => a.trim()).filter(Boolean)
          : [],

        canBeReturnable: isAdminScope
          ? false
          : Boolean(consumable.canBeReturnable),
        availabilityConfirmStatus: ENUMS.AVAILABILITY_CONFIRM_STATUS.PENDING,
        assignedAvailabilityL2StaffId:
          consumable.assignedAvailabilityL2StaffId,
        availabilityNote: consumable.availabilityNote || "",

        // Public information
        isPublic: consumable.isPublic || false,
        publicSummary: consumable.publicSummary || "",
        publicImages: JSON.stringify([]),
        publicLocationLabel: "",
        publicConditionLabel: ENUMS.PUBLIC_CONDITION_LABEL.NEW,
        assetImage:
          "https://via.placeholder.com/400x300.png?text=Consumable",

        // Required fields for ASSETS collection
        departmentId: "",
        custodianStaffId: "",
        availableStatus: ENUMS.AVAILABLE_STATUS.PENDING_AVAILABILITY,
        currentCondition: ENUMS.CURRENT_CONDITION.NEW,
        purchaseDate: null,
        warrantyExpiryDate: null,
        lastMaintenanceDate: null,
        nextMaintenanceDue: null,
        lastInventoryCheck: null,
        retirementDate: null,
        disposalDate: null,
        attachmentFileIds: [],
        projectId: isNrepOrg
          ? isProjectScope
            ? consumable.projectId // must be explicitly selected for project scope
            : ADMIN_PLACEHOLDER_PROJECT_ID
          : null,
      };

      // Explicitly ensure orgId is included - try multiple sources in order of reliability
      let currentOrgId = 
        currentStaff?.orgId ||           // First: staff record (most reliable)
        theme?.appwriteOrgId;            // Second: theme from useOrgTheme (available immediately)
      
      // Third: Try API endpoint (works in production - server-side reads env vars at runtime)
      if (!currentOrgId || currentOrgId.trim() === "") {
        const { getCurrentOrgIdAsync } = await import("../../../../lib/utils/org.js");
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
        throw new Error("Unable to determine organization. Please refresh the page and try again.");
      }
      consumableData.orgId = currentOrgId.trim();

      const created = await assetsService.create(consumableData, currentStaff.$id);

      try {
        const { notifyAvailabilityPending } = await import(
          "../../../../lib/services/return-availability-notifications.js"
        );
        await notifyAvailabilityPending({
          item: created,
          assignedL2StaffId: consumableData.assignedAvailabilityL2StaffId,
          createdBy: currentStaff,
          orgId: consumableData.orgId,
        });
      } catch (notifyErr) {
        console.warn("Availability pending notify failed:", notifyErr);
      }

      toast.success("Consumable created successfully!");

      // Redirect to consumables list
      setTimeout(() => {
        router.push("/admin/consumables");
      }, 500);
    } catch (error) {
      console.error("Failed to create consumable:", error);
      toast.error("Failed to create consumable. Please try again.");
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-slate-200 border-t-orange-600 rounded-full animate-spin"></div>
        </div>
        <p className="mt-4 text-slate-600 font-medium">Loading...</p>
      </div>
    );
  }

  if (!currentStaff) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Clean Header */}
        <div className="space-y-6">
          <Button
            asChild
            variant="ghost"
            className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 -ml-2"
          >
            <Link href="/admin/consumables">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Consumables
            </Link>
          </Button>

          <div className="space-y-2">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-orange-600 rounded-xl flex items-center justify-center">
                <Package className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">
                  Add New Consumable
                </h1>
                <p className="text-slate-600 mt-1">
                  Create a new consumable item for inventory management
                </p>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-white">
              <div className="flex items-center space-x-2">
                <Info className="w-5 h-5 text-orange-600" />
                <CardTitle className="text-lg font-semibold text-slate-900">
                  Basic Information
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6 bg-white">
              {isNrepOrg && (
                <div className="flex items-center gap-2 bg-white/80 border border-gray-200/70 rounded-full px-1.5 py-1 shadow-sm w-fit">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setConsumable((prev) => ({
                        ...prev,
                        consumableScope: ENUMS.CONSUMABLE_SCOPE.PROJECT,
                      }))
                    }
                    className={`h-8 px-3 rounded-full flex items-center gap-2 transition-all ${
                      consumable.consumableScope ===
                      ENUMS.CONSUMABLE_SCOPE.PROJECT
                        ? "bg-org-gradient text-white shadow-md hover:bg-org-gradient"
                        : "text-slate-600 hover:text-[var(--org-primary)]"
                    }`}
                  >
                    Project
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setConsumable((prev) => ({
                        ...prev,
                        consumableScope: ENUMS.CONSUMABLE_SCOPE.ADMIN,
                      }))
                    }
                    className={`h-8 px-3 rounded-full flex items-center gap-2 transition-all ${
                      consumable.consumableScope ===
                      ENUMS.CONSUMABLE_SCOPE.ADMIN
                        ? "bg-org-gradient text-white shadow-md hover:bg-org-gradient"
                        : "text-slate-600 hover:text-[var(--org-primary)]"
                    }`}
                  >
                    Administrative
                  </Button>
                </div>
              )}

              {/* Manual ID Assignment */}
              <div className="space-y-4">
                <div className="flex items-center space-x-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <input
                    type="checkbox"
                    id="manualIdAssignment"
                    checked={manualIdAssignment}
                    onChange={(e) => {
                      setManualIdAssignment(e.target.checked);
                      if (!e.target.checked) {
                        setConsumable({ ...consumable, assetTag: "" });
                      }
                    }}
                    className="w-4 h-4 text-orange-600 rounded focus:ring-2 focus:ring-orange-500"
                  />
                  <Label
                    htmlFor="manualIdAssignment"
                    className="text-sm font-medium text-slate-700 cursor-pointer"
                  >
                    Manually assign consumable ID
                  </Label>
                </div>

                {manualIdAssignment && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                    <Label htmlFor="assetTag" className="text-sm font-medium text-slate-700">
                      Consumable ID <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="assetTag"
                      value={consumable.assetTag}
                      onChange={(e) =>
                        setConsumable({ ...consumable, assetTag: e.target.value })
                      }
                      placeholder="e.g., CONS-PAPER-001"
                      className="h-11 border-slate-300 focus:border-orange-500 focus:ring-orange-500"
                      required={manualIdAssignment}
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium text-slate-700">
                    Consumable Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="name"
                    value={consumable.name}
                    onChange={(e) =>
                      setConsumable({ ...consumable, name: e.target.value })
                    }
                    placeholder="e.g., A4 Paper, Office Pens"
                    className="h-11 border-slate-300 focus:border-orange-500 focus:ring-orange-500"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="consumableCategory" className="text-sm font-medium text-slate-700">
                    Category <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={consumable.consumableCategory}
                    onValueChange={(value) =>
                      setConsumable({ ...consumable, consumableCategory: value })
                    }
                  >
                    <SelectTrigger className="h-11 border-slate-300 focus:border-orange-500 focus:ring-orange-500">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {formCategoryOptions.map((category, index) => (
                        <SelectItem key={`${category}-${index}`} value={category}>
                          {formatCategory(category)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {isNrepOrg &&
                  consumable.consumableScope ===
                    ENUMS.CONSUMABLE_SCOPE.PROJECT && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-slate-700">
                        Project <span className="text-red-500">*</span>
                      </Label>
                      <Select
                        value={consumable.projectId}
                        onValueChange={(value) =>
                          setConsumable({ ...consumable, projectId: value })
                        }
                      >
                        <SelectTrigger className="h-11 border-slate-300 focus:border-orange-500 focus:ring-orange-500">
                          <SelectValue placeholder="Select project" />
                        </SelectTrigger>
                        <SelectContent>
                          {projects.map((project) => (
                            <SelectItem key={project.$id} value={project.$id}>
                              {project.name || project.title || project.code || project.$id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                <div className="space-y-2">
                  <Label htmlFor="unit" className="text-sm font-medium text-slate-700">
                    Unit <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={consumable.unit}
                    onValueChange={(value) =>
                      setConsumable({ ...consumable, unit: value })
                    }
                  >
                    <SelectTrigger className="h-11 border-slate-300 focus:border-orange-500 focus:ring-orange-500">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(ENUMS.CONSUMABLE_UNIT).map((unit) => (
                        <SelectItem key={unit} value={unit}>
                          {formatCategory(unit)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stock Management */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-white">
              <div className="flex items-center space-x-2">
                <BarChart3 className="w-5 h-5 text-orange-600" />
                <CardTitle className="text-lg font-semibold text-slate-900">
                  Stock Management
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6 bg-white">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="currentStock" className="text-sm font-medium text-slate-700">
                    Current Stock
                  </Label>
                  <Input
                    id="currentStock"
                    type="number"
                    min="0"
                    value={consumable.currentStock}
                    onChange={(e) =>
                      setConsumable({
                        ...consumable,
                        currentStock: parseInt(e.target.value) || 0,
                      })
                    }
                    placeholder="0"
                    className="h-11 border-slate-300 focus:border-orange-500 focus:ring-orange-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="minStock" className="text-sm font-medium text-slate-700">
                    Minimum Stock
                  </Label>
                  <Input
                    id="minStock"
                    type="number"
                    min="0"
                    value={consumable.minStock}
                    onChange={(e) =>
                      setConsumable({
                        ...consumable,
                        minStock: parseInt(e.target.value) || 0,
                      })
                    }
                    placeholder="0"
                    className="h-11 border-slate-300 focus:border-orange-500 focus:ring-orange-500"
                  />
                  <p className="text-xs text-slate-500">Reorder threshold</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxStock" className="text-sm font-medium text-slate-700">
                    Maximum Stock
                  </Label>
                  <Input
                    id="maxStock"
                    type="number"
                    min="0"
                    value={consumable.maxStock}
                    onChange={(e) =>
                      setConsumable({
                        ...consumable,
                        maxStock: parseInt(e.target.value) || 0,
                      })
                    }
                    placeholder="0"
                    className="h-11 border-slate-300 focus:border-orange-500 focus:ring-orange-500"
                  />
                  <p className="text-xs text-slate-500">Maximum capacity</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Location Information */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-white">
              <div className="flex items-center space-x-2">
                <MapPin className="w-5 h-5 text-red-600" />
                <CardTitle className="text-lg font-semibold text-slate-900">
                  Location Information
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6 bg-white">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="locationName" className="text-sm font-medium text-slate-700">
                    Location Name
                  </Label>
                  <Input
                    id="locationName"
                    value={consumable.locationName}
                    onChange={(e) =>
                      setConsumable({
                        ...consumable,
                        locationName: e.target.value,
                      })
                    }
                    placeholder="e.g., Storage Room A, Main Warehouse"
                    className="h-11 border-slate-300 focus:border-orange-500 focus:ring-orange-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="roomOrArea" className="text-sm font-medium text-slate-700">
                    Room/Area
                  </Label>
                  <Input
                    id="roomOrArea"
                    value={consumable.roomOrArea}
                    onChange={(e) =>
                      setConsumable({ ...consumable, roomOrArea: e.target.value })
                    }
                    placeholder="e.g., Shelf 1, Cabinet B"
                    className="h-11 border-slate-300 focus:border-orange-500 focus:ring-orange-500"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Accessories */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-white">
              <div className="flex items-center space-x-2">
                <Package className="w-5 h-5 text-orange-600" />
                <CardTitle className="text-lg font-semibold text-slate-900">
                  Accessories
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 bg-white">
              <AccessoriesEditor
                value={consumable.accessories}
                onChange={(next) =>
                  setConsumable((prev) => ({ ...prev, accessories: next }))
                }
                disabled={saving}
                itemLabel="consumable"
              />
              {isNrepOrg &&
                consumable.consumableScope ===
                  ENUMS.CONSUMABLE_SCOPE.PROJECT && (
                  <div className="mt-6 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <Checkbox
                      id="canBeReturnable"
                      checked={Boolean(consumable.canBeReturnable)}
                      onCheckedChange={(checked) =>
                        setConsumable((prev) => ({
                          ...prev,
                          canBeReturnable: !!checked,
                        }))
                      }
                      disabled={saving}
                    />
                    <div>
                      <Label
                        htmlFor="canBeReturnable"
                        className="cursor-pointer text-sm font-medium text-slate-800"
                      >
                        Can be returnable
                      </Label>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        When enabled, requesters can choose to borrow this item
                        with a return date. Administrative consumables never
                        use return dates.
                      </p>
                    </div>
                  </div>
                )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-white">
              <CardTitle className="text-lg font-semibold text-slate-900">
                Availability confirmation
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 bg-white">
              <L2AvailabilityPicker
                value={consumable.assignedAvailabilityL2StaffId}
                onChange={(v) =>
                  setConsumable((prev) => ({
                    ...prev,
                    assignedAvailabilityL2StaffId: v,
                  }))
                }
                note={consumable.availabilityNote}
                onNoteChange={(v) =>
                  setConsumable((prev) => ({
                    ...prev,
                    availabilityNote: v,
                  }))
                }
                disabled={saving}
              />
            </CardContent>
          </Card>

          {/* Public Visibility */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100 bg-white">
              <div className="flex items-center space-x-2">
                <Eye className="w-5 h-5 text-orange-600" />
                <CardTitle className="text-lg font-semibold text-slate-900">
                  Public Visibility
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6 bg-white">
              <div className="flex items-center space-x-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <input
                  type="checkbox"
                  id="isPublic"
                  checked={consumable.isPublic}
                  onChange={(e) =>
                    setConsumable({ ...consumable, isPublic: e.target.checked })
                  }
                  className="w-4 h-4 text-orange-600 rounded focus:ring-2 focus:ring-orange-500"
                />
                <Label htmlFor="isPublic" className="text-sm font-medium text-slate-700 cursor-pointer">
                  Make this consumable visible in guest portal
                </Label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="publicSummary" className="text-sm font-medium text-slate-700">
                  Public Summary
                </Label>
                <Textarea
                  id="publicSummary"
                  value={consumable.publicSummary}
                  onChange={(e) =>
                    setConsumable({
                      ...consumable,
                      publicSummary: e.target.value,
                    })
                  }
                  placeholder="Brief description visible to guests"
                  rows={3}
                  className="border-slate-300 focus:border-orange-500 focus:ring-orange-500 resize-none"
                />
              </div>
            </CardContent>
          </Card>

          {/* Form Actions */}
          <div className="flex items-center justify-end space-x-3 pt-6 pb-8">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/admin/consumables")}
              disabled={saving}
              className="h-11 px-6 border-slate-300 hover:bg-slate-50"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                saving ||
                !consumable.name ||
                (manualIdAssignment && !consumable.assetTag) ||
                (isNrepOrg &&
                  consumable.consumableScope ===
                    ENUMS.CONSUMABLE_SCOPE.PROJECT &&
                  !consumable.projectId) ||
                !consumable.assignedAvailabilityL2StaffId
              }
              className="h-11 px-6 bg-orange-600 hover:bg-orange-700 text-white"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Creating Consumable...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Create Consumable
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
