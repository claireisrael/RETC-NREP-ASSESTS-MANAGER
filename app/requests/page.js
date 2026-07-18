"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Input } from "../../components/ui/input";
import {
  FileText,
  Plus,
  Search,
  Filter,
  Calendar,
  CheckCircle,
  XCircle,
  AlertCircle,
  Pause,
  RefreshCw,
  Eye,
  X,
} from "lucide-react";
import {
  assetRequestsService,
  assetsService,
} from "../../lib/appwrite/provider.js";
import { getCurrentStaff } from "../../lib/utils/auth.js";
import { ENUMS } from "../../lib/appwrite/config.js";
import { useOrgTheme } from "../../components/providers/org-theme-provider";
import {
  aggregateResolvedItems,
  formatItemQuantityLabel,
  summarizeRequestPurpose,
  formatRequestDateRange,
} from "../../lib/utils/requested-items.js";
import { Query } from "appwrite";
import { PageLoading } from "../../components/ui/loading";
import { hexToRgba } from "../../lib/utils/mappings.js";
import {
  ListPagination,
  paginateItems,
} from "../../components/ui/list-pagination";

const PAGE_SIZE = 12;

export default function MyRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const { theme } = useOrgTheme();
  const highlightColor =
    theme?.colors?.highlight || theme?.colors?.accent || "#EFA74F";
  const highlightSoft = hexToRgba(highlightColor, 0.12);
  const highlightBorder = hexToRgba(highlightColor, 0.35);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (staff) {
      loadRequests();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff, statusFilter, searchTerm, dateFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchTerm, dateFilter]);

  const loadData = async () => {
    try {
      const currentStaff = await getCurrentStaff();
      setStaff(currentStaff);
    } catch (error) {
      // Silent fail for staff data loading
    }
  };

  const loadRequests = async () => {
    setLoading(true);
    try {
      const queries = [
        Query.equal("requesterStaffId", staff.$id),
        Query.orderDesc("$createdAt"),
      ];

      if (statusFilter !== "all") {
        queries.push(Query.equal("status", statusFilter));
      }

      // Add date filtering
      if (dateFilter !== "all") {
        const now = new Date();
        const startOfDay = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate()
        );

        switch (dateFilter) {
          case "today":
            queries.push(
              Query.greaterThanEqual("$createdAt", startOfDay.toISOString())
            );
            break;
          case "week":
            const weekAgo = new Date(startOfDay);
            weekAgo.setDate(weekAgo.getDate() - 7);
            queries.push(
              Query.greaterThanEqual("$createdAt", weekAgo.toISOString())
            );
            break;
          case "month":
            const monthAgo = new Date(startOfDay);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            queries.push(
              Query.greaterThanEqual("$createdAt", monthAgo.toISOString())
            );
            break;
        }
      }

      const result = await assetRequestsService.list(queries);

      // Load asset details for each request
      let requestsWithAssets = await Promise.all(
        result.documents.map(async (request) => {
          try {
            const assets = await Promise.all(
              request.requestedItems.map(async (itemId) => {
                try {
                  return await assetsService.get(itemId);
                } catch {
                  return { name: "Asset not found", $id: itemId };
                }
              })
            );
            return { ...request, assets };
          } catch {
            return { ...request, assets: [] };
          }
        })
      );

      // Apply search filtering
      if (searchTerm) {
        requestsWithAssets = requestsWithAssets.filter((request) => {
          const searchLower = searchTerm.toLowerCase();
          return (
            request.purpose?.toLowerCase().includes(searchLower) ||
            request.assets.some((asset) =>
              asset.name?.toLowerCase().includes(searchLower)
            ) ||
            request.$id.toLowerCase().includes(searchLower)
          );
        });
      }

      setRequests(requestsWithAssets);
    } catch (error) {
      // Silent fail for requests loading
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeColor = (status) => {
    const colors = {
      [ENUMS.REQUEST_STATUS.PENDING]:
        "bg-gradient-to-r from-yellow-100 to-yellow-200 text-yellow-800 border-yellow-300",
      [ENUMS.REQUEST_STATUS.APPROVED]:
        "bg-gradient-to-r from-primary-100 to-primary-200 text-primary-800 border-primary-300",
      [ENUMS.REQUEST_STATUS.DENIED]:
        "bg-gradient-to-r from-red-100 to-red-200 text-red-800 border-red-300",
      [ENUMS.REQUEST_STATUS.CANCELLED]:
        "bg-gradient-to-r from-gray-100 to-gray-200 text-gray-800 border-gray-300",
      [ENUMS.REQUEST_STATUS.FULFILLED]:
        "bg-gradient-to-r from-sidebar-100 to-sidebar-200 text-sidebar-800 border-sidebar-300",
    };
    return (
      colors[status] ||
      "bg-gradient-to-r from-gray-100 to-gray-200 text-gray-800 border-gray-300"
    );
  };


  const getStatusIcon = (status) => {
    const icons = {
      [ENUMS.REQUEST_STATUS.PENDING]: Pause,
      [ENUMS.REQUEST_STATUS.APPROVED]: CheckCircle,
      [ENUMS.REQUEST_STATUS.DENIED]: XCircle,
      [ENUMS.REQUEST_STATUS.CANCELLED]: X,
      [ENUMS.REQUEST_STATUS.FULFILLED]: CheckCircle,
    };
    return icons[status] || AlertCircle;
  };

  // Helper functions for cleaner code
  const formatDate = (dateString) => new Date(dateString).toLocaleDateString();

  const clearFilters = () => {
    setStatusFilter("all");
    setSearchTerm("");
    setDateFilter("all");
  };

  // Filter requests based on current filters
  const getFilteredRequests = () => {
    return requests.filter((request) => {
      const matchesSearch =
        !searchTerm ||
        request.purpose?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        request.assetName?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || request.status === statusFilter;

      const matchesDate =
        dateFilter === "all" ||
        (() => {
          const requestDate = new Date(request.$createdAt);
          const now = new Date();
          const startOfDay = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
          );

          switch (dateFilter) {
            case "today":
              return requestDate >= startOfDay;
            case "week":
              const weekAgo = new Date(startOfDay);
              weekAgo.setDate(weekAgo.getDate() - 7);
              return requestDate >= weekAgo;
            case "month":
              const monthAgo = new Date(startOfDay);
              monthAgo.setMonth(monthAgo.getMonth() - 1);
              return requestDate >= monthAgo;
            default:
              return true;
          }
        })();

      return matchesSearch && matchesStatus && matchesDate;
    });
  };

  const filteredRequests = getFilteredRequests();
  const pagination = useMemo(
    () => paginateItems(filteredRequests, currentPage, PAGE_SIZE),
    [filteredRequests, currentPage]
  );
  const pagedRequests = pagination.items;

  if (loading) {
    return <PageLoading message="Loading your requests..." />;
  }

  return (
    <div
      className="min-h-screen"
      style={{ background: theme?.colors?.background || "#f5f5f5" }}
    >
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Mobile-optimized Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-gray-900 via-[var(--org-primary)] to-[var(--org-accent)] bg-clip-text text-transparent">
                My Requests
              </h1>
              <p className="text-gray-700 text-base sm:text-lg mt-1 sm:mt-2 font-medium">
                Track your asset requests and their status
              </p>
            </div>
            <Button
              asChild
              variant="request"
              className="shadow-xl hover:shadow-2xl transition-all duration-300 w-full sm:w-auto"
            >
              <Link
                href="/requests/new?type=asset"
                className="flex items-center justify-center space-x-2"
              >
                <Plus className="w-5 h-5" />
                <span>New Request</span>
              </Link>
            </Button>
          </div>
        </div>
        {/* Mobile-optimized Filter Section */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl border border-gray-200/60 p-4 sm:p-6 mb-6 sm:mb-8 relative z-10">
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 group-hover:text-primary-500 w-5 h-5 transition-colors duration-300" />
              <Input
                placeholder="Search requests..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-3 border-2 border-gray-300 focus:border-[var(--org-primary)] focus:ring-4 focus:ring-[var(--org-primary)]/20 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 w-full"
              />
            </div>

            {/* Filters Row */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              {/* Status Filter */}
              <div className="flex-1 sm:flex-none sm:w-48">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="border-2 border-gray-300 focus:border-[var(--org-primary)] focus:ring-4 focus:ring-[var(--org-primary)]/20 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 w-full">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {Object.values(ENUMS.REQUEST_STATUS).map((status) => (
                      <SelectItem key={status} value={status}>
                        {status.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date Filter */}
              <div className="flex-1 sm:flex-none sm:w-48">
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger className="border-2 border-gray-300 focus:border-[var(--org-primary)] focus:ring-4 focus:ring-[var(--org-primary)]/20 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 w-full">
                    <SelectValue placeholder="All Time" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">Last 7 Days</SelectItem>
                    <SelectItem value="month">Last 30 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Clear Filters Button */}
              <Button
                variant="outline"
                onClick={clearFilters}
                className="text-gray-600 border-2 border-gray-300 hover:bg-gradient-to-r hover:from-gray-50 hover:to-[var(--org-primary)]/10 hover:border-[var(--org-primary)]/30 hover:text-[var(--org-primary)] rounded-xl shadow-sm hover:shadow-md transition-all duration-300 flex items-center justify-center gap-2 w-full sm:w-auto"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">Clear</span>
                <span className="sm:hidden">Clear Filters</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Requests List */}
        {filteredRequests.length === 0 ? (
          <Card className="bg-white/90 backdrop-blur-sm border border-gray-200/60 shadow-xl rounded-2xl">
            <CardContent className="text-center py-16">
              <div className="w-20 h-20 bg-gradient-to-br from-primary-100 to-sidebar-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <FileText className="w-10 h-10 text-primary-600" />
              </div>
              <h3 className="text-2xl font-bold bg-gradient-to-r from-gray-900 via-primary-700 to-sidebar-700 bg-clip-text text-transparent mb-3">
                No requests found
              </h3>
              <p className="text-gray-600 mb-8 text-lg">
                {statusFilter !== "all" || searchTerm || dateFilter !== "all"
                  ? "No requests match your current filters."
                  : "You haven't made any asset requests yet."}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  asChild
                  className="bg-gradient-to-r from-primary-600 via-primary-700 to-sidebar-600 hover:from-primary-700 hover:via-sidebar-600 hover:to-primary-800 text-white shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                >
                  <Link
                    href="/requests/new?type=asset"
                    className="flex items-center space-x-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create Request</span>
                  </Link>
                </Button>
                {(statusFilter !== "all" ||
                  searchTerm ||
                  dateFilter !== "all") && (
                  <Button
                    variant="outline"
                    onClick={clearFilters}
                    className="text-gray-600 border-2 border-gray-300 hover:bg-gradient-to-r hover:from-gray-50 hover:to-primary-50 hover:border-primary-300 hover:text-primary-700 rounded-xl shadow-sm hover:shadow-md transition-all duration-300"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Clear Filters
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {pagedRequests.map((request) => {
              const StatusIcon = getStatusIcon(request.status);
              const aggregated = aggregateResolvedItems(request.assets || []);
              const purposeSummary = summarizeRequestPurpose(request.purpose);
              const dateRange = formatRequestDateRange(
                request.issueDate,
                request.expectedReturnDate,
                formatDate
              );
              const decisionNote =
                request.decisionNotes &&
                String(request.decisionNotes).trim().length > 0
                  ? String(request.decisionNotes).trim().length > 100
                    ? `${String(request.decisionNotes).trim().slice(0, 99)}…`
                    : String(request.decisionNotes).trim()
                  : null;

              return (
                <Card
                  key={request.$id}
                  className="bg-white border border-gray-200/80 shadow-sm hover:shadow-md transition-shadow duration-200 rounded-xl"
                >
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-gray-900">
                            Request #{request.$id.slice(-8)}
                          </h3>
                          <Badge
                            className={`${getStatusBadgeColor(
                              request.status
                            )} shadow-none`}
                          >
                            <StatusIcon className="w-3 h-3 mr-1" />
                            <span className="text-xs">
                              {request.status.replace(/_/g, " ")}
                            </span>
                          </Badge>
                          <span className="text-xs text-gray-500">
                            Created {formatDate(request.$createdAt)}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {aggregated.length > 0 ? (
                            aggregated.slice(0, 4).map(({ item, quantity, id }) => (
                              <Badge
                                key={id}
                                className="text-xs border px-2 py-0.5 font-medium"
                                style={{
                                  background: highlightSoft,
                                  borderColor: highlightBorder,
                                  color: highlightColor,
                                }}
                              >
                                {formatItemQuantityLabel(item, quantity)}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-gray-500">
                              No items specified
                            </span>
                          )}
                          {aggregated.length > 4 ? (
                            <Badge variant="secondary" className="text-xs">
                              +{aggregated.length - 4} more
                            </Badge>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                          {dateRange ? (
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-[var(--org-primary)]" />
                              {dateRange}
                            </span>
                          ) : null}
                          {purposeSummary ? (
                            <span className="truncate max-w-full sm:max-w-md text-gray-600">
                              {purposeSummary}
                            </span>
                          ) : null}
                        </div>

                        {decisionNote ? (
                          <p className="text-xs text-gray-600 line-clamp-1">
                            <span className="font-medium text-gray-700">
                              Notes:
                            </span>{" "}
                            {decisionNote}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex sm:flex-col gap-2 shrink-0">
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={`/requests/${request.$id}`}
                            className="flex items-center justify-center gap-1.5"
                          >
                            <Eye className="w-4 h-4" />
                            View
                          </Link>
                        </Button>
                        {request.status === ENUMS.REQUEST_STATUS.PENDING && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 border-red-200 hover:bg-red-50"
                          >
                            <X className="w-4 h-4 mr-1" />
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            <ListPagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
              itemLabel="requests"
            />
          </div>
        )}
      </div>
    </div>
  );
}
