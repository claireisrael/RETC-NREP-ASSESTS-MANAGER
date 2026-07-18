/**
 * Centralized notifications for the two-step (L1 -> L2) approval workflow.
 * Delivery goes through /api/notifications/approval so L1/L2 recipients are
 * resolved with the Appwrite admin key (browser sessions often cannot list
 * other staff emails — which is why Mukisa/Paul and L1 admins were missing mail).
 *
 * All functions are best-effort: email failures are logged, never thrown.
 */

function serializeStaff(staff) {
  if (!staff) return null;
  return {
    $id: staff.$id,
    name: staff.name,
    email: staff.email,
    orgId: staff.orgId,
    orgCode: staff.orgCode,
    userId: staff.userId,
  };
}

function serializeRequest(request) {
  if (!request) return null;
  return {
    $id: request.$id,
    purpose: request.purpose,
    orgId: request.orgId,
    orgCode: request.orgCode,
    requestedItems: request.requestedItems || [],
    expectedReturnDate: request.expectedReturnDate || null,
    assignedL2StaffId: request.assignedL2StaffId || null,
    requesterStaffId: request.requesterStaffId || null,
    decisionNotes: request.decisionNotes || null,
  };
}

function serializeItems(items = []) {
  return (items || []).map((item) => ({
    $id: item?.$id,
    name: item?.name,
    assetTag: item?.assetTag,
    itemType: item?.itemType,
    title: item?.title,
  }));
}

async function postApprovalNotification(payload) {
  const apiResponse = await fetch("/api/notifications/approval", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await apiResponse.json().catch(() => ({}));
  if (!apiResponse.ok) {
    console.warn("approval notification API failed:", result);
    return {
      sent: false,
      reason: result.reason || "api_error",
      error: result.error || apiResponse.statusText,
      result,
    };
  }
  return {
    sent: !result?.skipped && result?.success !== false,
    result,
  };
}

/** New request → email all L1 approvers. */
export async function notifyRequestCreated(request, requester, items = []) {
  try {
    return await postApprovalNotification({
      type: "REQUEST_CREATED",
      request: serializeRequest(request),
      requester: serializeStaff(requester),
      items: serializeItems(items),
    });
  } catch (error) {
    console.warn("notifyRequestCreated failed:", error);
    return { sent: false, error: error.message || String(error) };
  }
}

/** L1 approved → email assigned L2 + requester. */
export async function notifyL1Approved(
  request,
  requester,
  l1Approver,
  items = []
) {
  try {
    return await postApprovalNotification({
      type: "L1_APPROVED",
      request: serializeRequest(request),
      requester: serializeStaff(requester),
      approver: serializeStaff(l1Approver),
      assignedL2StaffId: request?.assignedL2StaffId || null,
      items: serializeItems(items),
    });
  } catch (error) {
    console.warn("notifyL1Approved failed:", error);
    return { sent: false, error: error.message || String(error) };
  }
}

/** Final L2 approval → email requester + L2 confirmation. */
export async function notifyFinalApproved(
  request,
  requester,
  l2Approver,
  items = []
) {
  try {
    return await postApprovalNotification({
      type: "FINAL_APPROVED",
      request: serializeRequest(request),
      requester: serializeStaff(requester),
      approver: serializeStaff(l2Approver),
      items: serializeItems(items),
    });
  } catch (error) {
    console.warn("notifyFinalApproved failed:", error);
    return { sent: false, error: error.message || String(error) };
  }
}

/** Consumables auto-issued on final approval → requester + L2 notice. */
export async function notifyConsumablesIssued(
  request,
  requester,
  issuer,
  items = []
) {
  try {
    return await postApprovalNotification({
      type: "CONSUMABLES_ISSUED",
      request: serializeRequest(request),
      requester: serializeStaff(requester),
      approver: serializeStaff(issuer),
      items: serializeItems(items),
    });
  } catch (error) {
    console.warn("notifyConsumablesIssued failed:", error);
    return { sent: false, error: error.message || String(error) };
  }
}

/** Denied at any level → requester (existing decision API). */
export async function notifyDenied(
  request,
  requester,
  approver,
  reason,
  items = []
) {
  try {
    const payload = {
      type: "REQUEST_DENIED",
      requesterStaffId: request?.requesterStaffId || requester?.$id || null,
      requester: serializeStaff(requester),
      request: serializeRequest({
        ...request,
        decisionNotes: reason,
      }),
      approverName: approver?.name || "Approver",
      reason: reason || "No reason provided",
      items: serializeItems(items),
    };

    const apiResponse = await fetch("/api/notifications/decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await apiResponse.json().catch(() => ({}));
    if (!apiResponse.ok) {
      console.warn("notifyDenied API failed:", result);
      return {
        sent: false,
        reason: result.reason || "api_error",
        error: result.error || apiResponse.statusText,
        result,
      };
    }

    return {
      sent: !result?.skipped && result?.success !== false,
      result,
    };
  } catch (error) {
    console.warn("notifyDenied failed:", error);
    return { sent: false, error: error.message || String(error) };
  }
}
