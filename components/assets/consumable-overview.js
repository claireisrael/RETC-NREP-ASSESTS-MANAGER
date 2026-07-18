"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
import { Button } from "../ui/button";
import {
  departmentsService,
  staffService,
} from "../../lib/appwrite/provider.js";
import { getConsumableRecipients } from "../../lib/utils/holders.js";
import { APPWRITE_CONFIG, BUCKETS } from "../../lib/appwrite/config.js";
import {
  getStatusBadgeColor,
  formatCategory,
  getCurrentStock,
  getMinStock,
  getMaxStock,
  getConsumableStatus,
  getConsumableUnit,
  getConsumableCategory,
  getConsumableStatusBadgeColor,
} from "../../lib/utils/mappings.js";
import {
  getCurrentStaff,
  permissions,
  getCurrentViewMode,
} from "../../lib/utils/auth.js";
// import { ConsumableDistributionForm } from "./consumable-distribution-form.js";
import { ConsumableStockForm } from "./consumable-stock-form.js";

export function ConsumableOverview({ consumable, onUpdate, onStockUpdated }) {
  const [department, setDepartment] = useState(null);
  const [custodian, setCustodian] = useState(null);
  const [staff, setStaff] = useState(null);
  const [recipients, setRecipients] = useState([]);

  useEffect(() => {
    loadRelatedData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consumable]);

  const loadRelatedData = async () => {
    try {
      const [currentStaff] = await Promise.all([getCurrentStaff()]);
      setStaff(currentStaff);

      if (consumable.departmentId) {
        const deptData = await departmentsService.get(consumable.departmentId);
        setDepartment(deptData);
      }

      if (consumable.custodianStaffId) {
        const custodianData = await staffService.get(
          consumable.custodianStaffId
        );
        setCustodian(custodianData);
      }

      // Who has received units of this consumable (recent first).
      const recipientList = await getConsumableRecipients(consumable.$id);
      setRecipients(recipientList);
    } catch (error) {
      console.error("Failed to load related data:", error);
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleString();
  };

  const formatDate = (dateString) => {
    if (!dateString) return "Not set";
    return new Date(dateString).toLocaleDateString();
  };

  const getStockStatusText = (status) => {
    return status
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const canManageConsumables =
    staff &&
    permissions.canManageConsumables(staff) &&
    getCurrentViewMode() === "admin";

  // Parse images
  const images = consumable.publicImages
    ? typeof consumable.publicImages === "string"
      ? JSON.parse(consumable.publicImages || "[]")
      : consumable.publicImages
    : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Consumable Images (if available) */}
      {images.length > 0 && (
        <Card className="border-orange-200 bg-white lg:col-span-2">
          <CardHeader className="bg-orange-50 border-b border-orange-200">
            <CardTitle className="text-orange-800">Images</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {images.map((imageId, index) => (
                <div
                  key={imageId}
                  className="relative aspect-square rounded-lg overflow-hidden border-2 border-gray-200 hover:border-orange-400 transition-colors"
                >
                  <img
                    src={`${APPWRITE_CONFIG.endpoint}/storage/buckets/${BUCKETS.PUBLIC_IMAGES}/files/${imageId}/view?project=${APPWRITE_CONFIG.projectId}`}
                    alt={`${consumable.name} - Image ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  {index === 0 && (
                    <div className="absolute top-2 right-2 bg-orange-500 text-white text-xs px-2 py-1 rounded">
                      Primary
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Basic Information */}
      <Card className="border-green-200 bg-white">
        <CardHeader className="bg-green-50 border-b border-green-200">
          <CardTitle className="text-green-800">Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold text-gray-700 mb-1">Name</h4>
            <p className="text-lg font-medium text-gray-900">
              {consumable.name}
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-gray-700 mb-1">Category</h4>
            <p className="text-sm bg-green-50 px-3 py-2 rounded border border-green-200">
              {formatCategory(getConsumableCategory(consumable))}
            </p>
          </div>

          {consumable.subcategory && (
            <div>
              <h4 className="font-semibold text-gray-700 mb-1">Subcategory</h4>
              <p className="text-sm bg-green-50 px-3 py-2 rounded border border-green-200">
                {consumable.subcategory}
              </p>
            </div>
          )}

          {consumable.manufacturer && (
            <div>
              <h4 className="font-semibold text-gray-700 mb-1">Manufacturer</h4>
              <p className="text-sm bg-gray-50 px-3 py-2 rounded border">
                {consumable.manufacturer}
              </p>
            </div>
          )}

          {consumable.model && (
            <div>
              <h4 className="font-semibold text-gray-700 mb-1">Model</h4>
              <p className="text-sm bg-gray-50 px-3 py-2 rounded border">
                {consumable.model}
              </p>
            </div>
          )}

          {consumable.description && (
            <div>
              <h4 className="font-semibold text-gray-700 mb-1">Description</h4>
              <p className="text-sm text-gray-600">{consumable.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stock Information */}
      <Card className="border-blue-200 bg-white">
        <CardHeader className="bg-blue-50 border-b border-blue-200">
          <CardTitle className="text-blue-800">Stock Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold text-gray-700 mb-1">
                Current Stock
              </h4>
              <p className="text-2xl font-bold text-blue-600">
                {getCurrentStock(consumable)}{" "}
                {getConsumableUnit(consumable)?.toLowerCase()}
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-gray-700 mb-1">Status</h4>
              <Badge
                className={getConsumableStatusBadgeColor(
                  getConsumableStatus(consumable)
                )}
              >
                {getStockStatusText(getConsumableStatus(consumable))}
              </Badge>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold text-gray-700 mb-1">
                Minimum Stock
              </h4>
              <p className="text-sm text-gray-600">
                {getMinStock(consumable)}{" "}
                {/* {getConsumableUnit(consumable)?.toLowerCase()} */}
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-gray-700 mb-1">
                Maximum Stock
              </h4>
              <p className="text-sm text-gray-600">
                {getMaxStock(consumable)}{" "}
                {/* {getConsumableUnit(consumable)?.toLowerCase()} */}
              </p>
            </div>
          </div>

          {consumable.reorderPoint > 0 && (
            <div>
              <h4 className="font-semibold text-gray-700 mb-1">
                Reorder Point
              </h4>
              <p className="text-sm text-gray-600">
                {consumable.reorderPoint}{" "}
                {getConsumableUnit(consumable)?.toLowerCase()}
              </p>
            </div>
          )}

          {consumable.supplier && (
            <div>
              <h4 className="font-semibold text-gray-700 mb-1">Supplier</h4>
              <p className="text-sm text-gray-600">{consumable.supplier}</p>
            </div>
          )}

          {consumable.purchaseCost && (
            <div>
              <h4 className="font-semibold text-gray-700 mb-1">Unit Cost</h4>
              <p className="text-sm text-gray-600">
                ${Number(consumable.purchaseCost).toFixed(2)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Location & Ownership */}
      <Card className="border-purple-200 bg-white">
        <CardHeader className="bg-purple-50 border-b border-purple-200">
          <CardTitle className="text-purple-800">
            Location & Ownership
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {department && (
            <div>
              <h4 className="font-semibold text-gray-700 mb-1">Department</h4>
              <p className="text-sm bg-purple-50 px-3 py-2 rounded border border-purple-200">
                {department.name}
              </p>
            </div>
          )}

          {custodian && (
            <div>
              <h4 className="font-semibold text-gray-700 mb-1">Custodian</h4>
              <p className="text-sm bg-gray-50 px-3 py-2 rounded border">
                {custodian.name}
              </p>
            </div>
          )}

          {consumable.locationName && (
            <div>
              <h4 className="font-semibold text-gray-700 mb-1">Location</h4>
              <p className="text-sm text-gray-600">{consumable.locationName}</p>
            </div>
          )}

          {consumable.roomOrArea && (
            <div>
              <h4 className="font-semibold text-gray-700 mb-1">Room/Area</h4>
              <p className="text-sm text-gray-600">{consumable.roomOrArea}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Accessories */}
      {Array.isArray(consumable.accessories) &&
        consumable.accessories.length > 0 && (
          <Card className="border-green-200 bg-white lg:col-span-2">
            <CardHeader className="bg-green-50 border-b border-green-200">
              <CardTitle className="text-green-800">Accessories</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-2">
                {consumable.accessories.map((accessory, index) => (
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

      {/* Recent Recipients - who has received units of this consumable */}
      <Card className="border-amber-200 bg-white lg:col-span-2">
        <CardHeader className="bg-amber-50 border-b border-amber-200">
          <CardTitle className="text-amber-800">
            Recent Recipients
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {recipients.length === 0 ? (
            <p className="text-sm text-gray-500">
              No one has been issued this consumable yet.
            </p>
          ) : (
            <div className="space-y-2">
              {recipients.map((recipient, index) => (
                <div
                  key={`${recipient.name}-${recipient.issuedAt}-${index}`}
                  className="flex items-center justify-between rounded border border-gray-100 bg-gray-50 px-3 py-2"
                >
                  <span className="text-sm font-medium text-gray-800">
                    {recipient.name}
                  </span>
                  <span className="text-xs text-gray-500">
                    {recipient.quantity > 1 ? `${recipient.quantity} units · ` : ""}
                    {formatDateTime(recipient.issuedAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lifecycle Information */}
      <Card className="border-orange-200 bg-white">
        <CardHeader className="bg-orange-50 border-b border-orange-200">
          <CardTitle className="text-orange-800">
            Lifecycle Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {consumable.purchaseDate && (
            <div>
              <h4 className="font-semibold text-gray-700 mb-1">
                Purchase Date
              </h4>
              <p className="text-sm text-gray-600">
                {formatDate(consumable.purchaseDate)}
              </p>
            </div>
          )}

          {consumable.expiryDate && (
            <div>
              <h4 className="font-semibold text-gray-700 mb-1">Expiry Date</h4>
              <p className="text-sm text-gray-600">
                {formatDate(consumable.expiryDate)}
              </p>
            </div>
          )}

          <div>
            <h4 className="font-semibold text-gray-700 mb-1">Created</h4>
            <p className="text-sm text-gray-600">
              {formatDate(consumable.$createdAt)}
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-gray-700 mb-1">Last Updated</h4>
            <p className="text-sm text-gray-600">
              {formatDate(consumable.$updatedAt)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      {canManageConsumables && (
        <Card className="border-gray-200 bg-white lg:col-span-2">
          <CardHeader className="bg-gray-50 border-b border-gray-200">
            <CardTitle className="text-gray-800">Actions</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="flex space-x-4">
              <Button
                onClick={() => onUpdate && onUpdate(consumable)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Edit Consumable
              </Button>
              <ConsumableStockForm
                consumable={consumable}
                onStockUpdated={onStockUpdated}
              />
              {/* <ConsumableDistributionForm
                consumable={consumable}
                onDistributed={onStockUpdated}
              /> */}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
