import { account } from "../appwrite/client.js";
import { staffService } from "../appwrite/provider.js";
import { ENUMS } from "../appwrite/config.js";
import { isL2FinalApprover } from "./approvers.js";
import { resolveOrgCodeFromIdentifier, getCurrentOrgCode } from "./org";

// Session storage keys
const SESSION_KEYS = {
  USER: "auth_user",
  STAFF: "auth_staff",
  LAST_ACTIVITY: "auth_last_activity",
  SESSION_EXPIRY: "auth_session_expiry",
  LOGIN_TIME: "auth_login_time",
};

// Session timeout (20 minutes of inactivity)
const SESSION_TIMEOUT = 20 * 60 * 1000;
// Refresh threshold (3 minutes before expiry)
const SESSION_REFRESH_THRESHOLD = 3 * 60 * 1000;

// Max session duration: force re-login after this even if user was active (e.g. 24 hours)
const MAX_SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

// Cookie max-age (seconds): limit how long the session cookie lives (20 minutes)
const SESSION_COOKIE_MAX_AGE_SECONDS = 20 * 60;

// Get current user session with caching
export async function getCurrentUser() {
  try {
    // Enforce session expiry: if app considers session expired, delete server session and clear local state
    if (isSessionExpired()) {
      try {
        await account.deleteSession("current");
      } catch (_) {
        // Ignore (session may already be gone)
      }
      clearAuthCache();
      return null;
    }

    // Check cached user first
    const cachedUser = getCachedUser();
    if (cachedUser) {
      updateLastActivity();
      return cachedUser;
    }

    // Fetch fresh user data with timeout
    const user = await Promise.race([
      account.get(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Account.get() timeout")), 3000)
      ),
    ]);

    if (user) {
      cacheUser(user);
      updateLastActivity();
    }

    return user;
  } catch (error) {
    try {
      await account.deleteSession("current");
    } catch (_) {
      // Ignore
    }
    clearAuthCache();
    return null;
  }
}

// Get current staff member with roles
export async function getCurrentStaff() {
  try {
    const user = await getCurrentUser();
    if (!user) return null;

    // Check cached staff first
    const cachedStaff = getCachedStaff();
    const activeOrgCode = getCurrentOrgCode()?.toUpperCase();
    if (cachedStaff && !isSessionExpired() && cachedStaff.userId === user.$id) {
      const cachedOrgCode = resolveOrgCodeFromIdentifier(
        cachedStaff.orgId || cachedStaff.orgCode || cachedStaff.orgCodes?.[0]
      );
      if (!cachedOrgCode || cachedOrgCode === activeOrgCode) {
        return cachedStaff;
      }
    }

    // Fetch fresh staff data with timeout to prevent infinite loading
    const staffPromise = staffService.getByUserId(user.$id);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Staff lookup timeout")), 5000)
    );

    const staff = await Promise.race([staffPromise, timeoutPromise]);
    
    if (staff) {
      const orgIdentifiers = Array.isArray(staff.orgMemberships)
        ? staff.orgMemberships
        : [staff.orgCodes, staff.orgs, staff.orgCode, staff.orgId]
            .flat()
            .filter(Boolean);
      const normalised = orgIdentifiers
        .map((code) => resolveOrgCodeFromIdentifier(code))
        .filter(Boolean);

      const enrichedStaff = {
        ...staff,
        orgCodes: normalised.length > 0 ? normalised : undefined,
      };

      cacheStaff(enrichedStaff);
      return enrichedStaff;
    }

    // No staff record found - return null (caller should handle this)
    return null;
  } catch (error) {
    // If it's a timeout or network error, don't clear cache - might be temporary
    if (error.message === "Staff lookup timeout" || error.message === "Failed to fetch") {
      console.warn("Staff lookup failed:", error.message);
      return null;
    }
    
    // For other errors, clear cache and return null
    clearAuthCache();
    return null;
  }
}

// Check if user has specific role
export function hasRole(staff, role) {
  if (!staff || !staff.roles) return false;
  return staff.roles.includes(role);
}

// Check if user has any of the specified roles
export function hasAnyRole(staff, roles) {
  if (!staff || !staff.roles) return false;
  return roles.some((role) => staff.roles.includes(role));
}

// Role-based permission checks
export const permissions = {
  // Anyone who can use the Admin view switcher (assets and/or consumables managers)
  isAdmin: (staff) =>
    hasAnyRole(staff, [
      ENUMS.ROLES.SYSTEM_ADMIN,
      ENUMS.ROLES.ASSET_ADMIN,
      ENUMS.ROLES.CONSUMABLE_ADMIN,
    ]),
  isSystemAdmin: (staff) => hasRole(staff, ENUMS.ROLES.SYSTEM_ADMIN),
  canManageAssets: (staff) =>
    hasAnyRole(staff, [ENUMS.ROLES.SYSTEM_ADMIN, ENUMS.ROLES.ASSET_ADMIN]),
  canManageConsumables: (staff) =>
    hasAnyRole(staff, [
      ENUMS.ROLES.SYSTEM_ADMIN,
      ENUMS.ROLES.ASSET_ADMIN,
      ENUMS.ROLES.CONSUMABLE_ADMIN,
    ]),
  canApproveRequests: (staff) =>
    hasAnyRole(staff, [
      ENUMS.ROLES.SYSTEM_ADMIN,
      ENUMS.ROLES.ASSET_ADMIN,
      ENUMS.ROLES.SENIOR_MANAGER,
    ]),
  canIssueAssets: (staff) =>
    hasAnyRole(staff, [ENUMS.ROLES.SYSTEM_ADMIN, ENUMS.ROLES.ASSET_ADMIN]),
  canManageUsers: (staff) => hasRole(staff, ENUMS.ROLES.SYSTEM_ADMIN),
  canManageSettings: (staff) => hasRole(staff, ENUMS.ROLES.SYSTEM_ADMIN),
  canViewReports: (staff) =>
    hasAnyRole(staff, [
      ENUMS.ROLES.SYSTEM_ADMIN,
      ENUMS.ROLES.ASSET_ADMIN,
      ENUMS.ROLES.SENIOR_MANAGER,
      ENUMS.ROLES.CONSUMABLE_ADMIN,
    ]),
  canCreateRequests: (staff) => !!staff, // Any authenticated user
  canManageRequests: (staff) =>
    hasAnyRole(staff, [ENUMS.ROLES.SYSTEM_ADMIN, ENUMS.ROLES.ASSET_ADMIN]),
  // First-level (L1) approval: asset admins & senior managers only.
  // Superadmins (SYSTEM_ADMIN) must wait — they only act at L2 after L1.
  canApproveL1: (staff) =>
    hasAnyRole(staff, [
      ENUMS.ROLES.ASSET_ADMIN,
      ENUMS.ROLES.SENIOR_MANAGER,
    ]) && !hasRole(staff, ENUMS.ROLES.SYSTEM_ADMIN),
  // Final (L2) approval: Paul Nduhuura or Mukisa Nicholas only
  canApproveL2: (staff) =>
    hasRole(staff, ENUMS.ROLES.SYSTEM_ADMIN) && isL2FinalApprover(staff),
};

// Login function with callback support and enhanced verification
export async function login(email, password, callback = null) {
  try {
    // Remove any existing session so Appwrite allows creating a new one (avoids "session already active" after timeout/logout)
    try {
      await account.deleteSession("current");
    } catch (_) {
      // No current session - ignore
    }

    const session = await account.createEmailPasswordSession(email, password);

    if (session) {
      // Initialize session data
      const user = await account.get();

      if (user) {
        cacheUser(user);
        updateLastActivity();
        setSessionExpiry();
        setLoginTime();

        // Manually set session cookie with limited lifetime (not 1 year)
        if (typeof window !== "undefined" && session) {
          const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
          const cookieName = `a_session_${projectId}`;
          const cookieValue = session.$id;

          // Cookie expires after SESSION_COOKIE_MAX_AGE_SECONDS (30 minutes)
          document.cookie = `${cookieName}=${cookieValue}; path=/; max-age=${SESSION_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
        }

        // Additional wait to ensure session cookies are set properly
        await new Promise((resolve) => setTimeout(resolve, 100));

        return { session, user, callback };
      }
    }

    throw new Error("Login failed - could not establish session");
  } catch (error) {
    clearAuthCache();
    throw error;
  }
}

// Logout function with cleanup
export async function logout() {
  try {
    // Clear local cache first
    clearAuthCache();

    // Clear manually set session cookie
    if (typeof window !== "undefined") {
      const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
      const cookieName = `a_session_${projectId}`;
      document.cookie = `${cookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    }

    // Delete Appwrite session
    await account.deleteSession("current");

    return true;
  } catch (error) {
    // Even if Appwrite logout fails, clear local data
    clearAuthCache();

    // Still clear the cookie on error
    if (typeof window !== "undefined") {
      const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
      const cookieName = `a_session_${projectId}`;
      document.cookie = `${cookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    }

    throw error;
  }
}

// Register function (for setup wizard), enabling users admins to add new users
export async function register(email, password, name) {
  try {
    return await account.create("unique()", email, password, name);
  } catch (error) {
    throw error;
  }
}

// ================================
// Session Management Functions
// ================================

// Check if running in browser
function isBrowser() {
  return typeof window !== "undefined";
}

// Cache user data
function cacheUser(user) {
  if (!isBrowser()) return;

  try {
    localStorage.setItem(SESSION_KEYS.USER, JSON.stringify(user));
    setSessionExpiry();
  } catch (error) {
    // Silent fail for caching
  }
}

// Get cached user
function getCachedUser() {
  if (!isBrowser()) return null;

  try {
    const cached = localStorage.getItem(SESSION_KEYS.USER);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    return null;
  }
}

// Cache staff data
function cacheStaff(staff) {
  if (!isBrowser()) return;

  try {
    localStorage.setItem(SESSION_KEYS.STAFF, JSON.stringify(staff));
  } catch (error) {
    // Silent fail for caching
  }
}

// Get cached staff
function getCachedStaff() {
  if (!isBrowser()) return null;

  try {
    const cached = localStorage.getItem(SESSION_KEYS.STAFF);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    return null;
  }
}

// Update last activity timestamp
function updateLastActivity() {
  if (!isBrowser()) return;

  try {
    localStorage.setItem(SESSION_KEYS.LAST_ACTIVITY, Date.now().toString());
  } catch (error) {
    // Silent fail for activity tracking
  }
}

// Set session expiry
function setSessionExpiry() {
  if (!isBrowser()) return;

  try {
    const expiry = Date.now() + SESSION_TIMEOUT;
    localStorage.setItem(SESSION_KEYS.SESSION_EXPIRY, expiry.toString());
  } catch (error) {
    // Silent fail for session expiry
  }
}

// Store login time for max session duration check
function setLoginTime() {
  if (!isBrowser()) return;

  try {
    localStorage.setItem(SESSION_KEYS.LOGIN_TIME, Date.now().toString());
  } catch (error) {
    // Silent fail
  }
}

// Clear session cookie so middleware treats user as logged out
function clearSessionCookie() {
  if (!isBrowser()) return;

  try {
    const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
    const cookieName = `a_session_${projectId}`;
    document.cookie = `${cookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  } catch (error) {
    // Silent fail
  }
}

// Check if session is expired (inactivity or max duration)
function isSessionExpired() {
  if (!isBrowser()) return false;

  try {
    const lastActivity = localStorage.getItem(SESSION_KEYS.LAST_ACTIVITY);
    const sessionExpiry = localStorage.getItem(SESSION_KEYS.SESSION_EXPIRY);
    const loginTime = localStorage.getItem(SESSION_KEYS.LOGIN_TIME);

    if (!lastActivity || !sessionExpiry) return true;

    const now = Date.now();
    const lastActivityTime = parseInt(lastActivity, 10);
    const expiryTime = parseInt(sessionExpiry, 10);

    // Expired due to inactivity (e.g. 30 min)
    const inactivityExpired = now - lastActivityTime > SESSION_TIMEOUT;

    // Absolute expiry (rolling window)
    const absoluteExpired = now > expiryTime;

    // Max session duration: force re-login after e.g. 24 hours even if active
    const loginTimeNum = loginTime ? parseInt(loginTime, 10) : 0;
    const maxDurationExpired =
      loginTimeNum > 0 && now - loginTimeNum > MAX_SESSION_DURATION_MS;

    return inactivityExpired || absoluteExpired || maxDurationExpired;
  } catch (error) {
    return true;
  }
}

// Verify current session is valid
export async function verifySession() {
  try {
    const user = await account.get();

    if (user) {
      cacheUser(user);
      updateLastActivity();
      return user;
    }

    return null;
  } catch (error) {
    clearAuthCache();
    return null;
  }
}

// Clear all authentication cache and session cookie
export function clearAuthCache() {
  if (!isBrowser()) return;

  try {
    Object.values(SESSION_KEYS).forEach((key) => {
      localStorage.removeItem(key);
    });
    clearSessionCookie();
  } catch (error) {
    // Silent fail for cache clearing
  }
}

// Check if session needs refresh
export function shouldRefreshSession() {
  if (!isBrowser()) return false;

  try {
    const sessionExpiry = localStorage.getItem(SESSION_KEYS.SESSION_EXPIRY);
    if (!sessionExpiry) return false;

    const now = Date.now();
    const expiryTime = parseInt(sessionExpiry);

    // Refresh if within threshold of expiry
    return expiryTime - now < SESSION_REFRESH_THRESHOLD;
  } catch (error) {
    return false;
  }
}

// Refresh session
export async function refreshSession() {
  try {
    // Get fresh session from Appwrite
    const session = await account.getSession("current");
    if (session) {
      setSessionExpiry();
      updateLastActivity();
      return true;
    }
    return false;
  } catch (error) {
    clearAuthCache();
    return false;
  }
}

// Initialize session monitoring
export function initSessionMonitoring() {
  if (!isBrowser()) return;

  let activityTimer;
  let refreshTimer;
  let isInitialized = false;

  // Track user activity
  const trackActivity = () => {
    updateLastActivity();

    // Clear existing timer
    if (activityTimer) {
      clearTimeout(activityTimer);
    }

    // Set new timer for session expiry warning (only after initial load)
    if (isInitialized) {
      activityTimer = setTimeout(() => {
        // Warn user of impending session expiry
        // Use a more user-friendly approach - auto-refresh with notification
        refreshSession();

        // Show a toast notification instead of blocking confirm dialog
        if (typeof window !== "undefined") {
          // Dispatch a custom event that can be caught by toast system
          window.dispatchEvent(
            new CustomEvent("session-warning", {
              detail: { message: "Your session was refreshed automatically" },
            })
          );
        }
      }, SESSION_TIMEOUT - 60000); // Warn 1 minute before expiry
    }
  };

  // Set up periodic session refresh
  const setupRefreshTimer = () => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
    }

    refreshTimer = setInterval(async () => {
      if (shouldRefreshSession()) {
        const refreshed = await refreshSession();
        if (!refreshed) {
          // Session refresh failed, redirect to login
          window.location.href = "/login";
        }
      }
    }, 60000); // Check every minute
  };

  // Add activity listeners
  const events = ["mousedown", "mousemove", "keypress", "scroll", "touchstart"];
  events.forEach((event) => {
    document.addEventListener(event, trackActivity, { passive: true });
  });

  // Setup timers
  setupRefreshTimer();

  // Mark as initialized after a short delay to prevent initial dialog
  setTimeout(() => {
    isInitialized = true;
  }, 2000); // 2 second delay

  // Return cleanup function
  return () => {
    events.forEach((event) => {
      document.removeEventListener(event, trackActivity);
    });
    if (activityTimer) clearTimeout(activityTimer);
    if (refreshTimer) clearInterval(refreshTimer);
  };
}

// Get current view mode from localStorage
export const getCurrentViewMode = () => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("viewMode") || "user";
  }
  return "user";
};
