"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Alert, AlertDescription } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import {
  Calendar,
  Clock,
  Package,
  CheckCircle,
  X,
  Plus,
  Minus,
  Search,
  ShoppingCart,
  Layers,
  Circle,
  CheckCircle2,
  Eye,
  MapPin,
  Filter,
} from "lucide-react";
import {
  assetsService,
  assetRequestsService,
  projectsService,
} from "../../lib/appwrite/provider.js";
import { assetImageService } from "../../lib/appwrite/image-service.js";
import { getCurrentStaff } from "../../lib/utils/auth.js";
import { ENUMS } from "../../lib/appwrite/config.js";
import { validateRequestDates } from "../../lib/utils/validation.js";
import { notifyRequestCreated } from "../../lib/services/approval-notifications.js";
import { formatCategory } from "../../lib/utils/mappings.js";
import { formatSubcategory, assetMatchesSubcategory, getSubcategoriesForCategory } from "../../lib/constants/asset-subcategories.js";
import {
  isApronItem,
  detectApronColor,
  getApronColorChoices,
  apronCartKey,
} from "../../lib/constants/apron-colors.js";
import { Query } from "appwrite";
import { useOrgTheme } from "../providers/org-theme-provider";
import { getConsumableCategoriesForOrg } from "../../lib/constants/consumable-categories.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "../ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

export function RequestForm({ itemType = ENUMS.ITEM_TYPE.ASSET }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState("");
  const [staff, setStaff] = useState(null);
  const [availableItems, setAvailableItems] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [sortOption, setSortOption] = useState("name-asc");
  const [projectCatalog, setProjectCatalog] = useState([]);
  const { orgCode, theme } = useOrgTheme();
  const isConsumableRequest = useMemo(
    () => itemType === ENUMS.ITEM_TYPE.CONSUMABLE,
    [itemType]
  );
  const viewPathBase = isConsumableRequest ? "/consumables" : "/assets";
  const isNrepOrg = useMemo(() => orgCode?.toUpperCase() === "NREP", [orgCode]);
  const mutedBg = theme?.colors?.muted || "rgba(14, 99, 112, 0.08)";
  const projectLookup = useMemo(() => {
    const map = new Map();
    (projectCatalog || []).forEach((project) => {
      if (!project) return;
      const label =
        project.name ||
        project.title ||
        project.displayName ||
        project.code ||
        project.projectName ||
        project.projectCode ||
        "";
      if (project.$id && label) {
        map.set(project.$id, label);
      }
    });
    return map;
  }, [projectCatalog]);
  const itemLabel = isConsumableRequest ? "Consumable" : "Asset";
  const itemLabelPlural = isConsumableRequest ? "Consumables" : "Assets";
  const PrimaryIcon = isConsumableRequest ? ShoppingCart : Package;

  const [formData, setFormData] = useState({
    issueDate: "",
    expectedReturnDate: "",
  });

  useEffect(() => {
    setError("");
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConsumableRequest, isNrepOrg]);

  // Reset project filter for RETC (RETC doesn't use projects)
  useEffect(() => {
    if (!isNrepOrg && projectFilter !== "all") {
      setProjectFilter("all");
    }
  }, [isNrepOrg, projectFilter]);

  const normalizeItem = (doc) => {
    const inferredType =
      doc.itemType ||
      (isConsumableRequest
        ? ENUMS.ITEM_TYPE.CONSUMABLE
        : ENUMS.ITEM_TYPE.ASSET);
    const isConsumableItem = inferredType === ENUMS.ITEM_TYPE.CONSUMABLE;

    const rawProjectId = doc.projectId || doc.project?.$id || doc.projectIdRef || "";
    const resolvedProjectName =
      projectLookup.get(rawProjectId) ||
      doc.project?.name ||
      doc.project?.title ||
      doc.project?.code ||
      doc.projectName ||
      doc.projectLabel ||
      "";

    let primaryImage = "";
    if (doc.assetImage && doc.assetImage.trim() !== "") {
      primaryImage = doc.assetImage;
    } else {
      const urls = assetImageService.getAssetImageUrls(doc.publicImages);
      if (urls && urls.length > 0) {
        primaryImage = urls[0];
      }
    }

    return {
      id: doc.$id,
      itemType: inferredType,
      name: doc.name || "Unnamed Item",
      tag: doc.assetTag || doc.identifier || "",
      category: doc.category || "",
      subcategory: doc.subcategory || "",
      accessories: Array.isArray(doc.accessories) ? doc.accessories : [],
      location:
        doc.locationName ||
        doc.roomOrArea ||
        (isConsumableRequest
          ? isNrepOrg
            ? "NREP Store"
            : "RETC Store"
          : ""),
      status: isConsumableItem ? doc.status : doc.availableStatus,
      projectId: rawProjectId || "",
      projectName: resolvedProjectName || (rawProjectId ? "Unnamed Project" : "Unassigned"),
      currentStock: isConsumableItem ? doc.currentStock ?? null : null,
      unit: isConsumableItem ? doc.unit || "" : "",
      imageUrl: primaryImage,
      fallbackInitial: doc.name?.charAt(0)?.toUpperCase() || "?",
      raw: doc,
    };
  };

  const loadData = async () => {
    setLoadingItems(true);
    try {
      const itemQueries = [Query.orderAsc("name")];
      let itemsPromise;

      if (isConsumableRequest) {
        itemsPromise = assetsService.getConsumables(itemQueries);
      } else {
        const assetQueries = [
          ...itemQueries,
          Query.equal("availableStatus", ENUMS.AVAILABLE_STATUS.AVAILABLE),
        ];
        itemsPromise = assetsService.getAssets(assetQueries);
      }

      const projectQueries = [Query.orderAsc("name")];
      const projectsPromise = projectsService
        .list(projectQueries)
        .then((res) => res?.documents || [])
        .catch((err) => {
          console.error("Failed to load projects:", err);
          return [];
        });

      const [currentStaff, itemsResult, projectsResult] = await Promise.all([
        getCurrentStaff(),
        itemsPromise,
        projectsPromise,
      ]);

      setStaff(currentStaff);
      setProjectCatalog(projectsResult);

      const normalizedItems = (itemsResult.documents || [])
        .map(normalizeItem)
        .filter((item) => {
          if (!isConsumableRequest) return true;
          if (item.status === ENUMS.CONSUMABLE_STATUS.OUT_OF_STOCK) {
            return false;
          }
          if (item.currentStock !== null && item.currentStock <= 0) {
            return false;
          }
          return true;
        });

      setAvailableItems(normalizedItems);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 8);

      setFormData({
        issueDate: tomorrow.toISOString().split("T")[0],
        expectedReturnDate: nextWeek.toISOString().split("T")[0],
      });
    } catch (loadError) {
      console.error("Failed to load form data:", loadError);
      setError("Failed to load form data. Please refresh the page.");
    } finally {
      setLoadingItems(false);
    }
  };

  const categories = useMemo(() => {
    if (isConsumableRequest) {
      // For consumables, use organization-specific categories
      const orgCategories = getConsumableCategoriesForOrg(orgCode);
      return orgCategories ?? [];
    }

    // For assets, show all available categories from ENUMS
    return Object.values(ENUMS.CATEGORY).sort();
  }, [isConsumableRequest, orgCode]);

  // Prefer predefined subcategory lists for the selected category so users can
  // filter even when older assets only encode the type in the name.
  const subcategoryOptions = useMemo(() => {
    if (isConsumableRequest || categoryFilter === "all") return [];
    const predefined = getSubcategoriesForCategory(categoryFilter);
    if (predefined.length > 0) {
      return predefined.map((opt) => opt.value);
    }
    const values = new Set();
    availableItems.forEach((item) => {
      if (item.category === categoryFilter && item.subcategory) {
        values.add(item.subcategory);
      }
    });
    return Array.from(values).sort();
  }, [availableItems, categoryFilter, isConsumableRequest]);

  // Reset the subcategory filter whenever the category changes.
  useEffect(() => {
    setSubcategoryFilter("all");
  }, [categoryFilter]);

  const statuses = useMemo(() => {
    if (isConsumableRequest) {
      // For consumables, show all consumable statuses
      return Object.values(ENUMS.CONSUMABLE_STATUS).sort();
    }

    // For assets, show all available statuses
    return Object.values(ENUMS.AVAILABLE_STATUS).sort();
  }, [isConsumableRequest]);

  const projectOptions = useMemo(() => {
    const unique = new Map();
    (projectCatalog || []).forEach((project) => {
      if (!project) return;
      const label =
        project.name ||
        project.title ||
        project.displayName ||
        project.code ||
        project.projectName ||
        project.projectCode ||
        "";
      if (project.$id && label) {
        unique.set(project.$id, label);
      }
    });

    let options = Array.from(unique.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));

    if (options.length === 0) {
      const fallback = new Map();
      availableItems.forEach((item) => {
        const id = item.projectId || item.project?.$id;
        const name =
          item.projectName ||
          item.project?.name ||
          item.project?.title ||
          item.project?.code ||
          "";
        if (id && name) {
          fallback.set(id, name);
        }
      });

      options = Array.from(fallback.entries())
        .map(([id, label]) => ({ id, label }))
        .sort((a, b) => a.label.localeCompare(b.label));
    }

    const hasUnassigned = availableItems.some(
      (item) => !item.projectId || item.projectId === ""
    );
    if (hasUnassigned) {
      options.unshift({ id: "unassigned", label: "Unassigned" });
    }

    return options;
  }, [projectCatalog, availableItems]);

  const filteredItems = useMemo(() => {
    const filtered = availableItems.filter((item) => {
      if (categoryFilter !== "all" && item.category) {
        if (item.category !== categoryFilter) {
          return false;
        }
      }

      if (!isConsumableRequest && subcategoryFilter !== "all") {
        if (!assetMatchesSubcategory(item, subcategoryFilter)) {
          return false;
        }
      }

      if (statusFilter !== "all") {
        if (!item.status || item.status !== statusFilter) {
          return false;
        }
      }

      // Project filter only applies to NREP (RETC doesn't use projects)
      if (isNrepOrg && projectFilter !== "all") {
        if (projectFilter === "unassigned") {
          if (item.projectId && item.projectId !== "") {
            return false;
          }
        } else if (!item.projectId || item.projectId !== projectFilter) {
          return false;
        }
      }

      if (searchTerm.trim() !== "") {
        const query = searchTerm.toLowerCase();
        const matches =
          item.name.toLowerCase().includes(query) ||
          (item.tag && item.tag.toLowerCase().includes(query)) ||
          (item.location && item.location.toLowerCase().includes(query)) ||
          (item.category && item.category.toLowerCase().includes(query));
        if (!matches) {
          return false;
        }
      }

      if (isConsumableRequest) {
        if (item.status === ENUMS.CONSUMABLE_STATUS.OUT_OF_STOCK) {
          return false;
        }
        if (item.currentStock !== null && item.currentStock <= 0) {
          return false;
        }
      }

      return true;
    });

    return filtered.sort((a, b) => {
      switch (sortOption) {
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "stock-asc":
          return (a.currentStock ?? 0) - (b.currentStock ?? 0);
        case "stock-desc":
          return (b.currentStock ?? 0) - (a.currentStock ?? 0);
        default:
          return a.name.localeCompare(b.name);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    availableItems,
    categoryFilter,
    subcategoryFilter,
    statusFilter,
    projectFilter,
    searchTerm,
    selectedItems,
    isConsumableRequest,
    sortOption,
    isNrepOrg,
  ]);

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const getCartKey = (item) => item.cartKey || item.id;

  const findCatalogItemForColor = (color) => {
    return availableItems.find((candidate) => {
      if (!isApronItem(candidate)) return false;
      const detected = detectApronColor(candidate);
      if (detected?.key === color.key) return true;
      return color.pattern.test(
        `${candidate.name || ""} ${candidate.subcategory || ""}`
      );
    });
  };

  const handleItemToggle = (item) => {
    setSelectedItems((prev) => {
      const detected = isApronItem(item) ? detectApronColor(item) : null;
      const cartKey = detected
        ? apronCartKey(item.id, detected.key)
        : item.id;
      const exists = prev.find((selected) => getCartKey(selected) === cartKey);
      if (exists) {
        return prev.filter((selected) => getCartKey(selected) !== cartKey);
      }

      return [
        ...prev,
        {
          ...item,
          cartKey,
          colorKey: detected?.key || null,
          colorLabel: detected?.label || null,
          quantity: isConsumableRequest ? 1 : undefined,
          note: "",
          selectedAccessories: [],
        },
      ];
    });
  };

  const handleAddApronColor = (sourceItem, color) => {
    const sibling = findCatalogItemForColor(color);
    const base = sibling || sourceItem;
    const cartKey = apronCartKey(base.id, color.key);

    setSelectedItems((prev) => {
      if (prev.some((item) => getCartKey(item) === cartKey)) {
        return prev;
      }

      const baseName = String(base.name || "Aprons")
        .replace(/\s*\([^)]*\)\s*$/, "")
        .trim();
      const alreadyNamed = color.pattern.test(base.name || "");

      return [
        ...prev,
        {
          ...base,
          cartKey,
          colorKey: color.key,
          colorLabel: color.label,
          name: alreadyNamed ? base.name : `${baseName} (${color.label})`,
          quantity: 1,
          note: "",
          selectedAccessories: [],
        },
      ];
    });
  };

  const handleAccessoryToggle = (itemKey, accessory) => {
    setSelectedItems((prev) =>
      prev.map((item) => {
        if (getCartKey(item) !== itemKey) return item;
        const current = item.selectedAccessories || [];
        const exists = current.includes(accessory);
        return {
          ...item,
          selectedAccessories: exists
            ? current.filter((a) => a !== accessory)
            : [...current, accessory],
        };
      })
    );
  };

  const handleQuantityChange = (itemKey, delta) => {
    if (!isConsumableRequest) return;
    setSelectedItems((prev) =>
      prev.map((item) => {
        if (getCartKey(item) !== itemKey) return item;
        const max = item.currentStock ?? Number.POSITIVE_INFINITY;
        // Shared stock across color lines of the same catalog id
        const others = prev
          .filter(
            (other) =>
              other.id === item.id && getCartKey(other) !== itemKey
          )
          .reduce((sum, other) => sum + (other.quantity || 1), 0);
        const room = Math.max(1, max - others);
        const next = Math.max(1, Math.min(room, (item.quantity || 1) + delta));
        return { ...item, quantity: next };
      })
    );
  };

  const handleRemoveItem = (itemKey) => {
    setSelectedItems((prev) =>
      prev.filter((item) => getCartKey(item) !== itemKey)
    );
  };

  const handleItemNoteChange = (itemKey, value) => {
    setSelectedItems((prev) =>
      prev.map((item) =>
        getCartKey(item) === itemKey
          ? {
              ...item,
              note: value,
            }
          : item
      )
    );
  };

  const requestedItemIds = useMemo(() => {
    if (!isConsumableRequest) {
      return selectedItems.map((item) => item.id);
    }
    const expanded = [];
    selectedItems.forEach((item) => {
      const max = item.currentStock ?? Number.POSITIVE_INFINITY;
      const quantity = Math.max(1, Math.min(max, item.quantity || 1));
      for (let i = 0; i < quantity; i += 1) {
        expanded.push(item.id);
      }
    });
    return expanded;
  }, [selectedItems, isConsumableRequest]);

  const hasSelectedItems = selectedItems.length > 0;
  const hasDetails = formData.issueDate && formData.expectedReturnDate;
  const canSubmit = hasSelectedItems && hasDetails;

  const steps = useMemo(
    () => [
      {
        id: 1,
        title: `Add ${itemLabelPlural}`,
        description: `Collect the ${itemLabelPlural.toLowerCase()} you need`,
        status: hasSelectedItems ? "complete" : "current",
      },
      {
        id: 2,
        title: "Review & Submit",
        description: "Confirm purpose, timeline, and send the request",
        status: hasSelectedItems ? (canSubmit ? "complete" : "current") : "upcoming",
      },
    ],
    [hasSelectedItems, canSubmit, itemLabelPlural]
  );

  const getStepClasses = (status) => {
    switch (status) {
      case "complete":
        return "border-transparent bg-org-gradient text-white shadow-md";
      case "current":
        return "border-[var(--org-primary)]/40 bg-white text-gray-900 shadow-sm";
      default:
        return "border-dashed border-gray-300 bg-white text-gray-400";
    }
  };

  const renderStepIcon = (status) => {
    if (status === "complete") {
      return <CheckCircle2 className="w-5 h-5" />;
    }
    if (status === "current") {
      return (
        <div className="w-5 h-5 rounded-full border-2 border-[var(--org-primary)] flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-[var(--org-primary)] animate-pulse" />
        </div>
      );
    }
    return <Circle className="w-5 h-5" />;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (selectedItems.length === 0) {
        throw new Error(`Please add at least one ${itemLabel.toLowerCase()} to your request.`);
      }

      if (isConsumableRequest) {
        const totalsById = new Map();
        selectedItems.forEach((item) => {
          totalsById.set(
            item.id,
            (totalsById.get(item.id) || 0) + (item.quantity || 1)
          );
        });
        const overLimit = selectedItems.find((item) => {
          if (item.currentStock === null || item.currentStock === undefined) {
            return false;
          }
          return (totalsById.get(item.id) || 0) > item.currentStock;
        });
        if (overLimit) {
          throw new Error(
            `${overLimit.name} has only ${overLimit.currentStock} in stock across all colors. Adjust the quantities before submitting.`
          );
        }
      }

      validateRequestDates(formData.issueDate, formData.expectedReturnDate);

      const itemNotes = selectedItems
        .filter((item) => item.note && item.note.trim().length > 0)
        .map((item) => {
          const details = item.tag ? `${item.name} (${item.tag})` : item.name;
          return `${details}: ${item.note.trim()}`;
        });

      // Accessories a requester attached, kept both structured (requestedAccessories)
      // and as readable lines in the purpose so they show up everywhere.
      const accessoryLines = selectedItems
        .filter(
          (item) =>
            Array.isArray(item.selectedAccessories) &&
            item.selectedAccessories.length > 0
        )
        .map((item) => {
          const details = item.tag ? `${item.name} (${item.tag})` : item.name;
          return `${details} accessories: ${item.selectedAccessories.join(", ")}`;
        });

      // Apron color breakdown (green / orange / cream, etc.)
      const apronColorGroups = new Map();
      selectedItems.forEach((item) => {
        if (!isApronItem(item)) return;
        const label =
          item.colorLabel || detectApronColor(item)?.label || null;
        if (!label) return;
        const list = apronColorGroups.get(item.id) || [];
        list.push(`${label} × ${item.quantity || 1}`);
        apronColorGroups.set(item.id, list);
      });
      const apronColorLines = [];
      apronColorGroups.forEach((parts, catalogId) => {
        const sample = selectedItems.find((i) => i.id === catalogId);
        const baseName = String(sample?.name || "Aprons")
          .replace(/\s*\([^)]*\)\s*$/, "")
          .trim();
        apronColorLines.push(`${baseName} colors: ${parts.join(", ")}`);
      });

      const requestedAccessories = [...accessoryLines, ...apronColorLines];

      const purposeLines = [...itemNotes, ...accessoryLines, ...apronColorLines];

      const requestData = {
        requesterStaffId: staff.$id,
        purpose: purposeLines.length
          ? purposeLines.map((line) => `- ${line}`).join("\n")
          : "Request submitted",
        issueDate: new Date(formData.issueDate).toISOString(),
        expectedReturnDate: new Date(formData.expectedReturnDate).toISOString(),
        requestedItems: requestedItemIds,
        requestedAccessories,
        status: ENUMS.REQUEST_STATUS.PENDING,
        approvalStage: ENUMS.APPROVAL_STAGE.L1,
      };

      const createdRequest = await assetRequestsService.create(requestData);

      // Notify first-level (L1) approvers. Best-effort; never blocks submission.
      await notifyRequestCreated(createdRequest, staff, selectedItems);

      router.push("/requests");
    } catch (submitError) {
      setError(submitError.message || "Failed to submit request");
    } finally {
      setLoading(false);
    }
  };

  const itemCount = selectedItems.length;

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="grid gap-4 md:grid-cols-2">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`rounded-2xl border px-5 py-4 flex items-start gap-3 transition-all duration-200 ${getStepClasses(
              step.status
            )}`}
          >
            <div className="mt-0.5">{renderStepIcon(step.status)}</div>
            <div className="space-y-1">
              <p
                className={`text-sm font-semibold ${
                  step.status === "complete"
                    ? "text-white"
                    : step.status === "current"
                    ? "text-gray-900"
                    : "text-gray-500"
                }`}
              >
                Step {step.id}
              </p>
              <h3
                className={`text-lg font-semibold ${
                  step.status === "complete" ? "text-white" : "text-gray-900"
                }`}
              >
                {step.title}
              </h3>
              <p
                className={`text-sm ${
                  step.status === "complete"
                    ? "text-white/90"
                    : step.status === "current"
                    ? "text-gray-600"
                    : "text-gray-400"
                }`}
              >
                {step.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <Alert variant="destructive" className="bg-red-50 border-red-200">
          <AlertDescription className="text-red-800">
            {error}
          </AlertDescription>
        </Alert>
      )}

      <Card className="bg-white border border-gray-200 shadow-sm">
        <CardHeader className="bg-[var(--org-muted)]/60 border-b border-[var(--org-primary)]/20">
          <CardTitle className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[var(--org-primary)]" />
            Request Details
          </CardTitle>
          <CardDescription className="text-gray-600">
            Provide details for when and why you need these {itemLabelPlural.toLowerCase()}.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label
                htmlFor="issueDate"
                className="text-sm font-medium text-gray-700 flex items-center gap-2"
              >
                <Calendar className="w-4 h-4 text-primary-600" />
                Issue Date *
              </Label>
              <Input
                id="issueDate"
                type="date"
                value={formData.issueDate}
                onChange={(e) => updateField("issueDate", e.target.value)}
                required
                disabled={loading}
                className="border-gray-300 focus:border-primary-500 focus:ring-primary-500"
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="expectedReturnDate"
                className="text-sm font-medium text-gray-700 flex items-center gap-2"
              >
                <Clock className="w-4 h-4 text-primary-600" />
                Expected Return Date *
              </Label>
              <Input
                id="expectedReturnDate"
                type="date"
                value={formData.expectedReturnDate}
                onChange={(e) => updateField("expectedReturnDate", e.target.value)}
                required
                disabled={loading}
                className="border-gray-300 focus:border-primary-500 focus:ring-primary-500"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white border border-gray-200 shadow-sm">
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
          <CardTitle className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-[var(--org-primary)]" />
              Selected {itemLabelPlural}
          </CardTitle>
            <CardDescription className="text-gray-600">
              Keep adding {itemLabelPlural.toLowerCase()} until your request is complete.
            </CardDescription>
          </div>
          <Button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-2 bg-org-gradient text-white shadow-md hover:shadow-lg"
          >
            <Plus className="w-4 h-4" />
            Add {itemLabel}
          </Button>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          {itemCount === 0 ? (
            <div className="border border-dashed border-gray-300 rounded-xl p-6 text-center space-y-3 bg-gray-50">
              <div className="mx-auto w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm">
                <PrimaryIcon className="w-6 h-6 text-primary-600" />
              </div>
              <p className="text-gray-700 font-medium">
                No {itemLabelPlural.toLowerCase()} selected yet.
              </p>
              <p className="text-gray-500 text-sm">
                Use the button above to browse and add {itemLabelPlural.toLowerCase()} to this request.
              </p>
              <Button
                type="button"
                      variant="outline"
                onClick={() => setPickerOpen(true)}
                className="inline-flex items-center gap-2 border-[var(--org-primary)] text-[var(--org-primary)] hover:bg-[var(--org-primary)]/10"
              >
                <Plus className="w-4 h-4" />
                Browse {itemLabelPlural}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {selectedItems.map((item) => {
                const itemKey = getCartKey(item);
                const showApronColors =
                  isConsumableRequest && isApronItem(item);
                const apronChoices = showApronColors
                  ? getApronColorChoices(item)
                  : [];

                return (
                <div
                  key={itemKey}
                  className="flex flex-col sm:flex-row sm:items-start gap-4 border border-gray-200 rounded-xl p-4 bg-white shadow-sm"
                >
                  <div className="w-full sm:w-24 sm:h-24 h-40 rounded-lg overflow-hidden"
                    style={{
                      background: item.imageUrl && !isConsumableRequest
                        ? `linear-gradient(135deg, ${mutedBg}, #ffffff)`
                        : `linear-gradient(135deg, ${mutedBg}, rgba(255,255,255,0.95))`,
                    }}
                  >
                    {item.imageUrl && !isConsumableRequest ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <span className="text-2xl font-semibold text-primary-600">
                          {item.fallbackInitial}
                                          </span>
                                        </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div>
                        <h4 className="text-lg font-semibold text-gray-900">
                          {item.name}
                        </h4>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                          {item.tag && (
                            <Badge className="bg-gray-100 text-gray-700 border border-gray-200">
                              Tag: {item.tag}
                            </Badge>
                          )}
                          {item.category && (
                            <Badge className="bg-primary-50 text-primary-700 border border-primary-200">
                              {formatCategory(item.category)}
                            </Badge>
                          )}
                          {item.subcategory && (
                            <Badge className="bg-gray-100 text-gray-700 border border-gray-200">
                              {formatSubcategory(item.subcategory)}
                            </Badge>
                          )}
                          {(item.colorLabel ||
                            detectApronColor(item)?.label) && (
                            <Badge className="bg-amber-50 text-amber-800 border border-amber-200">
                              {item.colorLabel || detectApronColor(item).label}
                            </Badge>
                          )}
                          {item.location && (
                            <Badge className="bg-gray-50 text-gray-600 border border-gray-200">
                              {item.location}
                            </Badge>
                          )}
                                      </div>
                                    </div>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => handleRemoveItem(itemKey)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <X className="w-4 h-4" />
                        <span className="sr-only">Remove {item.name}</span>
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-gradient-to-r from-primary-50 to-primary-100 text-primary-800 border border-primary-200">
                        {item.status 
                          ? (isConsumableRequest 
                              ? formatCategory(item.status) 
                              : item.status.replace(/_/g, " "))
                          : (isConsumableRequest 
                              ? "In Stock" 
                              : "Available")}
                      </Badge>
                      {isConsumableRequest && item.currentStock !== null && (
                        <Badge className="bg-[var(--org-highlight)] text-white border border-[var(--org-highlight-dark)]/30">
                          In stock: {item.currentStock}
                        </Badge>
                      )}
                                  </div>

                    {isConsumableRequest && item.currentStock !== null && (
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-700">
                          Quantity
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleQuantityChange(itemKey, -1)}
                            disabled={item.quantity <= 1}
                          >
                            <Minus className="w-4 h-4" />
                          </Button>
                          <span className="text-base font-semibold text-gray-900 min-w-[2rem] text-center">
                            {item.quantity}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleQuantityChange(itemKey, 1)}
                            disabled={
                              item.currentStock !== null &&
                              selectedItems
                                .filter((s) => s.id === item.id)
                                .reduce(
                                  (sum, s) => sum + (s.quantity || 1),
                                  0
                                ) >= item.currentStock
                            }
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                          {item.unit && (
                            <span className="text-sm text-gray-500">
                              {item.unit.toLowerCase()}
                              {item.quantity !== 1 ? "s" : ""}
                                        </span>
                          )}
                                    </div>
                                  </div>
                                )}

                    {showApronColors && (
                      <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                        <Label className="text-sm font-medium text-gray-800">
                          Apron colors for the field
                        </Label>
                        <p className="text-xs text-gray-600">
                          Add green, orange, or cream — each color is added to
                          your request cart with its own quantity.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {apronChoices.map((color) => {
                            const inCart = selectedItems.some((s) => {
                              if (s.colorKey === color.key) return true;
                              const detected = detectApronColor(s);
                              return (
                                isApronItem(s) && detected?.key === color.key
                              );
                            });
                            return (
                              <Button
                                key={color.key}
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={inCart}
                                onClick={() => handleAddApronColor(item, color)}
                                className={
                                  inCart
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                    : "border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                                }
                              >
                                <Plus className="w-3.5 h-3.5 mr-1" />
                                {inCart
                                  ? `${color.label} added`
                                  : `Add ${color.label}`}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {!isConsumableRequest &&
                      Array.isArray(item.accessories) &&
                      item.accessories.length > 0 && (
                        <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                          <Label className="text-sm font-medium text-gray-700">
                            Attach accessories
                          </Label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {item.accessories.map((accessory) => {
                              const checked = (item.selectedAccessories || []).includes(
                                accessory
                              );
                              return (
                                <label
                                  key={accessory}
                                  className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
                                >
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={() =>
                                      handleAccessoryToggle(itemKey, accessory)
                                    }
                                  />
                                  <span>{accessory}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}

                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-700">
                        Purpose for this {itemLabel.toLowerCase()}
                      </Label>
                      <Textarea
                        value={item.note || ""}
                        onChange={(e) =>
                          handleItemNoteChange(itemKey, e.target.value)
                        }
                        placeholder={`Why do you need ${item.name}?`}
                        rows={3}
                        className="border-gray-300 focus:border-[var(--org-primary)] focus:ring-[var(--org-primary)]/20 transition-all duration-200"
                      />
                              </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-gray-200">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading}
          className="text-gray-600 border-gray-300 hover:bg-gray-50"
        >
          <X className="w-4 h-4 mr-2" />
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={loading || requestedItemIds.length === 0 || !hasDetails}
          className="bg-org-gradient hover:from-[var(--org-primary-dark)] hover:to-[var(--org-primary)] text-white shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
              Submitting...
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4 mr-2" />
              Confirm Request
            </>
          )}
        </Button>
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-none w-full md:w-[70rem] lg:w-[76rem] xl:w-[80rem] max-h-[85vh] overflow-hidden p-0 gap-0 border-slate-200">
          <div className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-r from-[var(--org-primary)] via-[var(--org-primary-dark)] to-[var(--org-highlight)] px-6 py-5 text-white">
            <div className="flex items-start justify-between gap-4">
              <DialogHeader className="space-y-1 border-0 p-0 text-left">
                <DialogTitle className="text-xl font-semibold tracking-tight text-white">
                  Select {itemLabelPlural}
                </DialogTitle>
                <DialogDescription className="text-sm text-white/90">
                  Browse available {itemLabelPlural.toLowerCase()} and add them to your request cart.
                </DialogDescription>
              </DialogHeader>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                aria-label="Close"
                className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/15 text-white transition-colors hover:bg-white/25"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/20 blur-2xl" />
          </div>

          <div className="space-y-4 bg-[var(--org-background,#f8fafc)] px-5 py-4 sm:px-6">
            {/* Filters */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-slate-700">
                <Filter className="h-4 w-4 text-[var(--org-primary)]" />
                <span className="text-sm font-semibold">Search & filter</span>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[220px] flex-1">
                  <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Search
                  </Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder={`Search ${itemLabelPlural.toLowerCase()} by name, tag, or location...`}
                      className="h-10 rounded-xl border-slate-200 bg-slate-50/80 pl-9 focus:border-[var(--org-primary)] focus:ring-[var(--org-primary)]/20"
                    />
                  </div>
                </div>

                {isNrepOrg && projectOptions.length > 0 && (
                  <div className="w-full sm:w-[170px]">
                    <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Project
                    </Label>
                    <Select value={projectFilter} onValueChange={setProjectFilter}>
                      <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-slate-50/80 px-3 text-sm text-slate-700">
                        <span className="flex-1 truncate text-left">
                          {projectFilter === "all"
                            ? "All Projects"
                            : projectOptions.find((project) => project.id === projectFilter)?.label ||
                              "All Projects"}
                        </span>
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="all">All Projects</SelectItem>
                        {projectOptions.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="w-full sm:w-[160px]">
                  <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Status
                  </Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-slate-50/80 px-3 text-sm text-slate-700">
                      <span className="flex-1 truncate text-left">
                        {statusFilter === "all"
                          ? "All Statuses"
                          : statusFilter.replace(/_/g, " ")}
                      </span>
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="all">All Statuses</SelectItem>
                      {statuses.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-full sm:w-[170px]">
                  <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Category
                  </Label>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-slate-50/80 px-3 text-sm text-slate-700">
                      <span className="flex-1 truncate text-left">
                        {categoryFilter === "all"
                          ? "All Categories"
                          : formatCategory(categoryFilter)}
                      </span>
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category} value={category}>
                          {formatCategory(category)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {!isConsumableRequest &&
                  categoryFilter !== "all" &&
                  subcategoryOptions.length > 0 && (
                    <div className="w-full sm:w-[170px]">
                      <Label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Subcategory
                      </Label>
                      <Select
                        value={subcategoryFilter}
                        onValueChange={setSubcategoryFilter}
                      >
                        <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-slate-50/80 px-3 text-sm text-slate-700">
                          <span className="flex-1 truncate text-left">
                            {subcategoryFilter === "all"
                              ? "All Subcategories"
                              : formatSubcategory(subcategoryFilter)}
                          </span>
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          <SelectItem value="all">All Subcategories</SelectItem>
                          {subcategoryOptions.map((sub) => (
                            <SelectItem key={sub} value={sub}>
                              {formatSubcategory(sub)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSearchTerm("");
                    setCategoryFilter("all");
                    setSubcategoryFilter("all");
                    setStatusFilter("all");
                    setProjectFilter("all");
                    setSortOption("name-asc");
                  }}
                  className="h-10 rounded-xl border-slate-200 px-4 text-slate-600 hover:bg-slate-50"
                >
                  Clear
                </Button>
              </div>
            </div>

            {/* Item grid */}
            <div className="max-h-[52vh] overflow-y-auto pr-1">
              {loadingItems ? (
                <div className="flex items-center justify-center py-16 text-slate-500">
                  Loading {itemLabelPlural.toLowerCase()}...
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center space-y-3 rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center text-slate-500">
                  <PrimaryIcon className="h-10 w-10 text-[var(--org-primary)]/50" />
                  <p className="text-sm">
                    No {itemLabelPlural.toLowerCase()} match your current filters.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredItems.map((item) => {
                    const isSelected = selectedItems.some(
                      (selected) => selected.id === item.id
                    );
                    const statusLabel = item.status
                      ? isConsumableRequest
                        ? formatCategory(item.status)
                        : item.status.replace(/_/g, " ")
                      : isConsumableRequest
                      ? "In Stock"
                      : "Available";
                    const isAvailable =
                      !item.status ||
                      item.status === "AVAILABLE" ||
                      item.status === "IN_STOCK";

                    return (
                      <div
                        key={item.id}
                        className={`group flex h-full flex-col overflow-hidden rounded-2xl border bg-white transition-colors duration-200 ${
                          isSelected
                            ? "border-[var(--org-highlight)] ring-1 ring-[var(--org-highlight)]/30"
                            : "border-slate-200 hover:border-[var(--org-primary)]/35"
                        }`}
                      >
                        <div className="flex items-start gap-3 border-b border-slate-100 p-4">
                          <div
                            className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl"
                            style={{
                              background: item.imageUrl
                                ? undefined
                                : "color-mix(in srgb, var(--org-primary) 12%, white)",
                            }}
                          >
                            {item.imageUrl && !isConsumableRequest ? (
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="text-base font-semibold text-[var(--org-primary-dark)]">
                                {item.fallbackInitial}
                              </span>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h4 className="truncate text-[15px] font-semibold text-slate-700">
                                  {item.name}
                                </h4>
                                {item.tag && (
                                  <p className="mt-0.5 truncate text-xs text-slate-500">
                                    {item.tag}
                                  </p>
                                )}
                              </div>
                              <span
                                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                  isAvailable
                                    ? "bg-[var(--org-primary)]/12 text-[var(--org-primary-dark)]"
                                    : "bg-[var(--org-highlight)]/20 text-[var(--org-highlight-dark)]"
                                }`}
                              >
                                {statusLabel}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-1 flex-col gap-3 p-4">
                          <div className="flex flex-wrap gap-1.5">
                            {item.category && (
                              <span className="rounded-md bg-[var(--org-primary)]/10 px-2 py-1 text-[11px] font-medium text-[var(--org-primary-dark)]">
                                {formatCategory(item.category)}
                              </span>
                            )}
                            {item.subcategory && (
                              <span className="rounded-md bg-[var(--org-highlight)]/15 px-2 py-1 text-[11px] font-medium text-[var(--org-highlight-dark)]">
                                {formatSubcategory(item.subcategory)}
                              </span>
                            )}
                            {item.accessories && item.accessories.length > 0 && (
                              <span className="rounded-md bg-[var(--org-primary)]/10 px-2 py-1 text-[11px] font-medium text-[var(--org-primary-dark)]">
                                {item.accessories.length} accessor
                                {item.accessories.length === 1 ? "y" : "ies"}
                              </span>
                            )}
                            {isConsumableRequest && item.currentStock !== null && (
                              <span className="rounded-md bg-[var(--org-highlight)]/15 px-2 py-1 text-[11px] font-medium text-[var(--org-highlight-dark)]">
                                Stock: {item.currentStock}
                              </span>
                            )}
                          </div>

                          {item.location && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-600">
                              <MapPin className="h-3.5 w-3.5 shrink-0 text-red-600" />
                              <span className="truncate">{item.location}</span>
                            </div>
                          )}

                          <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--org-primary)]">
                              {itemLabel}
                            </span>
                            <div className="flex items-center gap-2">
                              <a
                                href={`${viewPathBase}/${item.id}?from=request&type=${
                                  isConsumableRequest ? "consumable" : "asset"
                                }`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                View
                              </a>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => handleItemToggle(item)}
                                className={
                                  isSelected
                                    ? "h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                    : "h-9 rounded-lg bg-[var(--org-primary)] px-3 text-xs font-semibold text-white hover:bg-[var(--org-primary-dark)]"
                                }
                              >
                                {isSelected ? "Remove" : "Add"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <DialogFooter className="border-t border-slate-200 bg-white px-1 py-3 sm:justify-between">
              <p className="hidden text-sm text-slate-500 sm:block">
                {selectedItems.length} selected in cart
              </p>
              <Button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="rounded-xl bg-org-gradient px-6 text-white shadow-sm hover:opacity-95"
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </form>
  );
}
