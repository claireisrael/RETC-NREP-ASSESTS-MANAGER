"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../../components/ui/tabs";
import { assetsService } from "../../../lib/appwrite/provider.js";
import { getCurrentStaff } from "../../../lib/utils/auth.js";
import {
  getCurrentStock,
  getConsumableStatus,
  getConsumableUnit,
  getConsumableStatusBadgeColor,
} from "../../../lib/utils/mappings.js";
import { ConsumableOverview } from "../../../components/assets/consumable-overview";
import { ConsumableActivity } from "../../../components/assets/consumable-activity";
import {
  ArrowLeft,
  Package,
  Activity,
  ShoppingCart,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from "lucide-react";

export default function ConsumableDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [consumable, setConsumable] = useState(null);
  const [currentStaff, setCurrentStaff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const getStatusIcon = (consumable) => {
    const status = getConsumableStatus(consumable);
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

  const getStatusText = (status) => {
    return status
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="!bg-white !text-slate-700 !border-slate-300 hover:!bg-slate-50 shadow-none flex items-center"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {consumable.name}
            </h1>
            <p className="text-gray-600">Consumable Details</p>
          </div>
        </div>
        <Button
          variant="request"
          onClick={() =>
            router.push(
              `/requests/new?type=consumable&itemId=${encodeURIComponent(
                consumable.$id
              )}`
            )
          }
          disabled={getConsumableStatus(consumable) === "OUT_OF_STOCK"}
        >
          <ShoppingCart className="w-4 h-4 mr-2" />
          Request Item
        </Button>
      </div>

      {/* Status Banner */}
      <Card
        className={`border-2 ${
          getConsumableStatusBadgeColor(getConsumableStatus(consumable)).split(
            " "
          )[0]
        }-200`}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {getStatusIcon(consumable)}
              <div>
                <h3 className="font-semibold text-lg">
                  {getStatusText(getConsumableStatus(consumable))}
                </h3>
                <p className="text-sm text-gray-600">
                  Current Stock: {getCurrentStock(consumable)}{" "}
                  {getConsumableUnit(consumable)?.toLowerCase()}
                </p>
              </div>
            </div>
            <Badge
              className={getConsumableStatusBadgeColor(
                getConsumableStatus(consumable)
              )}
            >
              {getStatusText(getConsumableStatus(consumable))}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="overview" className="flex items-center">
            <Package className="w-4 h-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex items-center">
            <Activity className="w-4 h-4 mr-2" />
            Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <ConsumableOverview
            consumable={consumable}
            onUpdate={(consumable) => {
              // TODO: Handle update
              // Update consumable functionality
            }}
          />
        </TabsContent>

        <TabsContent value="activity" className="space-y-6">
          <ConsumableActivity consumableId={consumable.$id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
