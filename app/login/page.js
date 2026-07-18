"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { login, verifySession, getCurrentStaff } from "../../lib/utils/auth.js";
import { useOrgTheme } from "../../components/providers/org-theme-provider";
import { setCurrentOrgCode, listSupportedOrgCodes, resolveOrgCodeFromIdentifier } from "../../lib/utils/org";
import { DEFAULT_ORG_CODE, resolveOrgTheme } from "../../lib/constants/org-branding";
import { 
  checkLoginBlocked, 
  recordFailedAttempt, 
  resetLoginAttempts,
  getRemainingAttempts,
  MAX_ATTEMPTS
} from "../../lib/utils/login-attempts.js";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("/dashboard");
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme, setOrgCode, orgCode } = useOrgTheme();
  const [selectedOrg, setSelectedOrg] = useState(() => orgCode?.toUpperCase() || DEFAULT_ORG_CODE);
  const activeTheme = useMemo(() => resolveOrgTheme(selectedOrg || DEFAULT_ORG_CODE), [selectedOrg]);
  const orgOptions = useMemo(
    () => listSupportedOrgCodes().map((code) => resolveOrgTheme(code)),
    []
  );
  const branding = activeTheme?.branding ?? {};
  const orgLogo =
    branding.logoProxy ||
    branding.logo ||
    "https://appwrite.nrep.ug/v1/storage/buckets/68aa099d001f36378da4/files/68aa09f10037892a3872/view?project=68926e9b000ac167ec8a&mode=admin";
  const orgName = activeTheme?.name || "Asset Management";
  const orgTagline = branding.tagline || orgName;
  const orgCodeDisplay = activeTheme?.code || DEFAULT_ORG_CODE;

  // Get organization-specific contact email
  const getContactEmail = useMemo(() => {
    const org = selectedOrg?.toUpperCase() || DEFAULT_ORG_CODE;
    if (org === "RETC") {
      return "retc@nrep.ug";
    } else if (org === "NREP") {
      return "info@nrep.ug";
    }
    return "retc@nrep.ug"; // Default to RETC email
  }, [selectedOrg]);

  useEffect(() => {
    const callback = searchParams.get("callback");
    if (callback) {
      setCallbackUrl(callback);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!orgCode) {
      const defaultCode = DEFAULT_ORG_CODE.toUpperCase();
      setSelectedOrg(defaultCode);
      setCurrentOrgCode(defaultCode);
      setOrgCode(defaultCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const normalised = orgCode?.toUpperCase() || DEFAULT_ORG_CODE;
    setSelectedOrg(normalised);
  }, [orgCode]);

  const handleOrgSelection = (code) => {
    const normalised = code.toUpperCase();
    setSelectedOrg(normalised);
    setCurrentOrgCode(normalised);
    setOrgCode(normalised);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Check if user is blocked due to too many failed attempts
    const blockCheck = checkLoginBlocked(email);
    if (blockCheck.isBlocked) {
      setError(blockCheck.message);
      setLoading(false);
      return;
    }

    try {
      if (!process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || !process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID) {
        setError("Server configuration error. Please contact your administrator.");
        setLoading(false);
        return;
      }

      await login(email, password, callbackUrl);
      
      resetLoginAttempts(email);

      // Immediately redirect after successful login - no waiting or verification
      if (typeof window !== "undefined") {
        window.location.replace(callbackUrl);
      }
      
      return;
    } catch (err) {
      // Record failed attempt
      recordFailedAttempt(email);
      
      // Check block status again after recording the attempt
      const blockCheck = checkLoginBlocked(email);
      const remainingAttempts = getRemainingAttempts(email);
      
      // Build error message
      let errorMessage = err.message || "Login failed. Please check your credentials.";
      
      if (blockCheck.isBlocked) {
        errorMessage = blockCheck.message;
      } else if (blockCheck.isWarning) {
        errorMessage = `${errorMessage} ${blockCheck.message}`;
      } else if (remainingAttempts < MAX_ATTEMPTS) {
        errorMessage = `${errorMessage} ${blockCheck.message || `(${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining)`}`;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page__background min-h-screen relative overflow-hidden">
      {/* Advanced Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Primary gradient orbs */}
        <div className="absolute -top-40 -right-40 w-80 h-80 login-page__orb rounded-full blur-3xl animate-pulse"></div>
        <div
          className="absolute top-1/2 -left-40 w-96 h-96 login-page__orb--muted rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: "2s" }}
        ></div>
        <div
          className="absolute -bottom-40 right-1/3 w-64 h-64 login-page__orb--accent rounded-full blur-2xl animate-pulse"
          style={{ animationDelay: "4s" }}
        ></div>

        {/* Additional floating elements for depth */}
        <div
          className="absolute top-1/4 right-1/4 w-32 h-32 login-page__orb rounded-full blur-2xl animate-pulse"
          style={{ animationDelay: "1.5s" }}
        ></div>
        <div
          className="absolute bottom-1/4 left-1/3 w-48 h-48 login-page__orb--muted rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: "3.5s" }}
        ></div>
      </div>

      {/* Floating Geometric Shapes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-20 left-20 w-4 h-4 login-page__orb rounded-full animate-bounce"
          style={{ animationDelay: "1s" }}
        ></div>
        <div
          className="absolute top-40 right-32 w-6 h-6 login-page__orb--accent rounded-full animate-bounce"
          style={{ animationDelay: "2.5s" }}
        ></div>
        <div
          className="absolute bottom-32 left-1/4 w-3 h-3 login-page__orb rounded-full animate-bounce"
          style={{ animationDelay: "3.5s" }}
        ></div>
        <div
          className="absolute top-1/3 right-1/4 w-5 h-5 login-page__orb--muted rounded-full animate-bounce"
          style={{ animationDelay: "4.5s" }}
        ></div>
      </div>

      <div className="relative z-10 min-h-screen flex">
        {/* Left Side - Modern Hero Section */}
        <div className="hidden lg:flex lg:w-1/2 relative">
          {/* Gradient Background */}
          <div className="absolute inset-0 login-page__hero-gradient"></div>

          {/* Mesh Gradient Overlay */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom right, var(--org-hero-accent-a), transparent 40%, var(--org-hero-accent-b))",
            }}
          ></div>

          {/* Animated Grid Pattern */}
          <div className="absolute inset-0 opacity-10">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `radial-gradient(circle at 25% 25%, white 2px, transparent 2px), radial-gradient(circle at 75% 75%, white 2px, transparent 2px)`,
                backgroundSize: "60px 60px",
                backgroundPosition: "0 0, 30px 30px",
              }}
            ></div>
          </div>

          {/* Content */}
          <div className="relative z-10 flex flex-col justify-center px-16 py-24 text-white">
            {/* Logo on a clear white card */}
            <div className="mb-10 inline-flex">
              <div className="rounded-3xl bg-white p-4 ring-1 ring-black/5 shadow-lg">
                <img
                  src={orgLogo}
                  alt={`${orgName} logo`}
                  className="h-28 w-28 object-contain"
                />
              </div>
            </div>

            {/* Hero Text with Modern Typography */}
            <div className="space-y-8">
              <div>
                <h1 className="text-5xl lg:text-6xl font-bold leading-tight mb-4">
                  Welcome to
                  <span
                    className="block bg-clip-text text-transparent"
                    style={{
                      backgroundImage:
                        "linear-gradient(to right, rgba(255,255,255,0.95), rgba(255,255,255,0.7), var(--org-accent))",
                    }}
                  >
                    {orgCodeDisplay} Assets Manager
                  </span>
                </h1>
                <p className="text-xl text-white/80 leading-relaxed max-w-lg">
                  Experience Asset management with {orgName}.
                </p>
              </div>

              {/* Feature Cards */}
              <div className="space-y-4">
                <div className="flex items-center space-x-4 p-4 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/15 transition-all duration-300">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg"
                    style={{
                      background:
                        "linear-gradient(to bottom right, var(--org-primary), var(--org-primary-dark))",
                    }}
                  >
                    <svg
                      className="w-7 h-7 text-white"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div>
                    <h3 
                      className="text-xl md:text-2xl font-bold text-white mb-2"
                      style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}
                    >
                      Secure & Reliable
                    </h3>
                    <p 
                      className="text-base md:text-lg text-white/90 font-normal leading-relaxed"
                      style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}
                    >
                      Enterprise-grade security for your assets
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-4 p-4 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/15 transition-all duration-300">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg"
                    style={{
                      background:
                        "linear-gradient(to bottom right, var(--org-primary), var(--org-primary-dark))",
                    }}
                  >
                    <svg
                      className="w-7 h-7 text-white"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div>
                    <h3 
                      className="text-xl md:text-2xl font-bold text-white mb-2"
                      style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}
                    >
                      Asset Management
                    </h3>
                    <p 
                      className="text-base md:text-lg text-white/90 font-normal leading-relaxed"
                      style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}
                    >
                      Complete asset tracking and lifecycle management
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Modern Login Form */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 lg:p-12">
          <div className="w-full max-w-md space-y-8">
            {/* Mobile Logo */}
            <div className="flex flex-col items-center lg:hidden mb-8">
              <div className="rounded-3xl bg-white p-4 ring-1 ring-black/5 shadow-md mb-4">
                <img
                  src={orgLogo}
                  alt={`${orgName} logo`}
                  className="h-24 w-24 object-contain"
                />
              </div>
              <h2 className="mt-2 text-3xl font-bold text-gray-900 text-center">
                Welcome to {orgCodeDisplay} Assets Manager
              </h2>
              <p className="text-gray-600 text-center">
                Choose your organisation and sign in to continue
              </p>
            </div>

            {/* Ultra-Modern Login Card */}
            <div className="relative bg-white/90 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/30 overflow-hidden group hover:shadow-3xl transition-all duration-500">
              {/* Subtle inner glow */}

              {/* Animated border gradient */}
              <div
                className="absolute inset-0 rounded-3xl"
                style={{
                  background:
                    "linear-gradient(to bottom right, rgba(255, 255, 255, 0.5), transparent 45%, var(--org-muted))",
                }}
              ></div>

              <div
                className="absolute inset-0 rounded-3xl p-[1px]"
                style={{
                  background:
                    "linear-gradient(to right, var(--org-hero-accent-a), var(--org-hero-accent-b), var(--org-hero-accent-a))",
                }}
              >
                <div className="w-full h-full bg-white/90 backdrop-blur-2xl rounded-3xl"></div>
              </div>

              <div className="relative px-8 py-10 lg:px-10 lg:py-12">
                <div className="mb-8 text-center">
                  <h2
                    className="text-3xl font-bold bg-clip-text text-transparent mb-2"
                    style={{
                      backgroundImage:
                        "linear-gradient(to right, #111827, var(--org-primary), var(--org-accent))",
                    }}
                  >
                    Welcome back
                  </h2>
                  <p className="text-gray-600">
                    Sign in to your account to continue
                  </p>
                </div>

                <div className="mb-6 text-center space-y-2">
                  <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                    Select organisation
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {orgOptions.map((option) => (
                      <button
                        key={option.code}
                        type="button"
                        onClick={() => handleOrgSelection(option.code)}
                        className={`flex flex-col items-center justify-center rounded-2xl border-2 px-4 py-3 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--org-primary)] ${
                          selectedOrg === option.code
                            ? "border-[var(--org-primary)] bg-white shadow-lg"
                            : "border-gray-200/70 bg-white/70 hover:bg-white"
                        }`}
                      >
                        <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-white ring-1 ring-black/5 p-2">
                          <img
                            src={option.branding.logoProxy || option.branding.logo}
                            alt={`${option.name} logo`}
                            className="h-full w-full object-contain"
                          />
                        </div>
                        <span className="text-sm font-semibold text-gray-800">
                          {option.code}
                        </span>
                        <span className="text-xs text-gray-500">
                          {option.branding.tagline}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  {error && (
                    <div className={`rounded-2xl border p-4 ${
                      error.includes("Warning") || error.includes("attempts remaining")
                        ? "bg-amber-50 border-amber-200"
                        : error.includes("locked") || error.includes("temporarily")
                        ? "bg-red-50 border-red-200"
                        : "bg-red-50 border-red-200"
                    }`}>
                      <div className="flex items-start">
                        <div className="flex-shrink-0">
                          {error.includes("Warning") || error.includes("attempts remaining") ? (
                            <svg
                              className="h-6 w-6 text-amber-600"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                clipRule="evenodd"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="h-6 w-6 text-red-600"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </div>
                        <div className="ml-3 flex-1">
                          <p 
                            className={`text-base font-semibold leading-relaxed ${
                              error.includes("Warning") || error.includes("attempts remaining")
                                ? "text-amber-800"
                                : "text-red-800"
                            }`}
                            style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}
                          >
                            {error}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Email Field */}
                  <div className="space-y-2">
                    <label
                      htmlFor="email"
                      className="block text-sm font-semibold text-gray-700"
                    >
                      Email Address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <svg
                          className="h-5 w-5 text-gray-400"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                          <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                        </svg>
                      </div>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        className="login-field pl-12 pr-4 py-4 h-12 block w-full rounded-2xl border border-slate-200/80 bg-white text-slate-900 placeholder:text-slate-400 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_rgba(15,23,42,0.06)] hover:border-slate-300 hover:shadow-[0_2px_4px_rgba(15,23,42,0.05),0_6px_16px_rgba(15,23,42,0.08)] focus:bg-white focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 transition-all duration-200"
                        placeholder="Enter your email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={loading}
                      />
                    </div>
                  </div>

                  {/* Password Field */}
                  <div className="space-y-2">
                    <label
                      htmlFor="password"
                      className="block text-sm font-semibold text-gray-700"
                    >
                      Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <svg
                          className="h-5 w-5 text-gray-400"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                      <Input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        required
                        className="login-field pl-12 pr-12 py-4 h-12 block w-full rounded-2xl border border-slate-200/80 bg-white text-slate-900 placeholder:text-slate-400 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_12px_rgba(15,23,42,0.06)] hover:border-slate-300 hover:shadow-[0_2px_4px_rgba(15,23,42,0.05),0_6px_16px_rgba(15,23,42,0.08)] focus:bg-white focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 transition-all duration-200"
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={loading}
                      />
                      <button
                        type="button"
                        className="absolute inset-y-0 right-0 pr-4 flex items-center"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <svg
                            className="h-5 w-5 text-gray-400 hover:text-gray-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="h-5 w-5 text-gray-400 hover:text-gray-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Remember Me & Forgot Password */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <input
                        id="remember-me"
                        name="remember-me"
                        type="checkbox"
                        className="h-4 w-4 border-2 border-gray-300 rounded transition-all duration-200"
                        style={{ accentColor: "var(--org-highlight)" }}
                      />
                      <label
                        htmlFor="remember-me"
                        className="ml-3 text-sm font-medium text-gray-700"
                      >
                        Remember me
                      </label>
                    </div>
                    <Link
                      href="/forgot-password"
                      className="text-sm font-semibold link-org-primary"
                      prefetch={false}
                    >
                      Forgot password?
                    </Link>
                  </div>

                  {/* Ultra-Modern Login Button */}
                  <button
                    type="submit"
                    className="group relative w-full flex justify-center py-4 px-6 border border-transparent rounded-2xl text-lg font-semibold text-white focus:outline-none focus:ring-4 focus:ring-primary-500/30 transition-all duration-300 transform hover:scale-105 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed shadow-xl hover:shadow-2xl overflow-hidden"
                    style={{
                      background:
                        "linear-gradient(to right, var(--org-primary), var(--org-primary-dark))",
                    }}
                    disabled={loading}
                  >
                    {/* Animated background shimmer */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>

                    {/* Button content */}
                    <span className="relative z-10 flex items-center">
                      {loading && (
                        <svg
                          className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                      )}
                      {loading ? "Signing in..." : "Sign In"}
                    </span>
                  </button>
                </form>
              </div>
            </div>

            {/* Enhanced Guest Portal Button */}
            <div className="text-center">
              {selectedOrg === "RETC" && (
                <Button
                  asChild
                  className="group relative w-full text-white font-semibold py-4 px-6 rounded-2xl shadow-lg transition-all duration-300 overflow-hidden bg-gradient-to-r from-sky-400/60 to-emerald-300/50 hover:from-sky-400/70 hover:to-emerald-300/60 hover:text-white hover:shadow-xl hover:scale-[1.02]"
                >
                  <a
                    href="/guest"
                    className="relative z-10 flex items-center justify-center space-x-3"
                  >
                    {/* Animated shimmer effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>

                    <svg
                      className="w-5 h-5 group-hover:scale-110 transition-transform duration-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                    <span className="group-hover:tracking-wide transition-all duration-300">
                      Browse the Guest Portal
                    </span>
                  </a>
                </Button>
              )}
            </div>

            {/* Footer */}
            <div className="text-center space-y-5 pt-4">
              <p 
                className="text-base md:text-lg text-gray-700 font-normal leading-relaxed"
                style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}
              >
                Need access?{" "}
                <a
                  href={`mailto:${getContactEmail}`}
                  className="font-semibold text-[var(--org-primary)] hover:text-[var(--org-primary-dark)] underline underline-offset-2 hover:underline-offset-4 transition-all duration-200"
                  style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}
                >
                  Contact your system administrator
                </a>
              </p>
              <div 
                className="flex items-center justify-center space-x-4 text-sm md:text-base text-gray-600 font-medium"
                style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}
              >
                <a
                  href="#"
                  className="hover:text-[var(--org-primary)] hover:underline underline-offset-2 transition-all duration-200"
                >
                  Privacy Policy
                </a>
                <span className="text-gray-400">•</span>
                <a
                  href="#"
                  className="hover:text-[var(--org-primary)] hover:underline underline-offset-2 transition-all duration-200"
                >
                  Terms of Service
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
