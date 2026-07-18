"use client";

import { useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useOrgTheme } from "../../components/providers/org-theme-provider";
import {
  DEFAULT_ORG_CODE,
  resolveOrgTheme,
} from "../../lib/constants/org-branding";
import {
  listSupportedOrgCodes,
  setCurrentOrgCode,
} from "../../lib/utils/org";

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const { orgCode, setOrgCode } = useOrgTheme();
  const [selectedOrg, setSelectedOrg] = useState(
    () =>
      searchParams.get("org")?.toUpperCase() ||
      orgCode?.toUpperCase() ||
      DEFAULT_ORG_CODE
  );
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const activeTheme = useMemo(
    () => resolveOrgTheme(selectedOrg || DEFAULT_ORG_CODE),
    [selectedOrg]
  );
  const branding = activeTheme?.branding ?? {};
  const orgLogo =
    branding.logoProxy || branding.logo || "/nrep-logo.png?v=2";
  const orgName = activeTheme?.name || "Asset Management";
  const orgOptions = useMemo(
    () => listSupportedOrgCodes().map((code) => resolveOrgTheme(code)),
    []
  );

  const handleOrgSelection = (code) => {
    setSelectedOrg(code);
    setOrgCode?.(code);
    setCurrentOrgCode?.(code);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, orgCode: selectedOrg }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Unable to send reset email.");
      }
      setSent(true);
    } catch (err) {
      setError(err.message || "Unable to send reset email.");
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
            Forgot password
          </h1>
          <p className="text-sm text-gray-600 text-center mb-6">
            Enter your work email and we will send you a reset link.
          </p>

          <div className="mb-5 grid grid-cols-2 gap-2">
            {orgOptions.map((option) => (
              <button
                key={option.code}
                type="button"
                onClick={() => handleOrgSelection(option.code)}
                className={`rounded-xl border-2 px-3 py-2 text-sm font-medium transition ${
                  selectedOrg === option.code
                    ? "border-[var(--org-primary)] bg-white shadow"
                    : "border-gray-200 bg-white/70 hover:bg-white"
                }`}
              >
                {option.code}
              </button>
            ))}
          </div>

          {sent ? (
            <div className="space-y-4">
              <div
                className="rounded-2xl border px-4 py-3 text-sm"
                style={{
                  background: "var(--org-muted, #f0f9ff)",
                  borderColor: "var(--org-primary)",
                  color: "#1f2937",
                }}
              >
                If an account exists for that email, we have sent password reset
                instructions. Check your inbox and spam folder.
              </div>
              <Link
                href="/login"
                className="block text-center text-sm font-semibold link-org-primary"
              >
                Back to sign in
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
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-gray-900 focus:outline-none focus:border-[var(--org-primary)] focus:ring-2 focus:ring-[var(--org-primary)]/20"
                  placeholder="you@organisation.org"
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
                {loading ? "Sending…" : "Send reset link"}
              </button>

              <p className="text-center text-sm text-gray-600">
                Remembered it?{" "}
                <Link href="/login" className="font-semibold link-org-primary">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-white bg-slate-800">
          Loading…
        </div>
      }
    >
      <ForgotPasswordForm />
    </Suspense>
  );
}
