/**
 * Resolve a staff member's notification email.
 * Prefers staff.email; falls back to the linked Appwrite Auth user email.
 */
import { createAdminClient } from "../appwrite/admin.js";
import { COLLECTIONS } from "../appwrite/config.js";

export async function resolveStaffRecipient(staffOrId) {
  if (!staffOrId) return null;

  let staff =
    typeof staffOrId === "object" && staffOrId.$id
      ? staffOrId
      : null;

  const { databases, users, databaseId } = createAdminClient();

  if (!staff && typeof staffOrId === "string") {
    try {
      staff = await databases.getDocument(
        databaseId,
        COLLECTIONS.STAFF,
        staffOrId
      );
    } catch (error) {
      console.warn("resolveStaffRecipient: staff get failed:", error?.message);
      return null;
    }
  }

  if (!staff) return null;

  const email = String(staff.email || "").trim();
  if (email && email.includes("@")) {
    return {
      ...staff,
      email: email.toLowerCase(),
      name: staff.name || email.split("@")[0],
    };
  }

  if (staff.userId) {
    try {
      const authUser = await users.get(staff.userId);
      const authEmail = String(authUser?.email || "").trim();
      if (authEmail && authEmail.includes("@")) {
        return {
          ...staff,
          email: authEmail.toLowerCase(),
          name: staff.name || authUser.name || authEmail.split("@")[0],
        };
      }
    } catch (error) {
      console.warn(
        "resolveStaffRecipient: auth user lookup failed:",
        error?.message
      );
    }
  }

  return {
    ...staff,
    email: null,
    name: staff.name || "Colleague",
  };
}
