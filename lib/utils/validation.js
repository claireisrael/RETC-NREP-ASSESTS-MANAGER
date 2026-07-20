import { ENUMS } from "../appwrite/config.js"
import { parseLocalDateInput, startOfLocalDay } from "./local-dates.js"

// Validate asset request dates
export function validateRequestDates(issueDate, expectedReturnDate) {
  const issue = parseLocalDateInput(issueDate)
  const expectedReturn = parseLocalDateInput(expectedReturnDate)

  if (!issue || !expectedReturn) {
    throw new Error("Issue date and expected return date are required")
  }

  if (issue >= expectedReturn) {
    throw new Error("Issue date must be before expected return date")
  }

  if (issue < startOfLocalDay()) {
    throw new Error("Issue date cannot be in the past")
  }

  return true
}

// Validate asset tag format: ORG-TYPE-NUM (e.g. RETC-LAPTOP-001) or ORG-PROJECT-TYPE-NUM (e.g. NREP-MECS-LAPTOP-001)
export function validateAssetTag(assetTag) {
  const threePart = /^[A-Z0-9]+-[A-Z0-9]+-\d{3,}$/
  const fourPart = /^[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+-\d{3,}$/
  if (!threePart.test(assetTag) && !fourPart.test(assetTag)) {
    throw new Error("Asset tag must follow format: ORG-TYPE-NUMBER (e.g. RETC-LAPTOP-001) or ORG-PROJECT-TYPE-NUMBER (e.g. NREP-MECS-LAPTOP-001)")
  }
  return true
}

// Validate email format
export function validateEmail(email) {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!pattern.test(email)) {
    throw new Error("Invalid email format")
  }
  return true
}

// Validate phone number (basic)
export function validatePhoneNumber(phone) {
  if (!phone) return true // Optional field
  const pattern = /^[+]?[1-9][\d]{0,15}$/
  if (!pattern.test(phone.replace(/[\s\-$$$$]/g, ""))) {
    throw new Error("Invalid phone number format")
  }
  return true
}

// Check if asset can be issued
export function canIssueAsset(asset, { requireCustodian = false } = {}) {
  const validStatuses = [ENUMS.AVAILABLE_STATUS.AVAILABLE, ENUMS.AVAILABLE_STATUS.RESERVED]

  if (!validStatuses.includes(asset.availableStatus)) {
    throw new Error(`Asset cannot be issued. Current status: ${asset.availableStatus}`)
  }

  // Custodian is assigned at issue time; only enforce when caller already set it.
  if (requireCustodian && !asset.custodianStaffId) {
    throw new Error("Asset must have a custodian assigned before issuance")
  }

  return true
}

// Check if asset status transition is valid
export function validateStatusTransition(fromStatus, toStatus) {
  const validTransitions = {
    [ENUMS.AVAILABLE_STATUS.AWAITING_DEPLOY]: [ENUMS.AVAILABLE_STATUS.AVAILABLE],
    [ENUMS.AVAILABLE_STATUS.PENDING_AVAILABILITY]: [
      ENUMS.AVAILABLE_STATUS.AVAILABLE,
      ENUMS.AVAILABLE_STATUS.PENDING_AVAILABILITY,
      ENUMS.AVAILABLE_STATUS.RETIRED,
    ],
    [ENUMS.AVAILABLE_STATUS.AVAILABLE]: [
      ENUMS.AVAILABLE_STATUS.RESERVED,
      ENUMS.AVAILABLE_STATUS.IN_USE,
      ENUMS.AVAILABLE_STATUS.MAINTENANCE,
      ENUMS.AVAILABLE_STATUS.RETIRED,
    ],
    [ENUMS.AVAILABLE_STATUS.RESERVED]: [ENUMS.AVAILABLE_STATUS.AVAILABLE, ENUMS.AVAILABLE_STATUS.IN_USE],
    [ENUMS.AVAILABLE_STATUS.IN_USE]: [
      ENUMS.AVAILABLE_STATUS.AVAILABLE,
      ENUMS.AVAILABLE_STATUS.AWAITING_RETURN,
      ENUMS.AVAILABLE_STATUS.REPAIR_REQUIRED,
    ],
    [ENUMS.AVAILABLE_STATUS.AWAITING_RETURN]: [
      ENUMS.AVAILABLE_STATUS.AVAILABLE,
      ENUMS.AVAILABLE_STATUS.REPAIR_REQUIRED,
    ],
    [ENUMS.AVAILABLE_STATUS.MAINTENANCE]: [ENUMS.AVAILABLE_STATUS.AVAILABLE, ENUMS.AVAILABLE_STATUS.OUT_FOR_SERVICE],
    [ENUMS.AVAILABLE_STATUS.REPAIR_REQUIRED]: [ENUMS.AVAILABLE_STATUS.MAINTENANCE, ENUMS.AVAILABLE_STATUS.RETIRED],
    [ENUMS.AVAILABLE_STATUS.OUT_FOR_SERVICE]: [ENUMS.AVAILABLE_STATUS.MAINTENANCE, ENUMS.AVAILABLE_STATUS.AVAILABLE],
    [ENUMS.AVAILABLE_STATUS.RETIRED]: [ENUMS.AVAILABLE_STATUS.DISPOSED],
    [ENUMS.AVAILABLE_STATUS.DISPOSED]: [], // Terminal state
  }

  const allowedTransitions = validTransitions[fromStatus] || []

  if (!allowedTransitions.includes(toStatus)) {
    throw new Error(`Invalid status transition from ${fromStatus} to ${toStatus}`)
  }

  return true
}
