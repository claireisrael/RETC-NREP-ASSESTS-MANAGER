import { NextResponse } from "next/server";
import { Query } from "node-appwrite";
import {
  createAdminClient,
  resolveAppBaseUrl,
} from "../../../../lib/appwrite/admin.js";
import { COLLECTIONS } from "../../../../lib/appwrite/config.js";
import { NodemailerService } from "../../../../lib/services/nodemailer.js";
import { renderEmailTemplate } from "../../../../lib/services/email-templates.js";
import { resolveEmailBranding } from "../../../../lib/utils/email-branding.js";

const TOKEN_LENGTH = 64;
const TOKEN_EXPIRE_SECONDS = 60 * 60; // 1 hour

const GENERIC_MESSAGE =
  "If an account exists for that email, we have sent password reset instructions.";

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

async function findStaffByEmail(databases, databaseId, email) {
  try {
    const result = await databases.listDocuments(databaseId, COLLECTIONS.STAFF, [
      Query.equal("email", email),
      Query.limit(1),
    ]);
    return result.documents?.[0] || null;
  } catch (error) {
    console.warn("Staff lookup by email failed:", error?.message || error);
    return null;
  }
}

async function findStaffByUserId(databases, databaseId, userId) {
  try {
    const result = await databases.listDocuments(databaseId, COLLECTIONS.STAFF, [
      Query.equal("userId", userId),
      Query.limit(1),
    ]);
    return result.documents?.[0] || null;
  } catch (error) {
    console.warn("Staff lookup by userId failed:", error?.message || error);
    return null;
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    const orgCode = body.orgCode || null;

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { success: false, error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    let users;
    let databases;
    let databaseId;
    try {
      ({ users, databases, databaseId } = createAdminClient());
    } catch (configError) {
      console.error("Forgot password config error:", configError.message);
      return NextResponse.json(
        {
          success: false,
          error:
            "Password reset is not configured on the server. Please contact an administrator.",
        },
        { status: 503 }
      );
    }

    // Look up Auth user by email (do not reveal whether the account exists).
    let authUser = null;
    try {
      const listed = await users.list([Query.equal("email", email), Query.limit(1)]);
      authUser = listed.users?.[0] || listed.documents?.[0] || null;
    } catch (listError) {
      console.error("Failed to list users for password reset:", listError);
      return NextResponse.json(
        { success: false, error: "Unable to process password reset right now." },
        { status: 500 }
      );
    }

    if (!authUser) {
      // Same response either way — avoid account enumeration.
      return NextResponse.json({ success: true, message: GENERIC_MESSAGE });
    }

    const staff =
      (await findStaffByUserId(databases, databaseId, authUser.$id)) ||
      (await findStaffByEmail(databases, databaseId, email));

    const token = await users.createToken(
      authUser.$id,
      TOKEN_LENGTH,
      TOKEN_EXPIRE_SECONDS
    );

    const baseUrl = resolveAppBaseUrl(request);
    const resetUrl = `${baseUrl}/reset-password?userId=${encodeURIComponent(
      authUser.$id
    )}&secret=${encodeURIComponent(token.secret)}`;

    const branding = resolveEmailBranding({
      orgCode: orgCode || staff?.orgCode,
      orgId: staff?.orgId,
      requester: staff,
    });

    const userName =
      staff?.name || authUser.name || email.split("@")[0] || "there";

    const data = {
      userName,
      userEmail: email,
      resetUrl,
      expiresInMinutes: Math.round(TOKEN_EXPIRE_SECONDS / 60),
      orgId: staff?.orgId,
      orgCode: branding.orgCode,
    };

    const rendered = renderEmailTemplate("PASSWORD_RESET", data, branding);
    const result = await NodemailerService.sendNotification(
      "PASSWORD_RESET",
      email,
      data,
      rendered
    );

    if (result?.skipped) {
      console.error("Password reset email skipped:", result.reason);
      return NextResponse.json(
        {
          success: false,
          error:
            "Email delivery is not configured. Please contact an administrator.",
        },
        { status: 503 }
      );
    }

    console.log("Password reset email sent to", email, result?.messageId);
    return NextResponse.json({ success: true, message: GENERIC_MESSAGE });
  } catch (error) {
    console.error("Forgot password failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to process password reset right now.",
      },
      { status: 500 }
    );
  }
}
