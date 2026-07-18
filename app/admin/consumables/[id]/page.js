"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Badge } from "../../../../components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../../../components/ui/tabs";
import { assetsService } from "../../../../lib/appwrite/provider.js";
import { getCurrentStaff, permissions } from "../../../../lib/utils/auth.js";
import {
  getConsumableStatus,
  getConsumableStatusBadgeColor,
  getCurrentStock,
  getMinStock,
  getMaxStock,
  getConsumableUnit,
  getConsumableCategory,
} from "../../../../lib/utils/mappings.js";
import { ConsumableOverview } from "../../../../components/assets/consumable-overview";
import { ConsumableActivity } from "../../../../components/assets/consumable-activity";
import { AssetCustody } from "../../../../components/assets/asset-custody";
import {
  ArrowLeft,
  Edit,
  Package,
  Activity,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  MapPin,
  Tag,
  Layers,
  TrendingUp,
  TrendingDown,
  BarChart3,
} from "lucide-react";
import { formatCategory } from "../../../../lib/utils/mappings.js";
import { useOrgTheme } from "../../../../components/providers/org-theme-provider";

export default function ConsumableDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [consumable, setConsumable] = useState(null);
  const [currentStaff, setCurrentStaff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { orgCode } = useOrgTheme();
  const isNrepOrg = useMemo(
    () => (orgCode || "").toUpperCase() === "NREP",
    [orgCode]
  );

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const loadData = async () => {
    try {
      const [staff, consumableData] = await Promise.all([
        getCurrentStaff(),
        assetsService.get(params.id),
      ]);

      setCurrentStaff(staff);
      setConsumable(consumableData);
    } catch (error) {
      console.error("Failed to load consumable:", error);
      setError("Failed to load consumable details");
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "IN_STOCK":
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case "LOW_STOCK":
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      case "OUT_OF_STOCK":
        return <XCircle className="w-5 h-5 text-red-600" />;
      case "DISCONTINUED":
        return <XCircle className="w-5 h-5 text-gray-600" />;
      default:
        return <Package className="w-5 h-5 text-gray-600" />;
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      IN_STOCK: "bg-green-100 text-green-800 border-green-200",
      LOW_STOCK: "bg-yellow-100 text-yellow-800 border-yellow-200",
      OUT_OF_STOCK: "bg-red-100 text-red-800 border-red-200",
      DISCONTINUED: "bg-gray-100 text-gray-800 border-gray-200",
    };
    return colors[status] || "bg-gray-100 text-gray-800 border-gray-200";
  };

  const getStatusText = (status) => {
    if (!status) return "Unknown";
    return status
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const canManageConsumables =
    currentStaff && permissions.canManageConsumables(currentStaff);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading consumable...</span>
      </div>
    );
  }

  if (error || !consumable) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-600 mb-4">Error loading consumable</div>
          <div className="text-gray-600 mb-4">
            {error || "Consumable not found"}
          </div>
          <Button onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  // Parse images
  const images = consumable.publicImages
    ? typeof consumable.publicImages === "string"
      ? JSON.parse(consumable.publicImages || "[]")
      : consumable.publicImages
    : [];

  // Get stock metrics
  const currentStock = getCurrentStock(consumable);
  const minStock = getMinStock(consumable);
  const maxStock = getMaxStock(consumable);
  const status = getConsumableStatus(consumable);
  const unit = getConsumableUnit(consumable);

  // Calculate stock percentage
  const stockPercentage =
    maxStock > 0 ? Math.round((currentStock / maxStock) * 100) : 0;

  const surfaceClass = isNrepOrg
    ? "bg-white shadow-lg border border-[var(--org-primary)]/10"
    : "bg-white shadow-lg border border-gray-100";
  const accentButtonClass = isNrepOrg
    ? "bg-[var(--org-primary)] hover:bg-[var(--org-primary-dark)] text-white"
    : "bg-orange-500 hover:bg-orange-600 text-white";
  const mutedButtonClass = isNrepOrg
    ? "bg-[var(--org-muted)] text-[var(--org-primary)] hover:bg-[var(--org-muted)]/80"
    : "bg-orange-100 text-orange-700 hover:bg-orange-200";
  const headingAccentClass = isNrepOrg
    ? "bg-gradient-to-r from-slate-900 via-[var(--org-primary)] to-[var(--org-accent)]"
    : "bg-gradient-to-r from-slate-900 via-orange-600 to-amber-600";
  const metricCardBorder = isNrepOrg
    ? "border border-[var(--org-primary)]/15"
    : "border-2 border-blue-200";

  return (
    <div className="min-h-screen bg-[var(--org-background)]">
      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Enhanced Header */}
        <div className={`${surfaceClass} rounded-2xl backdrop-blur-sm p-6`}>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-6 gap-4 sm:gap-6">
              <Button
                variant="ghost"
                onClick={() => router.push("/admin/consumables")}
                className={`${mutedButtonClass} border-none`}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Consumables
              </Button>
              <div className="flex items-center gap-4 sm:gap-4">
                <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-xl flex items-center justify-center shadow-lg ${
                  isNrepOrg
                    ? "bg-gradient-to-br from-[var(--org-primary)] to-[var(--org-accent)]"
                    : "bg-gradient-to-br from-orange-500 to-amber-500"
                }`}>
                  <Package className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
                </div>
                <div>
                  <h1
                    className={`text-2xl sm:text-3xl font-bold bg-clip-text text-transparent ${headingAccentClass}`}
                  >
                    {consumable.name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <Badge
                      className={`border-0 ${
                        isNrepOrg
                          ? "bg-[var(--org-muted)] text-[var(--org-primary)]"
                          : "bg-orange-100 text-orange-800"
                      }`}
                    >
                      <Tag className="w-3 h-3 mr-1" />
                      {consumable.assetTag}
                    </Badge>
                    <Badge
                      className={`border-0 ${
                        isNrepOrg
                          ? "bg-[var(--org-primary)]/10 text-[var(--org-primary)]"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      <Layers className="w-3 h-3 mr-1" />
                      {formatCategory(getConsumableCategory(consumable))}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
            {canManageConsumables && (
              <Button
                onClick={() =>
                  router.push(`/admin/consumables/${consumable.$id}/edit`)
                }
                className={`${accentButtonClass} w-full sm:w-auto justify-center shadow-lg hover:shadow-xl transition-all`}
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit Consumable
              </Button>
            )}
          </div>
        </div>

        {/* Stock Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Current Stock Card */}
          <Card className={`${surfaceClass} ${metricCardBorder}`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-blue-600 flex items-center">
                <BarChart3 className="w-4 h-4 mr-2" />
                Current Stock
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="text-3xl font-bold text-blue-700">
                  {currentStock}
                </div>
                <div className="text-sm text-gray-600">
                  {unit ? formatCategory(unit) : "Units"}
                </div>
                {maxStock > 0 && (
                  <div className="pt-2">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(stockPercentage, 100)}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {stockPercentage}% of capacity
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Minimum Stock Card */}
          <Card className={`${surfaceClass} ${metricCardBorder}`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-yellow-600 flex items-center">
                <TrendingDown className="w-4 h-4 mr-2" />
                Minimum Stock
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="text-3xl font-bold text-yellow-700">
                  {minStock}
                </div>
                <div className="text-sm text-gray-600">
                  Reorder threshold
                </div>
                {currentStock <= minStock && minStock > 0 && (
                  <Badge className="bg-yellow-500 text-white mt-2">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Low Stock Alert
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Maximum Stock Card */}
          <Card className={`${surfaceClass} ${metricCardBorder}`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-green-600 flex items-center">
                <TrendingUp className="w-4 h-4 mr-2" />
                Maximum Capacity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="text-3xl font-bold text-green-700">
                  {maxStock || "N/A"}
                </div>
                <div className="text-sm text-gray-600">
                  Maximum capacity
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Status Card */}
          <Card className={`${surfaceClass} ${metricCardBorder}`}>
            <CardHeader className="pb-3">
              <CardTitle
                className={`text-sm font-medium flex items-center ${
                  status === "IN_STOCK"
                    ? "text-green-600"
                    : status === "LOW_STOCK"
                    ? "text-yellow-600"
                    : "text-red-600"
                }`}
              >
                {getStatusIcon(status)}
                <span className="ml-2">Status</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Badge
                  className={`text-base px-3 py-1 ${getConsumableStatusBadgeColor(
                    status
                  )}`}
                >
                  {getStatusText(status)}
                </Badge>
                <div className="text-xs text-gray-600 mt-2">
                  {status === "IN_STOCK"
                    ? "Available for distribution"
                    : status === "LOW_STOCK"
                    ? "Reorder recommended"
                    : "Out of stock"}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className={`grid w-full grid-cols-3 ${surfaceClass} rounded-xl p-1`}>
            <TabsTrigger
              value="overview"
              className={`flex items-center rounded-lg data-[state=active]:text-white ${
                isNrepOrg
                  ? "data-[state=active]:bg-[var(--org-primary)]"
                  : "data-[state=active]:bg-orange-500"
              }`}
            >
              <Package className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              className={`flex items-center rounded-lg data-[state=active]:text-white ${
                isNrepOrg
                  ? "data-[state=active]:bg-[var(--org-primary)]"
                  : "data-[state=active]:bg-orange-500"
              }`}
            >
              <Activity className="w-4 h-4 mr-2" />
              Activity Log
            </TabsTrigger>
            <TabsTrigger
              value="custody"
              className={`flex items-center rounded-lg data-[state=active]:text-white ${
                isNrepOrg
                  ? "data-[state=active]:bg-[var(--org-primary)]"
                  : "data-[state=active]:bg-orange-500"
              }`}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Issues & Returns
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-6">
            <ConsumableOverview
              consumable={consumable}
              onUpdate={(consumable) => {
                router.push(`/admin/consumables/${consumable.$id}/edit`);
              }}
              onStockUpdated={() => {
                loadData();
              }}
            />
          </TabsContent>

          <TabsContent value="activity" className="space-y-6 mt-6">
            <ConsumableActivity consumableId={consumable.$id} />
          </TabsContent>

          <TabsContent value="custody" className="space-y-6 mt-6">
            <AssetCustody
              assetId={consumable.$id}
              onReturnProcessed={loadData}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
