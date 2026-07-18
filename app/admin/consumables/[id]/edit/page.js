"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../../../components/ui/card";
import { Button } from "../../../../../components/ui/button";
import { Input } from "../../../../../components/ui/input";
import { Label } from "../../../../../components/ui/label";
import { Textarea } from "../../../../../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../../components/ui/select";
import { Badge } from "../../../../../components/ui/badge";
import {
  ArrowLeft,
  Save,
  Trash2,
  Eye,
  History,
  Package,
  CheckCircle,
  X,
} from "lucide-react";
import {
  assetsService,
  assetEventsService,
  projectsService,
} from "../../../../../lib/appwrite/provider.js";
import { getCurrentStaff, permissions } from "../../../../../lib/utils/auth.js";
import { useToastContext } from "../../../../../components/providers/toast-provider";
// Removed useConfirmation import - using custom dialog instead
import { ENUMS } from "../../../../../lib/appwrite/config.js";
import {
  formatCategory,
  getStatusBadgeColor,
  getConditionBadgeColor,
  getConsumableStatusEnum,
  getCurrentStock,
  getMinStock,
  getMaxStock,
  getConsumableUnit,
  getConsumableCategory,
} from "../../../../../lib/utils/mappings.js";
import { useOrgTheme } from "../../../../../components/providers/org-theme-provider";
import { AccessoriesEditor } from "../../../../../components/assets/accessories-editor";

export default function EditConsumable() {
  const params = useParams();
  const router = useRouter();
  const toast = useToastContext();
  const { orgCode, theme } = useOrgTheme();
  const normalizedOrgCode = (orgCode || theme?.code || "").toUpperCase();
  const isNrepOrg = normalizedOrgCode === "NREP";
  const primaryGradient = isNrepOrg
    ? "from-[var(--org-primary)] to-[var(--org-accent)]"
    : "from-primary-500 to-primary-600";
  const secondaryGradient = isNrepOrg
    ? "from-[var(--org-primary-dark)] to-[var(--org-accent)]"
    : "from-sidebar-500 to-sidebar-600";
  const mutedSurface = isNrepOrg
    ? "bg-white/95 border border-[var(--org-primary)]/10"
    : "bg-white border border-white/20";
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
  // Custom delete dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [staff, setStaff] = useState(null);
  const [consumable, setConsumable] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [originalConsumable, setOriginalConsumable] = useState(null);
  const [consumableId, setConsumableId] = useState(null);
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    if (!isNrepOrg || !consumable) return;
    if (!consumable.projectId && (defaultProjectId || projects[0]?.$id)) {
      setConsumable((prev) => ({
        ...prev,
        projectId: defaultProjectId || projects[0]?.$id || "",
      }));
    }
  }, [isNrepOrg, consumable, defaultProjectId, projects]);

  // Stock functions are imported from mappings.js

  // Use utility function for status - returns enum value
  const getStatus = (consumable) => {
    return getConsumableStatusEnum(consumable) || ENUMS.CONSUMABLE_STATUS.IN_STOCK;
  };

  // Unit and category functions are imported from mappings.js

  useEffect(() => {
    // For Next.js 15, params is already unwrapped in the component
    if (params?.id) {
      setConsumableId(params.id);
      checkPermissionsAndLoadConsumable(params.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    if (isNrepOrg) {
      loadProjects();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNrepOrg, allowedProjectIds]);

  const checkPermissionsAndLoadConsumable = async (id) => {
    try {
      const currentStaff = await getCurrentStaff();
      if (!currentStaff || !permissions.canManageConsumables(currentStaff)) {
        window.location.href = "/unauthorized";
        return;
      }
      setStaff(currentStaff);
      await loadConsumable(id);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadConsumable = async (id) => {
    try {
      const consumableData = await assetsService.get(id);
      if (!consumableData) {
        router.push("/admin/consumables");
        return;
      }

      // Process the consumable data to extract mapped fields
      const processedConsumable = {
        ...consumableData,
        // Extract stock data from mapped fields
        currentStock: getCurrentStock(consumableData),
        minStock: getMinStock(consumableData),
        maxStock: getMaxStock(consumableData),
        status: getStatus(consumableData),
        unit: getConsumableUnit(consumableData),
        consumableCategory: getConsumableCategory(consumableData),
        accessories: Array.isArray(consumableData.accessories)
          ? consumableData.accessories
          : [],
        // Parse publicImages if it's a string
        publicImages: typeof consumableData.publicImages === 'string'
          ? JSON.parse(consumableData.publicImages || '[]')
          : (consumableData.publicImages || []),
        projectId: consumableData.projectId || "",
      };

      setConsumable(processedConsumable);
      setOriginalConsumable(JSON.parse(JSON.stringify(processedConsumable))); // Deep clone
    } catch (error) {
      console.error("Failed to load consumable:", error);
      router.push("/admin/consumables");
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
    } catch (error) {
      console.error("Failed to load projects", error);
      setProjects([]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isNrepOrg && !consumable.projectId) {
        toast.error("Please select a project before saving.");
        setSaving(false);
        return;
      }

      // Only include changed fields
      const changedFields = {};

      // Check basic fields
      if (consumable.name !== originalConsumable.name) {
        changedFields.name = consumable.name;
      }

      if (consumable.consumableCategory !== originalConsumable.consumableCategory) {
        changedFields.subcategory = consumable.consumableCategory;
      }

      // Check stock fields
      if (consumable.currentStock !== originalConsumable.currentStock) {
        changedFields.currentStock = consumable.currentStock || 0;
      }

      if (consumable.minStock !== originalConsumable.minStock) {
        changedFields.minimumStock = consumable.minStock || 0;
      }

      if (consumable.maxStock !== originalConsumable.maxStock) {
        changedFields.maximumStock = consumable.maxStock || 0;
      }

      if (consumable.unit !== originalConsumable.unit) {
        changedFields.unit = consumable.unit;
      }

      // Check status field
      if (consumable.status !== originalConsumable.status) {
        changedFields.status = consumable.status;
      }

      // Check location fields
      if (consumable.locationName !== originalConsumable.locationName) {
        changedFields.locationName = consumable.locationName || "";
      }

      if (consumable.roomOrArea !== originalConsumable.roomOrArea) {
        changedFields.roomOrArea = consumable.roomOrArea || "";
      }

      if (isNrepOrg && consumable.projectId !== originalConsumable.projectId) {
        changedFields.projectId = consumable.projectId || "";
      }

      // Check public fields
      if (consumable.isPublic !== originalConsumable.isPublic) {
        changedFields.isPublic = consumable.isPublic || false;
      }

      if (consumable.publicSummary !== originalConsumable.publicSummary) {
        changedFields.publicSummary = consumable.publicSummary || "";
      }

      // Accessories (array) - compare cleaned values
      const cleanedAccessories = Array.isArray(consumable.accessories)
        ? consumable.accessories.map((a) => a.trim()).filter(Boolean)
        : [];
      const originalAccessories = Array.isArray(originalConsumable.accessories)
        ? originalConsumable.accessories
        : [];
      if (
        JSON.stringify(cleanedAccessories) !==
        JSON.stringify(originalAccessories)
      ) {
        changedFields.accessories = cleanedAccessories;
      }

      // If no changes, show message and return
      if (Object.keys(changedFields).length === 0) {
        toast.info("No changes to save");
        setSaving(false);
        return;
      }

      // Update the consumable with only changed fields
      await assetsService.update(
        consumableId,
        changedFields,
        staff.$id,
        "Consumable updated"
      );

      // Log changes as asset events
      for (const [field, value] of Object.entries(changedFields)) {
        try {
          const fromValue = String(originalConsumable[field] || "").substring(0, 100);
          const toValue = String(value || "").substring(0, 100);

          await assetEventsService.create({
            assetId: consumableId,
            eventType: ENUMS.EVENT_TYPE.STATUS_CHANGED,
            fromValue: fromValue,
            toValue: toValue,
            actorStaffId: staff.$id,
            at: new Date().toISOString(),
            notes: `Updated ${field}`,
          });
        } catch (eventError) {
          console.error("Failed to log asset event:", eventError);
        }
      }

      // Show success message and redirect to details page
      toast.success("Consumable updated successfully!");

      // Redirect to consumable details page
      setTimeout(() => {
        router.push(`/admin/consumables/${consumableId}`);
      }, 500); // Small delay to allow toast to be seen
    } catch (error) {
      console.error("Failed to update consumable:", error);
      console.error("Error details:", {
        message: error.message,
        code: error.code,
        type: error.type,
        response: error.response,
      });
      toast.error(
        `Failed to update consumable: ${error.message || "Please try again."}`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    setShowDeleteDialog(true);
  };

  const confirmDeleteConsumable = async () => {
    try {
      await assetsService.delete(consumableId);
      toast.success("Consumable deleted successfully!");
      router.push("/admin/consumables");
    } catch (error) {
      toast.error("Failed to delete consumable. Please try again.");
    } finally {
      setShowDeleteDialog(false);
    }
  };

  const cancelDeleteConsumable = () => {
    setShowDeleteDialog(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!consumable) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900">
            Consumable not found
          </h2>
          <p className="text-gray-600">
            The consumable you're looking for doesn't exist.
          </p>
          <Button asChild className="mt-4">
            <Link href="/admin/consumables">Back to Consumables</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-primary-50/30">
      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Enhanced Header */}
        <div className="bg-white rounded-2xl shadow-xl border border-white/20 backdrop-blur-sm p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-4 sm:gap-6">
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="w-full sm:w-auto justify-center bg-[var(--org-muted)] text-[var(--org-primary)] border border-[var(--org-primary)]/20 hover:bg-[var(--org-muted)]/80 transition-colors duration-200"
              >
                <Link href="/admin/consumables">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Consumables
                </Link>
              </Button>
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg bg-gradient-to-br from-[var(--org-primary)] to-[var(--org-accent)]">
                  <Package className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-gray-900 via-[var(--org-primary)] to-[var(--org-accent)] bg-clip-text text-transparent">
                    Edit Consumable
                  </h1>
                  <p className="text-gray-600 font-medium break-words max-w-xs sm:max-w-none">
                    {consumable.name}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 w-full lg:w-auto">
              <Button
                asChild
                variant="outline"
                className="w-full sm:w-auto justify-center border-[var(--org-primary)]/30 text-[var(--org-primary)] hover:bg-[var(--org-primary)]/10 transition-all duration-200"
              >
                <Link href={`/admin/consumables/${consumable.$id}`}>
                  <Eye className="w-4 h-4 mr-2" />
                  View Details
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="w-full sm:w-auto justify-center border-gray-200 text-gray-600 hover:bg-gray-100 transition-all duration-200"
              >
                <Link href={`/admin/consumables/${consumable.$id}/history`}>
                  <History className="w-4 h-4 mr-2" />
                  History
                </Link>
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="w-full sm:w-auto justify-center bg-org-gradient hover:from-[var(--org-primary-dark)] hover:to-[var(--org-primary)] text-white font-semibold px-6 py-2 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? "Saving..." : "Save Changes"}
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                className="w-full sm:w-auto justify-center bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white font-semibold px-6 py-2 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>
        </div>

        {/* Enhanced Current Status */}
        <div className="bg-white rounded-2xl shadow-xl border border-white/20 backdrop-blur-sm overflow-hidden">
          <div className={`bg-gradient-to-r ${primaryGradient} p-6`}>
            <h2 className="text-2xl font-bold text-white flex items-center">
              <CheckCircle className="w-6 h-6 mr-3" />
              Current Status
            </h2>
            <p className="text-white/80 mt-1">
              Overview of consumable details
            </p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className={`rounded-xl p-4 ${mutedSurface}`}>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-semibold text-gray-800">
                    Status
                  </Label>
                  <div className="w-2 h-2 bg-primary-500 rounded-full animate-pulse"></div>
                </div>
                <Badge
                  className={`text-sm font-semibold px-3 py-1 border ${
                    consumable.status === ENUMS.CONSUMABLE_STATUS.IN_STOCK
                      ? "bg-[var(--org-primary)]/10 text-[var(--org-primary)] border-[var(--org-primary)]/30"
                      : consumable.status === ENUMS.CONSUMABLE_STATUS.LOW_STOCK
                      ? "bg-amber-100 text-amber-700 border-amber-200"
                      : "bg-rose-100 text-rose-700 border-rose-200"
                  }`}
                >
                  {consumable.status.replace(/_/g, " ")}
                </Badge>
              </div>

              <div className={`rounded-xl p-4 ${mutedSurface}`}>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-semibold text-gray-800">
                    Category
                  </Label>
                  <Package className="w-4 h-4 text-[var(--org-primary)]" />
                </div>
                <Badge className="text-sm font-semibold px-3 py-1 bg-[var(--org-primary)]/12 text-[var(--org-primary)] border border-[var(--org-primary)]/25">
                  {formatCategory(consumable.consumableCategory)}
                </Badge>
              </div>

              <div className={`rounded-xl p-4 ${mutedSurface}`}>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-semibold text-gray-800">
                    Unit
                  </Label>
                  <div className="w-4 h-4 bg-gray-500 rounded"></div>
                </div>
                <Badge className="bg-slate-100 text-slate-800 border border-slate-200 text-sm font-semibold px-3 py-1">
                  {formatCategory(consumable.unit)}
                </Badge>
              </div>

              <div className={`rounded-xl p-4 ${mutedSurface}`}>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-semibold text-gray-800">
                    Current Stock
                  </Label>
                  <div className="w-4 h-4 bg-primary-500 rounded-full"></div>
                </div>
                <div className="text-2xl font-bold text-[var(--org-primary)]">
                  {consumable.currentStock}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Enhanced Basic Information */}
          <div className={`rounded-2xl shadow-xl overflow-hidden ${mutedSurface}`}>
            <div className={`bg-gradient-to-r ${secondaryGradient} p-6`}>
              <h3 className="text-xl font-bold text-white flex items-center">
                <Package className="w-5 h-5 mr-3" />
                Basic Information
              </h3>
              <p className="text-white/80 text-sm mt-1">
                Core consumable details
              </p>
            </div>
            <div className="p-6 space-y-6">
              <div className="space-y-3">
                <Label htmlFor="name" className="text-sm font-semibold text-gray-800">
                  Consumable Name *
                </Label>
                <Input
                  id="name"
                  value={consumable.name}
                  onChange={(e) =>
                    setConsumable({ ...consumable, name: e.target.value })
                  }
                  className="h-12 border-2 border-gray-200 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/20 transition-all duration-200 rounded-xl"
                  placeholder="Enter consumable name"
                />
              </div>

              <div className="space-y-3">
                <Label
                  htmlFor="consumableCategory"
                  className="text-sm font-semibold text-gray-800"
                >
                  Category
                </Label>
                <Select
                  value={consumable.consumableCategory}
                  onValueChange={(value) =>
                    setConsumable({ ...consumable, consumableCategory: value })
                  }
                >
                  <SelectTrigger className="h-12 border-2 border-gray-200 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/20 transition-all duration-200 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-2 border-gray-200 shadow-xl">
                    {Object.values(ENUMS.CATEGORY).map((category) => (
                      <SelectItem
                        key={category}
                        value={category}
                        className="rounded-lg"
                      >
                        {formatCategory(category)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isNrepOrg && (
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-gray-800">
                    Project <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={consumable.projectId || ""}
                    onValueChange={(value) =>
                      setConsumable({ ...consumable, projectId: value })
                    }
                  >
                    <SelectTrigger className="h-12 border-2 border-gray-200 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/20 transition-all duration-200 rounded-xl">
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-2 border-gray-200 shadow-xl">
                      {projects.map((project) => (
                        <SelectItem key={project.$id} value={project.$id}>
                          {project.name || project.title || project.code || project.$id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-3">
                <Label
                  htmlFor="unit"
                  className="text-sm font-semibold text-gray-800"
                >
                  Unit of Measure
                </Label>
                <Select
                  value={consumable.unit}
                  onValueChange={(value) =>
                    setConsumable({ ...consumable, unit: value })
                  }
                >
                  <SelectTrigger className="h-12 border-2 border-gray-200 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/20 transition-all duration-200 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-2 border-gray-200 shadow-xl">
                    {Object.values(ENUMS.CONSUMABLE_UNIT).map((unit) => (
                      <SelectItem
                        key={unit}
                        value={unit}
                        className="rounded-lg"
                      >
                        {formatCategory(unit)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label
                  htmlFor="publicSummary"
                  className="text-sm font-semibold text-gray-800"
                >
                  Guest Portal Summary
                </Label>
                <Textarea
                  id="publicSummary"
                  value={consumable.publicSummary || ""}
                  onChange={(e) =>
                    setConsumable({
                      ...consumable,
                      publicSummary: e.target.value,
                    })
                  }
                  rows={3}
                  placeholder="Brief description visible to guests"
                  className="border-2 border-gray-200 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/20 transition-all duration-200 rounded-xl resize-none"
                />
              </div>
            </div>
          </div>

          {/* Enhanced Stock Management */}
          <div className={`rounded-2xl shadow-xl overflow-hidden ${mutedSurface}`}>
            <div className={`bg-gradient-to-r ${primaryGradient} p-6`}>
              <h3 className="text-xl font-bold text-white flex items-center">
                <CheckCircle className="w-5 h-5 mr-3" />
                Stock & Thresholds
              </h3>
              <p className="text-white/80 text-sm mt-1">
                Manage availability levels
              </p>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label
                    htmlFor="currentStock"
                    className="text-sm font-semibold text-gray-800"
                  >
                    Current Stock
                  </Label>
                  <Input
                    id="currentStock"
                    type="number"
                    value={consumable.currentStock}
                    onChange={(e) =>
                      setConsumable({
                        ...consumable,
                        currentStock: parseInt(e.target.value) || 0,
                      })
                    }
                    className="h-12 border-2 border-gray-200 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/20 transition-all duration-200 rounded-xl text-lg font-semibold"
                    placeholder="Enter current stock"
                  />
                </div>

                <div className="space-y-3">
                  <Label
                    htmlFor="minStock"
                    className="text-sm font-semibold text-gray-800"
                  >
                    Minimum Stock Threshold
                  </Label>
                  <Input
                    id="minStock"
                    type="number"
                    value={consumable.minStock}
                    onChange={(e) =>
                      setConsumable({
                        ...consumable,
                        minStock: parseInt(e.target.value) || 0,
                      })
                    }
                    className="h-12 border-2 border-gray-200 focus:border-yellow-500 focus:ring-4 focus:ring-yellow-500/20 transition-all duration-200 rounded-xl"
                    placeholder="Min stock"
                  />
                </div>

                <div className="space-y-3">
                  <Label
                    htmlFor="maxStock"
                    className="text-sm font-semibold text-gray-800"
                  >
                    Maximum Stock Capacity
                  </Label>
                  <Input
                    id="maxStock"
                    type="number"
                    value={consumable.maxStock}
                    onChange={(e) =>
                      setConsumable({
                        ...consumable,
                        maxStock: parseInt(e.target.value) || 0,
                      })
                    }
                    className="h-12 border-2 border-gray-200 focus:border-green-500 focus:ring-4 focus:ring-green-500/20 transition-all duration-200 rounded-xl"
                    placeholder="Max stock"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label
                  htmlFor="status"
                  className="text-sm font-semibold text-gray-700"
                >
                  Status
                </Label>
                <Select
                  value={consumable.status}
                  onValueChange={(value) =>
                    setConsumable({ ...consumable, status: value })
                  }
                >
                  <SelectTrigger className="h-12 border-2 border-gray-200 focus:border-[var(--org-primary)] focus:ring-4 focus:ring-[var(--org-primary)]/20 transition-all duration-200 rounded-xl bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[999] rounded-xl border-2 border-gray-200 shadow-2xl bg-white">
                    {Object.values(ENUMS.CONSUMABLE_STATUS).map((status) => (
                      <SelectItem
                        key={status}
                        value={status}
                        className="rounded-lg text-gray-800 focus:text-white focus:bg-[var(--org-primary)]"
                      >
                        {status.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Location Information */}
        <div className={`rounded-2xl shadow-xl overflow-hidden ${mutedSurface}`}>
          <div className={`bg-gradient-to-r ${secondaryGradient} p-6`}>
            <h3 className="text-xl font-bold text-white flex items-center">
              <Package className="w-5 h-5 mr-3" />
              Location & Visibility
            </h3>
            <p className="text-white/80 text-sm mt-1">
              Control where the consumable appears
            </p>
          </div>
          <div className="p-6 space-y-6">
            <div className="space-y-3">
              <Label
                htmlFor="locationName"
                className="text-sm font-semibold text-gray-800"
              >
                Location Name
              </Label>
              <Input
                id="locationName"
                value={consumable.locationName || ""}
                onChange={(e) =>
                  setConsumable({
                    ...consumable,
                    locationName: e.target.value,
                  })
                }
                placeholder="e.g., Main Store, Warehouse A"
                className="h-12 border-2 border-gray-200 focus:border-gray-500 focus:ring-4 focus:ring-gray-500/20 transition-all duration-200 rounded-xl"
              />
            </div>

            <div className="space-y-3">
              <Label
                htmlFor="roomOrArea"
                className="text-sm font-semibold text-gray-800"
              >
                Room / Area
              </Label>
              <Input
                id="roomOrArea"
                value={consumable.roomOrArea || ""}
                onChange={(e) =>
                  setConsumable({ ...consumable, roomOrArea: e.target.value })
                }
                placeholder="e.g., Shelf 1, Cabinet B"
                className="h-12 border-2 border-gray-200 focus:border-gray-500 focus:ring-4 focus:ring-gray-500/20 transition-all duration-200 rounded-xl"
              />
            </div>

            <div className="space-y-3">
              <Label
                htmlFor="isPublic"
                className="text-sm font-semibold text-gray-700"
              >
                Public Visibility
              </Label>
              <div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-xl border-2 border-gray-200">
                <input
                  type="checkbox"
                  id="isPublic"
                  checked={consumable.isPublic || false}
                  onChange={(e) =>
                    setConsumable({
                      ...consumable,
                      isPublic: e.target.checked,
                    })
                  }
                  className="w-5 h-5 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 focus:ring-2"
                />
                <Label
                  htmlFor="isPublic"
                  className="text-sm font-medium text-gray-700 cursor-pointer"
                >
                  Make this consumable visible in guest portal
                </Label>
              </div>
            </div>
          </div>
        </div>

        {/* Accessories */}
        <div className={`rounded-2xl shadow-xl overflow-hidden ${mutedSurface}`}>
          <div className={`bg-gradient-to-r ${secondaryGradient} p-6`}>
            <h3 className="text-xl font-bold text-white flex items-center">
              <Package className="w-5 h-5 mr-3" />
              Accessories
            </h3>
            <p className="text-white/80 text-sm mt-1">
              Items that go with this consumable
            </p>
          </div>
          <div className="p-6">
            <AccessoriesEditor
              value={consumable.accessories}
              onChange={(next) =>
                setConsumable((prev) => ({ ...prev, accessories: next }))
              }
              disabled={saving}
              itemLabel="consumable"
            />
          </div>
        </div>

        {/* Enhanced Internal Notes */}
        <div className="bg-white rounded-2xl shadow-xl border border-white/20 backdrop-blur-sm overflow-hidden">
          <div className="bg-gradient-to-r from-primary-500 to-primary-600 p-6">
            <h3 className="text-xl font-bold text-white flex items-center">
              <Package className="w-5 h-5 mr-3" />
              Internal Notes
            </h3>
            <p className="text-primary-100 text-sm mt-1">
              Internal comments and notes (not visible to guests)
            </p>
          </div>
          <div className="p-6">
            <Textarea
              value={consumable.notes || ""}
              onChange={(e) =>
                setConsumable({ ...consumable, notes: e.target.value })
              }
              rows={4}
              placeholder="Add internal notes and comments..."
              className="border-2 border-gray-200 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/20 transition-all duration-200 rounded-xl resize-none"
            />
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
              className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 transform transition-all duration-300 scale-100"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Dialog Header */}
              <div className="bg-gradient-to-r from-red-500 to-red-600 p-6 rounded-t-2xl">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <Trash2 className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">
                      Delete Consumable
                    </h2>
                    <p className="text-red-100 text-sm">
                      This action cannot be undone
                    </p>
                  </div>
                </div>
              </div>

              {/* Dialog Content */}
              <div className="text-center space-y-4 p-6">
                <h3 className="text-xl font-semibold text-gray-900">
                  Are you sure you want to delete this consumable?
                </h3>
                <p className="text-gray-600">
                  This action will permanently remove the consumable and all its
                  data.
                </p>

                {/* Consumable Details */}
                {consumable && (
                  <div className="bg-gray-50 rounded-lg p-4 mt-4">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-gradient-to-br from-primary-100 to-primary-200 rounded-lg">
                        <Package className="h-5 w-5 text-primary-600" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-gray-900">
                          {consumable.name}
                        </p>
                        <p className="text-sm text-gray-500">
                          {formatCategory(consumable.consumableCategory)}
                        </p>
                        <p className="text-sm text-gray-500">
                          Stock: {consumable.currentStock}{" "}
                          {formatCategory(consumable.unit)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center space-x-3 w-full pt-4">
                  <Button
                    onClick={cancelDeleteConsumable}
                    className="flex-1 bg-org-gradient hover:from-[var(--org-primary-dark)] hover:to-[var(--org-primary)] text-white border-0 shadow-md hover:shadow-lg transition-all duration-200"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={confirmDeleteConsumable}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white border-0 shadow-md hover:shadow-lg transition-all duration-200"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Consumable
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
