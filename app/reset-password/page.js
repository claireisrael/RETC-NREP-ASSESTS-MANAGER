"use client";

import { useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useOrgTheme } from "../../components/providers/org-theme-provider";
import {
  DEFAULT_ORG_CODE,
  resolveOrgTheme,
} from "../../lib/constants/org-branding";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { orgCode } = useOrgTheme();
  const activeTheme = useMemo(
    () => resolveOrgTheme(orgCode || DEFAULT_ORG_CODE),
    [orgCode]
  );
  const branding = activeTheme?.branding ?? {};
  const orgLogo =
    branding.logoProxy || branding.logo || "/nrep-logo.png?v=2";
  const orgName = activeTheme?.name || "Asset Management";

  const userId = searchParams.get("userId") || "";
  const secret = searchParams.get("secret") || "";
  const linkValid = Boolean(userId && secret);

  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          secret,
          password,
          passwordConfirm,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Could not reset password.");
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch (err) {
      setError(err.message || "Could not reset password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{
        background:
          "linear-gradient(135deg, var(--org-primary-dark) 0%, var(--org-primary) 45%, var(--org-accent) 100%)",
      }}
    >
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <div className="rounded-2xl bg-white p-3 shadow-lg ring-1 ring-black/5">
            <img
              src={orgLogo}
              alt={orgName}
              className="h-12 w-auto object-contain"
            />
          </div>
        </div>

        <div className="rounded-3xl bg-white/95 backdrop-blur-xl shadow-2xl border border-white/40 p-8">
          <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
            Set a new password
          </h1>
          <p className="text-sm text-gray-600 text-center mb-6">
            Choose a strong password for your account.
          </p>

          {!linkValid ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                This reset link is invalid or incomplete. Please request a new
                one.
              </div>
              <Link
                href="/forgot-password"
                className="block text-center text-sm font-semibold link-org-primary"
              >
                Request a new reset link
              </Link>
            </div>
          ) : done ? (
            <div className="space-y-4">
              <div
                className="rounded-2xl border px-4 py-3 text-sm"
                style={{
                  background: "var(--org-muted, #f0f9ff)",
                  borderColor: "var(--org-primary)",
                }}
              >
                Your password has been updated. Redirecting you to sign in…
              </div>
              <Link
                href="/login"
                className="block text-center text-sm font-semibold link-org-primary"
              >
                Go to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  New password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 pr-12 text-gray-900 focus:outline-none focus:border-[var(--org-primary)] focus:ring-2 focus:ring-[var(--org-primary)]/20"
                    placeholder="At least 8 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 px-3 text-sm text-gray-500"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="passwordConfirm"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  Confirm password
                </label>
                <input
                  id="passwordConfirm"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-gray-900 focus:outline-none focus:border-[var(--org-primary)] focus:ring-2 focus:ring-[var(--org-primary)]/20"
                  placeholder="Repeat password"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl py-3.5 text-base font-semibold text-white shadow-lg transition disabled:opacity-50"
                style={{
                  background:
                    "linear-gradient(to right, var(--org-primary), var(--org-primary-dark))",
                }}
              >
                {loading ? "Updating…" : "Update password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-white bg-slate-800">
          Loading…
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
