"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../../components/ui/tabs";
import { Button } from "../../../components/ui/button";
import { Progress } from "../../../components/ui/progress";
import { Badge } from "../../../components/ui/badge";
import {
  Download,
  Users,
  Package,
  Clock,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Activity,
  FileText,
  RefreshCw,
  Calendar,
  BarChart3,
  PieChart,
  Shield,
  Zap,
  Target,
  Briefcase,
  Settings,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Pause,
  Archive,
  ShoppingCart,
  DollarSign,
  Percent,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Lightbulb,
  Bell,
} from "lucide-react";
import { getCurrentStaff, permissions } from "../../../lib/utils/auth.js";
import { useToastContext } from "../../../components/providers/toast-provider";
import {
  assetsService,
  assetRequestsService,
  staffService,
  departmentsService,
  assetEventsService,
} from "../../../lib/appwrite/provider.js";
import { ENUMS } from "../../../lib/appwrite/config.js";
import { Query } from "appwrite";
import {
  getConsumableStatus,
  getConsumableStatusEnum,
  getCurrentStock,
  getMinStock,
} from "../../../lib/utils/mappings.js";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function AdminDashboard() {
  const toast = useToastContext();
  const [staff, setStaff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Function to get time-based greeting
  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  // Real data from database
  const [dashboardData, setDashboardData] = useState({
    metrics: {
      totalAssets: 0,
      availableAssets: 0,
      inUseAssets: 0,
      maintenanceAssets: 0,
      retiredAssets: 0,
      totalConsumables: 0,
      inStockConsumables: 0,
      lowStockConsumables: 0,
      outOfStockConsumables: 0,
      pendingRequests: 0,
      approvedRequests: 0,
      fulfilledRequests: 0,
      totalStaff: 0,
      totalDepartments: 0,
      utilizationRate: 0,
      assetHealthScore: 0,
      totalValue: 0,
    },
    insights: [],
    assetsByCategory: [],
    assetsByDepartment: [],
    assetsByStatus: [],
    consumablesByCategory: [],
    consumablesByStatus: [],
    requestsByStatus: [],
    recentEvents: [],
    criticalAlerts: [],
  });

  useEffect(() => {
    loadDashboardData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Check admin permissions first
      const currentStaff = await getCurrentStaff();
      if (!currentStaff || !permissions.isAdmin(currentStaff)) {
        window.location.href = "/unauthorized";
        return;
      }
      setStaff(currentStaff);

      // Load all real data from Appwrite in parallel
      const [
        assetsResult,
        consumablesResult,
        requestsResult,
        staffResult,
        departmentsResult,
        recentEventsResult,
      ] = await Promise.all([
        assetsService.list(),
        assetsService.getConsumables(),
        assetRequestsService.list([Query.orderDesc("$createdAt")]),
        staffService.list(),
        departmentsService.list(),
        assetEventsService.list([Query.orderDesc("at"), Query.limit(10)]),
      ]);

      const assets = assetsResult.documents;
      const consumables = consumablesResult.documents;
      const requests = requestsResult.documents;
      const allStaff = staffResult.documents;
      const departments = departmentsResult.documents;
      const events = recentEventsResult.documents;

      // Filter assets to only include actual assets (not consumables)
      const actualAssets = assets.filter(
        (item) =>
          item.itemType === ENUMS.ITEM_TYPE.ASSET ||
          !item.itemType ||
          item.itemType === undefined
      );

      // Calculate utilization rate
      const utilizationRate = actualAssets.length > 0
        ? ((actualAssets.filter(a => a.availableStatus === ENUMS.AVAILABLE_STATUS.IN_USE).length / actualAssets.length) * 100).toFixed(1)
        : 0;

      // Calculate asset health score (based on condition)
      const healthyAssets = actualAssets.filter(a =>
        a.currentCondition === ENUMS.CURRENT_CONDITION.NEW ||
        a.currentCondition === ENUMS.CURRENT_CONDITION.EXCELLENT ||
        a.currentCondition === ENUMS.CURRENT_CONDITION.GOOD
      ).length;
      const assetHealthScore = actualAssets.length > 0
        ? ((healthyAssets / actualAssets.length) * 100).toFixed(1)
        : 0;

      // Calculate total asset value (if purchaseCost is available)
      const totalValue = actualAssets.reduce((sum, asset) => {
        return sum + (parseFloat(asset.purchaseCost) || 0);
      }, 0);

      const metrics = {
        totalAssets: actualAssets.length,
        availableAssets: actualAssets.filter(
          (a) => a.availableStatus === ENUMS.AVAILABLE_STATUS.AVAILABLE
        ).length,
        inUseAssets: actualAssets.filter(
          (a) => a.availableStatus === ENUMS.AVAILABLE_STATUS.IN_USE
        ).length,
        maintenanceAssets: actualAssets.filter(
          (a) =>
            a.availableStatus === ENUMS.AVAILABLE_STATUS.MAINTENANCE ||
            a.availableStatus === ENUMS.AVAILABLE_STATUS.REPAIR_REQUIRED
        ).length,
        retiredAssets: actualAssets.filter(
          (a) =>
            a.availableStatus === ENUMS.AVAILABLE_STATUS.RETIRED ||
            a.availableStatus === ENUMS.AVAILABLE_STATUS.DISPOSED
        ).length,
        totalConsumables: consumables.length,
        inStockConsumables: consumables.filter(
          (c) => getConsumableStatusEnum(c) === ENUMS.CONSUMABLE_STATUS.IN_STOCK
        ).length,
        lowStockConsumables: consumables.filter(
          (c) => getConsumableStatusEnum(c) === ENUMS.CONSUMABLE_STATUS.LOW_STOCK
        ).length,
        outOfStockConsumables: consumables.filter(
          (c) => getConsumableStatusEnum(c) === ENUMS.CONSUMABLE_STATUS.OUT_OF_STOCK
        ).length,
        pendingRequests: requests.filter((r) => r.status === ENUMS.REQUEST_STATUS.PENDING).length,
        approvedRequests: requests.filter((r) => r.status === ENUMS.REQUEST_STATUS.APPROVED).length,
        fulfilledRequests: requests.filter((r) => r.status === ENUMS.REQUEST_STATUS.FULFILLED).length,
        totalStaff: allStaff.length,
        totalDepartments: departments.length,
        utilizationRate: parseFloat(utilizationRate),
        assetHealthScore: parseFloat(assetHealthScore),
        totalValue: totalValue,
      };

      // Generate insights
      const insights = generateInsights(metrics, actualAssets, consumables, requests);

      // Generate critical alerts
      const criticalAlerts = generateCriticalAlerts(metrics, consumables);

      // Process assets by category
      const categoryMap = {};
      actualAssets.forEach((asset) => {
        const category = asset.category || "UNCATEGORIZED";
        categoryMap[category] = (categoryMap[category] || 0) + 1;
      });

      const assetsByCategory = Object.entries(categoryMap).map(
        ([category, count]) => ({
          name: category
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/\b\w/g, (l) => l.toUpperCase()),
          value: count,
          percentage:
            actualAssets.length > 0
              ? ((count / actualAssets.length) * 100).toFixed(1)
              : 0,
        })
      );

      // Process assets by status
      const statusMap = {};
      Object.values(ENUMS.AVAILABLE_STATUS).forEach((status) => {
        statusMap[status] = actualAssets.filter(
          (a) => a.availableStatus === status
        ).length;
      });

      const assetsByStatus = Object.entries(statusMap)
        .filter(([status, count]) => count > 0)
        .map(([status, count]) => ({
          name: status
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/\b\w/g, (l) => l.toUpperCase()),
          value: count,
          percentage:
            actualAssets.length > 0
              ? ((count / actualAssets.length) * 100).toFixed(1)
              : 0,
          status: status,
        }));

      // Process requests by status
      const requestStatusMap = {};
      Object.values(ENUMS.REQUEST_STATUS).forEach((status) => {
        requestStatusMap[status] = requests.filter(
          (r) => r.status === status
        ).length;
      });

      const requestsByStatus = Object.entries(requestStatusMap)
        .filter(([status, count]) => count > 0)
        .map(([status, count]) => ({
          name: status
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/\b\w/g, (l) => l.toUpperCase()),
          value: count,
          percentage:
            requests.length > 0
              ? ((count / requests.length) * 100).toFixed(1)
              : 0,
          status: status,
        }));

      // Process assets by department
      const deptAssetsMap = {};
      departments.forEach((dept) => {
        const deptAssets = actualAssets.filter(
          (a) => a.departmentId === dept.$id
        );
        if (deptAssets.length > 0) {
          deptAssetsMap[dept.name] = {
            total: deptAssets.length,
            available: deptAssets.filter(
              (a) => a.availableStatus === ENUMS.AVAILABLE_STATUS.AVAILABLE
            ).length,
            inUse: deptAssets.filter(
              (a) => a.availableStatus === ENUMS.AVAILABLE_STATUS.IN_USE
            ).length,
            utilization:
              deptAssets.length > 0
                ? (
                    (deptAssets.filter(
                      (a) => a.availableStatus === ENUMS.AVAILABLE_STATUS.IN_USE
                    ).length /
                      deptAssets.length) *
                    100
                  ).toFixed(1)
                : 0,
          };
        }
      });

      const assetsByDepartment = Object.entries(deptAssetsMap).map(
        ([deptName, data]) => ({
          name: deptName,
          ...data,
        })
      );

      // Process consumables by category
      const consumableCategoryMap = {};
      consumables.forEach((consumable) => {
        const category = consumable.subcategory || "UNCATEGORIZED";
        consumableCategoryMap[category] =
          (consumableCategoryMap[category] || 0) + 1;
      });

      const consumablesByCategory = Object.entries(consumableCategoryMap).map(
        ([category, count]) => ({
          name: category
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/\b\w/g, (l) => l.toUpperCase()),
          value: count,
          percentage:
            consumables.length > 0
              ? ((count / consumables.length) * 100).toFixed(1)
              : 0,
        })
      );

      // Process consumables by status
      const consumableStatusMap = {};
      Object.values(ENUMS.CONSUMABLE_STATUS).forEach((status) => {
        consumableStatusMap[status] = consumables.filter(
          (c) => getConsumableStatusEnum(c) === status
        ).length;
      });

      const consumablesByStatus = Object.entries(consumableStatusMap)
        .filter(([status, count]) => count > 0)
        .map(([status, count]) => ({
          name: status
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/\b\w/g, (l) => l.toUpperCase()),
          value: count,
          percentage:
            consumables.length > 0
              ? ((count / consumables.length) * 100).toFixed(1)
              : 0,
          status: status,
        }));

      setDashboardData({
        metrics,
        insights,
        criticalAlerts,
        assetsByCategory,
        assetsByDepartment,
        assetsByStatus,
        consumablesByCategory,
        consumablesByStatus,
        requestsByStatus,
        recentEvents: events,
      });

      setLastUpdated(new Date());
    } catch (error) {
      console.error("Dashboard load error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Generate insights based on data
  const generateInsights = (metrics, assets, consumables, requests) => {
    const insights = [];

    // Critical stock insights (highest priority)
    if (metrics.outOfStockConsumables > 0) {
      insights.push({
        type: "urgent",
        title: "Critical: Items Out of Stock",
        message: `${metrics.outOfStockConsumables} consumable items are completely out of stock. Immediate reordering required to prevent disruption.`,
        icon: "alert",
      });
    }

    // Pending requests insight
    if (metrics.pendingRequests > 5) {
      insights.push({
        type: "urgent",
        title: "Multiple Pending Requests",
        message: `${metrics.pendingRequests} requests await your approval. Timely processing improves user satisfaction.`,
        icon: "clock",
      });
    }

    // Low stock warning
    if (metrics.lowStockConsumables > 0) {
      insights.push({
        type: "warning",
        title: "Low Stock Alert",
        message: `${metrics.lowStockConsumables} consumable items are running low. Plan replenishment to avoid stockouts.`,
        icon: "shopping",
      });
    }

    // Asset utilization insight
    if (metrics.utilizationRate > 80) {
      insights.push({
        type: "warning",
        title: "High Asset Utilization",
        message: `Asset utilization is at ${metrics.utilizationRate}%. Consider acquiring more assets to meet growing demand.`,
        icon: "alert",
      });
    } else if (metrics.utilizationRate < 40 && metrics.totalAssets > 0) {
      insights.push({
        type: "info",
        title: "Low Asset Utilization",
        message: `Only ${metrics.utilizationRate}% of assets are actively in use. Review allocation to optimize resource efficiency.`,
        icon: "info",
      });
    }

    // Consumable stock health
    const stockHealthPercent = metrics.totalConsumables > 0
      ? ((metrics.inStockConsumables / metrics.totalConsumables) * 100).toFixed(1)
      : 0;

    if (stockHealthPercent < 50 && metrics.totalConsumables > 0) {
      insights.push({
        type: "warning",
        title: "Poor Consumable Stock Health",
        message: `Only ${stockHealthPercent}% of consumables are adequately stocked. Review inventory management processes.`,
        icon: "shopping",
      });
    } else if (stockHealthPercent > 90 && metrics.totalConsumables > 0) {
      insights.push({
        type: "info",
        title: "Excellent Stock Management",
        message: `${stockHealthPercent}% of consumables are well-stocked. Your inventory management is working effectively.`,
        icon: "shopping",
      });
    }

    // Asset health score insight
    if (metrics.assetHealthScore < 60 && metrics.totalAssets > 0) {
      insights.push({
        type: "warning",
        title: "Asset Health Needs Attention",
        message: `Asset health score is ${metrics.assetHealthScore}%. Consider maintenance schedule or replacement for aging assets.`,
        icon: "alert",
      });
    }

    // Maintenance backlog
    if (metrics.maintenanceAssets > 3) {
      insights.push({
        type: "warning",
        title: "Maintenance Backlog",
        message: `${metrics.maintenanceAssets} assets require maintenance or repair. Address this to prevent extended downtime.`,
        icon: "alert",
      });
    }

    // Overall inventory health
    const totalItems = metrics.totalAssets + metrics.totalConsumables;
    if (totalItems > 0) {
      insights.push({
        type: "info",
        title: "Inventory Overview",
        message: `Managing ${totalItems} total items: ${metrics.totalAssets} assets and ${metrics.totalConsumables} consumable items.`,
        icon: "info",
      });
    }

    return insights;
  };

  // Generate critical alerts
  const generateCriticalAlerts = (metrics, consumables) => {
    const alerts = [];

    // Out of stock items
    if (metrics.outOfStockConsumables > 0) {
      const n = metrics.outOfStockConsumables;
      alerts.push({
        severity: "critical",
        message:
          n === 1
            ? "1 item is out of stock"
            : `${n} items are out of stock`,
        action: "View Consumables",
        link: `/admin/consumables?status=${ENUMS.CONSUMABLE_STATUS.OUT_OF_STOCK}`,
      });
    }

    // Low stock items
    if (metrics.lowStockConsumables > 0) {
      const n = metrics.lowStockConsumables;
      alerts.push({
        severity: "warning",
        message:
          n === 1
            ? "1 item is running low"
            : `${n} items are running low`,
        action: "Check Stock",
        link: `/admin/consumables?status=${ENUMS.CONSUMABLE_STATUS.LOW_STOCK}`,
      });
    }

    // Pending requests
    if (metrics.pendingRequests > 3) {
      alerts.push({
        severity: "info",
        message: `${metrics.pendingRequests} requests pending approval`,
        action: "Review Requests",
        link: "/admin/requests",
      });
    }

    return alerts;
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
  };

  const exportData = async (type) => {
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const now = new Date();
      doc.setFontSize(16);
      doc.text(`${type} Report`, 40, 40);
      doc.setFontSize(10);
      doc.text(`Generated by: ${staff?.name || "Unknown"}`, 40, 60);
      doc.text(`Generated on: ${now.toLocaleString()}`, 40, 74);

      let filename = type.toLowerCase();

      if (type === "Assets") {
        const assets = await assetsService.list();
        const records = Array.isArray(assets?.documents) ? assets.documents : [];
        if (!records.length) {
          toast.warning("No assets available for download.");
          return;
        }
        autoTable(doc, {
          startY: 100,
          head: [
            ["#", "Asset Code", "Asset Name", "Category", "Status", "Condition", "Location"],
          ],
          body: records.map((asset, index) => [
            index + 1,
            asset.assetTag || asset.serialNumber || asset.$id,
            asset.name || "Unnamed Asset",
            (asset.category || "Unknown").replace(/_/g, " "),
            (asset.availableStatus || "Unknown").replace(/_/g, " "),
            (asset.currentCondition || "Unknown").replace(/_/g, " "),
            asset.locationName || asset.roomOrArea || "Not specified",
          ]),
          styles: { fontSize: 9, cellPadding: 4 },
          headStyles: { fillColor: [5, 150, 105], textColor: 255 },
          margin: { left: 40, right: 40 },
        });
      } else if (type === "Requests") {
        const requests = await assetRequestsService.list([
          Query.orderDesc("$createdAt"),
        ]);
        const records = Array.isArray(requests?.documents)
          ? requests.documents
          : [];
        if (!records.length) {
          toast.warning("No requests available for download.");
          return;
        }
        autoTable(doc, {
          startY: 100,
          head: [["#", "Request ID", "Asset", "Requester", "Status", "Created"]],
          body: records.map((request, index) => [
            index + 1,
            request.$id,
            request.assetName || request.assetId || "—",
            request.requesterName || request.requesterEmail || "—",
            (request.status || request.requestStatus || "Unknown").replace(
              /_/g,
              " "
            ),
            request.$createdAt
              ? new Date(request.$createdAt).toLocaleDateString()
              : "—",
          ]),
          styles: { fontSize: 9, cellPadding: 4 },
          headStyles: { fillColor: [14, 99, 112], textColor: 255 },
          margin: { left: 40, right: 40 },
        });
      } else {
        const summary = [
          ["Total Assets", dashboardData.metrics.totalAssets],
          ["Available Assets", dashboardData.metrics.availableAssets],
          ["Pending Requests", dashboardData.metrics.pendingRequests],
          ["Approved Requests", dashboardData.metrics.approvedRequests],
          ["Fulfilled Requests", dashboardData.metrics.fulfilledRequests],
          ["In-Stock Consumables", dashboardData.metrics.inStockConsumables],
          ["Low-Stock Consumables", dashboardData.metrics.lowStockConsumables],
          ["Asset Health Score", `${dashboardData.metrics.assetHealthScore}%`],
        ];
        autoTable(doc, {
          startY: 100,
          head: [["Metric", "Value"]],
          body: summary,
          styles: { fontSize: 10, cellPadding: 6 },
          headStyles: { fillColor: [37, 99, 235], textColor: 255 },
          margin: { left: 40, right: 40 },
        });
        filename = "dashboard_summary";
      }

      doc.save(`${filename}_${now.toISOString().split("T")[0]}.pdf`);
      toast.success(`${type} report downloaded successfully!`);
    } catch (error) {
      console.error("Download failed:", error);
      toast.error("Download failed. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
        </div>
        <p className="mt-4 text-slate-600 font-medium">Loading Dashboard...</p>
        <p className="mt-2 text-sm text-slate-500">Fetching real-time analytics</p>
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
                Real-time system analytics & insights
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
                onClick={handleRefresh}
                variant="outline"
                disabled={refreshing}
                className="h-10 px-4 border-[var(--org-primary)] text-org-primary hover:bg-org-primary-soft"
              >
                <RefreshCw
                  className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
              <Button
                onClick={() => exportData("Dashboard")}
                className="h-10 px-6 bg-org-gradient text-white shadow-md hover:shadow-lg transition-transform hover:-translate-y-0.5"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Report PDF
              </Button>
            </div>
          </div>
        </div>

        {/* Critical Alerts */}
        {dashboardData.criticalAlerts.length > 0 && (
          <div className="space-y-3">
            {dashboardData.criticalAlerts.map((alert, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border ${
                  alert.severity === "critical"
                    ? "bg-red-50 border-red-200"
                    : alert.severity === "warning"
                    ? "bg-yellow-50 border-yellow-200"
                    : "bg-blue-50 border-blue-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Bell
                      className={`w-5 h-5 ${
                        alert.severity === "critical"
                          ? "text-red-600"
                          : alert.severity === "warning"
                          ? "text-yellow-600"
                          : "text-blue-600"
                      }`}
                    />
                    <span
                      className={`font-medium ${
                        alert.severity === "critical"
                          ? "text-red-900"
                          : alert.severity === "warning"
                          ? "text-yellow-900"
                          : "text-blue-900"
                      }`}
                    >
                      {alert.message}
                    </span>
                  </div>
                  <Button
                    asChild
                    size="sm"
                    className={
                      alert.severity === "critical"
                        ? "bg-red-600 hover:bg-red-700"
                        : alert.severity === "warning"
                        ? "bg-yellow-600 hover:bg-yellow-700"
                        : "bg-blue-600 hover:bg-blue-700"
                    }
                  >
                    <Link href={alert.link}>{alert.action} →</Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Key Metrics with Enhanced Design - Row 1: Unified Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total Assets - clickable */}
          <Link href="/admin/assets">
            <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer hover:border-blue-300 h-full group">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <Package className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge className="bg-blue-100 text-blue-700">Assets</Badge>
                    <ArrowUpRight className="h-4 w-4 text-blue-600 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-3xl font-bold text-slate-900">
                    {dashboardData.metrics.totalAssets}
                  </h3>
                  <p className="text-sm font-medium text-slate-600">Total Assets</p>
                  <div className="flex items-center space-x-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span className="text-slate-600">
                      {dashboardData.metrics.availableAssets} available
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Total Consumables - clickable */}
          <Link href="/admin/consumables">
            <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer hover:border-orange-300 h-full group">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-orange-100 rounded-lg">
                    <ShoppingCart className="h-6 w-6 text-orange-600" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge className="bg-orange-100 text-orange-700">Consumables</Badge>
                    <ArrowUpRight className="h-4 w-4 text-orange-600 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-3xl font-bold text-slate-900">
                    {dashboardData.metrics.totalConsumables}
                  </h3>
                  <p className="text-sm font-medium text-slate-600">Total Consumables</p>
                  <div className="flex items-center space-x-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span className="text-slate-600">
                      {dashboardData.metrics.inStockConsumables} in stock
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Total Inventory Items */}
          <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <BarChart3 className="h-6 w-6 text-purple-600" />
                </div>
                <Badge className="bg-purple-100 text-purple-700">Combined</Badge>
              </div>
              <div className="space-y-2">
                <h3 className="text-3xl font-bold text-slate-900">
                  {dashboardData.metrics.totalAssets + dashboardData.metrics.totalConsumables}
                </h3>
                <p className="text-sm font-medium text-slate-600">Total Inventory</p>
                <div className="flex items-center space-x-2 text-slate-600">
                  <span>{dashboardData.metrics.totalAssets} assets</span>
                  <span>•</span>
                  <span>{dashboardData.metrics.totalConsumables} consumables</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pending Requests */}
          <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-amber-100 rounded-lg">
                  <Clock className="h-6 w-6 text-amber-600" />
                </div>
                <Badge className="bg-amber-100 text-amber-700">Pending</Badge>
              </div>
              <div className="space-y-2">
                <h3 className="text-3xl font-bold text-slate-900">
                  {dashboardData.metrics.pendingRequests}
                </h3>
                <p className="text-sm font-medium text-slate-600">Pending Requests</p>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="w-full mt-2"
                >
                  <Link href="/admin/requests">Review →</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Key Metrics - Row 2: Specific Analytics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Asset Utilization Rate */}
          <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Percent className="h-6 w-6 text-blue-600" />
                </div>
                <Badge className="bg-blue-100 text-blue-700">Assets</Badge>
              </div>
              <div className="space-y-2">
                <h3 className="text-3xl font-bold text-slate-900">
                  {dashboardData.metrics.utilizationRate}%
                </h3>
                <p className="text-sm font-medium text-slate-600">Asset Utilization</p>
                <Progress
                  value={dashboardData.metrics.utilizationRate}
                  className="h-2"
                />
              </div>
            </CardContent>
          </Card>

          {/* Consumable Stock Health */}
          <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-orange-100 rounded-lg">
                  <Target className="h-6 w-6 text-orange-600" />
                </div>
                <Badge className="bg-orange-100 text-orange-700">Stock</Badge>
              </div>
              <div className="space-y-2">
                <h3 className="text-3xl font-bold text-slate-900">
                  {dashboardData.metrics.totalConsumables > 0
                    ? ((dashboardData.metrics.inStockConsumables / dashboardData.metrics.totalConsumables) * 100).toFixed(1)
                    : 0}%
                </h3>
                <p className="text-sm font-medium text-slate-600">Stock Health</p>
                <Progress
                  value={dashboardData.metrics.totalConsumables > 0
                    ? (dashboardData.metrics.inStockConsumables / dashboardData.metrics.totalConsumables) * 100
                    : 0}
                  className="h-2"
                />
              </div>
            </CardContent>
          </Card>

          {/* Asset Health Score */}
          <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-green-100 rounded-lg">
                  <Shield className="h-6 w-6 text-green-600" />
                </div>
                <Badge className="bg-green-100 text-green-700">Health</Badge>
              </div>
              <div className="space-y-2">
                <h3 className="text-3xl font-bold text-slate-900">
                  {dashboardData.metrics.assetHealthScore}%
                </h3>
                <p className="text-sm font-medium text-slate-600">Asset Condition</p>
                <Progress
                  value={dashboardData.metrics.assetHealthScore}
                  className="h-2"
                />
              </div>
            </CardContent>
          </Card>

          {/* Critical Items */}
          <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-red-100 rounded-lg">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <Badge className="bg-red-100 text-red-700">Critical</Badge>
              </div>
              <div className="space-y-2">
                <h3 className="text-3xl font-bold text-slate-900">
                  {dashboardData.metrics.maintenanceAssets + dashboardData.metrics.outOfStockConsumables}
                </h3>
                <p className="text-sm font-medium text-slate-600">Need Attention</p>
                <div className="flex items-center space-x-2 text-sm text-slate-600">
                  <span>{dashboardData.metrics.maintenanceAssets} assets</span>
                  <span>•</span>
                  <span>{dashboardData.metrics.outOfStockConsumables} stock</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Insights Section */}
        {dashboardData.insights.length > 0 && (
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Lightbulb className="w-5 h-5 text-yellow-600" />
                <CardTitle className="text-lg font-semibold text-slate-900">
                  Key Insights & Recommendations
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                {dashboardData.insights.map((insight, index) => (
                  <div
                    key={index}
                    className={`p-4 rounded-lg border ${
                      insight.type === "urgent"
                        ? "bg-red-50 border-red-200"
                        : insight.type === "warning"
                        ? "bg-yellow-50 border-yellow-200"
                        : "bg-blue-50 border-blue-200"
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <Lightbulb
                        className={`w-5 h-5 mt-0.5 ${
                          insight.type === "urgent"
                            ? "text-red-600"
                            : insight.type === "warning"
                            ? "text-yellow-600"
                            : "text-blue-600"
                        }`}
                      />
                      <div className="flex-1">
                        <h4
                          className={`font-semibold mb-1 ${
                            insight.type === "urgent"
                              ? "text-red-900"
                              : insight.type === "warning"
                              ? "text-yellow-900"
                              : "text-blue-900"
                          }`}
                        >
                          {insight.title}
                        </h4>
                        <p
                          className={`text-sm ${
                            insight.type === "urgent"
                              ? "text-red-700"
                              : insight.type === "warning"
                              ? "text-yellow-700"
                              : "text-blue-700"
                          }`}
                        >
                          {insight.message}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Additional Analytics Section */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Asset Status Breakdown */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Package className="w-5 h-5 text-blue-600" />
                <CardTitle className="text-lg font-semibold text-slate-900">
                  Asset Status
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Available</span>
                  <span className="text-lg font-bold text-green-700">
                    {dashboardData.metrics.availableAssets}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">In Use</span>
                  <span className="text-lg font-bold text-blue-700">
                    {dashboardData.metrics.inUseAssets}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Maintenance</span>
                  <span className="text-lg font-bold text-orange-700">
                    {dashboardData.metrics.maintenanceAssets}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Retired</span>
                  <span className="text-lg font-bold text-slate-700">
                    {dashboardData.metrics.retiredAssets}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Consumables Stock */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <ShoppingCart className="w-5 h-5 text-orange-600" />
                <CardTitle className="text-lg font-semibold text-slate-900">
                  Consumable Status
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">In Stock</span>
                  <span className="text-lg font-bold text-green-700">
                    {dashboardData.metrics.inStockConsumables}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Low Stock</span>
                  <Link
                    href={`/admin/consumables?status=${ENUMS.CONSUMABLE_STATUS.LOW_STOCK}`}
                    className="text-lg font-bold text-yellow-700 hover:underline"
                  >
                    {dashboardData.metrics.lowStockConsumables}
                  </Link>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Out of Stock</span>
                  <Link
                    href={`/admin/consumables?status=${ENUMS.CONSUMABLE_STATUS.OUT_OF_STOCK}`}
                    className="text-lg font-bold text-red-700 hover:underline"
                  >
                    {dashboardData.metrics.outOfStockConsumables}
                  </Link>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                  <span className="text-sm font-medium text-slate-700">Total Items</span>
                  <span className="text-lg font-bold text-slate-900">
                    {dashboardData.metrics.totalConsumables}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Request Summary */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Clock className="w-5 h-5 text-amber-600" />
                <CardTitle className="text-lg font-semibold text-slate-900">
                  Requests
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Pending</span>
                  <span className="text-lg font-bold text-orange-700">
                    {dashboardData.metrics.pendingRequests}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Approved</span>
                  <span className="text-lg font-bold text-green-700">
                    {dashboardData.metrics.approvedRequests}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Fulfilled</span>
                  <span className="text-lg font-bold text-blue-700">
                    {dashboardData.metrics.fulfilledRequests}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Organization Summary */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Briefcase className="w-5 h-5 text-purple-600" />
                <CardTitle className="text-lg font-semibold text-slate-900">
                  Organization
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Departments</span>
                  <span className="text-lg font-bold text-slate-900">
                    {dashboardData.metrics.totalDepartments}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Staff Members</span>
                  <span className="text-lg font-bold text-slate-900">
                    {dashboardData.metrics.totalStaff}
                  </span>
                </div>
                {dashboardData.metrics.totalValue > 0 && (
                  <>
                    <div className="pt-2 border-t border-slate-200" />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Asset Value</span>
                      <span className="text-lg font-bold text-green-700">
                        ${(dashboardData.metrics.totalValue / 1000).toFixed(0)}k
                      </span>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 bg-white border border-slate-200 p-1 rounded-lg">
            <TabsTrigger value="overview" className="rounded-md">
              <PieChart className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="assets" className="rounded-md">
              <Package className="w-4 h-4 mr-2" />
              Assets
            </TabsTrigger>
            <TabsTrigger value="consumables" className="rounded-md">
              <ShoppingCart className="w-4 h-4 mr-2" />
              Consumables
            </TabsTrigger>
            <TabsTrigger value="requests" className="rounded-md">
              <Clock className="w-4 h-4 mr-2" />
              Requests
            </TabsTrigger>
            <TabsTrigger value="activity" className="rounded-md">
              <Activity className="w-4 h-4 mr-2" />
              Activity
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Asset Distribution */}
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="border-b border-slate-100">
                  <div className="flex items-center space-x-2">
                    <Package className="w-5 h-5 text-blue-600" />
                    <CardTitle className="text-lg font-semibold text-slate-900">
                      Asset Distribution
                    </CardTitle>
                  </div>
                  <CardDescription className="text-slate-600">
                    By category
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    {dashboardData.assetsByCategory.length > 0 ? (
                      dashboardData.assetsByCategory.map((category, index) => (
                        <div key={index} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-slate-700">
                              {category.name}
                            </span>
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-bold text-slate-900">
                                {category.value}
                              </span>
                              <Badge className="bg-blue-100 text-blue-700">
                                {category.percentage}%
                              </Badge>
                            </div>
                          </div>
                          <Progress
                            value={parseFloat(category.percentage)}
                            className="h-2"
                          />
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8">
                        <Package className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                        <p className="text-slate-500">No assets found</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Consumables Distribution */}
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="border-b border-slate-100">
                  <div className="flex items-center space-x-2">
                    <ShoppingCart className="w-5 h-5 text-orange-600" />
                    <CardTitle className="text-lg font-semibold text-slate-900">
                      Consumables Distribution
                    </CardTitle>
                  </div>
                  <CardDescription className="text-slate-600">
                    By category
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    {dashboardData.consumablesByCategory.length > 0 ? (
                      dashboardData.consumablesByCategory.map((category, index) => (
                        <div key={index} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-slate-700">
                              {category.name}
                            </span>
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-bold text-slate-900">
                                {category.value}
                              </span>
                              <Badge className="bg-orange-100 text-orange-700">
                                {category.percentage}%
                              </Badge>
                            </div>
                          </div>
                          <Progress
                            value={parseFloat(category.percentage)}
                            className="h-2"
                          />
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8">
                        <ShoppingCart className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                        <p className="text-slate-500">No consumables found</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Department Utilization */}
              <Card className="border-slate-200 shadow-sm lg:col-span-2">
                <CardHeader className="border-b border-slate-100">
                  <div className="flex items-center space-x-2">
                    <Briefcase className="w-5 h-5 text-green-600" />
                    <CardTitle className="text-lg font-semibold text-slate-900">
                      Department Asset Utilization
                    </CardTitle>
                  </div>
                  <CardDescription className="text-slate-600">
                    Asset usage by department
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {dashboardData.assetsByDepartment.length > 0 ? (
                      dashboardData.assetsByDepartment.map((dept, index) => (
                        <div key={index} className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-slate-700">
                              {dept.name}
                            </span>
                            <div className="text-right">
                              <div className="text-sm font-bold text-slate-900">
                                {dept.inUse}/{dept.total}
                              </div>
                              <Badge
                                className={`text-xs ${
                                  parseFloat(dept.utilization) >= 80
                                    ? "bg-red-100 text-red-700"
                                    : parseFloat(dept.utilization) >= 60
                                    ? "bg-yellow-100 text-yellow-700"
                                    : "bg-green-100 text-green-700"
                                }`}
                              >
                                {dept.utilization}%
                              </Badge>
                            </div>
                          </div>
                          <Progress
                            value={parseFloat(dept.utilization)}
                            className="h-2"
                          />
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 col-span-2">
                        <Briefcase className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                        <p className="text-slate-500">No department assignments</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Assets Tab */}
          <TabsContent value="assets" className="space-y-6">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <Package className="w-5 h-5 text-blue-600" />
                  <CardTitle className="text-lg font-semibold text-slate-900">
                    Asset Status Breakdown
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {dashboardData.assetsByStatus.map((statusGroup, index) => {
                    const getStatusColor = (status) => {
                      switch (status) {
                        case "AVAILABLE":
                          return "border-green-200 bg-green-50";
                        case "IN_USE":
                          return "border-blue-200 bg-blue-50";
                        case "MAINTENANCE":
                        case "REPAIR_REQUIRED":
                          return "border-orange-200 bg-orange-50";
                        case "RETIRED":
                        case "DISPOSED":
                          return "border-slate-200 bg-slate-50";
                        default:
                          return "border-purple-200 bg-purple-50";
                      }
                    };

                    const getStatusIcon = (status) => {
                      switch (status) {
                        case "AVAILABLE":
                          return <CheckCircle2 className="w-5 h-5 text-green-600" />;
                        case "IN_USE":
                          return <Zap className="w-5 h-5 text-blue-600" />;
                        case "MAINTENANCE":
                        case "REPAIR_REQUIRED":
                          return <Settings className="w-5 h-5 text-orange-600" />;
                        case "RETIRED":
                        case "DISPOSED":
                          return <Archive className="w-5 h-5 text-slate-600" />;
                        default:
                          return <AlertCircle className="w-5 h-5 text-purple-600" />;
                      }
                    };

                    return (
                      <div
                        key={index}
                        className={`p-6 rounded-lg border ${getStatusColor(
                          statusGroup.status
                        )} hover:shadow-md transition-shadow`}
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center space-x-2">
                            {getStatusIcon(statusGroup.status)}
                            <h4 className="font-semibold text-slate-800">
                              {statusGroup.name}
                            </h4>
                          </div>
                          <Badge className="bg-white/80 text-slate-700">
                            {statusGroup.percentage}%
                          </Badge>
                        </div>
                        <div className="text-3xl font-bold text-slate-900 mb-3">
                          {statusGroup.value}
                        </div>
                        <Progress
                          value={parseFloat(statusGroup.percentage)}
                          className="h-2"
                        />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Consumables Tab */}
          <TabsContent value="consumables" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="border-b border-slate-100">
                  <div className="flex items-center space-x-2">
                    <ShoppingCart className="w-5 h-5 text-orange-600" />
                    <CardTitle className="text-lg font-semibold text-slate-900">
                      Consumables by Category
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    {dashboardData.consumablesByCategory.length > 0 ? (
                      dashboardData.consumablesByCategory.map((category, index) => (
                        <div key={index} className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-slate-700">
                              {category.name}
                            </span>
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-bold text-slate-900">
                                {category.value}
                              </span>
                              <Badge className="bg-orange-100 text-orange-700">
                                {category.percentage}%
                              </Badge>
                            </div>
                          </div>
                          <Progress
                            value={parseFloat(category.percentage)}
                            className="h-2"
                          />
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8">
                        <ShoppingCart className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                        <p className="text-slate-500">No consumables found</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="border-b border-slate-100">
                  <div className="flex items-center space-x-2">
                    <Target className="w-5 h-5 text-orange-600" />
                    <CardTitle className="text-lg font-semibold text-slate-900">
                      Stock Status
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    {dashboardData.consumablesByStatus.map((status, index) => {
                      const getStatusColor = (statusName) => {
                        if (statusName === "In Stock") return "border-green-200 bg-green-50";
                        if (statusName === "Low Stock") return "border-yellow-200 bg-yellow-50";
                        if (statusName === "Out Of Stock") return "border-red-200 bg-red-50";
                        return "border-slate-200 bg-slate-50";
                      };

                      const getStatusIcon = (statusName) => {
                        if (statusName === "In Stock")
                          return <CheckCircle2 className="h-5 w-5 text-green-600" />;
                        if (statusName === "Low Stock")
                          return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
                        if (statusName === "Out Of Stock")
                          return <XCircle className="h-5 w-5 text-red-600" />;
                        return <Package className="h-5 w-5 text-slate-600" />;
                      };

                      return (
                        <div
                          key={index}
                          className={`p-4 rounded-lg border ${getStatusColor(
                            status.name
                          )}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              {getStatusIcon(status.name)}
                              <div>
                                <div className="font-semibold text-slate-800">
                                  {status.name}
                                </div>
                                <div className="text-sm text-slate-600">
                                  {status.percentage}% of total
                                </div>
                              </div>
                            </div>
                            <div className="text-2xl font-bold text-slate-900">
                              {status.value}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Requests Tab */}
          <TabsContent value="requests" className="space-y-6">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <Clock className="w-5 h-5 text-orange-600" />
                  <CardTitle className="text-lg font-semibold text-slate-900">
                    Request Status Summary
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {dashboardData.requestsByStatus.length > 0 ? (
                    dashboardData.requestsByStatus.map((statusGroup, index) => {
                      const getRequestStatusColor = (status) => {
                        switch (status) {
                          case "PENDING":
                            return "border-orange-200 bg-orange-50";
                          case "APPROVED":
                            return "border-green-200 bg-green-50";
                          case "FULFILLED":
                            return "border-blue-200 bg-blue-50";
                          case "REJECTED":
                            return "border-red-200 bg-red-50";
                          default:
                            return "border-slate-200 bg-slate-50";
                        }
                      };

                      const getRequestStatusIcon = (status) => {
                        switch (status) {
                          case "PENDING":
                            return <Clock className="w-5 h-5 text-orange-600" />;
                          case "APPROVED":
                            return <CheckCircle2 className="w-5 h-5 text-green-600" />;
                          case "FULFILLED":
                            return <Zap className="w-5 h-5 text-blue-600" />;
                          case "REJECTED":
                            return <XCircle className="w-5 h-5 text-red-600" />;
                          default:
                            return <Pause className="w-5 h-5 text-slate-600" />;
                        }
                      };

                      return (
                        <div
                          key={index}
                          className={`p-6 rounded-lg border ${getRequestStatusColor(
                            statusGroup.status
                          )}`}
                        >
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center space-x-2">
                              {getRequestStatusIcon(statusGroup.status)}
                              <div className="font-semibold text-slate-800">
                                {statusGroup.name}
                              </div>
                            </div>
                            <Badge className="bg-white/80 text-slate-700">
                              {statusGroup.percentage}%
                            </Badge>
                          </div>
                          <div className="text-3xl font-bold text-slate-900">
                            {statusGroup.value}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-12 col-span-3">
                      <Clock className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                      <p className="text-slate-500 font-medium">No requests found</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity" className="space-y-6">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <Activity className="w-5 h-5 text-purple-600" />
                  <CardTitle className="text-lg font-semibold text-slate-900">
                    Recent System Activity
                  </CardTitle>
                </div>
                <CardDescription className="text-slate-600">
                  Latest events from the audit trail
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {dashboardData.recentEvents.length > 0 ? (
                    dashboardData.recentEvents.map((event, index) => {
                      const getEventColor = (eventType) => {
                        if (eventType.includes("CREATE")) return "border-green-200 bg-green-50";
                        if (eventType.includes("UPDATE")) return "border-blue-200 bg-blue-50";
                        if (eventType.includes("DELETE")) return "border-red-200 bg-red-50";
                        if (eventType.includes("ASSIGN")) return "border-purple-200 bg-purple-50";
                        return "border-slate-200 bg-slate-50";
                      };

                      const getEventIcon = (eventType) => {
                        if (eventType.includes("CREATE"))
                          return <CheckCircle2 className="h-5 w-5 text-green-600" />;
                        if (eventType.includes("UPDATE"))
                          return <Settings className="h-5 w-5 text-blue-600" />;
                        if (eventType.includes("DELETE"))
                          return <XCircle className="h-5 w-5 text-red-600" />;
                        if (eventType.includes("ASSIGN"))
                          return <Users className="h-5 w-5 text-purple-600" />;
                        return <Activity className="h-5 w-5 text-slate-600" />;
                      };

                      return (
                        <div
                          key={event.$id}
                          className={`p-4 rounded-lg border ${getEventColor(
                            event.eventType
                          )}`}
                        >
                          <div className="flex items-start space-x-4">
                            <div className="p-2 bg-white rounded-lg shadow-sm">
                              {getEventIcon(event.eventType)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2 mb-2">
                                <Badge className="bg-white/80 text-slate-700 text-xs">
                                  {event.eventType.replace(/_/g, " ")}
                                </Badge>
                                <span className="text-xs text-slate-500">
                                  {new Date(event.at).toLocaleDateString()} •{" "}
                                  {new Date(event.at).toLocaleTimeString()}
                                </span>
                              </div>
                              <p className="text-sm font-medium text-slate-800 mb-1">
                                {event.fromValue && event.toValue
                                  ? `Changed from "${event.fromValue}" to "${event.toValue}"`
                                  : event.eventType
                                      .replace(/_/g, " ")
                                      .toLowerCase()}
                              </p>
                              {event.notes && (
                                <p className="text-xs text-slate-600 bg-white/50 rounded-lg px-3 py-2 mt-2">
                                  {event.notes}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-16">
                      <Activity className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-slate-600 mb-2">
                        No Recent Activity
                      </h3>
                      <p className="text-slate-500">
                        System activity will appear here when events occur
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
