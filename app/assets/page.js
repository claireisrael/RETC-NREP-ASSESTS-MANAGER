"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  Package,
  Search,
  Filter,
  Plus,
  RefreshCw,
  Eye,
  Image as ImageIcon,
  FileText,
  MapPin,
  Clock,
  List,
  Grid3X3,
} from "lucide-react";
import {
  assetsService,
  departmentsService,
} from "../../lib/appwrite/provider.js";
import { ENUMS } from "../../lib/appwrite/config.js";
import {
  getStatusBadgeColor,
  getConditionBadgeColor,
  formatCategory,
} from "../../lib/utils/mappings.js";
import {
  ASSET_SUBCATEGORIES,
  getSubcategoriesForCategory,
  assetMatchesSubcategory,
} from "../../lib/constants/asset-subcategories.js";
import {
  getCurrentStaff,
  permissions,
  getCurrentViewMode,
} from "../../lib/utils/auth.js";
import { assetImageService } from "../../lib/appwrite/image-service.js";
import { Query } from "appwrite";

export default function AssetsPage() {
  const router = useRouter();
  const [assets, setAssets] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState(null);

  // Filters
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 12;

  const [viewMode, setViewMode] = useState("cards");
  // Default to user mode for requester pages
  // Only switch to admin if user explicitly toggles and has permissions
  const [userViewMode, setUserViewMode] = useState("user");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedMode = window.localStorage.getItem("assetsViewMode");
    if (storedMode === "cards" || storedMode === "table") {
      setViewMode(storedMode);
    }
  }, []);

  // Separate effect to handle view mode changes from sidebar
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    // Listen for custom events from sidebar
    const handleViewModeChange = (e) => {
      const mode = e?.detail?.mode;
      if (mode === "admin" || mode === "user") {
        setUserViewMode(mode);
      }
    };
    
    window.addEventListener("viewModeChanged", handleViewModeChange);
    
    return () => {
      window.removeEventListener("viewModeChanged", handleViewModeChange);
    };
  }, []);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadAssets();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoryFilter, subcategoryFilter, statusFilter, departmentFilter, currentPage]);

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("assetsViewMode", mode);
    }
  };

  const loadInitialData = async () => {
    try {
      const [currentStaff, deptResult] = await Promise.all([
        getCurrentStaff(),
        departmentsService.list(),
      ]);
      setStaff(currentStaff);
      setDepartments(deptResult.documents);
    } catch (error) {
      console.error("Failed to load initial data:", error);
    }
  };

  const loadAssets = async () => {
    setLoading(true);
    try {
      const queries = [];

      // Add search query
      if (search) {
        queries.push(Query.search("name", search));
      }

      // Add filters (skip sentinel "all" values)
      if (categoryFilter && categoryFilter !== "all") {
        queries.push(Query.equal("category", categoryFilter));
      }
      if (statusFilter && statusFilter !== "all") {
        queries.push(Query.equal("availableStatus", statusFilter));
      }
      if (departmentFilter && departmentFilter !== "all") {
        queries.push(Query.equal("departmentId", departmentFilter));
      }

      // Subcategory is matched client-side so free-text / legacy values
      // (and names like "Camera - Canon") still filter correctly.
      // Fetch a larger page when a subcategory is active.
      const activeSubcategory =
        subcategoryFilter && subcategoryFilter !== "all"
          ? subcategoryFilter
          : null;
      const fetchLimit = activeSubcategory ? 500 : pageSize;
      const fetchOffset = activeSubcategory ? 0 : (currentPage - 1) * pageSize;

      queries.push(Query.limit(fetchLimit));
      queries.push(Query.offset(fetchOffset));
      queries.push(Query.orderDesc("$createdAt"));

      const result = await assetsService.list(queries);

      // Filter to only show assets (not consumables)
      let assetsOnly = result.documents.filter(
        (item) =>
          item.itemType === ENUMS.ITEM_TYPE.ASSET ||
          !item.itemType ||
          item.itemType === undefined
      );

      if (activeSubcategory) {
        assetsOnly = assetsOnly.filter((asset) =>
          assetMatchesSubcategory(asset, activeSubcategory)
        );
        const start = (currentPage - 1) * pageSize;
        setTotalPages(Math.max(1, Math.ceil(assetsOnly.length / pageSize)));
        setAssets(assetsOnly.slice(start, start + pageSize));
      } else {
        setAssets(assetsOnly);
        setTotalPages(
          Math.max(
            1,
            Math.ceil((result.total || assetsOnly.length) / pageSize)
          )
        );
      }
    } catch (error) {
      console.error("Failed to load assets:", error);
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setCategoryFilter("all");
    setSubcategoryFilter("all");
    setStatusFilter("all");
    setDepartmentFilter("all");
    setCurrentPage(1);
  };

  // Subcategory options: use the selected category's predefined list, or a
  // de-duplicated union of all predefined subcategories when no category is set.
  const subcategoryOptions = (() => {
    if (categoryFilter && categoryFilter !== "all") {
      return getSubcategoriesForCategory(categoryFilter);
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

  // This is a requester page - show "Request Asset" by default
  // Only show "Add Asset" if user is in admin mode and has permissions
  const isAdminMode = userViewMode === "admin";
  const shouldShowAddAsset = isAdminMode && staff && permissions.canManageAssets(staff);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-primary-100 to-primary-200 rounded-xl">
                <Package className="w-8 h-8 text-primary-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Assets</h1>
                <p className="text-gray-600 text-lg mt-1">
                  Manage and track your organization's assets
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Use state for view mode, but default to user if not admin */}
              {shouldShowAddAsset ? (
                <Button
                  asChild
                  className="bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white shadow-lg hover:shadow-xl transition-all duration-300"
                >
                  <Link href="/admin/assets/new" className="flex items-center gap-2">
                    <Plus className="w-5 h-5" />
                    Add Asset
                  </Link>
                </Button>
              ) : (
                <Button
                  onClick={() => router.push("/requests/new?type=asset")}
                  className="bg-org-gradient hover:opacity-90 text-white shadow-lg hover:shadow-xl transition-all duration-300"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Request Asset
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <Filter className="w-5 h-5 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900">
              Search & Filter
            </h3>
          </div>

          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search Bar */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input
                  placeholder="Search assets..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 pr-4 py-2 border-gray-300 focus:border-primary-500 focus:ring-primary-500"
                />
              </div>
            </div>

            {/* Category Filter */}
            <div className="lg:w-48">
              <Select
                value={categoryFilter}
                onValueChange={(value) => {
                  setCategoryFilter(value);
                  setSubcategoryFilter("all");
                }}
              >
                <SelectTrigger className="border-gray-300 focus:border-primary-500 focus:ring-primary-500">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {Object.values(ENUMS.CATEGORY).map((category) => (
                    <SelectItem key={category} value={category}>
                      {formatCategory(category)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Subcategory Filter */}
            {subcategoryOptions.length > 0 && (
              <div className="lg:w-48">
                <Select
                  value={subcategoryFilter}
                  onValueChange={setSubcategoryFilter}
                >
                  <SelectTrigger className="border-gray-300 focus:border-primary-500 focus:ring-primary-500">
                    <SelectValue placeholder="Subcategory" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Subcategories</SelectItem>
                    {subcategoryOptions.map((sub) => (
                      <SelectItem key={sub.value} value={sub.value}>
                        {sub.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Status Filter */}
            <div className="lg:w-48">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="border-gray-300 focus:border-primary-500 focus:ring-primary-500">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.values(ENUMS.AVAILABLE_STATUS).map((status) => (
                    <SelectItem key={status} value={status}>
                      {status.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Department Filter */}
            <div className="lg:w-48">
              <Select
                value={departmentFilter}
                onValueChange={setDepartmentFilter}
              >
                <SelectTrigger className="border-gray-300 focus:border-primary-500 focus:ring-primary-500">
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept.$id} value={dept.$id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Clear Filters */}
            <Button
              variant="outline"
              onClick={clearFilters}
              className="text-gray-600 border-gray-300 hover:bg-gray-50"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Clear
            </Button>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center justify-end mb-6">
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
              onClick={() => handleViewModeChange("cards")}
              className={`h-8 px-3 rounded-full flex items-center gap-2 transition-all font-medium ${
                viewMode === "cards"
                  ? "bg-[var(--org-primary)] text-white shadow-sm hover:bg-[var(--org-primary)]/90"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              }`}
            >
              <Grid3X3 className="w-4 h-4" />
              <span className="hidden sm:inline">Cards</span>
            </Button>
          </div>
        </div>

        {/* Assets Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card
                key={i}
                className="animate-pulse bg-white border border-gray-200"
              >
                <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 rounded-t-lg"></div>
                <CardContent className="p-4">
                  <div className="h-4 bg-gray-200 rounded mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded mb-4"></div>
                  <div className="flex gap-2">
                    <div className="h-6 bg-gray-200 rounded w-16"></div>
                    <div className="h-6 bg-gray-200 rounded w-20"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : assets.length === 0 ? (
          <Card className="bg-white border border-gray-200">
            <CardContent className="text-center py-16">
              <div className="w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center mx-auto mb-6">
                <Package className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                No assets found
              </h3>
              <p className="text-gray-600 mb-8 text-lg">
                {search ||
                (categoryFilter && categoryFilter !== "all") ||
                (subcategoryFilter && subcategoryFilter !== "all") ||
                (statusFilter && statusFilter !== "all") ||
                (departmentFilter && departmentFilter !== "all")
                  ? "No assets match your current filters. Try adjusting your search criteria."
                  : shouldShowAddAsset
                  ? "Get started by adding your first asset."
                  : "No assets available. Contact your administrator to request assets."}
              </p>
              {shouldShowAddAsset ? (
                <Button
                  asChild
                  className="bg-org-gradient text-white shadow-lg hover:shadow-xl transition-transform duration-300 hover:-translate-y-0.5"
                >
                  <Link href="/admin/assets/new" className="flex items-center gap-2">
                    <Plus className="w-5 h-5" />
                    Add First Asset
                  </Link>
                </Button>
              ) : (
                <Button
                  onClick={() => router.push("/requests/new?type=asset")}
                  className="bg-org-gradient text-white shadow-lg hover:shadow-xl transition-transform duration-300 hover:-translate-y-0.5"
                >
                  <FileText className="w-5 h-5 mr-2" />
                  Request Asset
                </Button>
              )}
            </CardContent>
          </Card>
        ) : viewMode === "table" ? (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-x-auto">
            <Table>
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
                  <TableHead className="py-4 px-6 text-sm font-semibold text-gray-700">
                    Location
                  </TableHead>
                  <TableHead className="py-4 px-6 text-sm font-semibold text-gray-700 text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((asset) => (
                  <TableRow key={`${asset.$id}-table`} className="border-b">
                    <TableCell className="py-4 px-6">
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-900">
                          {asset.name}
                        </span>
                        {asset.serialNumber && (
                          <span className="text-sm text-gray-500">
                            S/N: {asset.serialNumber}
                          </span>
                        )}
                        <span className="text-xs text-gray-400 uppercase tracking-wide mt-1">
                          {asset.assetTag || "—"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-4 px-6">
                      <Badge className="bg-gray-100 text-gray-700 border-gray-200">
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
                    <TableCell className="py-4 px-6">
                      <div className="flex items-center gap-2 text-gray-600">
                        <MapPin className="h-4 w-4 text-red-600" />
                        <span>
                          {asset.locationName ||
                            asset.roomOrArea ||
                            "Not specified"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-3 text-sm">
                        <Button
                          asChild
                          type="button"
                          variant="outline"
                          className="inline-flex items-center gap-2 rounded-full border-gray-200 text-gray-600 hover:bg-gray-100"
                        >
                          <Link href={`/assets/${asset.$id}`}>
                            <Eye className="w-4 h-4" />
                            View
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {assets.map((asset) => {
              const imageUrls = assetImageService.getAssetImageUrls(
                asset.publicImages
              );
              const hasImages = imageUrls && imageUrls.length > 0;

              return (
                <Card
                  key={asset.$id}
                  className="bg-white border border-gray-200 hover:shadow-lg transition-all duration-300 overflow-hidden group"
                >
                  <CardContent className="p-0">
                    {/* Asset Image */}
                    {hasImages ? (
                      <div className="aspect-video relative overflow-hidden">
                        <img
                          src={imageUrls[0]}
                          alt={asset.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => {
                            e.target.style.display = "none";
                            e.target.nextSibling.style.display = "flex";
                          }}
                        />
                        <div className="hidden w-full h-full bg-gradient-to-br from-primary-100 to-primary-200 items-center justify-center">
                          <div className="text-center">
                            <div className="w-12 h-12 bg-primary-500 rounded-full flex items-center justify-center mx-auto mb-2">
                              <span className="text-white font-bold text-lg">
                                {asset.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <p className="text-primary-700 font-semibold text-sm">
                              Asset Image
                            </p>
                          </div>
                        </div>
                        {/* Image count badge */}
                        {imageUrls.length > 1 && (
                          <div className="absolute top-3 right-3 bg-black/80 text-white text-xs px-2 py-1 rounded-full backdrop-blur-sm">
                            +{imageUrls.length - 1}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                        <div className="text-center">
                          <div className="w-16 h-16 bg-gray-400 rounded-full flex items-center justify-center mx-auto mb-3">
                            <span className="text-white font-bold text-xl">
                              {asset.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <p className="text-gray-600 font-medium text-sm">
                            No Image
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="font-semibold text-gray-900 truncate flex-1 text-lg">
                          {asset.name}
                        </h3>
                        {asset.isPublic && (
                          <Badge
                            variant="outline"
                            className="ml-2 text-xs bg-gradient-to-r from-green-100 to-green-200 text-green-800 border-green-300"
                          >
                            Public
                          </Badge>
                        )}
                      </div>

                      <p className="text-sm text-gray-600 mb-4 font-medium">
                        {formatCategory(asset.category)}
                      </p>

                      <div className="flex flex-wrap gap-2 mb-4">
                        <Badge
                          className={`${getStatusBadgeColor(
                            asset.availableStatus
                          )} text-xs font-medium`}
                        >
                          {asset.availableStatus.replace(/_/g, " ")}
                        </Badge>
                        <Badge
                          className={`${getConditionBadgeColor(
                            asset.currentCondition
                          )} text-xs font-medium`}
                        >
                          {asset.currentCondition.replace(/_/g, " ")}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-600 mb-4">
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

                      <div className="flex items-center justify-between text-sm text-gray-500">
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-900">
                            {asset.assetTag || "—"}
                          </span>
                          <span className="text-xs uppercase tracking-wide">
                            Asset Tag
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            asChild
                            type="button"
                            variant="outline"
                            className="flex items-center gap-2 rounded-full border-gray-200 text-gray-600 hover:bg-gray-100"
                          >
                            <Link href={`/assets/${asset.$id}`}>
                              <Eye className="w-4 h-4" />
                              View
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}