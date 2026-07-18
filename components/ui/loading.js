'use client'

import React, { useEffect, useMemo, useState } from "react"
import { useOrgTheme } from "../providers/org-theme-provider"

const FALLBACK_THEME = {
  background: "#f1f5f9",
  primary: "#2563eb",
  primaryDark: "#1d4ed8",
  accent: "#059669",
  accentDark: "#047857",
  gradientFrom: "rgba(37, 99, 235, 0.85)",
  gradientTo: "rgba(5, 150, 105, 0.75)",
  muted: "rgba(148, 163, 184, 0.14)",
}

/**
 * Loading Spinner Component
 * Reusable loading indicator with different sizes and styles
 */
export function LoadingSpinner({
  size = "md",
  className = "",
  color,
  trackColor,
  thickness = 3,
  children,
  ...props
}) {
  const { theme } = useOrgTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const dimensions = {
    sm: 16,
    md: 32,
    lg: 48,
    xl: 72,
  }

  const diameter = dimensions[size] || dimensions.md
  const palette = mounted ? theme?.colors || {} : {}
  const spinnerColor = color || palette.primary || FALLBACK_THEME.primary
  const spinnerTrack = trackColor || `${spinnerColor}20`
  const glowColor = palette.accent || FALLBACK_THEME.accent

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: diameter, height: diameter }}
      {...props}
    >
      <span
        className="absolute inset-0 rounded-full animate-spin"
        style={{
          border: `${thickness}px solid ${spinnerTrack}`,
          borderTopColor: spinnerColor,
          borderLeftColor: spinnerColor,
          boxShadow: `0 0 12px ${glowColor}40`,
        }}
      />
      <span
        className="absolute inset-[25%] rounded-full"
        style={{
          background: `${spinnerColor}12`,
          boxShadow: `inset 0 0 12px ${spinnerColor}26`,
        }}
      />
      {children}
    </div>
  )
}

function OrgWatermark({ logo, orgName, maxWidth = 280, opacity = 0.08, className = "" }) {
  if (!logo) return null

  return (
    <div className={`absolute inset-0 flex items-center justify-center pointer-events-none ${className}`}>
      <div
        className="relative"
        style={{ maxWidth, width: "100%", opacity }}
      >
        <img
          src={logo}
          alt={`${orgName || "Organization"} logo`}
          className="w-full h-auto object-contain"
        />
      </div>
    </div>
  )
}

/**
 * Page Loading Component
 * Full-screen loading indicator for page transitions
 */
export function PageLoading({ message = "Loading...", className = "" }) {
  const { theme, orgCode } = useOrgTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const palette = useMemo(() => {
    if (!mounted) {
      return FALLBACK_THEME
    }
    return {
      ...FALLBACK_THEME,
      ...(theme?.colors || {}),
    }
  }, [mounted, theme?.colors])

  const logo = mounted ? theme?.branding?.logoProxy || theme?.branding?.logo : null
  const backgroundColor = palette.background
  const primary = palette.primary
  const accent = palette.accent
  const gradientFrom = palette.gradientFrom
  const gradientTo = palette.gradientTo
  const displayOrgCode = mounted && orgCode ? orgCode : ""

  return (
    <div
      className={`relative flex items-center justify-center w-full min-h-screen overflow-hidden ${className}`}
      style={{
        backgroundColor,
        backgroundImage: `radial-gradient(circle at 18% 18%, ${primary}1f, transparent 52%), radial-gradient(circle at 82% 78%, ${accent}1a, transparent 60%)`,
      }}
    >
      <OrgWatermark logo={logo} orgName={displayOrgCode} opacity={0.12} />
      <div className="relative text-center px-6 py-8 rounded-3xl backdrop-blur-sm" style={{ background: `${backgroundColor}aa` }}>
        <div className="mx-auto mb-6 h-16 w-16 rounded-3xl" style={{
          backgroundImage: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
          boxShadow: `0 20px 45px -25px ${primary}`,
        }}>
          <LoadingSpinner size="lg" className="h-full w-full" thickness={4} />
        </div>
        {message && (
          <p className="mt-2 text-sm font-medium" style={{ color: primary }}>
            {message}
          </p>
        )}
        {displayOrgCode ? (
          <p className="mt-1 text-xs uppercase tracking-[0.3em] text-slate-500">
            {displayOrgCode}
          </p>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Section Loading Component
 * Loading indicator for specific sections/components
 */
export function SectionLoading({ message = "Loading...", className = "" }) {
  const { theme, orgCode } = useOrgTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const palette = useMemo(() => {
    if (!mounted) {
      return FALLBACK_THEME
    }
    return {
      ...FALLBACK_THEME,
      ...(theme?.colors || {}),
    }
  }, [mounted, theme?.colors])

  const logo = mounted ? theme?.branding?.logoProxy || theme?.branding?.logo : null
  const muted = palette.muted
  const displayOrgCode = mounted && orgCode ? orgCode : ""

  return (
    <div className={`relative flex items-center justify-center py-12 overflow-hidden ${className}`}>
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, ${muted}, transparent)`
        }}
      ></div>
      <OrgWatermark logo={logo} orgName={displayOrgCode} maxWidth={220} opacity={0.06} />
      <div className="relative text-center">
        <LoadingSpinner />
        {message && (
          <p className="mt-2 text-sm text-gray-600">{message}</p>
        )}
      </div>
    </div>
  )
}

/**
 * Inline Loading Component
 * Small loading indicator for buttons or inline elements
 */
export function InlineLoading({ className = "" }) {
  return (
    <LoadingSpinner 
      size="sm" 
      className={`inline-block ${className}`}
    />
  )
}

/**
 * Card Skeleton Component
 * Loading skeleton for card layouts
 */
export function CardSkeleton({ className = "" }) {
  return (
    <div className={`animate-pulse bg-white rounded-lg border shadow-sm p-6 ${className}`}>
      <div className="space-y-4">
        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        <div className="h-3 bg-gray-200 rounded w-1/2"></div>
        <div className="flex gap-2">
          <div className="h-6 bg-gray-200 rounded w-16"></div>
          <div className="h-6 bg-gray-200 rounded w-20"></div>
        </div>
      </div>
    </div>
  )
}

/**
 * Table Skeleton Component
 * Loading skeleton for table layouts
 */
export function TableSkeleton({ rows = 5, columns = 4, className = "" }) {
  return (
    <div className={`animate-pulse ${className}`}>
      <div className="bg-white rounded-lg border shadow-sm">
        {/* Header skeleton */}
        <div className="px-6 py-4 border-b">
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
            {Array.from({ length: columns }).map((_, i) => (
              <div key={i} className="h-4 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
        
        {/* Row skeletons */}
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="px-6 py-4 border-b last:border-b-0">
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
              {Array.from({ length: columns }).map((_, colIndex) => (
                <div 
                  key={colIndex} 
                  className="h-4 bg-gray-200 rounded"
                  style={{ width: colIndex === 0 ? '80%' : '60%' }}
                ></div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Grid Skeleton Component
 * Loading skeleton for card grid layouts
 */
export function GridSkeleton({ items = 8, columns = 4, className = "" }) {
  const gridCols = {
    1: "grid-cols-1",
    2: "grid-cols-1 md:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
  }

  const gridClass = gridCols[columns] || gridCols[4]

  return (
    <div className={`grid ${gridClass} gap-4 ${className}`}>
      {Array.from({ length: items }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  )
}