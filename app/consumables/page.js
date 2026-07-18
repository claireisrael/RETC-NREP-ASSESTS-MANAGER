"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  assetsService,
  departmentsService,
  projectsService,
} from "../../lib/appwrite/provider.js";
import { ENUMS } from "../../lib/appwrite/config.js";
import { Query } from "appwrite";
import { getCurrentStaff } from "../../lib/utils/auth.js";
import { useToastContext } from "../../components/providers/toast-provider";
import {
  formatCategory,
  getCurrentStock,
  getMinStock,
  getConsumableStatus,
  getConsumableUnit,
  getConsumableCategory,
  getConsumableStatusBadgeColor,
} from "../../lib/utils/mappings.js";
import {
  Package,
  Search,
  Filter,
  Eye,
  List,
  Grid3X3,
  ShoppingCart,
} from "lucide-react";
import { useOrgTheme } from "../../components/providers/org-theme-provider";
import { PageLoading } from "../../components/ui/loading";
import {
  ListPagination,
  paginateItems,
} from "../../components/ui/list-pagination";

const ADMIN_PLACEHOLDER_PROJECT_ID = "ADMIN";
const PAGE_SIZE = 12;

export default function ConsumablesPage() {
  const router = useRouter();
  const toast = useToastContext();
  const [consumables, setConsumables] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentStaff, setCurrentStaff] = useState(null);
  const [viewMode, setViewMode] = useState("cards");
  const [currentPage, setCurrentPage] = useState(1);
  const { orgCode } = useOrgTheme();
  const normalizedOrgCode = (orgCode || "").toUpperCase();
  const isNrepOrg = normalizedOrgCode === "NREP";

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [scopeFilter, setScopeFilter] = useState("all"); // all | admin | projects

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedMode = window.localStorage.getItem("consumablesViewMode");
    if (storedMode === "cards" || storedMode === "table") {
      setViewMode(storedMode);
    }
  }, []);

  useEffect(() => {
    if (!orgCode) return;
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgCode]);

  const handleViewModeChange = (mode) => {
    if (mode === "table" || mode === "cards") {
      setViewMode(mode);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("consumablesViewMode", mode);
      }
    }
  };

  const loadData = async () => {
    try {
      const projectPromise = isNrepOrg
        ? projectsService.list([Query.orderAsc("name")])
        : Promise.resolve({ documents: [] });

      const [staff, deptResult, projectResult, consumablesResult] =
        await Promise.all([
          getCurrentStaff(),
          departmentsService.list(),
          projectPromise,
          assetsService.list([Query.orderDesc("$createdAt")]),
        ]);

      setCurrentStaff(staff);
      setDepartments(deptResult.documents);
      setProjects(projectResult.documents || []);

      // Filter showing consumables that are available (have stock > 0)
      const consumablesOnly = consumablesResult.documents.filter((item) => {
        if (item.itemType !== ENUMS.ITEM_TYPE.CONSUMABLE) return false;

        // Check if consumable has stock available
        const currentStock = getCurrentStock(item);
        return currentStock > 0;
      });

      setConsumables(consumablesOnly);
    } catch (error) {
      setError("Failed to load consumables");
      toast.error("Failed to load consumables. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    // Search is handled in the filteredConsumables calculation
    // This function is called when search input changes
  };

  const handleFilter = () => {
    // Filtering is handled in the filteredConsumables calculation
    // This function is called when filter dropdowns change
  };

  // Calculate filtered consumables
  const filteredConsumables = (consumables || []).filter((consumable) => {
    // Search filter
    if (
      searchQuery &&
      !consumable.name.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }

    // Category filter
    if (
      categoryFilter &&
      getConsumableCategory(consumable) !== categoryFilter
    ) {
      return false;
    }

    // Status filter
    if (statusFilter && getConsumableStatus(consumable) !== statusFilter) {
      return false;
    }

    // Department / project filter
    if (departmentFilter) {
      if (isNrepOrg) {
        const projectId = consumable.projectId || ADMIN_PLACEHOLDER_PROJECT_ID;
        if (departmentFilter === ADMIN_PLACEHOLDER_PROJECT_ID) {
          if (projectId !== ADMIN_PLACEHOLDER_PROJECT_ID) {
            return false;
          }
        } else if (projectId !== departmentFilter) {
          return false;
        }
      } else if (consumable.departmentId !== departmentFilter) {
        return false;
      }
    }

    // Scope: administrative vs project consumables (NREP)
    if (isNrepOrg && scopeFilter !== "all") {
      const isAdmin =
        !consumable.projectId ||
        consumable.projectId === ADMIN_PLACEHOLDER_PROJECT_ID;
      if (scopeFilter === "admin" && !isAdmin) return false;
      if (scopeFilter === "projects" && isAdmin) return false;
    }

    return true;
  });

  const getStatusBadge = (consumable) => {
    const status = getConsumableStatus(consumable);
    const statusText = status
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (l) => l.toUpperCase());

    return (
      <Badge className={getConsumableStatusBadgeColor(status)}>
        {statusText}
      </Badge>
    );
  };

  const getDepartmentName = useMemo(() => {
    const lookup = new Map();
    (departments || []).forEach((dept) => {
      if (!dept?.$id) return;
      lookup.set(dept.$id, dept.name || dept.title || dept.code || "");
    });
    return (departmentId) => {
      if (!departmentId) return "Not specified";
      return lookup.get(departmentId) || "Not specified";
    };
  }, [departments]);

  const getProjectName = useMemo(() => {
    const lookup = new Map();
    lookup.set(ADMIN_PLACEHOLDER_PROJECT_ID, "Administrative");
    (projects || []).forEach((project) => {
      if (!project?.$id) return;
      lookup.set(project.$id, project.name || project.title || project.code || "");
    });
    return (projectId) => {
      if (!projectId || projectId === ADMIN_PLACEHOLDER_PROJECT_ID) {
        return "Administrative";
      }
      return lookup.get(projectId) || "Unknown project";
    };
  }, [projects]);

  const isAdministrativeConsumable = (consumable) =>
    !consumable?.projectId ||
    consumable.projectId === ADMIN_PLACEHOLDER_PROJECT_ID;

  const getProjectBadge = (consumable) => {
    if (isAdministrativeConsumable(consumable)) {
      return {
        kind: "admin",
        label: "Administrative",
        detail: null,
      };
    }
    return {
      kind: "project",
      label: "Project",
      detail: getProjectName(consumable.projectId),
    };
  };

  const renderScopeBadge = (consumable) => {
    if (!isNrepOrg) return null;
    const badge = getProjectBadge(consumable);
    const isAdmin = badge.kind === "admin";
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${
          isAdmin
            ? "bg-[var(--org-accent)]/15 text-[var(--org-accent-dark)] border border-[var(--org-accent)]/35"
            : "bg-[var(--org-primary)]/10 text-[var(--org-primary-dark)] border border-[var(--org-primary)]/25"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            isAdmin ? "bg-[var(--org-accent)]" : "bg-[var(--org-primary)]"
          }`}
        />
        {isAdmin ? badge.label : `${badge.label} · ${badge.detail}`}
      </span>
    );
  };

  const goRequestConsumable = (consumableId) => {
    router.push(
      `/requests/new?type=consumable&itemId=${encodeURIComponent(consumableId)}`
    );
  };

  const scopeCounts = useMemo(() => {
    let admin = 0;
    let project = 0;
    (consumables || []).forEach((item) => {
      if (isAdministrativeConsumable(item)) admin += 1;
      else project += 1;
    });
    return { admin, project, total: admin + project };
  }, [consumables]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchQuery,
    categoryFilter,
    statusFilter,
    departmentFilter,
    scopeFilter,
  ]);

  const pagination = useMemo(
    () => paginateItems(filteredConsumables, currentPage, PAGE_SIZE),
    [filteredConsumables, currentPage]
  );
  const pagedConsumables = pagination.items;

  if (loading) {
    return <PageLoading message="Loading consumables..." />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "var(--org-background)" }}>
        <div className="text-center bg-white/90 backdrop-blur-md border border-gray-200/60 shadow-xl px-8 py-10 rounded-2xl">
          <div className="text-red-600 mb-4 font-semibold">Error loading consumables</div>
          <div className="text-gray-600 mb-6 max-w-sm">{error}</div>
          <Button onClick={() => loadData()} className="bg-org-gradient text-white shadow-md hover:shadow-lg">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-gray-900">Consumables</h1>
          <p className="text-gray-600">
            Browse and request consumable items
            {isNrepOrg && scopeCounts.total > 0 ? (
              <span className="text-gray-500">
                {" "}
                · {scopeCounts.admin} administrative · {scopeCounts.project}{" "}
                project
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => router.push("/requests/new?type=consumable")}
            variant="request"
            className="transition-transform hover:-translate-y-0.5"
          >
            <ShoppingCart className="w-4 h-4 mr-2" />
            Request Consumables
          </Button>
        </div>
      </div>

      {isNrepOrg && (
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: "all", label: `All (${scopeCounts.total})` },
            {
              id: "admin",
              label: `Administrative (${scopeCounts.admin})`,
            },
            {
              id: "projects",
              label: `By project (${scopeCounts.project})`,
            },
          ].map((chip) => (
            <Button
              key={chip.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setScopeFilter(chip.id)}
              className={`rounded-full ${
                scopeFilter === chip.id
                  ? "bg-[var(--org-primary)] text-white border-[var(--org-primary)] hover:bg-[var(--org-primary)]/90 hover:text-white"
                  : "border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {chip.label}
            </Button>
          ))}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search consumables..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All categories</SelectItem>
                  {Object.entries(ENUMS.CATEGORY).map(([key, value]) => (
                    <SelectItem key={key} value={value}>
                      {value
                        .replace(/_/g, " ")
                        .toLowerCase()
                        .replace(/\b\w/g, (l) => l.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All statuses</SelectItem>
                  {Object.entries(ENUMS.CONSUMABLE_STATUS).map(
                    ([key, value]) => (
                      <SelectItem key={key} value={value}>
                        {value
                          .replace(/_/g, " ")
                          .toLowerCase()
                          .replace(/\b\w/g, (l) => l.toUpperCase())}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {isNrepOrg ? "Project" : "Department"}
              </label>
              {isNrepOrg ? (
                <Select
                  value={departmentFilter}
                  onValueChange={setDepartmentFilter}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All projects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All projects</SelectItem>
                    <SelectItem value={ADMIN_PLACEHOLDER_PROJECT_ID}>
                      Administrative
                    </SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.$id} value={project.$id}>
                        {project.name || project.title || project.code || project.$id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select
                  value={departmentFilter}
                  onValueChange={setDepartmentFilter}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All departments" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All departments</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem key={dept.$id} value={dept.$id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <Button onClick={handleFilter} variant="outline">
              <Filter className="w-4 h-4 mr-2" />
              Apply Filters
            </Button>
          </div>
        </CardContent>
      </Card>

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

      {/* Consumables List — flat list; scope is controlled by filters only */}
      {filteredConsumables.length === 0 ? (
        <div className="text-center py-12">
          <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No consumables found
          </h3>
          <p className="text-gray-500">
            {searchQuery ||
            categoryFilter ||
            statusFilter ||
            departmentFilter ||
            scopeFilter !== "all"
              ? "Try adjusting your search or filter criteria."
              : "No consumables are currently available."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {viewMode === "table" ? (
            <div className="bg-white/90 backdrop-blur border border-gray-200 rounded-2xl shadow-md overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="py-4 px-6 text-sm font-semibold text-gray-700">
                        Consumable
                      </TableHead>
                      {isNrepOrg ? (
                        <TableHead className="py-4 px-6 text-sm font-semibold text-gray-700">
                          Scope
                        </TableHead>
                      ) : (
                        <TableHead className="py-4 px-6 text-sm font-semibold text-gray-700">
                          Department
                        </TableHead>
                      )}
                      <TableHead className="py-4 px-6 text-sm font-semibold text-gray-700">
                        Status
                      </TableHead>
                      <TableHead className="py-4 px-6 text-sm font-semibold text-gray-700">
                        Stock
                      </TableHead>
                      <TableHead className="py-4 px-6 text-sm font-semibold text-gray-700 text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedConsumables.map((consumable) => (
                      <TableRow
                        key={consumable.$id}
                        className="hover:bg-gray-50/70"
                      >
                        <TableCell className="py-4 px-6">
                          <div className="flex flex-col">
                            <span className="font-semibold text-gray-900">
                              {consumable.name}
                            </span>
                            <span className="text-xs text-gray-500">
                              {formatCategory(
                                getConsumableCategory(consumable)
                              )}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-4 px-6">
                          {isNrepOrg
                            ? renderScopeBadge(consumable)
                            : getDepartmentName(consumable.departmentId)}
                        </TableCell>
                        <TableCell className="py-4 px-6">
                          {getStatusBadge(consumable)}
                        </TableCell>
                        <TableCell className="py-4 px-6">
                          <span className="font-semibold text-gray-900">
                            {getCurrentStock(consumable)}{" "}
                            {getConsumableUnit(consumable)?.toLowerCase()}
                          </span>
                        </TableCell>
                        <TableCell className="py-4 px-6 text-right">
                          <div className="inline-flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() =>
                                router.push(`/consumables/${consumable.$id}`)
                              }
                              className="inline-flex items-center gap-2 border-gray-200"
                            >
                              <Eye className="w-4 h-4" />
                              View
                            </Button>
                            <Button
                              type="button"
                              variant="request"
                              onClick={() =>
                                goRequestConsumable(consumable.$id)
                              }
                              className="inline-flex items-center gap-2"
                            >
                              <ShoppingCart className="w-4 h-4" />
                              Request
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {pagedConsumables.map((consumable) => (
                <Card
                  key={consumable.$id}
                  className="bg-white border border-gray-200/90 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden"
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-gray-900 text-base leading-snug line-clamp-2">
                        {consumable.name}
                      </h3>
                      {getStatusBadge(consumable)}
                    </div>

                    {isNrepOrg && renderScopeBadge(consumable)}

                    <p className="text-sm text-gray-600">
                      <span className="font-semibold text-gray-900">
                        {getCurrentStock(consumable)}
                      </span>{" "}
                      {getConsumableUnit(consumable)?.toLowerCase()}
                      {getMinStock(consumable) > 0 ? (
                        <span className="text-gray-400">
                          {" "}
                          · min {getMinStock(consumable)}
                        </span>
                      ) : null}
                    </p>

                    <div className="flex gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          router.push(`/consumables/${consumable.$id}`)
                        }
                        className="flex-1 border-gray-200 text-gray-700"
                      >
                        <Eye className="w-4 h-4 mr-1.5" />
                        View
                      </Button>
                      <Button
                        type="button"
                        variant="request"
                        onClick={() => goRequestConsumable(consumable.$id)}
                        className="flex-1"
                      >
                        <ShoppingCart className="w-4 h-4 mr-1.5" />
                        Request
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <ListPagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            pageSize={PAGE_SIZE}
            onPageChange={setCurrentPage}
            itemLabel="consumables"
          />
        </div>
      )}
    </div>
  );
}