"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useMemo } from "react";
import Sidebar from "./sidebar";
import { Navbar } from "./navbar";
import { GuestNavbar } from "./guest-navbar";
import { getCurrentStaff } from "../../lib/utils/auth.js";
import { settingsService } from "../../lib/appwrite/provider.js";
import { useToastContext } from "../providers/toast-provider";
import { useInactivityLogout } from "../../lib/hooks/useInactivityLogout.js";
import { PageLoading, LoadingSpinner } from "../ui/loading";
import { useOrgTheme } from "../providers/org-theme-provider";

export default function LayoutProvider({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToastContext();
  const [staff, setStaff] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { theme, orgCode } = useOrgTheme();
  const colors = theme?.colors || {};
  const primaryColor = colors.primary || "#0E6370";
  const accentColor = colors.accent || "#1F8B99";
  const backgroundColor = colors.background || "#f1f5f9";
  const gradientFrom = colors.gradientFrom || `${primaryColor}d0`;
  const gradientTo = colors.gradientTo || `${accentColor}c0`;

  // Determine route types early for hook configuration
  const isNoLayout =
    pathname.startsWith("/login") ||
    pathname.startsWith("/setup") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/select-org") ||
    pathname.startsWith("/unauthorized");
  const isTopNavOnly = pathname.startsWith("/guest");

  // Session timeout configuration
  // Users will be logged out after 20 minutes of inactivity
  // Warning modal appears at 18 minutes (2 minutes before logout)
  const { WarningModal } = useInactivityLogout({
    inactivityTimeout: 20 * 60 * 1000, // 20 minutes of inactivity before logout
    warningTimeout: 2 * 60 * 1000, // 2 minutes warning before logout (shows at 18 minutes)
    enabled: !isNoLayout && !isTopNavOnly && staff !== null, // Only enable for authenticated staff
  });

  const loadAppData = useCallback(async () => {
    try {
      setError(null);

      // Load staff data with timeout and proper error handling
      const staffPromise = getCurrentStaff().catch((err) => {
        console.warn("Failed to load staff:", err);
        return null;
      });

      // Load settings with timeout
      const settingsPromise = settingsService.get().catch((err) => {
        // Silent fail for settings - app will use defaults
        return null;
      });

      // Wait for both with a timeout to prevent infinite loading
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Data loading timeout")), 8000)
      );

      const [currentStaff, systemSettings] = await Promise.race([
        Promise.all([staffPromise, settingsPromise]),
        timeoutPromise,
      ]).catch((err) => {
        // If timeout, return null values
        if (err.message === "Data loading timeout") {
          console.warn("Data loading timed out");
          return [null, null];
        }
        throw err;
      });

      setStaff(currentStaff);
      setSettings(systemSettings);

      // If user is authenticated but no staff record exists, handle gracefully
      if (currentStaff === null) {
        // Check if user is actually authenticated
        try {
          const { getCurrentUser } = await import("../../lib/utils/auth.js");
          const user = await getCurrentUser();
          if (user && typeof window !== "undefined") {
            // User is authenticated but no staff record - redirect to error page
            // Only redirect if not already on unauthorized page to prevent loops
            if (!pathname.startsWith("/unauthorized")) {
              try {
                // Clear any cached auth data
                localStorage.removeItem("auth_staff");
                localStorage.removeItem("auth_user");
                // Redirect to a page that explains the issue
                window.location.href = "/unauthorized?reason=no_staff_record";
                return;
              } catch (redirectError) {
                console.error("Redirect error:", redirectError);
                // Fallback: try router.push
                router.push("/unauthorized?reason=no_staff_record");
                return;
              }
            }
          }
        } catch (userError) {
          // User not authenticated - will be handled by redirect below
          console.warn("Could not verify user authentication:", userError);
        }
      }
    } catch (error) {
      console.error("Error loading app data:", error);
      setError(error.message || "Failed to load application data");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadAppData();

    // Set a timeout to stop loading after 10 seconds
    const timeout = setTimeout(() => {
      if (loading) {
        // Timeout reached - stop loading
        setLoading(false);
      }
    }, 10000);

    return () => clearTimeout(timeout);
  }, [loadAppData, loading]);

  // Listen for session warning events
  useEffect(() => {
    const handleSessionWarning = (event) => {
      toast.info(event.detail.message);
    };

    window.addEventListener("session-warning", handleSessionWarning);
    return () =>
      window.removeEventListener("session-warning", handleSessionWarning);
  }, [toast]);

  // Define routes that don't need any layout (public auth screens)
  const noLayoutRoutes = [
    "/login",
    "/setup",
    "/select-org",
    "/unauthorized",
    "/forgot-password",
    "/reset-password",
  ];

  // Define routes that only need top navigation (like guest portal)
  const topNavOnlyRoutes = ["/guest"];

  // Define routes that need full sidebar layout (authenticated users)
  const sidebarRoutes = [
    "/dashboard",
    "/admin",
    "/assets",
    "/consumables",
    "/requests",
  ];

  // Calculate route types using useMemo - MUST be before any conditional returns
  // This ensures hooks are always called in the same order
  const finalIsNoLayout = useMemo(() => 
    noLayoutRoutes.some((route) => pathname.startsWith(route)),
    [pathname]
  );
  const finalIsTopNavOnly = useMemo(() =>
    topNavOnlyRoutes.some((route) => pathname.startsWith(route)),
    [pathname]
  );
  const isSidebarRoute = useMemo(() =>
    sidebarRoutes.some((route) => pathname.startsWith(route)),
    [pathname]
  );

  // Handle redirect to login if not authenticated
  const shouldRedirectToLogin =
    !loading &&
    !staff &&
    !finalIsNoLayout &&
    !finalIsTopNavOnly &&
    !pathname.startsWith("/login") &&
    !pathname.startsWith("/forgot-password") &&
    !pathname.startsWith("/reset-password") &&
    !pathname.startsWith("/unauthorized");

  useEffect(() => {
    if (shouldRedirectToLogin) {
      router.push("/login");
    }
  }, [shouldRedirectToLogin, router]);

  if (loading) {
    return <PageLoading message="Loading workspace..." />;
  }

  if (error) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-6"
        style={{
          backgroundColor,
          backgroundImage: `radial-gradient(circle at 18% 18%, ${primaryColor}14, transparent 55%), radial-gradient(circle at 82% 78%, ${accentColor}12, transparent 60%)`,
        }}
      >
        <div className="relative max-w-lg w-full bg-white/90 backdrop-blur-md border border-gray-200/60 shadow-2xl rounded-3xl p-10 text-center">
          <div
            className="mx-auto mb-6 h-16 w-16 rounded-3xl flex items-center justify-center"
            style={{
              backgroundImage: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
              boxShadow: `0 20px 40px -22px ${primaryColor}`,
            }}
          >
            <LoadingSpinner size="lg" className="h-16 w-16" thickness={4} />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">
            We couldn't load the application
          </h2>
          <p className="text-slate-600 mb-6">
            {error || "Something went wrong while preparing your workspace."}
          </p>
          <button
            onClick={() => {
              setError(null);
              setLoading(true);
              loadAppData();
            }}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-white font-medium shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundImage: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
            }}
          >
            {loading ? "Retrying..." : "Retry"}
          </button>
          <p className="mt-4 text-xs tracking-[0.3em] text-slate-400 uppercase">
            {orgCode || "RETC"}
          </p>
        </div>
      </div>
    );
  }

  // No layout for login/setup pages
  if (finalIsNoLayout) {
    return (
      <>
        {children}
        <WarningModal />
      </>
    );
  }

  // Top navigation only (guest portal)
  if (finalIsTopNavOnly) {
    return (
      <div className="min-h-screen bg-gray-50">
        <GuestNavbar />
        <main>{children}</main>
        <WarningModal />
      </div>
    );
  }

  // Full sidebar layout for authenticated users
  if (staff && (isSidebarRoute || pathname === "/")) {
    return (
      <div className="flex h-screen bg-sidebar-50">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <main className="flex-1 overflow-auto">
            <div className="p-6">{children}</div>
          </main>
        </div>
        <WarningModal />
      </div>
    );
  }

  // Default: redirect to login if not authenticated, otherwise show with sidebar
  if (!staff) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <PageLoading message="Checking authentication..." />
      </div>
    );
  }

  // Fallback layout
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {children}
      </main>
      <WarningModal />
    </div>
  );
}
