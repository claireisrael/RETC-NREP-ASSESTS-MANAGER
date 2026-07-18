"use client";

import { useState, useEffect } from "react";
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
  Clock,
  Package,
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
import { assetImageService } from "../../lib/appwrite/image-service.js";
import { getCurrentStaff } from "../../lib/utils/auth.js";
import { ENUMS } from "../../lib/appwrite/config.js";
import { useOrgTheme } from "../../components/providers/org-theme-provider";
import {
  aggregateResolvedItems,
  formatItemQuantityLabel,
} from "../../lib/utils/requested-items.js";
import { Query } from "appwrite";
import { PageLoading } from "../../components/ui/loading";
import { formatCategory, hexToRgba, getConsumableStatus } from "../../lib/utils/mappings.js";

export default function MyRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const { theme } = useOrgTheme();
  const primaryColor = theme?.colors?.primary || "#0E6370";
  const accentColor = theme?.colors?.accent || primaryColor;
  const gradientFrom = theme?.colors?.gradientFrom || `${primaryColor}d9`;
  const gradientTo = theme?.colors?.gradientTo || `${accentColor}b3`;
  const highlightColor = theme?.colors?.highlight || "#f7901e";
  const highlightSoft = hexToRgba(highlightColor, 0.12);
  const highlightBorder = hexToRgba(highlightColor, 0.35);
  const highlightBadge = `linear-gradient(135deg, ${hexToRgba(
    highlightColor,
    0.18
  )}, ${hexToRgba(primaryColor, 0.07)})`;

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (staff) {
      loadRequests();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff, statusFilter, searchTerm, dateFilter]);

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
  const formatDateTime = (dateString) => new Date(dateString).toLocaleString();

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
              className="bg-org-gradient text-white shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:scale-105 w-full sm:w-auto"
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
        {requests.length === 0 ? (
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
          <div className="space-y-6">
            {requests.map((request) => {
              const StatusIcon = getStatusIcon(request.status);
              return (
                <Card
                  key={request.$id}
                  className="bg-white/90 backdrop-blur-sm border border-gray-200/60 hover:shadow-2xl hover:scale-105 transition-all duration-500 group cursor-pointer animate-in fade-in slide-in-from-bottom-4 rounded-2xl"
                >
                  <CardContent className="p-4 sm:p-6 lg:p-8">
                    <div className="space-y-4">
                      {/* Header with mobile-optimized layout */}
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                          <h3 className="text-lg sm:text-xl font-bold text-gray-900 group-hover:text-[var(--org-primary)] transition-colors duration-300">
                            Request #{request.$id.slice(-8)}
                          </h3>
                          <Badge
                            className={`${getStatusBadgeColor(
                              request.status
                            )} shadow-md w-fit`}
                          >
                            <StatusIcon className="w-3 h-3 mr-1" />
                            <span className="text-xs sm:text-sm">
                              {request.status.replace(/_/g, " ")}
                            </span>
                          </Badge>
                        </div>
                      </div>

                      {/* Purpose */}
                      <p className="text-gray-700 text-base sm:text-lg font-medium">
                        {request.purpose}
                      </p>

                      {/* Mobile-optimized date information */}
                      <div className="space-y-2 bg-gray-50/50 rounded-xl p-3">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Calendar className="w-4 h-4 text-[var(--org-primary)] flex-shrink-0" />
                          <span className="truncate">
                            <strong>Created:</strong>{" "}
                            {formatDate(request.$createdAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Clock className="w-4 h-4 text-sidebar-600 flex-shrink-0" />
                          <span className="truncate">
                            <strong>Issue:</strong>{" "}
                            {formatDate(request.issueDate)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Clock className="w-4 h-4 text-primary-600 flex-shrink-0" />
                          <span className="truncate">
                            <strong>Return:</strong>{" "}
                            {formatDate(request.expectedReturnDate)}
                          </span>
                        </div>
                      </div>

                      {/* Requested Items — name × quantity */}
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <Package className="w-5 h-5 text-primary-600" />
                          <span className="text-base font-semibold text-gray-700">
                            Requested Items (
                            {
                              aggregateResolvedItems(request.assets || [])
                                .length
                            }
                            )
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {aggregateResolvedItems(request.assets || []).map(
                            ({ item, quantity, id }) => (
                              <Badge
                                key={id}
                                className="text-sm border px-3 py-1.5 shadow-sm"
                                style={{
                                  background: highlightSoft,
                                  borderColor: highlightBorder,
                                  color: highlightColor,
                                }}
                              >
                                {formatItemQuantityLabel(item, quantity)}
                              </Badge>
                            )
                          )}
                          {(request.assets || []).length === 0 && (
                            <span className="text-sm text-gray-500">
                              No items specified
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Decision Notes */}
                      {request.decisionNotes && (
                        <div className="bg-gradient-to-r from-gray-50 to-primary-50/30 rounded-xl p-4 border border-gray-200/60">
                          <p className="text-sm text-gray-700">
                            <strong className="text-primary-700">Notes:</strong>{" "}
                            {request.decisionNotes}
                          </p>
                        </div>
                      )}

                      {/* Mobile-optimized Actions */}
                      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                        <Button
                          asChild
                          size="sm"
                          className="bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 flex-1 sm:flex-none"
                        >
                          <Link
                            href={`/requests/${request.$id}`}
                            className="flex items-center justify-center gap-2"
                          >
                            <Eye className="w-4 h-4" />
                            <span className="hidden sm:inline">View</span>
                            <span className="sm:hidden">View Details</span>
                          </Link>
                        </Button>
                        {request.status === ENUMS.REQUEST_STATUS.PENDING && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 border-2 border-red-300 hover:bg-gradient-to-r hover:from-red-50 hover:to-red-100 hover:border-red-400 shadow-sm hover:shadow-md transition-all duration-300 flex-1 sm:flex-none"
                          >
                            <X className="w-4 h-4 mr-1" />
                            <span className="hidden sm:inline">Cancel</span>
                            <span className="sm:hidden">Cancel Request</span>
                          </Button>
                        )}
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
