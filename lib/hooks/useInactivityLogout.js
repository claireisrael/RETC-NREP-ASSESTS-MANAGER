"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { logout } from "../utils/auth.js";

/**
 * Session timeout configuration constants
 * These values can be easily adjusted for different security requirements
 * 
 * @constant {Object} SESSION_TIMEOUT_CONFIG
 * @property {number} INACTIVITY_TIMEOUT_MS - Total inactivity time before logout (20 minutes)
 * @property {number} WARNING_TIMEOUT_MS - Warning time before logout (2 minutes before logout)
 */
export const SESSION_TIMEOUT_CONFIG = {
  INACTIVITY_TIMEOUT_MS: 20 * 60 * 1000, // 20 minutes of inactivity before logout
  WARNING_TIMEOUT_MS: 2 * 60 * 1000, // 2 minutes warning before logout (shows at 18 minutes)
};

/**
 * Custom hook for handling user inactivity and auto-logout
 *
 * Features:
 * - Monitors user activity (mouse, keyboard, scroll, touch)
 * - Shows warning modal before logout
 * - Configurable inactivity timeout and warning time
 * - Automatic logout and redirect to login page
 * - Integrates with existing auth system
 *
 * @param {Object} options - Configuration options
 * @param {number} options.inactivityTimeout - Time in ms before logout (default: 8 minutes)
 * @param {number} options.warningTimeout - Time in ms before showing warning (default: 2 minutes before logout)
 * @param {boolean} options.enabled - Whether the hook is enabled (default: true)
 */
export function useInactivityLogout({
  inactivityTimeout = SESSION_TIMEOUT_CONFIG.INACTIVITY_TIMEOUT_MS,
  warningTimeout = SESSION_TIMEOUT_CONFIG.WARNING_TIMEOUT_MS,
  enabled = true,
} = {}) {
  const router = useRouter();
  const [showWarning, setShowWarning] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const timeoutRef = useRef(null);
  const warningTimeoutRef = useRef(null);
  const countdownRef = useRef(null);
  const isActiveRef = useRef(true);
  const enabledRef = useRef(enabled);
  const showWarningRef = useRef(showWarning);

  // Keep refs in sync with state
  useEffect(() => {
    enabledRef.current = enabled;
    showWarningRef.current = showWarning;
  }, [enabled, showWarning]);

  // Handle logout process
  const handleLogout = async () => {
    try {
      setShowWarning(false);

      // Clear timers
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);

      // Clear the session
      await logout();

      // Redirect to login page
      router.push("/login");
    } catch (error) {
      console.error("Auto-logout failed:", error);
      // Force redirect even if logout fails
      router.push("/login");
    }
  };

  // Update last activity timestamp
  const updateLastActivity = () => {
    try {
      localStorage.setItem("auth_last_activity", Date.now().toString());
    } catch (error) {
      // Silent fail
    }
  };

  // Handle keep session (user clicked "Stay Logged In")
  const handleKeepSession = () => {
    updateLastActivity();

    // Clear existing timers
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);

    setShowWarning(false);
    setTimeRemaining(0);

    // Reset timers
    resetTimers();
  };

  // Reset timers on user activity
  const resetTimers = () => {
    if (!enabledRef.current || !isActiveRef.current) return;

    // Clear existing timers
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);

    // Hide warning if user is active
    if (showWarningRef.current) {
      setShowWarning(false);
      setTimeRemaining(0);
    }

    // Set warning timeout
    warningTimeoutRef.current = setTimeout(() => {
      if (!isActiveRef.current) return;
      setShowWarning(true);
      const warningTime = Math.round(warningTimeout / 1000);
      setTimeRemaining(warningTime);

      // Start countdown
      countdownRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, inactivityTimeout - warningTimeout);

    // Set logout timeout
    timeoutRef.current = setTimeout(async () => {
      if (!isActiveRef.current) return;
      await handleLogout();
    }, inactivityTimeout);
  };

  // Activity tracking function
  const handleActivity = () => {
    if (showWarningRef.current) {
      // User is active again after warning
      handleKeepSession();
    } else {
      // Normal activity tracking
      updateLastActivity();
      resetTimers();
    }
  };

  // Handle document visibility change (tab switch)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is not visible, pause activity
        isActiveRef.current = false;
      } else {
        // Tab is visible again, resume activity
        isActiveRef.current = true;
        updateLastActivity();
        resetTimers();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Main effect for activity tracking
  useEffect(() => {
    if (!enabled) return;

    isActiveRef.current = true;

    // Initial setup
    updateLastActivity();
    resetTimers();

    // Event listeners for user activity
    const events = [
      "mousedown",
      "mousemove",
      "keypress",
      "scroll",
      "touchstart",
      "click",
      "keydown",
    ];

    const options = { passive: true, capture: true };

    events.forEach((event) => {
      document.addEventListener(event, handleActivity, options);
    });

    // Cleanup function
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      events.forEach((event) => {
        document.removeEventListener(event, handleActivity, options);
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Generate warning modal JSX
  const WarningModal = () => {
    if (!showWarning) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 transform transition-all animate-in fade-in zoom-in duration-300">
          {/* Icon */}
          <div className="flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full mx-auto mb-6">
            <svg
              className="w-8 h-8 text-amber-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-3">
            Session About to Expire
          </h2>

          {/* Message */}
          <p className="text-gray-600 text-center mb-2">
            You've been inactive for a while. For security purposes, your
            session will expire in:
          </p>

          {/* Countdown */}
          <div className="flex items-center justify-center mb-6">
            <div className="bg-amber-50 rounded-xl px-6 py-4 border-2 border-amber-200">
              <div className="text-4xl font-bold text-amber-600">
                {formatTime(timeRemaining)}
              </div>
            </div>
          </div>

          <p className="text-sm text-gray-500 text-center mb-8">
            Click &quot;Stay Logged In&quot; to continue your session
          </p>

          {/* Buttons */}
          <div className="flex gap-4">
            <button
              onClick={handleKeepSession}
              className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200 shadow-lg hover:shadow-xl"
            >
              Stay Logged In
            </button>
            <button
              onClick={handleLogout}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-3 px-6 rounded-xl transition-colors duration-200"
            >
              Logout Now
            </button>
          </div>
        </div>
      </div>
    );
  };

  return { WarningModal, showWarning, timeRemaining };
}

// Helper function to format time
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
