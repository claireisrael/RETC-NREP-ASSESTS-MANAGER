"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Package,
  FileText,
  Users,
  Settings,
  BarChart3,
  Bell,
  Shield,
  LogOut,
  ChevronDown,
  ChevronRight,
  Eye,
  UserCog,
  Globe,
  Menu,
  X,
  ChevronLeft,
  ShoppingCart,
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { getCurrentStaff, permissions, logout } from "../../lib/utils/auth.js";
import { assetRequestsService } from "../../lib/appwrite/provider.js";
import { Query } from "appwrite";
import { ENUMS } from "../../lib/appwrite/config.js";
import { useOrgTheme } from "../providers/org-theme-provider";
import { setCurrentOrgCode, listSupportedOrgCodes } from "../../lib/utils/org";
import { resolveOrgTheme } from "../../lib/constants/org-branding";
import { useToastContext } from "../providers/toast-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export default function Sidebar() {
  const [staff, setStaff] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  // Initialize with all supported orgs so switcher is always available
  const [availableOrgs, setAvailableOrgs] = useState(() => {
    if (typeof window !== "undefined") {
      return listSupportedOrgCodes();
    }
    return [];
  });
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("viewMode") || "user";
    }
    return "user";
  }); // "user" or "admin"
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    admin: false,
    assets: false,
    consumables: false,
    requests: false,
  });
  const pathname = usePathname();
  const { theme, orgCode, setOrgCode } = useOrgTheme();
  const toast = useToastContext();
  const orgLogo =
    theme?.branding?.logoProxy ||
    theme?.branding?.logo ||
    "https://appwrite.nrep.ug/v1/storage/buckets/68aa099d001f36378da4/files/68aa09f10037892a3872/view?project=68926e9b000ac167ec8a";
  const orgName = theme?.name || "Asset Manager";
  const orgTagline = theme?.branding?.tagline || "Asset Management";
  const systemName = "Assets Manager";
  const isAdminView = viewMode === "admin";

  // Function to update view mode and persist it
  const updateViewMode = (mode) => {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("viewMode", mode);
      // Dispatch custom event so other components can react immediately
      window.dispatchEvent(new CustomEvent("viewModeChanged", { detail: { mode } }));
    }
  };

  useEffect(() => {
    loadStaffData();

    // Check if should be collapsed on mobile by default
    const handleResize = () => {
      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        setIsCollapsed(true);
        setIsMobileOpen(false);
      }
    };

    // Set initial state
    handleResize();
    window.addEventListener("resize", handleResize);

    // Restore sidebar state from localStorage
    if (typeof window !== "undefined") {
      const savedState = localStorage.getItem("sidebar-collapsed");
      if (savedState !== null && window.innerWidth >= 768) {
        setIsCollapsed(JSON.parse(savedState));
      }
    }

    return () => window.removeEventListener("resize", handleResize);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh pending requests count every 30 seconds for admins
  useEffect(() => {
    if (isAdmin && viewMode === "admin") {
      const interval = setInterval(() => {
        loadPendingRequestsCount();
      }, 30000); // 30 seconds

      return () => clearInterval(interval);
    }
  }, [isAdmin, viewMode]);

  // Save sidebar state
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth >= 768) {
      localStorage.setItem("sidebar-collapsed", JSON.stringify(isCollapsed));
    }
  }, [isCollapsed]);

  // Initialize available orgs on mount
  useEffect(() => {
    // Always show all supported organizations for switching
    const allSupportedOrgs = listSupportedOrgCodes();
    setAvailableOrgs(allSupportedOrgs);
  }, []);

  const loadStaffData = async () => {
    try {
      const currentStaff = await getCurrentStaff();
      if (currentStaff) {
        setStaff(currentStaff);
        const adminStatus = permissions.isAdmin(currentStaff);
        setIsAdmin(adminStatus);

        // Load pending request count for admins
        if (adminStatus) {
          loadPendingRequestsCount();
        }

        // Auto-set view mode based on current path
        if (pathname.startsWith("/admin")) {
          setViewMode("admin");
          setExpandedSections((prev) => ({ ...prev, admin: true }));
        } else {
          setViewMode("user");
        }
      }
    } catch (error) {
      // Silent fail for staff data loading
    }
  };

  const loadPendingRequestsCount = async () => {
    try {
      const response = await assetRequestsService.list([
        Query.equal("status", ENUMS.REQUEST_STATUS.PENDING),
        Query.orderDesc("$createdAt"),
      ]);
      const pending = response.documents || [];
      const staffMember = staff || (await getCurrentStaff());
      const isL1Only =
        staffMember &&
        permissions.canApproveL1(staffMember) &&
        !permissions.canApproveL2(staffMember);

      if (isL1Only) {
        // Only count requests still awaiting this admin's L1 action.
        const l1Count = pending.filter((request) => {
          const stage =
            request?.approvalStage || ENUMS.APPROVAL_STAGE.L1;
          return stage === ENUMS.APPROVAL_STAGE.L1;
        }).length;
        setPendingRequestsCount(l1Count);
      } else if (
        staffMember &&
        permissions.canApproveL2(staffMember)
      ) {
        // Superadmins: only count requests that have reached L2 (after L1).
        const l2Count = pending.filter((request) => {
          const stage =
            request?.approvalStage || ENUMS.APPROVAL_STAGE.L1;
          return stage === ENUMS.APPROVAL_STAGE.L2;
        }).length;
        setPendingRequestsCount(l2Count);
      } else {
        setPendingRequestsCount(pending.length);
      }
    } catch (error) {
      console.error("Error loading pending requests count:", error);
      setPendingRequestsCount(0);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      window.location.href = "/login";
    } catch (error) {
      // Silent fail for logout
    }
  };

  const toggleSidebar = () => {
    if (typeof window !== "undefined") {
      if (window.innerWidth < 768) {
        setIsMobileOpen(!isMobileOpen);
      } else {
        setIsCollapsed(!isCollapsed);
      }
    }
  };

  const toggleSection = (section) => {
    if (isCollapsed) return; // Don't expand sections when collapsed
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const switchViewMode = (mode) => {
    updateViewMode(mode);
    if (mode === "admin") {
      window.location.href = "/admin/dashboard";
    } else {
      window.location.href = "/dashboard";
    }
  };

  const isActivePath = (path) => {
    if (path === "/" && pathname === "/") return true;
    if (path !== "/" && pathname.startsWith(path)) return true;
    return false;
  };

  // User navigation items
  const userNavItems = [
    {
      label: "Dashboard",
      href: "/dashboard",
      icon: Home,
      badge: null,
    },
    {
      label: "Browse Assets",
      href: "/assets",
      icon: Package,
      badge: null,
    },
    {
      label: "Browse Consumables",
      href: "/consumables",
      icon: ShoppingCart,
      badge: null,
    },
    {
      label: "My Requests",
      href: "/requests",
      icon: FileText,
      badge: null,
    },
    {
      label: "Guest Portal",
      href: "/guest",
      icon: Globe,
      badge: null,
    },
  ];

  // Admin navigation items (filtered by role below)
  const adminNavItemsAll = [
    {
      label: "Admin Dashboard",
      href: "/admin/dashboard",
      icon: BarChart3,
      badge: null,
      visible: (s) => permissions.isAdmin(s),
    },
    {
      label: "Asset Management",
      href: "/admin/assets",
      icon: Package,
      badge: null,
      visible: (s) => permissions.canManageAssets(s),
      children: [
        { label: "All Assets", href: "/admin/assets" },
        { label: "Add Asset", href: "/admin/assets/new" },
      ],
    },
    {
      label: "Consumable Management",
      href: "/admin/consumables",
      icon: ShoppingCart,
      badge: null,
      visible: (s) => permissions.canManageConsumables(s),
      children: [
        { label: "All Consumables", href: "/admin/consumables" },
        { label: "Add Consumable", href: "/admin/consumables/new" },
      ],
    },
    {
      label: "Request Management",
      href: "/admin/requests",
      icon: FileText,
      badge: pendingRequestsCount > 0 ? pendingRequestsCount.toString() : null,
      visible: (s) => permissions.canManageRequests(s),
    },
    {
      label: "User Management",
      href: "/admin/users",
      icon: Users,
      badge: null,
      visible: (s) => permissions.canManageUsers(s),
    },
    {
      label: "Reports",
      href: "/admin/reports",
      icon: BarChart3,
      badge: null,
      visible: (s) => permissions.canViewReports(s),
    },
    {
      label: "Notifications",
      href: "/admin/notifications",
      icon: Bell,
      badge: null,
      visible: (s) => permissions.isAdmin(s),
    },
    {
      label: "System Settings",
      href: "/admin/settings",
      icon: Settings,
      badge: null,
      visible: (s) => permissions.canManageSettings(s),
    },
  ];

  const adminNavItems = staff
    ? adminNavItemsAll.filter((item) => !item.visible || item.visible(staff))
    : [];

  const NavigationItem = ({ item, isActive, level = 0 }) => {
    // Use the same blue → orange brand mix for active and hover
    const activeClass = "bg-gradient-to-r from-[var(--org-primary)] to-[var(--org-highlight)] text-white shadow-lg scale-[1.02]";
    const hoverClass = "hover:bg-gradient-to-r hover:from-[var(--org-primary)]/90 hover:to-[var(--org-highlight)]/90 hover:text-white hover:shadow-lg hover:scale-[1.02]";

    const ItemContent = (
      <>
        <div className="flex items-center flex-1 min-w-0">
          <item.icon
            className={`flex-shrink-0 ${
              isCollapsed ? "w-5 h-5" : "w-4 h-4 mr-3"
            } ${isActive ? "text-white" : "text-white group-hover:text-white"}`}
          />
          {!isCollapsed && (
            <>
              <span className="truncate font-medium text-sm text-white">
                {item.label}
              </span>
              {item.badge && (
                <Badge
                  className="ml-auto text-xs px-2 py-0.5 min-w-[1.45rem] h-5 font-bold text-slate-900 shadow"
                  style={{ background: "var(--org-highlight)" }}
                >
                  {item.badge}
                </Badge>
              )}
            </>
          )}
        </div>
        {!isCollapsed && item.children && (
          <ChevronRight
            className={`w-4 h-4 transition-transform ${
              expandedSections[item.href] ? "rotate-90" : ""
            } text-white/70`}
          />
        )}
      </>
    );

    if (isCollapsed) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href={item.href}
                className={`group flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-200 ${
                  isActive
                    ? `${activeClass}`
                    : `text-white/80 ${hoverClass}`
                } ${level > 0 ? "ml-4" : ""}`}
              >
                {ItemContent}
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium">
              <p>{item.label}</p>
              {item.badge && (
                <Badge
                  className="ml-2 text-xs font-bold text-slate-900 shadow"
                  style={{ background: "var(--org-highlight)" }}
                >
                  {item.badge}
                </Badge>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <Link
        href={item.href}
        className={`group flex items-center px-3 py-2.5 rounded-xl transition-all duration-200 ${
          isActive
            ? `${activeClass}`
            : `text-white/80 ${hoverClass}`
        } ${level > 0 ? "ml-6" : ""}`}
      >
        {ItemContent}
      </Link>
    );
  };

  if (!staff) {
    return null; // Don't render sidebar if not authenticated
  }

  return (
    <>
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Floating Menu Button - Bottom Left */}
      <button
        className="fixed bottom-6 left-6 z-50 md:hidden w-14 h-14 rounded-full text-white shadow-2xl border-0 transition-all duration-300 ease-in-out hover:scale-110 active:scale-95 flex items-center justify-center"
        onClick={() => {
          setIsMobileOpen(!isMobileOpen);
        }}
        type="button"
        style={
          isMobileOpen
            ? undefined
            : {
                background: "linear-gradient(135deg, var(--org-primary), var(--org-primary-dark))",
                boxShadow: "0 10px 25px rgba(0, 0, 0, 0.25)",
              }
        }
      >
        {isMobileOpen ? (
          <X className="w-6 h-6" />
        ) : (
          <Menu className="w-6 h-6" />
        )}

        {/* Subtle floating animation pulse */}
        {!isMobileOpen && (
          <div
            className="absolute inset-0 rounded-full opacity-20 animate-ping pointer-events-none"
            style={{
              background: "linear-gradient(135deg, var(--org-primary), var(--org-primary-dark))",
            }}
          ></div>
        )}

        {/* Notification badge for mobile */}
        {!isMobileOpen && isAdmin && viewMode === "admin" && (
          <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-white shadow-lg pointer-events-none">
            5
          </div>
        )}
      </button>

      {/* Desktop Sidebar - Inline */}
      <div
        className={`hidden md:flex flex-col border-r transition-all duration-300 ease-in-out ${
          isCollapsed ? "w-20" : "w-72"
        }`}
        style={{
          background: "linear-gradient(180deg, var(--org-primary-dark), var(--org-primary))",
          borderColor: "var(--org-primary-dark)",
        }}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-3 py-5">
            {!isCollapsed ? (
              <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-white px-3 py-2.5 ring-1 ring-black/5">
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white">
                  <img
                    src={orgLogo}
                    alt={`${orgName} logo`}
                    className="h-full w-full object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-base font-bold leading-tight text-slate-900">
                    {systemName}
                  </h1>
                  <p className="truncate text-[11px] font-medium leading-snug text-slate-500">
                    {orgCode || orgName}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mx-auto flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-black/5">
                <img
                  src={orgLogo}
                  alt={`${orgName} logo`}
                  className="h-full w-full object-contain"
                />
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="hidden md:flex items-center justify-center rounded-full text-white p-2 border border-white/30 shadow-md hover:shadow-lg hover:text-white transition-all duration-200"
              style={{
                background:
                  "linear-gradient(135deg, var(--org-highlight) 0%, var(--org-highlight-dark) 100%)",
              }}
              onClick={toggleSidebar}
            >
              <ChevronLeft
                className={`w-4 h-4 transition-transform duration-200 ${
                  isCollapsed ? "rotate-180" : ""
                }`}
              />
            </Button>
          </div>

          {/* User Info */}
          <div className="px-4 pb-6">
            {isCollapsed ? (
              <>
                {/* Organization Switcher for Collapsed Sidebar */}
                {availableOrgs.length > 0 && (
                  <div className="mb-3 flex justify-center">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-10 h-10 p-0 bg-white/5 border-white/20 hover:bg-white/10 text-white hover:text-white"
                              >
                                <Globe className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-60 bg-white border border-slate-200 shadow-xl rounded-xl p-1">
                              {availableOrgs.map((code) => {
                                const orgTheme = resolveOrgTheme(code);
                                const isActive = (orgCode || "RETC").toUpperCase() === code.toUpperCase();
                                return (
                                  <DropdownMenuItem
                                    key={code}
                                    onClick={() => {
                                      setCurrentOrgCode(code);
                                      setOrgCode(code);
                                      toast.success(`Switched to ${orgTheme.name}`);
                                      window.location.reload();
                                    }}
                                    className={`cursor-pointer rounded-lg px-2 py-2 transition-colors ${
                                      isActive
                                        ? "bg-org-primary-soft text-[var(--org-primary)] font-semibold"
                                        : "text-slate-700 hover:bg-slate-100 focus:bg-slate-100"
                                    }`}
                                  >
                                    <div className="flex items-center space-x-2.5 w-full">
                                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-slate-200">
                                        <img
                                          src={orgTheme.branding.logoProxy || orgTheme.branding.logo}
                                          alt={orgTheme.name}
                                          className="w-4 h-4 object-contain"
                                        />
                                      </span>
                                      <span
                                        className={`flex-1 text-sm leading-tight ${
                                          code.toUpperCase() === "RETC" ? "text-emerald-600 font-semibold" : ""
                                        }`}
                                      >
                                        {orgTheme.name}
                                      </span>
                                      {isActive && (
                                        <span className="h-2 w-2 rounded-full bg-[var(--org-accent)]" />
                                      )}
                                    </div>
                                  </DropdownMenuItem>
                                );
                              })}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <p>Switch Organization</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex justify-center">
                        <Avatar className="w-10 h-10 ring-2 ring-gray-700">
                          <AvatarFallback className="bg-gradient-to-br from-sidebar-500 to-sidebar-600 text-white font-semibold">
                            {staff.name?.charAt(0)?.toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <div>
                        <p className="font-medium">{staff.name}</p>
                        <p className="text-xs text-orange-400">{staff.email}</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </>
            ) : (
              <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-4 border border-gray-700/50">
                <div className="flex items-center space-x-3 mb-4">
                  <Avatar className="w-12 h-12 ring-2 ring-gray-600">
                    <AvatarFallback className="bg-gradient-to-br from-sidebar-500 to-sidebar-600 text-white font-semibold">
                      {staff.name?.charAt(0)?.toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm truncate">
                      {staff.name}
                    </p>
                    <p className="text-org-tagline text-xs truncate">
                      {staff.email}
                    </p>
                    <p className="text-org-tagline text-xs">
                      {staff.department || "Staff"}
                    </p>
                  </div>
                </div>

                {/* Organization Switcher - Always show if we have org data */}
                {availableOrgs.length > 0 && (
                  <div className="mb-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-between text-xs h-9 bg-white/5 border-white/20 hover:bg-white/10 text-white hover:text-white"
                        >
                          <div className="flex items-center space-x-2">
                            <Globe className="w-3 h-3" />
                            <span className="truncate">
                              {resolveOrgTheme(orgCode || "RETC").code}
                            </span>
                          </div>
                          <ChevronDown className="w-3 h-3 ml-2" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-60 bg-white border border-slate-200 shadow-xl rounded-xl p-1">
                        {availableOrgs.map((code) => {
                          const orgTheme = resolveOrgTheme(code);
                          const isActive = (orgCode || "RETC").toUpperCase() === code.toUpperCase();
                          return (
                            <DropdownMenuItem
                              key={code}
                              onClick={() => {
                                setCurrentOrgCode(code);
                                setOrgCode(code);
                                toast.success(`Switched to ${orgTheme.name}`);
                                // Reload page to apply new organization theme
                                window.location.reload();
                              }}
                              className={`cursor-pointer rounded-lg px-2 py-2 transition-colors ${
                                isActive
                                  ? "bg-org-primary-soft text-[var(--org-primary)] font-semibold"
                                  : "text-slate-700 hover:bg-slate-100 focus:bg-slate-100"
                              }`}
                            >
                              <div className="flex items-center space-x-2.5 w-full">
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-slate-200">
                                  <img
                                    src={orgTheme.branding.logoProxy || orgTheme.branding.logo}
                                    alt={orgTheme.name}
                                    className="w-4 h-4 object-contain"
                                  />
                                </span>
                                <span
                                  className={`flex-1 text-sm leading-tight ${
                                    code.toUpperCase() === "RETC" ? "text-emerald-600 font-semibold" : ""
                                  }`}
                                >
                                  {orgTheme.name}
                                </span>
                                {isActive && (
                                  <span className="h-2 w-2 rounded-full bg-[var(--org-accent)]" />
                                )}
                              </div>
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}

                {/* Role Switch for Admins */}
                {isAdmin && (
                  <div className="space-y-2">
                    <div className="flex space-x-2">
                      <Button
                        variant={viewMode === "user" ? "default" : "ghost"}
                        size="sm"
                        className={`sidebar-user-toggle flex-1 text-xs h-8 transition-all duration-200 font-medium ${
                          viewMode === "user"
                            ? "bg-gradient-to-r from-[var(--org-primary)] to-[var(--org-highlight)] text-white shadow-lg scale-[1.02]"
                            : "!text-white border-2 border-white/60 bg-gradient-to-r from-[var(--org-primary)]/50 to-[var(--org-highlight)]/40 hover:from-[var(--org-primary)]/70 hover:to-[var(--org-highlight)]/60 hover:!text-white hover:shadow-lg hover:scale-[1.02] hover:border-white"
                        }`}
                        onClick={() => switchViewMode("user")}
                      >
                        <Eye className="w-3 h-3 mr-1 !text-white" />
                        <span className="!text-white">User</span>
                      </Button>
                      <Button
                        variant={viewMode === "admin" ? "default" : "ghost"}
                        size="sm"
                        className={`sidebar-user-toggle flex-1 text-xs h-8 transition-all duration-200 font-medium ${
                          viewMode === "admin"
                            ? "bg-gradient-to-r from-[var(--org-primary)] to-[var(--org-highlight)] text-white shadow-lg scale-[1.02]"
                            : "!text-white border-2 border-white/60 bg-gradient-to-r from-[var(--org-primary)]/50 to-[var(--org-highlight)]/40 hover:from-[var(--org-primary)]/70 hover:to-[var(--org-highlight)]/60 hover:!text-white hover:shadow-lg hover:scale-[1.02] hover:border-white"
                        }`}
                        onClick={() => switchViewMode("admin")}
                      >
                        <Shield className="w-3 h-3 mr-1 !text-white" />
                        <span className="!text-white">Admin</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 pb-4 overflow-y-auto">
            <div className="space-y-2">
              {/* Mode indicator for collapsed sidebar */}
              {isCollapsed && (
                <div className="flex justify-center pb-2">
                  <div
                    className={`w-8 h-1 rounded-full ${
                      viewMode === "admin" ? "bg-red-500" : "bg-sidebar-500"
                    }`}
                  />
                </div>
              )}

              {/* Current View Label */}
              {!isCollapsed && (
                <div className="px-3 py-2">
                  <Badge
                    variant="outline"
                    className={`badge-mode ${
                      viewMode === "admin"
                        ? "badge-mode--admin"
                        : "badge-mode--user"
                    }`}
                  >
                    {viewMode === "admin" ? "Admin Mode" : "User Mode"}
                  </Badge>
                </div>
              )}

              {/* User Navigation */}
              {viewMode === "user" && (
                <div className="space-y-1">
                  {!isCollapsed && (
                    <div className="px-3 py-2">
                      <p className="text-xs font-semibold text-org-highlight uppercase tracking-wider">
                        User Menu
                      </p>
                    </div>
                  )}
                  {userNavItems.map((item) => (
                    <NavigationItem
                      key={item.href}
                      item={item}
                      isActive={isActivePath(item.href)}
                    />
                  ))}
                </div>
              )}

              {/* Admin Navigation */}
              {viewMode === "admin" && isAdmin && (
                <div className="space-y-1">
                  {!isCollapsed && (
                    <div className="px-3 py-2">
                      <p className="text-xs font-semibold text-org-highlight uppercase tracking-wider">
                        Admin Menu
                      </p>
                    </div>
                  )}
                  {adminNavItems.map((item) => (
                    <NavigationItem
                      key={item.href}
                      item={item}
                      isActive={isActivePath(item.href)}
                    />
                  ))}
                </div>
              )}
            </div>
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-orange-800/50">
            {isCollapsed ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      className="sidebar-signout w-12 h-12 mx-auto flex items-center justify-center rounded-xl transition-all duration-200"
                      onClick={handleLogout}
                    >
                      <LogOut className="w-5 h-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>Sign Out</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <Button
                variant="ghost"
                className="sidebar-signout w-full justify-start transition-all duration-200 font-semibold rounded-xl py-3"
                onClick={handleLogout}
              >
                <LogOut className="mr-3 h-5 w-5" />
                <span>Sign Out</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Sidebar - Fixed Overlay */}
      <div
        className={`fixed left-0 top-0 z-40 h-full w-72 md:hidden border-r transition-transform duration-300 ease-in-out ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          background: "linear-gradient(180deg, var(--org-primary-dark), var(--org-primary))",
          borderColor: "var(--org-primary-dark)",
        }}
      >
        <div className="flex flex-col h-full">
          {/* Mobile Header */}
          <div className="flex items-center justify-between gap-2 px-3 py-5">
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-white px-3 py-2.5 ring-1 ring-black/5">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white">
                <img
                  src={orgLogo}
                  alt={`${orgName} logo`}
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-base font-bold leading-tight text-slate-900">
                  {systemName}
                </h1>
                <p className="truncate text-[11px] font-medium leading-snug text-slate-500">
                  {orgCode || orgTagline}
                </p>
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="text-orange-400 hover:text-white hover:bg-orange-800/50 p-2"
              onClick={() => setIsMobileOpen(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Mobile User Info */}
          <div className="px-4 pb-6">
            <div
              className="backdrop-blur-sm rounded-xl p-4 border border-org-muted"
              style={{ backgroundColor: "rgba(255, 255, 255, 0.08)" }}
            >
              <div className="flex items-center space-x-3 mb-4">
                <Avatar className="w-12 h-12 ring-2"
                  style={{ boxShadow: "0 0 0 2px rgba(255,255,255,0.25) inset" }}
                >
                  <AvatarFallback className="bg-org-gradient text-white font-semibold">
                    {staff.name?.charAt(0)?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm truncate">
                    {staff.name}
                  </p>
                  <p className="text-org-tagline text-xs truncate">
                    {staff.email}
                  </p>
                  <p className="text-org-tagline text-xs">
                    {staff.department || "Staff"}
                  </p>
                </div>
              </div>

              {/* Mobile Role Switch for Admins */}
              {isAdmin && (
                <div className="space-y-2">
                  <div className="flex space-x-2">
                    <Button
                      variant={viewMode === "user" ? "default" : "ghost"}
                      size="sm"
                      className={`flex-1 text-xs h-8 transition-all duration-200 font-medium ${
                        viewMode === "user"
                          ? "bg-gradient-to-r from-[var(--org-primary)] to-[var(--org-highlight)] text-white shadow-lg scale-[1.02]"
                          : "!text-white border-2 border-white/60 bg-gradient-to-r from-[var(--org-primary)]/50 to-[var(--org-highlight)]/40 hover:from-[var(--org-primary)]/70 hover:to-[var(--org-highlight)]/60 hover:!text-white hover:shadow-lg hover:scale-[1.02] hover:border-white"
                      }`}
                      onClick={() => switchViewMode("user")}
                    >
                      <Eye className="w-3 h-3 mr-1 !text-white" />
                      <span className="!text-white">User</span>
                    </Button>
                    <Button
                      variant={viewMode === "admin" ? "default" : "ghost"}
                      size="sm"
                      className={`flex-1 text-xs h-8 transition-all duration-200 font-medium ${
                        viewMode === "admin"
                          ? "bg-gradient-to-r from-[var(--org-primary)] to-[var(--org-highlight)] text-white shadow-lg scale-[1.02]"
                          : "!text-white border-2 border-white/60 bg-gradient-to-r from-[var(--org-primary)]/50 to-[var(--org-highlight)]/40 hover:from-[var(--org-primary)]/70 hover:to-[var(--org-highlight)]/60 hover:!text-white hover:shadow-lg hover:scale-[1.02] hover:border-white"
                      }`}
                      onClick={() => switchViewMode("admin")}
                    >
                      <Shield className="w-3 h-3 mr-1 !text-white" />
                      <span className="!text-white">Admin</span>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Mobile Navigation */}
          <nav className="flex-1 px-4 pb-4 overflow-y-auto">
            <div className="space-y-2">
              {/* Current View Label */}
              <div className="px-3 py-2">
                <Badge
                  className={`bg-org-gradient text-white text-xs font-medium border-org-muted`}
                >
                  {viewMode === "admin" ? "Admin Mode" : "User Mode"}
                </Badge>
              </div>

              {/* User Navigation */}
              {viewMode === "user" && (
                <div className="space-y-1">
                  <div className="px-3 py-2">
                    <p className="text-xs font-semibold text-org-highlight uppercase tracking-wider">
                      User Menu
                    </p>
                  </div>
                  {userNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`group flex items-center px-3 py-2.5 rounded-xl transition-all duration-200 ${
                        isActivePath(item.href)
                          ? "bg-gradient-to-r from-[var(--org-primary)] to-[var(--org-highlight)] text-white shadow-lg scale-[1.02]"
                          : `text-white/80 hover:bg-gradient-to-r hover:from-[var(--org-primary)]/80 hover:to-[var(--org-highlight)]/70 hover:text-white hover:shadow-lg hover:scale-[1.02]`
                      }`}
                      onClick={() => setIsMobileOpen(false)}
                    >
                      <item.icon className="w-4 h-4 mr-3 text-white group-hover:text-white" />
                      <span className="truncate font-medium text-sm text-white">
                        {item.label}
                      </span>
                      {item.badge && (
                        <Badge
                          className="ml-auto text-xs px-2 py-0.5 min-w-[1.45rem] h-5 font-bold text-slate-900 shadow"
                          style={{ background: "var(--org-highlight)" }}
                        >
                          {item.badge}
                        </Badge>
                      )}
                    </Link>
                  ))}
                </div>
              )}

              {/* Admin Navigation */}
              {viewMode === "admin" && isAdmin && (
                <div className="space-y-1">
                  <div className="px-3 py-2">
                    <p className="text-xs font-semibold text-org-highlight uppercase tracking-wider">
                      {viewMode === "admin" ? "Admin Menu" : "User Menu"}
                    </p>
                  </div>
                  {adminNavItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`group flex items-center px-3 py-2.5 rounded-xl transition-all duration-200 ${
                        isActivePath(item.href)
                          ? "bg-gradient-to-r from-[var(--org-primary)] to-[var(--org-highlight)] text-white shadow-lg scale-[1.02]"
                          : "text-white/80 hover:bg-gradient-to-r hover:from-[var(--org-primary)]/80 hover:to-[var(--org-highlight)]/70 hover:text-white hover:shadow-lg hover:scale-[1.02]"
                      }`}
                      onClick={() => setIsMobileOpen(false)}
                    >
                      <item.icon className="w-4 h-4 mr-3 text-white group-hover:text-white" />
                      <span className="truncate font-medium text-sm text-white">
                        {item.label}
                      </span>
                      {item.badge && (
                        <Badge
                          className="ml-auto text-xs px-2 py-0.5 min-w-[1.45rem] h-5 font-bold text-slate-900 shadow"
                          style={{ background: "var(--org-highlight)" }}
                        >
                          {item.badge}
                        </Badge>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </nav>

          {/* Mobile Footer */}
          <div className="p-4 border-t border-orange-800/50">
            <Button
              variant="ghost"
              className="sidebar-signout w-full justify-start transition-all duration-200 font-semibold rounded-xl py-3"
              onClick={handleLogout}
            >
              <LogOut className="mr-3 h-5 w-5" />
              <span>Sign Out</span>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
