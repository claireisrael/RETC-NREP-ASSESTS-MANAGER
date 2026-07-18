"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Progress } from "../../components/ui/progress";
import {
  Package,
  Clock,
  AlertTriangle,
  Activity,
  FileText,
  RefreshCw,
  Calendar,
  ShoppingCart,
  CheckCircle2,
  XCircle,
  Zap,
  TrendingUp,
  Eye,
  Send,
  Search,
} from "lucide-react";
import { getCurrentStaff } from "../../lib/utils/auth.js";
import {
  assetsService,
  assetRequestsService,
} from "../../lib/appwrite/provider.js";
import { Query } from "appwrite";
import { ENUMS } from "../../lib/appwrite/config.js";
import {
  getConsumableStatus,
  getCurrentStock,
  getMinStock,
} from "../../lib/utils/mappings.js";

export default function DashboardPage() {
  const [staff, setStaff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [error, setError] = useState(null);
  const [dashboardData, setDashboardData] = useState({
    totalAssets: 0,
    availableAssets: 0,
    myRequests: 0,
    pendingRequests: 0,
    approvedRequests: 0,
    rejectedRequests: 0,
    fulfilledRequests: 0,
    totalConsumables: 0,
    inStockConsumables: 0,
    lowStockConsumables: 0,
    recentRequests: [],
    recentAssets: [],
  });

  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setRefreshing(true);
      const currentStaff = await getCurrentStaff();
      setStaff(currentStaff);

      if (!currentStaff) {
        setError("Not authenticated");
        return;
      }

      const [assetsResponse, requestsResponse] = await Promise.all([
        assetsService.list(),
        assetRequestsService.list([Query.orderDesc("$createdAt")]),
      ]);

      const assets = assetsResponse.documents || [];
      const requests = requestsResponse.documents || [];

      const myRequests = requests.filter(
        (request) => request.requesterStaffId === currentStaff.$id
      );

      // Filter assets and consumables
      const assetsOnly = assets.filter(
        (item) =>
          item.itemType === ENUMS.ITEM_TYPE.ASSET ||
          !item.itemType ||
          item.itemType === undefined
      );

      const consumablesOnly = assets.filter(
        (item) => item.itemType === ENUMS.ITEM_TYPE.CONSUMABLE
      );

      const totalAssets = assetsOnly.length;
      const availableAssets = assetsOnly.filter(
        (asset) => asset.availableStatus === ENUMS.AVAILABLE_STATUS.AVAILABLE
      ).length;
      const myRequestsCount = myRequests.length;

      const statusCounts = myRequests.reduce(
        (acc, request) => {
          const rawStatus = (request.status || "").toString();
          const normalized = rawStatus.trim().toUpperCase();

          const trackUnknown = () => acc._unknown.add(normalized || "(empty)");

          if (
            normalized === ENUMS.REQUEST_STATUS.PENDING ||
            normalized.startsWith("PEND") ||
            normalized.includes("AWAIT")
          ) {
            acc.pending += 1;
          } else if (
            normalized === ENUMS.REQUEST_STATUS.APPROVED ||
            normalized.startsWith("APPROV") ||
            normalized.includes("READY")
          ) {
            acc.approved += 1;
          } else if (
            normalized === ENUMS.REQUEST_STATUS.FULFILLED ||
            normalized.startsWith("FULFILL") ||
            normalized.startsWith("ISSUED") ||
            normalized.includes("ISSUE") ||
            normalized.startsWith("COMPLETE") ||
            normalized.includes("RETURNED")
          ) {
            acc.fulfilled += 1;
            // Fulfilled requests were approved earlier; reflect that in the summary
            acc.approved += 1;
          } else if (
            normalized === ENUMS.REQUEST_STATUS.DENIED ||
            normalized.startsWith("DENIED") ||
            normalized.startsWith("REJECT") ||
            normalized.includes("DECLINE")
          ) {
            acc.rejected += 1;
          } else if (
            normalized === ENUMS.REQUEST_STATUS.CANCELLED ||
            normalized.startsWith("CANCEL")
          ) {
            acc.cancelled += 1;
          } else {
            trackUnknown();
          }

          return acc;
        },
        {
          pending: 0,
          approved: 0,
          fulfilled: 0,
          rejected: 0,
          cancelled: 0,
          _unknown: new Set(),
        }
      );

      const rawStatusTallies = myRequests.reduce((acc, request) => {
        const key = (request.status || "").toString();
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      if (statusCounts._unknown.size > 0) {
        console.warn(
          "[Dashboard] Unmapped request statuses:",
          Array.from(statusCounts._unknown),
          "All status tallies:",
          rawStatusTallies
        );
      } else {
        console.debug("[Dashboard] Request status tallies:", rawStatusTallies);
      }

      const totalConsumables = consumablesOnly.length;

      // Calculate consumable stock status
      const inStockConsumables = consumablesOnly.filter(
        (c) => getConsumableStatus(c) === ENUMS.CONSUMABLE_STATUS.IN_STOCK
      ).length;
      const lowStockConsumables = consumablesOnly.filter(
        (c) => getConsumableStatus(c) === ENUMS.CONSUMABLE_STATUS.LOW_STOCK
      ).length;

      // Process recent requests with asset names
      const recentRequestsWithAssets = await Promise.all(
        myRequests
          .sort((a, b) => new Date(b.$createdAt) - new Date(a.$createdAt))
          .slice(0, 5)
          .map(async (request) => {
            try {
              const assetNames = await Promise.all(
                request.requestedItems.map(async (assetId) => {
                  try {
                    const asset = await assetsService.get(assetId);
                    return asset.name;
                  } catch (error) {
                    return "Unknown Asset";
                  }
                })
              );

              return {
                ...request,
                assetNames: assetNames.join(", "),
                itemCount: request.requestedItems.length,
              };
            } catch (error) {
              return {
                ...request,
                assetNames: "Unknown Assets",
                itemCount: request.requestedItems?.length || 0,
              };
            }
          })
      );

      const recentAssets = assetsOnly
        .filter((a) => a.availableStatus === ENUMS.AVAILABLE_STATUS.AVAILABLE)
        .sort((a, b) => new Date(b.$createdAt) - new Date(a.$createdAt))
        .slice(0, 6);

      setDashboardData({
        totalAssets,
        availableAssets,
        myRequests: myRequestsCount,
        pendingRequests: statusCounts.pending,
        approvedRequests: statusCounts.approved,
        rejectedRequests: statusCounts.rejected,
        fulfilledRequests: statusCounts.fulfilled,
        totalConsumables,
        inStockConsumables,
        lowStockConsumables,
        recentRequests: recentRequestsWithAssets,
        recentAssets,
      });

      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error("Error loading dashboard data:", err);
      setError(
        `Failed to load dashboard data: ${err.message || err.toString()}`
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusBadgeColor = (status) => {
    switch (status) {
      case ENUMS.REQUEST_STATUS.PENDING:
        return "highlight";
      case ENUMS.REQUEST_STATUS.APPROVED:
        return "primary";
      case ENUMS.REQUEST_STATUS.REJECTED:
        return "danger";
      case ENUMS.REQUEST_STATUS.FULFILLED:
        return "accent";
      default:
        return "neutral";
    }
  };

  const Pill = ({ tone = "primary", className = "", children }) => {
    const toneClasses = {
      primary: "bg-org-primary-soft text-org-primary",
      accent: "bg-org-accent-soft text-org-accent",
      highlight: "bg-org-highlight-soft text-org-highlight",
      neutral: "badge-neutral",
      success: "bg-emerald-100 text-emerald-700",
      danger: "bg-red-100 text-red-700",
      info: "bg-sky-100 text-sky-700",
    };

    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border border-transparent ${
          toneClasses[tone] || toneClasses.primary
        } ${className}`.trim()}
      >
        {children}
      </span>
    );
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case ENUMS.REQUEST_STATUS.PENDING:
        return <Clock className="w-3 h-3" />;
      case ENUMS.REQUEST_STATUS.APPROVED:
        return <CheckCircle2 className="w-3 h-3" />;
      case ENUMS.REQUEST_STATUS.REJECTED:
        return <XCircle className="w-3 h-3" />;
      case ENUMS.REQUEST_STATUS.FULFILLED:
        return <Zap className="w-3 h-3" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-slate-200 border-t-[var(--org-primary)] rounded-full animate-spin"></div>
        </div>
        <p className="mt-4 text-slate-600 font-medium">Loading Dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Card className="w-full max-w-md border-red-200">
          <CardHeader className="border-b border-red-100">
            <CardTitle className="text-red-700 flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2" />
              Error Loading Dashboard
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <p className="text-red-600 mb-4">{error}</p>
            <Button
              onClick={loadDashboardData}
              className="w-full bg-red-600 hover:bg-red-700"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Clean Header */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center space-y-4 lg:space-y-0">
            <div className="space-y-1">
              {staff && (
                <h1 className="text-3xl font-bold text-slate-900">
                  {getTimeBasedGreeting()}, <span className="text-org-primary">{staff.name}</span>!
                </h1>
              )}
              <p className="text-slate-600">
                Welcome to your asset management dashboard
              </p>
              <div className="flex items-center space-x-2 text-sm text-slate-500">
                <Calendar className="w-4 h-4" />
                <span>Last updated: {lastUpdated.toLocaleTimeString()}</span>
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span>Live</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={loadDashboardData}
                variant="outline"
                disabled={refreshing}
                className="h-10 px-4 border-[var(--org-primary)] text-org-primary hover:bg-org-primary-soft"
              >
                <RefreshCw
                  className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Available Assets */}
          <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-lg bg-org-primary-soft text-org-primary">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <Pill tone="primary">Available</Pill>
              </div>
              <div className="space-y-2">
                <h3 className="text-3xl font-bold text-slate-900">
                  {dashboardData.availableAssets}
                </h3>
                <p className="text-sm font-medium text-slate-600">
                  Assets Ready
                </p>
                <p className="text-xs text-slate-500">
                  Out of {dashboardData.totalAssets} total
                </p>
              </div>
            </CardContent>
          </Card>

          {/* My Requests */}
          <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-lg bg-org-accent-soft text-org-accent">
                  <FileText className="h-6 w-6" />
                </div>
                <Pill tone="accent">Requests</Pill>
              </div>
              <div className="space-y-2">
                <h3 className="text-3xl font-bold text-slate-900">
                  {dashboardData.myRequests}
                </h3>
                <p className="text-sm font-medium text-slate-600">
                  My Requests
                </p>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="w-full mt-2"
                >
                  <Link href="/requests">View All →</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Pending Requests */}
          <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-lg bg-org-highlight-soft text-org-highlight">
                  <Clock className="h-6 w-6" />
                </div>
                <Pill tone="highlight">Pending</Pill>
              </div>
              <div className="space-y-2">
                <h3 className="text-3xl font-bold text-slate-900">
                  {dashboardData.pendingRequests}
                </h3>
                <p className="text-sm font-medium text-slate-600">
                  Awaiting Approval
                </p>
                <p className="text-xs text-slate-500">
                  {dashboardData.approvedRequests} approved
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Consumables */}
          <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-lg bg-org-accent-soft text-org-accent">
                  <ShoppingCart className="h-6 w-6" />
                </div>
                <Pill tone="accent">Stock</Pill>
              </div>
              <div className="space-y-2">
                <h3 className="text-3xl font-bold text-slate-900">
                  {dashboardData.totalConsumables}
                </h3>
                <p className="text-sm font-medium text-slate-600">
                  Consumables
                </p>
                <p className="text-xs text-slate-500">
                  {dashboardData.inStockConsumables} in stock
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Request Status Progress */}
        {dashboardData.myRequests > 0 && (
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                <CardTitle className="text-lg font-semibold text-slate-900">
                  Request Status Summary
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    label: "Pending",
                    value: dashboardData.pendingRequests,
                    color: "text-orange-700",
                    bar: "bg-orange-500",
                  },
                  {
                    label: "Approved",
                    value: dashboardData.approvedRequests,
                    color: "text-green-700",
                    bar: "bg-green-500",
                  },
                  {
                    label: "Fulfilled",
                    value: dashboardData.fulfilledRequests,
                    color: "text-blue-700",
                    bar: "bg-blue-500",
                  },
                  {
                    label: "Rejected",
                    value: dashboardData.rejectedRequests,
                    color: "text-red-700",
                    bar: "bg-red-500",
                  },
                ].map((item) => (
                  <div key={item.label} className="space-y-2 text-center sm:text-left">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                      <span className={`text-2xl font-bold ${item.color}`}>
                        {item.value}
                      </span>
                      <span className="text-sm font-medium text-slate-700 uppercase tracking-wide">
                        {item.label}
                      </span>
                    </div>
                    <Progress
                      value={
                        dashboardData.myRequests > 0
                          ? (item.value / dashboardData.myRequests) * 100
                          : 0
                      }
                      className="h-2"
                      indicatorClassName={item.bar}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions & Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quick Actions */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Zap className="w-5 h-5 text-org-primary" />
                <CardTitle className="text-lg font-semibold text-slate-900">
                  Quick Actions
                </CardTitle>
              </div>
              <CardDescription className="text-slate-600">
                Common tasks you can perform
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Primary actions */}
                <Link
                  href="/requests/new?type=asset"
                  className="group relative flex items-center gap-4 overflow-hidden rounded-2xl bg-brand-orange p-4 text-white shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                    <Send className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold leading-tight">Request Asset</p>
                    <p className="text-xs text-white/80">Borrow equipment</p>
                  </div>
                </Link>

                <Link
                  href="/requests/new?type=consumable"
                  className="group relative flex items-center gap-4 overflow-hidden rounded-2xl bg-brand-orange p-4 text-white shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                    <ShoppingCart className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold leading-tight">Request Consumable</p>
                    <p className="text-xs text-white/80">Get supplies</p>
                  </div>
                </Link>

                {/* Secondary actions */}
                <Link
                  href="/assets"
                  className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--org-primary)]/40 hover:shadow-md"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-org-primary-soft text-[var(--org-primary)] transition-colors duration-200 group-hover:bg-org-gradient group-hover:text-white">
                    <Search className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold leading-tight text-slate-900">Browse Assets</p>
                    <p className="text-xs text-slate-500">Explore inventory</p>
                  </div>
                </Link>

                <Link
                  href="/consumables"
                  className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--org-primary)]/40 hover:shadow-md"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-org-primary-soft text-[var(--org-primary)] transition-colors duration-200 group-hover:bg-org-gradient group-hover:text-white">
                    <ShoppingCart className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold leading-tight text-slate-900">View Stock</p>
                    <p className="text-xs text-slate-500">Check supplies</p>
                  </div>
                </Link>

                <Link
                  href="/requests"
                  className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--org-primary)]/40 hover:shadow-md sm:col-span-2"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-org-primary-soft text-[var(--org-primary)] transition-colors duration-200 group-hover:bg-org-gradient group-hover:text-white">
                    <Eye className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold leading-tight text-slate-900">My Requests</p>
                    <p className="text-xs text-slate-500">Track your submissions</p>
                  </div>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Activity className="w-5 h-5 text-org-primary" />
                <CardTitle className="text-lg font-semibold text-slate-900">
                  Recent Requests
                </CardTitle>
              </div>
              <CardDescription className="text-slate-600">
                Your latest request activity
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              {dashboardData.recentRequests.length > 0 ? (
                <div className="space-y-3">
                  {dashboardData.recentRequests.map((request) => (
                    <div
                      key={request.$id}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex-1 min-w-0 mr-4">
                        <p className="font-medium text-sm text-slate-800 truncate">
                          {request.assetNames || "Asset Request"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatDate(request.$createdAt)} • {request.itemCount}{" "}
                          item{request.itemCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <Pill tone={getStatusBadgeColor(request.status)}>
                        {getStatusIcon(request.status)}
                        <span>{request.status}</span>
                      </Pill>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="p-3 bg-slate-100 rounded-full w-16 h-16 mx-auto mb-3 flex items-center justify-center">
                    <Activity className="h-8 w-8 text-slate-400" />
                  </div>
                  <p className="text-slate-600 font-medium mb-1">
                    No recent requests
                  </p>
                  <p className="text-slate-500 text-sm">
                    Your request activity will appear here
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recently Added Assets */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Package className="w-5 h-5 text-blue-600" />
                <CardTitle className="text-lg font-semibold text-slate-900">
                  Recently Added Assets
                </CardTitle>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/assets">View All →</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {dashboardData.recentAssets.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {dashboardData.recentAssets.map((asset) => (
                  <Link
                    key={asset.$id}
                    href={`/assets/${asset.$id}`}
                    className="block"
                  >
                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 hover:border-[var(--org-primary)] hover:shadow-md transition-all group">
                      <div className="flex items-start justify-between mb-3">
                        <div className="p-2 rounded-lg bg-org-accent-soft text-org-accent group-hover:bg-org-primary-soft group-hover:text-org-primary transition-colors">
                          <Package className="w-5 h-5" />
                        </div>
                        <Pill tone="primary">Available</Pill>
                      </div>
                      <h4 className="font-semibold text-slate-800 mb-1 truncate group-hover:text-org-primary transition-colors">
                        {asset.name}
                      </h4>
                      <p className="text-xs text-slate-500">
                        {asset.category
                          ?.replace(/_/g, " ")
                          .toLowerCase()
                          .replace(/\b\w/g, (l) => l.toUpperCase())}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Package className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-600 font-medium mb-1">
                  No assets available
                </p>
                <p className="text-slate-500 text-sm">
                  New assets will appear here
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
