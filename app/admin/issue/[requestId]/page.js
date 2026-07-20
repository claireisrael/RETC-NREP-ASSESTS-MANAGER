"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Textarea } from "../../../../components/ui/textarea";
import { Alert, AlertDescription } from "../../../../components/ui/alert";
import { Badge } from "../../../../components/ui/badge";
import {
  assetRequestsService,
  assetsService,
  assetIssuesService,
  staffService,
  writeAssetEvent,
} from "../../../../lib/appwrite/provider.js";
import { getCurrentStaff, permissions } from "../../../../lib/utils/auth.js";
import { ENUMS } from "../../../../lib/appwrite/config.js";
import { canIssueAsset } from "../../../../lib/utils/validation.js";
import { EmailService } from "../../../../lib/services/email.js";
import { assetImageService } from "../../../../lib/appwrite/image-service.js";
import { aggregateResolvedItems } from "../../../../lib/utils/requested-items.js";
import { isoToLocalDateInput } from "../../../../lib/utils/local-dates.js";
import { resolveIssueReturnable } from "../../../../lib/services/return-reports.js";

export default function IssueAssetsPage() {
  const params = useParams();
  const router = useRouter();
  const [request, setRequest] = useState(null);
  const [assets, setAssets] = useState([]);
  const [staff, setStaff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState("");

  // Issue form data
  const [issueData, setIssueData] = useState({});
  const [handoverNote, setHandoverNote] = useState("");
  const [expectedReturnDate, setExpectedReturnDate] = useState("");

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.requestId]);

  const loadData = async () => {
    try {
      const [requestData, currentStaff] = await Promise.all([
        assetRequestsService.get(params.requestId),
        getCurrentStaff(),
      ]);

      if (requestData.status !== ENUMS.REQUEST_STATUS.APPROVED) {
        setError("This request has not been approved yet.");
        return;
      }

      // Load assets and requester details
      const [assetsData, requester] = await Promise.all([
        Promise.all(
          requestData.requestedItems.map((id) => assetsService.get(id))
        ),
        staffService.get(requestData.requesterStaffId),
      ]);

      setRequest({ ...requestData, requester });
      const uniqueAssets = aggregateResolvedItems(assetsData).map(
        ({ item, quantity }) => ({
          ...item,
          requestQuantity: quantity,
        })
      );
      setAssets(uniqueAssets);
      setStaff(currentStaff);

      // Prefill return date from the request (required before issue).
      if (requestData.expectedReturnDate) {
        setExpectedReturnDate(
          isoToLocalDateInput(requestData.expectedReturnDate)
        );
      }

      // Initialize issue data for each asset
      const initialIssueData = {};
      uniqueAssets.forEach((asset) => {
        initialIssueData[asset.$id] = {
          preCondition: asset.currentCondition,
          accessories: [],
          customAccessory: "",
        };
      });
      setIssueData(initialIssueData);
    } catch (err) {
      setError("Failed to load request data.");
    } finally {
      setLoading(false);
    }
  };

  const updateAssetIssueData = (assetId, field, value) => {
    setIssueData((prev) => ({
      ...prev,
      [assetId]: {
        ...prev[assetId],
        [field]: value,
      },
    }));
  };

  const addAccessory = (assetId, accessory) => {
    if (!accessory.trim()) return;

    setIssueData((prev) => ({
      ...prev,
      [assetId]: {
        ...prev[assetId],
        accessories: [...prev[assetId].accessories, accessory.trim()],
        customAccessory: "",
      },
    }));
  };

  const removeAccessory = (assetId, index) => {
    setIssueData((prev) => ({
      ...prev,
      [assetId]: {
        ...prev[assetId],
        accessories: prev[assetId].accessories.filter((_, i) => i !== index),
      },
    }));
  };

  const handleIssue = async () => {
    setIssuing(true);
    setError("");

    try {
      const anyReturnable = assets.some((asset) =>
        resolveIssueReturnable(request, asset)
      );

      if (anyReturnable && !expectedReturnDate) {
        throw new Error(
          "Please set the expected return date before issuing returnable items. Reminder emails use this date."
        );
      }
      let returnDateIso = null;
      if (expectedReturnDate) {
        const returnDate = new Date(`${expectedReturnDate}T12:00:00`);
        if (Number.isNaN(returnDate.getTime())) {
          throw new Error("Expected return date is invalid.");
        }
        returnDateIso = returnDate.toISOString();
      }

      // Validate status, then assign custodian (set at issue time, not on create)
      for (const asset of assets) {
        canIssueAsset(asset);

        try {
          await assetsService.update(
            asset.$id,
            {
              custodianStaffId: request.requesterStaffId,
            },
            staff.$id,
            `Asset custodian changed to #${request.$id.slice(-8)}`
          );
          asset.custodianStaffId = request.requesterStaffId;
        } catch (err) {
          console.error("Error assigning custodian for asset:", asset.$id, err);
        }
      }

      // Create issue records for each asset (qty aggregated from duplicated IDs)
      const issuePromises = assets.map(async (asset) => {
        const assetIssueData = issueData[asset.$id];
        const qty = Math.max(1, Number(asset.requestQuantity) || 1);

        // Create issue record. requesterStaffId captures WHO received the item.
        const isReturnable = resolveIssueReturnable(request, asset);
        const issue = await assetIssuesService.create({
          requestId: request.$id,
          assetId: asset.$id,
          requesterStaffId: request.requesterStaffId,
          requesterName: request.requester?.name || null,
          quantity: qty,
          issuedByStaffId: staff.$id,
          preCondition: assetIssueData.preCondition,
          accessories: assetIssueData.accessories,
          issuedAt: new Date().toISOString(),
          dueAt: isReturnable ? returnDateIso : null,
          isReturnable,
          handoverNote,
          acknowledgedByRequester: false,
        });

        // Update asset/consumable status based on type
        if (asset.itemType === ENUMS.ITEM_TYPE.CONSUMABLE) {
          await assetsService.adjustConsumableStock(
            asset.$id,
            -qty,
            staff.$id,
            `Consumable issued for request #${request.$id.slice(-8)}`
          );
        } else {
          // For assets, mark as IN_USE
          await assetsService.update(
            asset.$id,
            {
              availableStatus: ENUMS.AVAILABLE_STATUS.IN_USE,
              custodianStaffId: request.requesterStaffId,
            },
            staff.$id,
            `Asset issued for request #${request.$id.slice(-8)}`
          );
        }

        // Write assignment event
        await writeAssetEvent(
          asset.$id,
          ENUMS.EVENT_TYPE.ASSIGNED,
          null,
          request.requester.name,
          staff.$id,
          `Issued to ${request.requester.name} for: ${request.purpose}`
        );

        return issue;
      });

      await Promise.all(issuePromises);

      // Persist return date + mark fulfilled so reminders can fire on that day.
      await assetRequestsService.update(request.$id, {
        status: ENUMS.REQUEST_STATUS.FULFILLED,
        ...(returnDateIso ? { expectedReturnDate: returnDateIso } : {}),
      });

      // Send email notification to requester about asset issuance
      try {
        await EmailService.sendAssetIssued(
          {
            ...request,
            expectedReturnDate: returnDateIso,
            handoverNote,
          },
          request.requester,
          assets,
          staff
        );
      } catch (error) {
        // Failed to send notification, but continue
      }

      router.push("/admin/requests");
    } catch (err) {
      setError(err.message || "Failed to issue assets");
    } finally {
      setIssuing(false);
    }
  };

  const canIssueAssets = staff && permissions.canIssueAssets(staff);

  if (loading) {
    return (
      <div
        className="min-h-screen"
        style={{
          background:
            "linear-gradient(160deg, var(--org-background), #ffffff 55%)",
        }}
      >
        <div className="max-w-5xl mx-auto p-6">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-10 text-center text-slate-600">
            Loading request…
          </div>
        </div>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div
        className="min-h-screen"
        style={{
          background:
            "linear-gradient(160deg, var(--org-background), #ffffff 55%)",
        }}
      >
        <div className="max-w-5xl mx-auto p-6">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-8">
            <Alert
              variant="destructive"
              className="bg-red-50 border-red-200 text-red-800"
            >
              <AlertDescription>
                {error || "Request not found"}
              </AlertDescription>
            </Alert>
            <div className="mt-6">
              <Button asChild variant="outline">
                <Link href="/admin/requests">Back to Requests</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!canIssueAssets) {
    return (
      <div
        className="min-h-screen"
        style={{
          background:
            "linear-gradient(160deg, var(--org-background), #ffffff 55%)",
        }}
      >
        <div className="max-w-5xl mx-auto p-6">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-10 text-center">
            <h1 className="text-2xl font-semibold text-slate-900 mb-2">
              Access Denied
            </h1>
            <p className="text-slate-600 mb-6">
              You don&apos;t have permission to issue assets.
            </p>
            <Button asChild className="bg-org-gradient border-0 text-white">
              <Link href="/admin/requests">Back to Requests</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background:
          "linear-gradient(160deg, var(--org-background), #ffffff 52%, color-mix(in srgb, var(--org-highlight) 8%, white) 100%)",
      }}
    >
      <div className="max-w-5xl mx-auto space-y-6 p-6">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white"
              style={{
                background:
                  "linear-gradient(135deg, var(--org-primary-dark), var(--org-primary))",
              }}
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
            </div>
            <div>
              <h1
                className="text-3xl font-bold tracking-tight"
                style={{
                  color:
                    "color-mix(in srgb, var(--org-primary-dark) 70%, #0f172a 30%)",
                }}
              >
                Issue Assets
              </h1>
              <p className="text-slate-600 mt-1">
                Hand over approved items to the requester and record conditions.
              </p>
            </div>
          </div>
        </div>

        {error && (
          <Alert
            variant="destructive"
            className="bg-red-50 border-red-200 text-red-800"
          >
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card className="rounded-2xl border border-slate-200/80 bg-white shadow-none">
          <CardHeader
            className="rounded-t-2xl border-b border-slate-100"
            style={{
              background:
                "linear-gradient(90deg, color-mix(in srgb, var(--org-primary) 10%, white), color-mix(in srgb, var(--org-highlight) 8%, white))",
            }}
          >
            <CardTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: "var(--org-primary)" }}
              />
              Request Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-slate-600 min-w-[110px] text-sm">
                    Request ID
                  </span>
                  <Badge className="bg-org-gradient text-white border-0 font-mono">
                    #{request.$id.slice(-8).toUpperCase()}
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium text-slate-600 min-w-[110px] text-sm">
                    Requester
                  </span>
                  <span className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800 border border-slate-100">
                    {request.requester.name}
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="font-medium text-slate-600 min-w-[110px] text-sm pt-2">
                    Purpose
                  </span>
                  <span className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 border border-slate-100 flex-1">
                    {request.purpose}
                  </span>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-slate-600 min-w-[130px] text-sm">
                    Issue Date
                  </span>
                  <span
                    className="rounded-lg px-3 py-2 text-sm border"
                    style={{
                      background:
                        "color-mix(in srgb, var(--org-primary) 12%, white)",
                      borderColor:
                        "color-mix(in srgb, var(--org-primary) 25%, transparent)",
                      color: "var(--org-primary-dark)",
                    }}
                  >
                    {new Date(request.issueDate).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor="expectedReturnDate"
                    className="font-medium text-slate-600 text-sm"
                  >
                    Expected Return Date{" "}
                    {assets.some((a) => resolveIssueReturnable(request, a)) ? (
                      <span className="text-red-500">*</span>
                    ) : (
                      <span className="text-slate-400 font-normal">
                        (not required)
                      </span>
                    )}
                  </Label>
                  <Input
                    id="expectedReturnDate"
                    type="date"
                    required={assets.some((a) =>
                      resolveIssueReturnable(request, a)
                    )}
                    value={expectedReturnDate}
                    onChange={(e) => setExpectedReturnDate(e.target.value)}
                    className="max-w-xs rounded-xl border-slate-200"
                    style={{
                      borderColor:
                        "color-mix(in srgb, var(--org-highlight) 40%, transparent)",
                    }}
                  />
                  <p className="text-xs text-slate-500">
                    Required when issuing returnable items (for due-date reminders).
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: "var(--org-highlight)" }}
            />
            Assets to Issue
          </h2>
          {assets.map((asset) => (
            <Card
              key={asset.$id}
              className="rounded-2xl border border-slate-200/80 bg-white shadow-none"
            >
              <CardHeader
                className="rounded-t-2xl border-b border-slate-100"
                style={{
                  background:
                    "linear-gradient(90deg, color-mix(in srgb, var(--org-primary) 8%, white), white)",
                }}
              >
                <CardTitle className="flex items-center justify-between text-lg font-semibold text-slate-800 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
                      style={{
                        background:
                          "linear-gradient(135deg, var(--org-primary), var(--org-primary-dark))",
                      }}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                        />
                      </svg>
                    </div>
                    <span className="truncate">{asset.name}</span>
                    {asset.requestQuantity > 1 && (
                      <Badge className="shrink-0 bg-slate-100 text-slate-700 border-slate-200 font-mono text-xs">
                        × {asset.requestQuantity}
                      </Badge>
                    )}
                  </div>
                  <Badge
                    className="shrink-0 border-0 text-white font-mono text-xs"
                    style={{
                      background:
                        "linear-gradient(135deg, var(--org-primary), var(--org-highlight))",
                    }}
                  >
                    {asset.assetTag}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="flex justify-center">
                  <div
                    className="w-44 h-44 rounded-2xl overflow-hidden border flex items-center justify-center"
                    style={{
                      borderColor:
                        "color-mix(in srgb, var(--org-primary) 20%, transparent)",
                      background:
                        "color-mix(in srgb, var(--org-background) 70%, white)",
                    }}
                  >
                    {asset.assetImage ? (
                      <img
                        src={
                          asset.assetImage.startsWith("http")
                            ? asset.assetImage
                            : assetImageService.getPublicImageUrl(
                                asset.assetImage
                              )
                        }
                        alt={asset.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.style.display = "none";
                          e.target.nextSibling.style.display = "flex";
                        }}
                      />
                    ) : null}
                    <div
                      className={`w-full h-full flex-col items-center justify-center text-slate-400 ${
                        asset.assetImage ? "hidden" : "flex"
                      }`}
                    >
                      <svg
                        className="w-12 h-12 mb-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                        />
                      </svg>
                      <p className="text-sm">No image</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700">
                      Pre-Issue Condition
                    </Label>
                    <select
                      className="w-full p-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-[var(--org-primary)]/30 focus:border-[var(--org-primary)]"
                      value={issueData[asset.$id]?.preCondition || ""}
                      onChange={(e) =>
                        updateAssetIssueData(
                          asset.$id,
                          "preCondition",
                          e.target.value
                        )
                      }
                    >
                      {Object.values(ENUMS.CURRENT_CONDITION).map(
                        (condition) => (
                          <option key={condition} value={condition}>
                            {condition.replace(/_/g, " ")}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700">
                      Location
                    </Label>
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-700">
                      {asset.locationName}
                      {asset.roomOrArea && ` — ${asset.roomOrArea}`}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-medium text-slate-700">
                    Accessories Included
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {issueData[asset.$id]?.accessories.map(
                      (accessory, index) => (
                        <Badge
                          key={index}
                          variant="outline"
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border"
                          style={{
                            background:
                              "color-mix(in srgb, var(--org-primary) 8%, white)",
                            borderColor:
                              "color-mix(in srgb, var(--org-primary) 22%, transparent)",
                            color: "var(--org-primary-dark)",
                          }}
                        >
                          {accessory}
                          <button
                            type="button"
                            onClick={() => removeAccessory(asset.$id, index)}
                            className="text-red-500 hover:text-red-700 ml-0.5"
                          >
                            ×
                          </button>
                        </Badge>
                      )
                    )}
                  </div>
                  <div className="flex gap-3">
                    <Input
                      placeholder="Add accessory…"
                      value={issueData[asset.$id]?.customAccessory || ""}
                      onChange={(e) =>
                        updateAssetIssueData(
                          asset.$id,
                          "customAccessory",
                          e.target.value
                        )
                      }
                      onKeyPress={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addAccessory(
                            asset.$id,
                            issueData[asset.$id]?.customAccessory
                          );
                        }
                      }}
                      className="flex-1 rounded-xl border-slate-200"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        addAccessory(
                          asset.$id,
                          issueData[asset.$id]?.customAccessory
                        )
                      }
                      className="bg-org-gradient border-0 text-white px-5"
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="rounded-2xl border border-slate-200/80 bg-white shadow-none">
          <CardHeader
            className="rounded-t-2xl border-b border-slate-100"
            style={{
              background:
                "linear-gradient(90deg, color-mix(in srgb, var(--org-highlight) 10%, white), white)",
            }}
          >
            <CardTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: "var(--org-highlight)" }}
              />
              Handover Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <Textarea
              value={handoverNote}
              onChange={(e) => setHandoverNote(e.target.value)}
              placeholder="Add any special instructions or notes for the requester…"
              rows={4}
              className="w-full rounded-xl border-slate-200 resize-none"
            />
          </CardContent>
        </Card>

        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:gap-4 justify-end pb-8">
          <Button
            variant="outline"
            onClick={() => router.back()}
            disabled={issuing}
            className="px-6"
          >
            Cancel
          </Button>
          <Button
            onClick={handleIssue}
            disabled={issuing}
            className="px-6 bg-org-gradient border-0 text-white"
          >
            {issuing ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Issuing…
              </div>
            ) : (
              "Issue Assets"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
