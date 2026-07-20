import React from "react"
import { Badge } from "./badge"
import { ENUMS } from "../../lib/appwrite/config"

// Status badge variants with predefined colors
const statusColors = {
  // Asset statuses
  [ENUMS.AVAILABLE_STATUS.AVAILABLE]: "bg-green-100 text-green-800 border-green-200",
  [ENUMS.AVAILABLE_STATUS.RESERVED]: "bg-yellow-100 text-yellow-800 border-yellow-200",
  [ENUMS.AVAILABLE_STATUS.IN_USE]: "bg-blue-100 text-blue-800 border-blue-200",
  [ENUMS.AVAILABLE_STATUS.AWAITING_RETURN]: "bg-orange-100 text-orange-800 border-orange-200",
  [ENUMS.AVAILABLE_STATUS.MAINTENANCE]: "bg-purple-100 text-purple-800 border-purple-200",
  [ENUMS.AVAILABLE_STATUS.REPAIR_REQUIRED]: "bg-red-100 text-red-800 border-red-200",
  [ENUMS.AVAILABLE_STATUS.OUT_FOR_SERVICE]: "bg-gray-100 text-gray-800 border-gray-200",
  [ENUMS.AVAILABLE_STATUS.AWAITING_DEPLOY]: "bg-cyan-100 text-cyan-800 border-cyan-200",
  [ENUMS.AVAILABLE_STATUS.PENDING_AVAILABILITY]: "bg-amber-100 text-amber-800 border-amber-200",
  [ENUMS.AVAILABLE_STATUS.RETIRED]: "bg-gray-100 text-gray-800 border-gray-200",
  [ENUMS.AVAILABLE_STATUS.DISPOSED]: "bg-black text-white border-black",

  // Asset conditions
  [ENUMS.CURRENT_CONDITION.NEW]: "bg-green-100 text-green-800 border-green-200",
  [ENUMS.CURRENT_CONDITION.LIKE_NEW]: "bg-green-100 text-green-800 border-green-200",
  [ENUMS.CURRENT_CONDITION.GOOD]: "bg-blue-100 text-blue-800 border-blue-200",
  [ENUMS.CURRENT_CONDITION.FAIR]: "bg-yellow-100 text-yellow-800 border-yellow-200",
  [ENUMS.CURRENT_CONDITION.POOR]: "bg-orange-100 text-orange-800 border-orange-200",
  [ENUMS.CURRENT_CONDITION.DAMAGED]: "bg-red-100 text-red-800 border-red-200",
  [ENUMS.CURRENT_CONDITION.SCRAP]: "bg-red-100 text-red-800 border-red-200",

  // Request statuses
  [ENUMS.REQUEST_STATUS.PENDING]: "bg-yellow-100 text-yellow-800 border-yellow-200",
  [ENUMS.REQUEST_STATUS.APPROVED]: "bg-green-100 text-green-800 border-green-200",
  [ENUMS.REQUEST_STATUS.DENIED]: "bg-red-100 text-red-800 border-red-200",
  [ENUMS.REQUEST_STATUS.CANCELLED]: "bg-gray-100 text-gray-800 border-gray-200",
  [ENUMS.REQUEST_STATUS.FULFILLED]: "bg-blue-100 text-blue-800 border-blue-200",

  // Return deltas
  [ENUMS.RETURN_DELTA.GOOD]: "bg-green-100 text-green-800 border-green-200",
  [ENUMS.RETURN_DELTA.OK]: "bg-yellow-100 text-yellow-800 border-yellow-200",
  [ENUMS.RETURN_DELTA.DAMAGED]: "bg-red-100 text-red-800 border-red-200",
}

// Format status text for display
const formatStatusText = (status) => {
  return status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
}

/**
 * StatusBadge Component
 * A specialized badge component for displaying asset statuses, conditions, and request states
 */
export function StatusBadge({ 
  status, 
  type = "status", // "status", "condition", "request", "return"
  showIcon = false,
  className = "",
  ...props 
}) {
  const colorClass = statusColors[status] || "bg-gray-100 text-gray-800 border-gray-200"
  const displayText = formatStatusText(status)

  // Optional icons for different status types
  const getStatusIcon = () => {
    if (!showIcon) return null

    switch (type) {
      case "status":
        if (status === ENUMS.AVAILABLE_STATUS.AVAILABLE) return "●"
        if (status === ENUMS.AVAILABLE_STATUS.IN_USE) return "◐"
        if (status === ENUMS.AVAILABLE_STATUS.MAINTENANCE) return "⚠"
        break
      case "condition":
        if (status === ENUMS.CURRENT_CONDITION.NEW) return "★"
        if (status === ENUMS.CURRENT_CONDITION.DAMAGED) return "✗"
        break
      case "request":
        if (status === ENUMS.REQUEST_STATUS.PENDING) return "⏳"
        if (status === ENUMS.REQUEST_STATUS.APPROVED) return "✓"
        if (status === ENUMS.REQUEST_STATUS.DENIED) return "✗"
        break
      default:
        return null
    }
    return null
  }

  const icon = getStatusIcon()

  return (
    <Badge
      className={`${colorClass} ${className}`}
      variant="outline"
      {...props}
    >
      {icon && <span className="mr-1">{icon}</span>}
      {displayText}
    </Badge>
  )
}

/**
 * Pre-configured status badge variants for common use cases
 */
export const AssetStatusBadge = (props) => (
  <StatusBadge type="status" {...props} />
)

export const AssetConditionBadge = (props) => (
  <StatusBadge type="condition" {...props} />
)

export const RequestStatusBadge = (props) => (
  <StatusBadge type="request" {...props} />
)

export const ReturnStatusBadge = (props) => (
  <StatusBadge type="return" {...props} />
)

/**
 * Multi-status badge group for displaying multiple statuses
 */
export function StatusBadgeGroup({ statuses = [], className = "", ...props }) {
  return (
    <div className={`flex flex-wrap gap-1 ${className}`} {...props}>
      {statuses.map((statusItem, index) => (
        <StatusBadge
          key={index}
          status={statusItem.status}
          type={statusItem.type || "status"}
          showIcon={statusItem.showIcon}
        />
      ))}
    </div>
  )
}