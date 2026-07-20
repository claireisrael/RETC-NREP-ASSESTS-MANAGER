"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Query } from "appwrite"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Textarea } from "../ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { Checkbox } from "../ui/checkbox"
import { Alert, AlertDescription } from "../ui/alert"
import { ImageUpload } from "../ui/image-upload"
import { AccessoriesEditor } from "./accessories-editor"
import { L2AvailabilityPicker } from "./l2-availability-picker"
import { assetsService, departmentsService, projectsService } from "../../lib/appwrite/provider.js"
import { ENUMS } from "../../lib/appwrite/config.js"
import { getCurrentStaff } from "../../lib/utils/auth.js"
import { validateAssetTag } from "../../lib/utils/validation.js"
import { formatCategory, mapToPublicCondition } from "../../lib/utils/mappings.js"
import { getSubcategoriesForCategory, hasPredefinedSubcategories } from "../../lib/constants/asset-subcategories.js"
import { useOrgTheme } from "../providers/org-theme-provider"
import { getCurrentOrgId } from "../../lib/utils/org"
import { assetImageService } from "../../lib/appwrite/image-service.js"


export function AssetForm({ asset, onSuccess }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [departments, setDepartments] = useState([])
  const [currentStaff, setCurrentStaff] = useState(null)
  const [projects, setProjects] = useState([])
  const { orgCode, theme } = useOrgTheme()
  const isNrepOrg = useMemo(() => orgCode?.toUpperCase() === "NREP", [orgCode])
  const activeOrgId = useMemo(() => theme?.appwriteOrgId || getCurrentOrgId(), [theme?.appwriteOrgId])
  const allowedProjectIdsRaw = useMemo(() => {
    const ids = theme?.projects?.allowedIds
    return Array.isArray(ids)
      ? ids.map((id) => id?.toString()).filter(Boolean)
      : []
  }, [theme?.projects?.allowedIds])
  const allowedProjectIds = useMemo(
    () => allowedProjectIdsRaw.map((id) => id.toLowerCase()),
    [allowedProjectIdsRaw]
  )
  const defaultProjectId = theme?.projects?.defaultId

  const parseImages = (images) => {
    if (!images) return []
    if (Array.isArray(images)) return images
    if (typeof images === "object" && images !== null) {
      return [
        images.assetViewUrl?.toString(),
        images.assetFileId?.toString().replace(/\/","/g, ""),
      ].filter(Boolean)
    }
    if (typeof images === "string") {
      try {
        return JSON.parse(images)
      } catch (error) {
        console.warn("Failed to parse public images", error)
        return []
      }
    }
    return []
  }

  const sanitiseAssetImage = (value) => {
    if (!value) return ""
    const trimmed = value.toString().trim()
    if (trimmed === "null" || trimmed === "undefined") return ""
    return trimmed
  }
  const sanitiseAssetFileId = (value) => {
    if (!value) return ""
    const trimmed = value.toString().trim()
    if (trimmed === "null" || trimmed === "undefined") return ""
    return trimmed
  }

  // Form data
  const [formData, setFormData] = useState({
    // Identity
    assetTag: "",
    serialNumber: "",
    name: "",

    // Classification
    category: "",
    subcategory: "",
    model: "",
    manufacturer: "",

    // Accessories that ship with this asset (e.g. Charger, Remote, HDMI cable)
    accessories: [],

    // L2 availability gate (new items)
    assignedAvailabilityL2StaffId: "",
    availabilityNote: "",

    // Ownership
    departmentId: "",

    // State
    availableStatus: ENUMS.AVAILABLE_STATUS.PENDING_AVAILABILITY,
    currentCondition: ENUMS.CURRENT_CONDITION.NEW,

    // Location
    locationName: "",
    roomOrArea: "",

    // Lifecycle dates
    purchaseDate: "",
    warrantyExpiryDate: "",
    lastMaintenanceDate: "",
    nextMaintenanceDue: "",

    // Public visibility
    isPublic: false,
    publicSummary: "",
    publicLocationLabel: "",
    publicConditionLabel: ENUMS.PUBLIC_CONDITION_LABEL.NEW,
    projectId: "",
  })
  const [publicImages, setPublicImages] = useState(() => parseImages(null))

  useEffect(() => {
    loadInitialData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNrepOrg, activeOrgId])

  useEffect(() => {
    if (asset) {
      setFormData({
        assetTag: asset.assetTag || "",
        serialNumber: asset.serialNumber || "",
        name: asset.name || "",
        category: asset.category || "",
        subcategory: asset.subcategory || "",
        model: asset.model || "",
        manufacturer: asset.manufacturer || "",
        accessories: Array.isArray(asset.accessories) ? asset.accessories : [],
        assignedAvailabilityL2StaffId:
          asset.assignedAvailabilityL2StaffId || "",
        availabilityNote: asset.availabilityNote || "",
        departmentId: asset.departmentId || "",
        availableStatus: asset.availableStatus || ENUMS.AVAILABLE_STATUS.AWAITING_DEPLOY,
        currentCondition: asset.currentCondition || ENUMS.CURRENT_CONDITION.NEW,
        locationName: asset.locationName || "",
        roomOrArea: asset.roomOrArea || "",
        purchaseDate: asset.purchaseDate ? asset.purchaseDate.split("T")[0] : "",
        warrantyExpiryDate: asset.warrantyExpiryDate ? asset.warrantyExpiryDate.split("T")[0] : "",
        lastMaintenanceDate: asset.lastMaintenanceDate ? asset.lastMaintenanceDate.split("T")[0] : "",
        nextMaintenanceDue: asset.nextMaintenanceDue ? asset.nextMaintenanceDue.split("T")[0] : "",
        isPublic: asset.isPublic || false,
        publicSummary: asset.publicSummary || "",
        publicLocationLabel: asset.publicLocationLabel || "",
        publicConditionLabel: asset.publicConditionLabel || mapToPublicCondition(asset.currentCondition),
        projectId: isNrepOrg ? asset.projectId || defaultProjectId || "" : "",
      })
      const images = parseImages(asset.publicImages)
      setPublicImages(images)
    } else {
      setPublicImages([])
    }
  }, [asset, isNrepOrg, defaultProjectId])

  const loadInitialData = async () => {
    try {
      const [deptResult, currentUser] = await Promise.all([
        departmentsService.list(),
        getCurrentStaff(),
      ])

      setDepartments(deptResult.documents)
      setCurrentStaff(currentUser)

      if (isNrepOrg) {
        const projectQueries = []
        if (allowedProjectIdsRaw.length > 0) {
          projectQueries.push(Query.equal("$id", allowedProjectIdsRaw))
        }

        const projectResult = await projectsService.list(projectQueries)
        const filteredProjects = (projectResult.documents || []).filter((project) => {
          const projectId = project.$id?.toString()?.toLowerCase()
          if (allowedProjectIds.length > 0) {
            return allowedProjectIds.includes(projectId)
          }
          const projectOrgCode = (project.orgCode || project.organizationCode || project.code || "").toUpperCase()
          if (projectOrgCode && orgCode) {
            return projectOrgCode === orgCode.toUpperCase()
          }
          const projectOrgId = project.orgId || project.organizationId
          if (projectOrgId && activeOrgId) {
            return projectOrgId === activeOrgId
          }
          return false
        })
        setProjects(filteredProjects)
        const initialProjectId = filteredProjects.find((project) => {
          if (!defaultProjectId) return false
          return project.$id === defaultProjectId
        })?.$id || filteredProjects[0]?.$id || ""
        setFormData((prev) => ({ ...prev, projectId: initialProjectId }))
      } else {
        setProjects([])
        setFormData((prev) => ({ ...prev, projectId: "" }))
      }
    } catch (error) {
      console.error("Failed to load form data:", error)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      // Validate asset tag
      validateAssetTag(formData.assetTag)

      if (isNrepOrg && !formData.projectId) {
        throw new Error("Please select a project before saving this asset.")
      }

      // Prepare data for submission
      const mergedPublicImages = Array.isArray(publicImages)
        ? publicImages
        : parseImages(publicImages)

      const firstUploadId = Array.isArray(mergedPublicImages)
        ? mergedPublicImages.find((img) => typeof img === "string" && !img.startsWith("http"))
        : undefined
      const firstImageUrl = mergedPublicImages.find(
        (img) => typeof img === "string" && img.startsWith("http")
      )

      // Decide primary asset image (optional)
      const resolvedAssetImage =
        firstImageUrl ||
        sanitiseAssetImage(asset?.assetImage) ||
        (firstUploadId ? assetImageService.getPublicImageUrl(firstUploadId) : "")

      // Build submitData, explicitly handling projectId based on organization
      // RETC doesn't use projects - only NREP requires projectId
      const { projectId: formProjectId, ...formDataWithoutProjectId } = formData;
      
      const cleanedAccessories = Array.isArray(formData.accessories)
        ? formData.accessories.map((a) => a.trim()).filter(Boolean)
        : []

      const isCreate = !asset
      if (isCreate && !formData.assignedAvailabilityL2StaffId) {
        throw new Error("Please select an L2 superadmin to confirm availability.")
      }

      const submitData = {
        ...formDataWithoutProjectId,
        custodianStaffId: asset?.custodianStaffId || "",
        accessories: cleanedAccessories,
        publicImages: JSON.stringify(mergedPublicImages || []),
        ...(resolvedAssetImage ? { assetImage: resolvedAssetImage } : {}),
        itemType: asset?.itemType || ENUMS.ITEM_TYPE.ASSET,
        // Convert dates to ISO strings
        purchaseDate: formData.purchaseDate ? new Date(formData.purchaseDate).toISOString() : null,
        warrantyExpiryDate: formData.warrantyExpiryDate ? new Date(formData.warrantyExpiryDate).toISOString() : null,
        lastMaintenanceDate: formData.lastMaintenanceDate ? new Date(formData.lastMaintenanceDate).toISOString() : null,
        nextMaintenanceDue: formData.nextMaintenanceDue ? new Date(formData.nextMaintenanceDue).toISOString() : null,

        // Initialize arrays
        attachmentFileIds: asset?.attachmentFileIds || [],
      }

      if (isCreate) {
        submitData.availabilityConfirmStatus =
          ENUMS.AVAILABILITY_CONFIRM_STATUS.PENDING
        submitData.availableStatus =
          ENUMS.AVAILABLE_STATUS.PENDING_AVAILABILITY
        submitData.assignedAvailabilityL2StaffId =
          formData.assignedAvailabilityL2StaffId
        submitData.availabilityNote = formData.availabilityNote || ""
      } else {
        delete submitData.assignedAvailabilityL2StaffId
        delete submitData.availabilityNote
      }

      // Handle projectId based on organization
      // Note: Appwrite schema requires projectId, so we must send a value
      // NREP requires a valid projectId, RETC uses a placeholder value
      const currentOrgCode = orgCode?.toUpperCase() || "";
      const isNrep = currentOrgCode === "NREP";
      
      if (isNrep) {
        // For NREP, require a valid projectId (validated above)
        const validProjectId = formProjectId && formProjectId.trim() !== "" ? formProjectId.trim() : null;
        if (validProjectId) {
          submitData.projectId = validProjectId;
        } else {
          // If NREP but no project selected, this will be caught by validation above
          // But we still don't want to send empty string
          delete submitData.projectId;
        }
      } else {
        // For RETC (or any non-NREP org), send a placeholder value
        // Since Appwrite schema requires projectId, we must send a value
        // Using a clearly identifiable placeholder that won't conflict with real project IDs
        submitData.projectId = "RETC_NO_PROJECT";
      }

      // Explicitly ensure orgId is included - try multiple sources in order of reliability
      let currentOrgId = 
        currentStaff?.orgId ||           // First: staff record (most reliable)
        theme?.appwriteOrgId;            // Second: theme from useOrgTheme (available immediately)
      
      // Third: Try API endpoint (works in production - server-side reads env vars at runtime)
      if (!currentOrgId || currentOrgId.trim() === "") {
        const { getCurrentOrgIdAsync } = await import("../../lib/utils/org.js");
        const apiOrgId = await getCurrentOrgIdAsync();
        if (apiOrgId) {
          currentOrgId = apiOrgId;
        }
      }
      
      // Fourth: Fallback to sync function (may not work in production if env vars weren't in build)
      if (!currentOrgId || currentOrgId.trim() === "") {
        currentOrgId = getCurrentOrgId();
      }
      
      if (!currentOrgId || currentOrgId.trim() === "") {
        throw new Error("Unable to determine organization. Please refresh the page and try again.");
      }
      submitData.orgId = currentOrgId.trim();

      if (asset) {
        // Update existing asset
        await assetsService.update(asset.$id, submitData, currentStaff?.$id, "Asset updated via form")
      } else {
        // Create new asset
        const created = await assetsService.create(submitData, currentStaff?.$id)
        try {
          const { notifyAvailabilityPending } = await import(
            "../../lib/services/return-availability-notifications.js"
          )
          await notifyAvailabilityPending({
            item: created,
            assignedL2StaffId: submitData.assignedAvailabilityL2StaffId,
            createdBy: currentStaff,
            orgId: submitData.orgId,
            orgCode: currentOrgCode,
          })
        } catch (notifyErr) {
          console.warn("Availability pending notify failed:", notifyErr)
        }
      }

      if (onSuccess) {
        onSuccess()
      } else {
        router.push("/assets")
      }
    } catch (err) {
      console.error("Asset save failed:", err);
      if (err?.code === "asset_tag_conflict") {
        setError("An asset with this tag already exists for this organisation. Please choose a different tag.")
      } else {
        const msg = err?.message || err?.toString?.() || "Failed to save asset";
        setError(msg);
      }
    } finally {
      setLoading(false)
    }
  }

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  // Changing category resets the subcategory unless the current value is still
  // valid within the newly selected category's predefined list.
  const handleCategoryChange = (value) => {
    setFormData((prev) => {
      const options = getSubcategoriesForCategory(value)
      const stillValid = options.some((opt) => opt.value === prev.subcategory)
      return {
        ...prev,
        category: value,
        subcategory: options.length > 0 ? (stillValid ? prev.subcategory : "") : prev.subcategory,
      }
    })
  }

  const subcategoryOptions = getSubcategoriesForCategory(formData.category)

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="assetTag">Asset Tag *</Label>
              <Input
                id="assetTag"
                value={formData.assetTag}
                onChange={(e) => updateField("assetTag", e.target.value)}
                placeholder={isNrepOrg ? "NREP-MECS-LAPTOP-001" : "RETC-LAPTOP-001"}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="serialNumber">Serial Number</Label>
              <Input
                id="serialNumber"
                value={formData.serialNumber}
                onChange={(e) => updateField("serialNumber", e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Asset Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => updateField("name", e.target.value)}
              required
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Classification */}
      <Card>
        <CardHeader>
          <CardTitle>Classification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select value={formData.category} onValueChange={handleCategoryChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(ENUMS.CATEGORY).map((category) => (
                    <SelectItem key={category} value={category}>
                      {formatCategory(category)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subcategory">Subcategory</Label>
              {subcategoryOptions.length > 0 ? (
                <Select
                  value={formData.subcategory}
                  onValueChange={(value) => updateField("subcategory", value)}
                  disabled={loading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select subcategory" />
                  </SelectTrigger>
                  <SelectContent>
                    {subcategoryOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="subcategory"
                  value={formData.subcategory}
                  onChange={(e) => updateField("subcategory", e.target.value)}
                  placeholder={formData.category ? "e.g. Router, Desk" : "Select a category first"}
                  disabled={loading}
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="manufacturer">Manufacturer</Label>
              <Input
                id="manufacturer"
                value={formData.manufacturer}
                onChange={(e) => updateField("manufacturer", e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="model">Model</Label>
              <Input
                id="model"
                value={formData.model}
                onChange={(e) => updateField("model", e.target.value)}
                disabled={loading}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Accessories */}
      <Card>
        <CardHeader>
          <CardTitle>Accessories</CardTitle>
          <p className="text-sm text-slate-500">
            List items that go with this asset (e.g. charger, remote, HDMI cable). Requesters can attach these when borrowing.
          </p>
        </CardHeader>
        <CardContent>
          <AccessoriesEditor
            value={formData.accessories}
            onChange={(next) => updateField("accessories", next)}
            disabled={loading}
            itemLabel="asset"
          />
        </CardContent>
      </Card>

      {!asset && (
        <Card>
          <CardHeader>
            <CardTitle>Availability confirmation</CardTitle>
          </CardHeader>
          <CardContent>
            <L2AvailabilityPicker
              value={formData.assignedAvailabilityL2StaffId}
              onChange={(v) =>
                updateField("assignedAvailabilityL2StaffId", v)
              }
              note={formData.availabilityNote}
              onNoteChange={(v) => updateField("availabilityNote", v)}
              disabled={loading}
            />
          </CardContent>
        </Card>
      )}

      {/* Ownership & Status */}
      <Card>
        <CardHeader>
          <CardTitle>Ownership & Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="departmentId">Department *</Label>
              <Select value={formData.departmentId} onValueChange={(value) => updateField("departmentId", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.$id} value={dept.$id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isNrepOrg && (
              <div className="space-y-2">
                <Label htmlFor="projectId">Project *</Label>
                <Select
                  value={formData.projectId}
                  onValueChange={(value) => updateField("projectId", value)}
                  disabled={loading || projects.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={projects.length ? "Select project" : "No projects available"} />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.$id} value={project.$id}>
                        {project.name || project.title || "Unnamed project"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {projects.length === 0 && (
                  <p className="text-sm text-amber-600">
                    No projects found for NREP. Create a project first to link this asset.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="availableStatus">Status</Label>
              <Select value={formData.availableStatus} onValueChange={(value) => updateField("availableStatus", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(ENUMS.AVAILABLE_STATUS).map((status) => (
                    <SelectItem key={status} value={status}>
                      {status.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="currentCondition">Condition</Label>
              <Select
                value={formData.currentCondition}
                onValueChange={(value) => updateField("currentCondition", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(ENUMS.CURRENT_CONDITION).map((condition) => (
                    <SelectItem key={condition} value={condition}>
                      {condition.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Location */}
      <Card>
        <CardHeader>
          <CardTitle>Location</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="locationName">Location Name *</Label>
              <Input
                id="locationName"
                value={formData.locationName}
                onChange={(e) => updateField("locationName", e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="roomOrArea">Room/Area</Label>
              <Input
                id="roomOrArea"
                value={formData.roomOrArea}
                onChange={(e) => updateField("roomOrArea", e.target.value)}
                disabled={loading}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Public Visibility */}
      <Card>
        <CardHeader>
          <CardTitle>Public Visibility</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isNrepOrg && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isPublic"
                checked={formData.isPublic}
                onCheckedChange={(checked) => updateField("isPublic", checked)}
              />
              <Label htmlFor="isPublic">Make this asset visible in the guest portal</Label>
            </div>
          )}

          {(!isNrepOrg && formData.isPublic) || isNrepOrg ? (
            <div className={`${!isNrepOrg ? "pl-6 border-l-2 border-blue-200 space-y-4" : "space-y-4"}`}>
              {!isNrepOrg && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="publicSummary">Public Summary</Label>
                    <Textarea
                      id="publicSummary"
                      value={formData.publicSummary}
                      onChange={(e) => updateField("publicSummary", e.target.value)}
                      placeholder="Brief description for public viewing..."
                      disabled={loading}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="publicLocationLabel">Public Location</Label>
                      <Input
                        id="publicLocationLabel"
                        value={formData.publicLocationLabel}
                        onChange={(e) => updateField("publicLocationLabel", e.target.value)}
                        placeholder="Main Lab"
                        disabled={loading}
                      />
                    </div>

                    <div className="space-y-2">
              <Label htmlFor="publicConditionLabel">Public Condition</Label>
                      <Select
                        value={formData.publicConditionLabel}
                        onValueChange={(value) => updateField("publicConditionLabel", value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.values(ENUMS.PUBLIC_CONDITION_LABEL).map((condition) => (
                            <SelectItem key={condition} value={condition}>
                              {condition.replace(/_/g, " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Asset Images (optional) */}
      <Card>
        <CardHeader>
          <CardTitle>Asset Images (optional)</CardTitle>
        </CardHeader>
        <CardContent>
          <ImageUpload
            assetId={asset?.$id || "new"}
            existingImages={publicImages}
            onImagesChange={setPublicImages}
            maxImages={10}
          />
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex gap-4">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : asset ? "Update Asset" : "Create Asset"}
        </Button>
      </div>
    </form>
  )
}
