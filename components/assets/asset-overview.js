"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
import {
  departmentsService,
  staffService,
} from "../../lib/appwrite/provider.js";
import {
  getStatusBadgeColor,
  getConditionBadgeColor,
  formatCategory,
} from "../../lib/utils/mappings.js";
import { formatSubcategory } from "../../lib/constants/asset-subcategories.js";
import {
  getCurrentStaff,
  permissions,
  getCurrentViewMode,
} from "../../lib/utils/auth.js";

export function AssetOverview({ asset, onUpdate }) {
  const [department, setDepartment] = useState(null);
  const [custodian, setCustodian] = useState(null);
  const [staff, setStaff] = useState(null);

  useEffect(() => {
    loadRelatedData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset]);

  const loadRelatedData = async () => {
    try {
      const [currentStaff] = await Promise.all([getCurrentStaff()]);
      setStaff(currentStaff);

      if (asset.departmentId) {
        const deptData = await departmentsService.get(asset.departmentId);
        setDepartment(deptData);
      }

      if (asset.custodianStaffId) {
        const custodianData = await staffService.get(asset.custodianStaffId);
        setCustodian(custodianData);
      }
    } catch (error) {
      console.error("Failed to load related data:", error);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "Not set";
    return new Date(dateString).toLocaleDateString();
  };

  const canManageAssets =
    staff &&
    permissions.canManageAssets(staff) &&
    getCurrentViewMode() === "admin";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Basic Information */}
      <Card className="border-green-200 bg-white">
        <CardHeader className="bg-green-50 border-b border-green-200">
          <CardTitle className="text-green-800">Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold text-gray-700 mb-1">Asset Tag</h4>
            <p className="font-mono text-sm bg-gray-100 px-3 py-2 rounded border">
              {asset.assetTag}
            </p>
          </div>

          {asset.serialNumber && (
            <div>
              <h4 className="font-semibold text-gray-700 mb-1">
                Serial Number
              </h4>
              <p className="font-mono text-sm bg-gray-100 px-3 py-2 rounded border">
                {asset.serialNumber}
              </p>
            </div>
          )}

          <div>
            <h4 className="font-semibold text-gray-700 mb-1">Category</h4>
            <p className="text-sm bg-green-50 px-3 py-2 rounded border border-green-200">
              {formatCategory(asset.category)}
            </p>
          </div>

          {asset.subcategory && (
            <div>
              <h4 className="font-semibold text-gray-700 mb-1">Subcategory</h4>
              <p className="text-sm bg-green-50 px-3 py-2 rounded border border-green-200">
                {formatSubcategory(asset.subcategory)}
              </p>
            </div>
          )}

          {asset.manufacturer && (
            <div>
              <h4 className="font-semibold text-gray-700 mb-1">Manufacturer</h4>
              <p className="text-sm bg-gray-50 px-3 py-2 rounded border">
                {asset.manufacturer}
              </p>
            </div>
          )}

          {asset.model && (
            <div>
              <h4 className="font-semibold text-gray-700 mb-1">Model</h4>
              <p className="text-sm bg-gray-50 px-3 py-2 rounded border">
                {asset.model}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status & Condition */}
      <Card className="border-green-200 bg-white">
        <CardHeader className="bg-green-50 border-b border-green-200">
          <CardTitle className="text-green-800">Status & Condition</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold text-gray-700 mb-2">Current Status</h4>
            <Badge className={getStatusBadgeColor(asset.availableStatus)}>
              {asset.availableStatus.replace(/_/g, " ")}
            </Badge>
          </div>

          <div>
            <h4 className="font-semibold text-gray-700 mb-2">Condition</h4>
            <Badge className={getConditionBadgeColor(asset.currentCondition)}>
              {asset.currentCondition.replace(/_/g, " ")}
            </Badge>
          </div>

          <Separator className="bg-green-200" />

          <div>
            <h4 className="font-semibold text-gray-700 mb-1">Department</h4>
            <p className="text-sm bg-gray-50 px-3 py-2 rounded border">
              {department?.name || "Loading..."}
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-gray-700 mb-1">Custodian</h4>
            <p className="text-sm bg-gray-50 px-3 py-2 rounded border">
              {custodian?.name || "Not assigned"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Location */}
      <Card className="border-green-200 bg-white">
        <CardHeader className="bg-green-50 border-b border-green-200">
          <CardTitle className="text-green-800">Location</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold text-gray-700 mb-1">Location</h4>
            <p className="text-sm bg-green-50 px-3 py-2 rounded border border-green-200">
              {asset.locationName}
            </p>
          </div>

          {asset.roomOrArea && (
            <div>
              <h4 className="font-semibold text-gray-700 mb-1">Room/Area</h4>
              <p className="text-sm bg-gray-50 px-3 py-2 rounded border">
                {asset.roomOrArea}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lifecycle Dates */}
      <Card className="border-green-200 bg-white">
        <CardHeader className="bg-green-50 border-b border-green-200">
          <CardTitle className="text-green-800">
            Lifecycle Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold text-gray-700 mb-1">Purchase Date</h4>
            <p className="text-sm bg-gray-50 px-3 py-2 rounded border">
              {formatDate(asset.purchaseDate)}
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-gray-700 mb-1">
              Warranty Expiry
            </h4>
            <p className="text-sm bg-gray-50 px-3 py-2 rounded border">
              {formatDate(asset.warrantyExpiryDate)}
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-gray-700 mb-1">
              Last Maintenance
            </h4>
            <p className="text-sm bg-gray-50 px-3 py-2 rounded border">
              {formatDate(asset.lastMaintenanceDate)}
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-gray-700 mb-1">
              Next Maintenance Due
            </h4>
            <p className="text-sm bg-gray-50 px-3 py-2 rounded border">
              {formatDate(asset.nextMaintenanceDue)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Accessories */}
      {Array.isArray(asset.accessories) && asset.accessories.length > 0 && (
        <Card className="lg:col-span-2 border-green-200 bg-white">
          <CardHeader className="bg-green-50 border-b border-green-200">
            <CardTitle className="text-green-800">Accessories</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-2">
              {asset.accessories.map((accessory, index) => (
                <Badge
                  key={`${accessory}-${index}`}
                  className="bg-gray-100 text-gray-800 border border-gray-200"
                >
                  {accessory}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Public Visibility */}
      {asset.isPublic && (
        <Card className="lg:col-span-2 border-green-200 bg-white">
          <CardHeader className="bg-green-50 border-b border-green-200">
            <CardTitle className="flex items-center gap-2 text-green-800">
              Public Visibility
              <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                Visible to Guests
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {asset.publicSummary && (
              <div>
                <h4 className="font-semibold text-gray-700 mb-1">
                  Public Summary
                </h4>
                <p className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded border">
                  {asset.publicSummary}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {asset.publicLocationLabel && (
                <div>
                  <h4 className="font-semibold text-gray-700 mb-1">
                    Public Location
                  </h4>
                  <p className="text-sm bg-green-50 px-3 py-2 rounded border border-green-200">
                    {asset.publicLocationLabel}
                  </p>
                </div>
              )}

              {asset.publicConditionLabel && (
                <div>
                  <h4 className="font-semibold text-gray-700 mb-1">
                    Public Condition
                  </h4>
                  <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                    {asset.publicConditionLabel.replace(/_/g, " ")}
                  </Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
