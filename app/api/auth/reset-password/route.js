import { NextResponse } from "next/server";
import {
  createAdminClient,
  createPublicAccountClient,
} from "../../../../lib/appwrite/admin.js";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = String(body.userId || "").trim();
    const secret = String(body.secret || "").trim();
    const password = String(body.password || "");
    const passwordConfirm = String(
      body.passwordConfirm ?? body.passwordAgain ?? password
    );

    if (!userId || !secret) {
      return NextResponse.json(
        {
          success: false,
          error: "This reset link is invalid or incomplete. Please request a new one.",
        },
        { status: 400 }
      );
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        },
        { status: 400 }
      );
    }

    if (password !== passwordConfirm) {
      return NextResponse.json(
        { success: false, error: "Passwords do not match." },
        { status: 400 }
      );
    }

    // Verify the one-time token by creating a temporary session.
    const { account } = createPublicAccountClient();
    let session = null;
    try {
      session = await account.createSession(userId, secret);
    } catch (tokenError) {
      console.warn(
        "Password reset token invalid:",
        tokenError?.message || tokenError
      );
      return NextResponse.json(
        {
          success: false,
          error:
            "This reset link is invalid or has expired. Please request a new one.",
        },
        { status: 400 }
      );
    }

    let users;
    try {
      ({ users } = createAdminClient());
    } catch (configError) {
      console.error("Reset password config error:", configError.message);
      return NextResponse.json(
        {
          success: false,
          error:
            "Password reset is not configured on the server. Please contact an administrator.",
        },
        { status: 503 }
      );
    }

    try {
      await users.updatePassword(userId, password);
    } catch (updateError) {
      console.error("Failed to update password:", updateError);
      return NextResponse.json(
        {
          success: false,
          error:
            updateError?.message ||
            "Could not update your password. Please try again.",
        },
        { status: 500 }
      );
    }

    // Invalidate sessions so the one-time token cannot be reused.
    try {
      if (session?.$id) {
        await users.deleteSession(userId, session.$id);
      }
      await users.deleteSessions(userId);
    } catch (cleanupError) {
      console.warn(
        "Password reset session cleanup warning:",
        cleanupError?.message || cleanupError
      );
    }

    return NextResponse.json({
      success: true,
      message: "Your password has been updated. You can sign in now.",
    });
  } catch (error) {
    console.error("Reset password failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to reset password right now.",
      },
      { status: 500 }
    );
  }
}
