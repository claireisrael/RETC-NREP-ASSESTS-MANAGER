"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../../components/ui/tabs";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { AssetOverview } from "../../../components/assets/asset-overview";
import { AssetActivity } from "../../../components/assets/asset-activity";
import { AssetCustody } from "../../../components/assets/asset-custody";
import { assetsService } from "../../../lib/appwrite/provider.js";
import { assetImageService } from "../../../lib/appwrite/image-service.js";
import {
  getCurrentStaff,
  permissions,
  getCurrentViewMode,
} from "../../../lib/utils/auth.js";
import {
  getStatusBadgeColor,
  getConditionBadgeColor,
  formatCategory,
} from "../../../lib/utils/mappings.js";
import { ArrowLeft, ImageIcon, Edit3, Package, FileText } from "lucide-react";

export default function AssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [asset, setAsset] = useState(null);
  const [staff, setStaff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadAssetData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const loadAssetData = async () => {
    try {
      const [assetData, currentStaff] = await Promise.all([
        assetsService.get(params.id),
        getCurrentStaff(),
      ]);

      setAsset(assetData);
      setStaff(currentStaff);
    } catch (err) {
      setError("Asset not found or you don't have permission to view it.");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    // If this detail page was opened from the admin assets screen,
    // the URL will include ?view=admin. In that case, ALWAYS go back
    // to the admin assets management screen, regardless of any other state.
    const openedFromAdmin = !!searchParams?.get("view");

    if (openedFromAdmin) {
      router.push("/admin/assets");
      return;
    }

    // Fallback: normal user assets list
    router.push("/assets");
  };

  const canManageAssets =
    staff &&
    permissions.canManageAssets(staff) &&
    getCurrentViewMode() === "admin";

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-green-100 rounded w-1/3"></div>
          <div className="h-64 bg-green-50 rounded-lg"></div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-48 bg-green-50 rounded-lg"></div>
            <div className="h-48 bg-green-50 rounded-lg"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !asset) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="space-y-6">
          <Alert className="border-red-200 bg-red-50">
            <AlertDescription className="text-red-800">
              {error || "Asset not found"}
            </AlertDescription>
          </Alert>
          <div className="mt-4">
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleBack}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Assets
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Get asset image URL
  const getAssetImageUrl = () => {
    if (asset.assetImage) {
      // Check if it's already a full URL
      if (asset.assetImage.startsWith("http")) {
        return asset.assetImage;
      }
      // Generate URL from file ID
      return assetImageService.getImageUrl(asset.assetImage);
    }
    return null;
  };

  const assetImageUrl = getAssetImageUrl();

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="space-y-4 sm:space-y-6">
        {/* Mobile-optimized Header */}
        <div className="space-y-4">
          {/* Back Button */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-green-600 hover:text-green-700 hover:bg-green-50"
              onClick={handleBack}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Assets
            </Button>
          </div>

          {/* Title and Public Badge */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 truncate">
                {asset.name}
              </h1>
              {asset.isPublic && (
                <Badge className="bg-blue-100 text-blue-800 border-blue-200 flex-shrink-0">
                  Public
                </Badge>
              )}
            </div>

            {/* Request Asset button for regular users */}
            {getCurrentViewMode() === "user" && (
              <Button
                onClick={() => router.push("/requests/new?type=asset")}
                className="bg-primary-600 hover:bg-primary-700 text-white w-full sm:w-auto"
              >
                <FileText className="w-4 h-4 mr-2" />
                Request Asset
              </Button>
            )}
          </div>

          {/* Status Badges */}
          <div className="flex flex-wrap gap-2">
            <Badge className={getStatusBadgeColor(asset.availableStatus)}>
              {asset.availableStatus.replace(/_/g, " ")}
            </Badge>
            <Badge className={getConditionBadgeColor(asset.currentCondition)}>
              {asset.currentCondition.replace(/_/g, " ")}
            </Badge>
            <Badge className="bg-gray-100 text-gray-800 border-gray-200">
              {formatCategory(asset.category)}
            </Badge>
          </div>

          {/* Asset Details */}
          <div className="text-sm text-gray-600 space-y-1">
            <p>
              <span className="font-semibold text-gray-700">Asset Tag:</span>{" "}
              <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                {asset.assetTag}
              </span>
            </p>
            {asset.serialNumber && (
              <p>
                <span className="font-semibold text-gray-700">Serial:</span>{" "}
                <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                  {asset.serialNumber}
                </span>
              </p>
            )}
          </div>

          {/* Admin Action Buttons - Mobile responsive */}
          {canManageAssets && (
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <Button
                asChild
                variant="outline"
                className="border-green-200 text-green-700 hover:bg-green-50 flex-1 sm:flex-none"
              >
                <Link
                  href={`/admin/assets/${asset.$id}/edit`}
                  className="flex items-center justify-center"
                >
                  <Edit3 className="w-4 h-4 mr-2" />
                  Edit Asset
                </Link>
              </Button>
              <Button
                asChild
                className="bg-green-600 hover:bg-green-700 text-white flex-1 sm:flex-none"
              >
                <Link
                  href={`/admin/issue?asset=${asset.$id}`}
                  className="flex items-center justify-center"
                >
                  <Package className="w-4 h-4 mr-2" />
                  Issue Asset
                </Link>
              </Button>
            </div>
          )}
        </div>

        {/* Asset Image Section */}
        {assetImageUrl && (
          <Card className="border-green-200 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-green-800 flex items-center gap-2 text-lg">
                <ImageIcon className="w-5 h-5" />
                Asset Image
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex justify-center">
                <div className="relative group">
                  <img
                    src={assetImageUrl}
                    alt={asset.name}
                    className="w-48 h-48 object-cover rounded-lg shadow-md border border-green-200 hover:shadow-lg transition-shadow duration-200"
                    onError={(e) => {
                      e.target.style.display = "none";
                      e.target.nextElementSibling.style.display = "flex";
                    }}
                  />
                  <div className="hidden items-center justify-center w-48 h-48 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300">
                    <div className="text-center">
                      <ImageIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm">
                        Image not available
                      </p>
                    </div>
                  </div>
                  {/* Hover overlay for better UX */}
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 rounded-lg transition-all duration-200 flex items-center justify-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="bg-white/90 hover:bg-white"
                      >
                        View Full Size
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="bg-green-50 border-green-200">
            <TabsTrigger
              value="overview"
              className="data-[state=active]:bg-green-600 data-[state=active]:text-white"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              className="data-[state=active]:bg-green-600 data-[state=active]:text-white"
            >
              Activity
            </TabsTrigger>
            <TabsTrigger
              value="custody"
              className="data-[state=active]:bg-green-600 data-[state=active]:text-white"
            >
              Custody
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <AssetOverview asset={asset} onUpdate={loadAssetData} />
          </TabsContent>

          <TabsContent value="activity">
            <AssetActivity assetId={asset.$id} />
          </TabsContent>

          <TabsContent value="custody">
            <AssetCustody assetId={asset.$id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
