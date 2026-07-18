"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Badge } from "../../../components/ui/badge";
import { DataTable } from "../../../components/ui/data-table";
import { EmptyUsers } from "../../../components/ui/empty-state";
import { PageLoading } from "../../../components/ui/loading";
import {
  ListPagination,
  paginateItems,
} from "../../../components/ui/list-pagination";
import { useOrgTheme } from "../../../components/providers/org-theme-provider";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Label } from "../../../components/ui/label";
import { Textarea } from "../../../components/ui/textarea";
import { Checkbox } from "../../../components/ui/checkbox";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  UserCheck,
  UserX,
  User,
  Mail,
  Shield,
  Building,
  Phone,
  Hash,
  AlertCircle,
  X,
  Loader2,
  CheckCircle,
  Copy,
  Users,
  Filter,
  RefreshCw,
  Eye,
  AlertTriangle,
} from "lucide-react";
import {
  staffService,
  departmentsService,
} from "../../../lib/appwrite/provider.js";
import { register } from "../../../lib/utils/auth.js";
import { getCurrentStaff, permissions } from "../../../lib/utils/auth.js";
import { ENUMS } from "../../../lib/appwrite/config.js";
import { USER_ROLES } from "../../../lib/utils/mappings.js";

// Helper function to format role for display
const formatRole = (role) => {
  return USER_ROLES[role] || role;
};

const getRoleBadgeColor = (role) => {
  switch (role) {
    case "SYSTEM_ADMIN":
      return "bg-[var(--org-highlight)] text-white border-[var(--org-highlight-dark)]/40 shadow-sm";
    case "ASSET_ADMIN":
      return "bg-white text-[var(--org-highlight-dark)] border-[var(--org-highlight)]/45 shadow-sm";
    case "CONSUMABLE_ADMIN":
      return "bg-[var(--org-highlight)]/20 text-[var(--org-highlight-dark)] border-[var(--org-highlight)]/35 shadow-sm";
    case "STAFF":
      return "bg-[var(--org-muted)] text-[var(--org-primary)] border-[var(--org-primary)]/20";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
};

const getStatusBadgeClass = (active) => {
  if (active) {
    return "bg-[var(--org-accent)] text-white border-[var(--org-primary-dark)]/35 shadow-sm";
  }

  return "bg-[var(--org-highlight)] text-white border-[var(--org-highlight-dark)]/35 shadow-sm";
};

const PAGE_SIZE = 15;

export default function UserManagement() {
  const [currentStaff, setCurrentStaff] = useState(null);
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRole, setSelectedRole] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [creationStep, setCreationStep] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  // Edit user state
  const [editUser, setEditUser] = useState({
    name: "",
    email: "",
    otherEmail: "",
    phoneNumber: "",
    phoneNumber2: "",
    departmentId: "",
    roles: [],
    active: true,
  });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");

  const { orgCode, theme } = useOrgTheme();
  const colors = theme?.colors || {};
  const primaryColor = colors.primary || "#059669";
  const accentColor = colors.accent || "#2563eb";
  const backgroundColor = colors.background || "#f1f5f9";
  const mutedColor = colors.muted || "rgba(226, 232, 240, 0.35)";
  const primaryDark = colors.primaryDark || primaryColor;
  const accentDark = colors.accentDark || accentColor;
  const highlightColor = "var(--org-highlight)";
  const highlightDark = "var(--org-highlight-dark)";
  const patternFill = encodeURIComponent((primaryColor || "#0E6370").replace("#", ""));


  // Delete dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Initialize new user with correct field names
  const [newUser, setNewUser] = useState({
    userId: "",
    name: "",
    email: "",
    otherEmail: "",
    phoneNumber: "",
    phoneNumber2: "",
    departmentId: "",
    roles: ["STAFF"], // Array of roles, default to STAFF
    active: true,
  });

  useEffect(() => {
    initializeData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initializeData = async () => {
    try {
      // Get current staff for permission checking
      const staff = await getCurrentStaff();
      if (!staff || !permissions.canManageUsers(staff)) {
        window.location.href = "/unauthorized";
        return;
      }
      setCurrentStaff(staff);

      // Load users and departments
      await Promise.all([loadUsers(), loadDepartments()]);
    } catch (error) {
      setError("Failed to load data. Please refresh the page.");
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await staffService.list();
      setUsers(response.documents || []);
    } catch (error) {
      throw error;
    }
  };

  const loadDepartments = async () => {
    try {
      const response = await departmentsService.list();
      setDepartments(response.documents || []);
    } catch (error) {
      throw error;
    }
  };

  const validateUserData = (userData) => {
    const errors = [];

    if (!userData.name || userData.name.trim().length === 0) {
      errors.push("Name is required");
    }

    if (!userData.email || userData.email.trim().length === 0) {
      errors.push("Email is required");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userData.email)) {
      errors.push("Please enter a valid email address");
    }

    if (
      userData.otherEmail &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userData.otherEmail)
    ) {
      errors.push("Please enter a valid secondary email address");
    }

    if (!Array.isArray(userData.roles) || userData.roles.length === 0) {
      errors.push("At least one role must be selected");
    }

    return errors;
  };

  const resetNewUser = () => {
    setNewUser({
      userId: "",
      name: "",
      email: "",
      otherEmail: "",
      phoneNumber: "",
      phoneNumber2: "",
      departmentId: "",
      roles: ["STAFF"],
      active: true,
    });
  };

  const createUser = async () => {
    setSubmitting(true);
    setError("");
    setCreationStep("Validating user data...");

    try {
      // Validate input data
      const validationErrors = validateUserData(newUser);
      if (validationErrors.length > 0) {
        setError(validationErrors.join(", "));
        return;
      }

      // Check if email already exists
      setCreationStep("Checking email availability...");
      const existingUsers = await staffService.list();
      const emailExists = existingUsers.documents.some(
        (user) => user.email?.toLowerCase() === newUser.email.toLowerCase()
      );

      if (emailExists) {
        setError("A user with this email already exists");
        return;
      }

      // Generate a temporary password for the new user
      setCreationStep("Generating secure credentials...");
      const tempPassword = `Temp${Math.random().toString(36).slice(-8)}!`;

      // Create the user account in Appwrite Auth
      setCreationStep("Creating user account...");
      const authUser = await register(
        newUser.email,
        tempPassword,
        newUser.name
      );
      if (!authUser) {
        setError("Failed to create user account");
        return;
      }

      // Generate userId if not provided
      const generatedUserId =
        newUser.userId?.trim() || `USR${Date.now().toString().slice(-6)}`;

      // Prepare staff data with correct field names matching the collection
      const staffData = {
        userId: generatedUserId,
        name: newUser.name.trim(),
        email: newUser.email.toLowerCase().trim(),
        otherEmail: newUser.otherEmail
          ? newUser.otherEmail.toLowerCase().trim()
          : null,
        phoneNumber: newUser.phoneNumber?.trim() || null,
        phoneNumber2: newUser.phoneNumber2?.trim() || null,
        departmentId: newUser.departmentId || null,
        roles: newUser.roles, // Array of role strings
        active: true,
      };

      // Create the staff document in the database
      setCreationStep("Setting up user profile...");
      await staffService.create(staffData);

      // Send welcome email with temporary password
      setCreationStep("Sending welcome email...");
      try {
        const departmentName = newUser.departmentId
          ? departments.find((d) => d.$id === newUser.departmentId)?.name
          : null;

        const welcomeEmailData = {
          userName: newUser.name.trim(),
          userEmail: newUser.email.toLowerCase().trim(),
          userId: generatedUserId,
          roles: newUser.roles,
          department: departmentName,
          temporaryPassword: tempPassword,
        };

        const emailResponse = await fetch("/api/notifications/email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "USER_WELCOME",
            recipient: newUser.email.toLowerCase().trim(),
            data: welcomeEmailData,
          }),
        });

        if (!emailResponse.ok) {
          // Welcome email failed to send
          // Don't fail user creation if email fails
        }
      } catch (emailError) {
        // Don't fail user creation if email fails
      }

      setCreationStep("Finalizing setup...");
      await loadUsers();

      // Reset filters to show all users
      setSelectedRole("all");
      setSearchTerm("");

      // Show success state
      setShowSuccess({
        userId: generatedUserId,
        email: newUser.email,
        name: newUser.name,
        tempPassword,
      });

      // Reset form after short delay to show success
      setTimeout(() => {
        setIsCreateDialogOpen(false);
        resetNewUser();
        setShowSuccess(false);
      }, 4000);
    } catch (error) {
      setError(error.message || "Failed to create user. Please try again.");
    } finally {
      setSubmitting(false);
      setCreationStep("");
    }
  };

  const updateUser = async (userId, updates) => {
    try {
      await staffService.update(userId, updates);
      await loadUsers();
      // Reset filters to show all users
      setSelectedRole("all");
      setSearchTerm("");
      setEditingUser(null);
    } catch (error) {
      setError("Failed to update user");
    }
  };

  const handleEditUser = (user) => {
    setEditUser({
      name: user.name || "",
      email: user.email || "",
      otherEmail: user.otherEmail || "",
      phoneNumber: user.phoneNumber || "",
      phoneNumber2: user.phoneNumber2 || "",
      departmentId: user.departmentId || "",
      roles: user.roles || [],
      active: user.active !== false,
    });
    setEditingUser(user);
    setEditError("");
  };

  const handleEditRoleToggle = (role, checked) => {
    setEditUser((prev) => {
      const newRoles = checked
        ? [...prev.roles, role]
        : prev.roles.filter((r) => r !== role);

      // Ensure at least one role is always selected
      return {
        ...prev,
        roles: newRoles.length > 0 ? newRoles : ["STAFF"],
      };
    });
  };

  const saveEditUser = async () => {
    if (!editingUser) return;

    setEditSubmitting(true);
    setEditError("");

    try {
      // Validate input data
      const validationErrors = validateUserData(editUser);
      if (validationErrors.length > 0) {
        setEditError(validationErrors.join(", "));
        return;
      }

      // Check if email already exists (excluding current user)
      const existingUsers = await staffService.list();
      const emailExists = existingUsers.documents.some(
        (user) =>
          user.$id !== editingUser.$id &&
          user.email?.toLowerCase() === editUser.email.toLowerCase()
      );

      if (emailExists) {
        setEditError("A user with this email already exists");
        return;
      }

      // Prepare update data
      const updateData = {
        name: editUser.name.trim(),
        email: editUser.email.toLowerCase().trim(),
        otherEmail: editUser.otherEmail
          ? editUser.otherEmail.toLowerCase().trim()
          : null,
        phoneNumber: editUser.phoneNumber?.trim() || null,
        phoneNumber2: editUser.phoneNumber2?.trim() || null,
        departmentId: editUser.departmentId || null,
        roles: editUser.roles,
        active: editUser.active,
      };

      // Update the user
      await staffService.update(editingUser.$id, updateData);
      await loadUsers();

      // Reset filters to show all users
      setSelectedRole("all");
      setSearchTerm("");

      // Close edit dialog
      setEditingUser(null);
      setEditUser({
        name: "",
        email: "",
        otherEmail: "",
        phoneNumber: "",
        phoneNumber2: "",
        departmentId: "",
        roles: [],
        active: true,
      });
    } catch (error) {
      setEditError(error.message || "Failed to update user. Please try again.");
    } finally {
      setEditSubmitting(false);
    }
  };

  const cancelEditUser = () => {
    setEditingUser(null);
    setEditUser({
      name: "",
      email: "",
      otherEmail: "",
      phoneNumber: "",
      phoneNumber2: "",
      departmentId: "",
      roles: [],
      active: true,
    });
    setEditError("");
  };

  const toggleUserStatus = async (user) => {
    try {
      await updateUser(user.$id, { active: !user.active });
    } catch (error) {
      // Silent fail for status toggle
    }
  };

  const handleDeleteUser = (user) => {
    setUserToDelete(user);
    setShowDeleteDialog(true);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;

    setDeleteLoading(true);
    try {
      await staffService.delete(userToDelete.$id);
      await loadUsers();
      // Reset filters to show all users
      setSelectedRole("all");
      setSearchTerm("");
      setShowDeleteDialog(false);
      setUserToDelete(null);
    } catch (error) {
      setError("Failed to delete user");
    } finally {
      setDeleteLoading(false);
    }
  };

  const cancelDeleteUser = () => {
    setShowDeleteDialog(false);
    setUserToDelete(null);
  };

  const getDepartmentName = (departmentId) => {
    if (!departmentId) return "Unassigned";
    const dept = departments.find((d) => d.$id === departmentId);
    return dept ? dept.name : "Unknown Department";
  };

  const handleRoleToggle = (role, checked) => {
    setNewUser((prev) => {
      const newRoles = checked
        ? [...prev.roles, role]
        : prev.roles.filter((r) => r !== role);

      // Ensure at least one role is always selected
      return {
        ...prev,
        roles: newRoles.length > 0 ? newRoles : ["STAFF"],
      };
    });
  };

  // Filter users based on search term and selected role
  const filteredUsers = users.filter((user) => {
    // Search term filter
    const matchesSearch =
      !searchTerm ||
      user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.userId?.toLowerCase().includes(searchTerm.toLowerCase());

    // Role filter
    const matchesRole =
      selectedRole === "all" ||
      (user.roles &&
        Array.isArray(user.roles) &&
        user.roles.includes(selectedRole));

    return matchesSearch && matchesRole;
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedRole]);

  const pagination = useMemo(
    () => paginateItems(filteredUsers, currentPage, PAGE_SIZE),
    [filteredUsers, currentPage]
  );
  const pagedUsers = pagination.items;

  if (loading) {
    return <PageLoading message="Loading users..." />;
  }

  return (
    <div
      className="relative min-h-screen"
      style={{
        backgroundColor,
        backgroundImage: `radial-gradient(circle at 20% 20%, ${primaryColor}24, transparent 55%), radial-gradient(circle at 80% 80%, ${accentColor}18, transparent 60%)`,
      }}
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-25 pointer-events-none mix-blend-multiply">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23${patternFill}' fill-opacity='0.12'%3E%3Ccircle cx='7' cy='7' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            backgroundSize: "60px 60px",
          }}
        ></div>
      </div>

      <div className="relative container mx-auto p-6 space-y-8 max-w-7xl overflow-visible">
        {/* Modern Header */}
        <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-gray-200/60 shadow-xl p-6">
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center space-y-4 lg:space-y-0">
            <div className="space-y-1">
              <div className="flex items-center space-x-3">
                <div
                  className="p-2 rounded-xl shadow-lg"
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${primaryColor}, ${accentDark})`,
                  }}
                >
                  <Users className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1
                    className="text-3xl font-bold bg-clip-text text-transparent"
                    style={{
                      backgroundImage: `linear-gradient(90deg, ${primaryDark}, ${accentColor})`,
                    }}
                  >
                    User Management
                  </h1>
                  <p className="text-slate-600 font-medium">
                    Manage system users and permissions
                  </p>
                  <div className="mt-2">
                    <span
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border"
                      style={{
                        color: primaryDark,
                        borderColor: `${primaryColor}40`,
                        backgroundImage: `linear-gradient(135deg, ${primaryColor}22, ${accentColor}18)`,
                      }}
                    >
                      {users.length} {users.length === 1 ? "User" : "Users"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => loadUsers()}
                variant="outline"
                disabled={loading}
                className="relative bg-white/90 border border-[var(--org-primary)]/30 hover:border-[var(--org-primary)]/50 hover:bg-[var(--org-muted)]/50 transition-all duration-300 ease-out group overflow-hidden hover:scale-105 disabled:hover:scale-100 disabled:opacity-60"
              >
                <div className="flex items-center justify-center relative z-10">
                  <RefreshCw
                    className={`w-4 h-4 mr-2 group-hover:rotate-180 transition-transform duration-500 ${
                      loading ? "animate-spin" : ""
                    }`}
                  />
                  <span className="group-hover:translate-x-0.5 transition-transform duration-300">
                    Refresh
                  </span>
                </div>
                {/* Ripple effect */}
                <div className="absolute inset-0 bg-[var(--org-muted)]/60 rounded-md scale-0 group-hover:scale-100 transition-transform duration-300 origin-center" />
              </Button>
              <Button
                onClick={() => setIsCreateDialogOpen(true)}
                className="relative text-white border-0 shadow-lg hover:shadow-2xl transition-all duration-300 ease-out group overflow-hidden hover:scale-105"
                style={{
                  backgroundImage: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
                }}
              >
                <div className="flex items-center justify-center relative z-10">
                  <Plus className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform duration-200" />
                  <span className="group-hover:translate-x-0.5 transition-transform duration-300">
                    Add User
                  </span>
                </div>
                {/* Animated background gradient */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${accentColor}, ${accentDark})`,
                  }}
                />
                {/* Ripple effect */}
                <div className="absolute inset-0 bg-white/25 rounded-md scale-0 group-hover:scale-100 transition-transform duration-300 origin-center" />
                {/* Shimmer effect */}
                <div className="absolute inset-0 -top-1 -left-1 w-0 h-full bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover:w-full transition-all duration-500 ease-out" />
              </Button>

              {/* Custom Add User Modal */}
              {isCreateDialogOpen &&
                createPortal(
                  <div
                    className="fixed inset-0 bg-black/50 flex items-center justify-center"
                    onClick={() => setIsCreateDialogOpen(false)}
                    style={{
                      backgroundColor: "rgba(0, 0, 0, 0.5)",
                      zIndex: 999999,
                      isolation: "isolate",
                    }}
                  >
                    <div
                      className="bg-white rounded-2xl shadow-2xl max-w-4xl max-h-[95vh] overflow-y-auto mx-auto w-full m-4"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        backgroundColor: "white !important",
                        position: "relative",
                        zIndex: 1000000,
                      }}
                    >
                      <div className="sticky top-0 bg-gradient-to-r from-primary-50 to-sidebar-50 border-b border-primary-200/30 pb-6 mb-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4">
                            <div className="p-3 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl shadow-lg">
                              <User className="h-6 w-6 text-white" />
                            </div>
                            <div>
                              <h2 className="text-2xl font-bold bg-gradient-to-r from-slate-900 via-primary-900 to-sidebar-900 bg-clip-text text-transparent">
                                Create New User
                              </h2>
                              <p className="text-slate-600 mt-1 font-medium">
                                Add a new user to the system with appropriate
                                role and permissions
                              </p>
                            </div>
                          </div>
                          <Button
                            onClick={() => setIsCreateDialogOpen(false)}
                            variant="ghost"
                            size="sm"
                            className="h-10 w-10 p-0 hover:bg-red-100 hover:text-red-600 transition-all duration-200"
                          >
                            <X className="h-5 w-5" />
                            <span className="sr-only">Close</span>
                          </Button>
                        </div>
                      </div>

                      <div className="p-6">
                        {/* Progress Indicator */}
                        {submitting && (
                          <div className="bg-gradient-to-r from-primary-50 to-sidebar-50 border border-primary-200 rounded-xl p-6 mb-6 shadow-lg">
                            <div className="flex items-center space-x-4">
                              <div className="p-2 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg">
                                <Loader2 className="h-6 w-6 text-white animate-spin" />
                              </div>
                              <div className="flex-1">
                                <p className="text-lg font-semibold text-slate-900">
                                  Creating User Account
                                </p>
                                <p className="text-sm text-slate-600 font-medium">
                                  {creationStep}
                                </p>
                              </div>
                            </div>
                            <div className="mt-4">
                              <div className="w-full bg-primary-200 rounded-full h-3 shadow-inner">
                                <div
                                  className="bg-gradient-to-r from-primary-500 to-sidebar-500 h-3 rounded-full transition-all duration-500 ease-out shadow-lg"
                                  style={{
                                    width: creationStep.includes("Validating")
                                      ? "10%"
                                      : creationStep.includes("Checking")
                                      ? "25%"
                                      : creationStep.includes("Generating")
                                      ? "40%"
                                      : creationStep.includes("Creating")
                                      ? "60%"
                                      : creationStep.includes("Setting")
                                      ? "75%"
                                      : creationStep.includes("Sending")
                                      ? "90%"
                                      : creationStep.includes("Finalizing")
                                      ? "100%"
                                      : "10%",
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Error State */}
                        {error && !submitting && (
                          <div className="bg-gradient-to-r from-red-50 to-red-100 border border-red-200 rounded-xl p-6 mb-6 shadow-lg">
                            <div className="flex items-center space-x-4">
                              <div className="p-2 bg-gradient-to-br from-red-500 to-red-600 rounded-lg">
                                <AlertCircle className="h-6 w-6 text-white" />
                              </div>
                              <div className="flex-1">
                                <h3 className="text-lg font-semibold text-red-900">
                                  Error Creating User
                                </h3>
                                <p className="text-sm text-red-700 mt-1 font-medium">
                                  {error}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600 hover:text-red-700 hover:bg-red-100 h-8 w-8 p-0"
                                onClick={() => setError("")}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Success State */}
                        {showSuccess && (
                          <div className="bg-gradient-to-r from-primary-50 to-green-50 border border-primary-200 rounded-xl p-6 mb-6 shadow-lg">
                            <div className="flex items-center space-x-4 mb-6">
                              <div className="p-3 bg-gradient-to-br from-primary-500 to-green-500 rounded-xl shadow-lg">
                                <CheckCircle className="h-6 w-6 text-white" />
                              </div>
                              <div>
                                <h3 className="text-xl font-bold text-slate-900">
                                  User Created Successfully! 🎉
                                </h3>
                                <p className="text-sm text-slate-600 font-medium">
                                  Account has been set up and welcome email
                                  sent.
                                </p>
                              </div>
                            </div>

                            <div className="bg-white rounded-xl p-6 space-y-4 shadow-md border border-primary-200">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-slate-700">
                                  User ID:
                                </span>
                                <div className="flex items-center space-x-2">
                                  <code className="text-sm bg-gradient-to-r from-primary-100 to-sidebar-100 px-3 py-2 rounded-lg font-mono border border-primary-200">
                                    {showSuccess.userId}
                                  </code>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0 hover:bg-primary-100"
                                    onClick={() =>
                                      navigator.clipboard.writeText(
                                        showSuccess.userId
                                      )
                                    }
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-slate-700">
                                  Email:
                                </span>
                                <div className="flex items-center space-x-2">
                                  <span className="text-sm text-slate-900 font-medium">
                                    {showSuccess.email}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0 hover:bg-primary-100"
                                    onClick={() =>
                                      navigator.clipboard.writeText(
                                        showSuccess.email
                                      )
                                    }
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-slate-700">
                                  Temporary Password:
                                </span>
                                <div className="flex items-center space-x-2">
                                  <code className="text-sm bg-gradient-to-r from-yellow-100 to-orange-100 px-3 py-2 rounded-lg font-mono border border-yellow-200">
                                    {showSuccess.tempPassword}
                                  </code>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0 hover:bg-yellow-100"
                                    onClick={() =>
                                      navigator.clipboard.writeText(
                                        showSuccess.tempPassword
                                      )
                                    }
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>

                              <div className="pt-4 border-t border-primary-200">
                                <div className="flex items-center space-x-2 text-sm text-slate-600">
                                  <div className="p-1 bg-green-100 rounded">
                                    <span>📧</span>
                                  </div>
                                  <span className="font-medium">
                                    Welcome email sent to {showSuccess.name}
                                  </span>
                                </div>
                                <div className="flex items-center space-x-2 text-sm text-slate-600 mt-2">
                                  <div className="p-1 bg-yellow-100 rounded">
                                    <span>⚠️</span>
                                  </div>
                                  <span className="font-medium">
                                    User should change password after first
                                    login
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        <div
                          className={`space-y-8 pb-4 transition-opacity duration-200 ${
                            submitting ? "opacity-60" : "opacity-100"
                          }`}
                        >
                          {/* Basic Information */}
                          <div className="bg-gray-50 p-6 rounded-lg space-y-6 relative">
                            <div className="flex items-center space-x-2">
                              <User className="h-5 w-5 text-blue-600" />
                              <h3 className="text-lg font-semibold text-gray-900">
                                Basic Information
                              </h3>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              <div className="space-y-3">
                                <Label
                                  htmlFor="name"
                                  className="text-sm font-semibold text-slate-700"
                                >
                                  Full Name *
                                </Label>
                                <Input
                                  id="name"
                                  value={newUser.name}
                                  onChange={(e) =>
                                    setNewUser({
                                      ...newUser,
                                      name: e.target.value,
                                    })
                                  }
                                  placeholder="e.g., John Doe"
                                  className="h-12 border-gray-300 focus:border-primary-500 focus:ring-primary-500/20 rounded-lg shadow-sm"
                                  disabled={submitting}
                                  required
                                />
                              </div>
                              <div className="space-y-3">
                                <Label
                                  htmlFor="email"
                                  className="text-sm font-semibold text-slate-700"
                                >
                                  Primary Email *
                                </Label>
                                <Input
                                  id="email"
                                  type="email"
                                  value={newUser.email}
                                  onChange={(e) =>
                                    setNewUser({
                                      ...newUser,
                                      email: e.target.value,
                                    })
                                  }
                                  placeholder="e.g., john.doe@company.com"
                                  className="h-12 border-gray-300 focus:border-primary-500 focus:ring-primary-500/20 rounded-lg shadow-sm"
                                  disabled={submitting}
                                  required
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              <div className="space-y-3">
                                <Label
                                  htmlFor="otherEmail"
                                  className="text-sm font-semibold text-slate-700"
                                >
                                  Other Email
                                </Label>
                                <Input
                                  id="otherEmail"
                                  type="email"
                                  value={newUser.otherEmail}
                                  onChange={(e) =>
                                    setNewUser({
                                      ...newUser,
                                      otherEmail: e.target.value,
                                    })
                                  }
                                  placeholder="e.g., john.personal@gmail.com"
                                  className="h-12 border-gray-300 focus:border-primary-500 focus:ring-primary-500/20 rounded-lg shadow-sm"
                                  disabled={submitting}
                                />
                              </div>
                              <div className="space-y-3">
                                <Label
                                  htmlFor="phoneNumber"
                                  className="text-sm font-semibold text-slate-700"
                                >
                                  Primary Phone
                                </Label>
                                <Input
                                  id="phoneNumber"
                                  type="tel"
                                  value={newUser.phoneNumber}
                                  onChange={(e) =>
                                    setNewUser({
                                      ...newUser,
                                      phoneNumber: e.target.value,
                                    })
                                  }
                                  placeholder="e.g., +1 (555) 123-4567"
                                  className="h-12 border-gray-300 focus:border-primary-500 focus:ring-primary-500/20 rounded-lg shadow-sm"
                                  disabled={submitting}
                                />
                              </div>
                            </div>

                            <div className="space-y-3">
                              <Label
                                htmlFor="phoneNumber2"
                                className="text-sm font-semibold text-slate-700"
                              >
                                Secondary Phone
                              </Label>
                              <div className="max-w-md">
                                <Input
                                  id="phoneNumber2"
                                  type="tel"
                                  value={newUser.phoneNumber2}
                                  onChange={(e) =>
                                    setNewUser({
                                      ...newUser,
                                      phoneNumber2: e.target.value,
                                    })
                                  }
                                  placeholder="e.g., +1 (555) 987-6543"
                                  className="h-12 border-gray-300 focus:border-primary-500 focus:ring-primary-500/20 rounded-lg shadow-sm"
                                  disabled={submitting}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Role & Permissions */}
                          <div className="bg-blue-50 p-6 rounded-lg space-y-6">
                            <div className="flex items-center space-x-2">
                              <Shield className="h-5 w-5 text-blue-600" />
                              <h3 className="text-lg font-semibold text-gray-900">
                                Role & Permissions
                              </h3>
                            </div>

                            <div className="space-y-4">
                              <Label className="text-sm font-semibold text-slate-700">
                                User Roles *
                              </Label>
                              <div className="space-y-4">
                                <p className="text-sm text-slate-600 font-medium">
                                  Select one or more roles for this user:
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {Object.entries(USER_ROLES).map(
                                    ([key, value]) => (
                                      <label
                                        key={key}
                                        className="flex items-center space-x-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-primary-300 hover:shadow-md cursor-pointer transition-all duration-200"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={newUser.roles.includes(key)}
                                          onChange={(e) =>
                                            handleRoleToggle(
                                              key,
                                              e.target.checked
                                            )
                                          }
                                          className="h-5 w-5 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                                          disabled={submitting}
                                        />
                                        <span className="text-sm font-semibold text-slate-700">
                                          {value}
                                        </span>
                                      </label>
                                    )
                                  )}
                                </div>
                                {newUser.roles.length > 0 && (
                                  <div className="flex flex-wrap gap-3 mt-4 p-4 bg-gradient-to-r from-primary-50 to-sidebar-50 rounded-xl border border-primary-200">
                                    <span className="text-sm font-semibold text-slate-700">
                                      Selected roles:
                                    </span>
                                    {newUser.roles.map((role) => (
                                      <Badge
                                        key={role}
                                        className="text-sm font-semibold bg-gradient-to-r from-primary-500 to-sidebar-500 text-white px-3 py-1.5 rounded-lg shadow-md"
                                      >
                                        {USER_ROLES[role] || role}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Organization Details */}
                          <div className="bg-gradient-to-br from-slate-50 to-gray-50 p-8 rounded-xl space-y-6 border border-gray-200/30 shadow-lg">
                            <div className="flex items-center space-x-3">
                              <div className="p-2 bg-gradient-to-br from-slate-500 to-gray-600 rounded-lg shadow-md">
                                <Building className="h-6 w-6 text-white" />
                              </div>
                              <h3 className="text-xl font-bold text-slate-900">
                                Organization Details
                              </h3>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              <div className="space-y-3">
                                <Label
                                  htmlFor="departmentId"
                                  className="text-sm font-semibold text-slate-700"
                                >
                                  Department
                                </Label>
                                <Select
                                  value={newUser.departmentId}
                                  onValueChange={(value) =>
                                    setNewUser({
                                      ...newUser,
                                      departmentId: value,
                                    })
                                  }
                                  disabled={submitting}
                                >
                                  <SelectTrigger className="h-12 border-gray-300 focus:border-primary-500 focus:ring-primary-500/20 rounded-lg shadow-sm">
                                    <SelectValue placeholder="Select department" />
                                  </SelectTrigger>
                                  <SelectContent className="z-[9999]">
                                    {departments.map((dept) => (
                                      <SelectItem
                                        key={dept.$id}
                                        value={dept.$id}
                                      >
                                        {dept.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-3">
                                <Label
                                  htmlFor="userId"
                                  className="text-sm font-semibold text-slate-700"
                                >
                                  User ID
                                </Label>
                                <Input
                                  id="userId"
                                  value={newUser.userId}
                                  onChange={(e) =>
                                    setNewUser({
                                      ...newUser,
                                      userId: e.target.value,
                                    })
                                  }
                                  placeholder="e.g., USR001 (auto-generated if empty)"
                                  className="h-12 border-gray-300 focus:border-primary-500 focus:ring-primary-500/20 rounded-lg shadow-sm"
                                  disabled={submitting}
                                />
                                <p className="text-xs text-gray-500">
                                  Leave empty to auto-generate
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="sticky bottom-0 bg-white border-t pt-4 mt-6">
                          <div className="flex items-center justify-between w-full pt-6 border-t border-primary-200">
                            <p className="text-sm font-medium text-slate-600">
                              Fields marked with * are required
                            </p>
                            <div className="flex items-center space-x-4">
                              <Button
                                onClick={() => setIsCreateDialogOpen(false)}
                                variant="outline"
                                className="px-8 h-12 border-gray-300 hover:border-gray-400 hover:bg-gray-50 font-semibold"
                                disabled={submitting}
                              >
                                Cancel
                              </Button>
                              <Button
                                onClick={createUser}
                                disabled={
                                  !newUser.name ||
                                  !newUser.email ||
                                  newUser.roles.length === 0 ||
                                  submitting
                                }
                                className="px-8 h-12 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 disabled:opacity-50 font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
                              >
                                {submitting ? (
                                  <>
                                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                    Creating...
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-5 h-5 mr-2" />
                                    Create User
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>,
                  document.body
                )}
            </div>
          </div>
        </div>

        {/* Modern Filters */}
        <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-gray-200/60 shadow-xl p-6 relative z-10 overflow-visible">
          <div className="flex items-center space-x-3 mb-4">
            <div
              className="p-2 rounded-xl shadow-lg"
              style={{
                backgroundImage: `linear-gradient(135deg, ${primaryColor}, ${accentDark})`,
              }}
            >
              <Filter className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900">
              Filter Users
            </h2>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-[var(--org-primary)]/50" />
                <Input
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-11 border-gray-200 focus:border-[var(--org-primary)] focus:ring-[var(--org-primary)]/20"
                />
              </div>
            </div>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger className="w-48 h-11 border-gray-200 focus:border-[var(--org-primary)] focus:ring-[var(--org-primary)]/20">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent
                className="z-[9999]"
                position="popper"
                sideOffset={4}
                style={{ position: "fixed" }}
              >
                <SelectItem value="all">All Roles</SelectItem>
                {Object.keys(USER_ROLES).map((role) => (
                  <SelectItem key={role} value={role}>
                    {USER_ROLES[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Modern Users Table */}
        <div className="bg-white/90 backdrop-blur-md rounded-2xl border border-gray-200/60 shadow-xl overflow-hidden relative z-0">
          <div className="p-6 border-b border-gray-200/60">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  Users ({filteredUsers.length})
                </h2>
                <p className="text-slate-600">
                  Manage user accounts and permissions
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                  <TableHead className="font-semibold text-slate-700">
                    Name
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700">
                    Email
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700">
                    Role
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700">
                    Department
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700">
                    Status
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedUsers.map((user) => (
                  <TableRow
                    key={user.$id}
                    className="hover:bg-gray-50/50 transition-colors duration-200 group border-b border-gray-100/50"
                  >
                    <TableCell className="font-medium text-slate-900 group-hover:text-sidebar-700">
                      {user.name}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {user.email}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.roles && user.roles.length > 0 ? (
                          user.roles.map((role) => (
                            <Badge
                              key={role}
                              className={getRoleBadgeColor(role)}
                            >
                              {role}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="secondary">No Role</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {getDepartmentName(user.departmentId)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`border ${getStatusBadgeClass(user.active)}`}
                      >
                        {user.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleUserStatus(user)}
                          className="h-10 w-10 border-[var(--org-primary)]/20 hover:border-[var(--org-primary)]/40 hover:bg-[var(--org-muted)]/60 text-[var(--org-primary)] transition-all duration-200"
                        >
                          {user.active ? (
                            <UserX className="w-5 h-5" />
                          ) : (
                            <UserCheck className="w-5 h-5" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditUser(user)}
                          className="h-10 w-10 border-[var(--org-primary)]/20 hover:border-[var(--org-primary)]/40 hover:bg-[var(--org-muted)]/60 text-[var(--org-primary)] transition-all duration-200"
                        >
                          <Edit className="w-5 h-5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteUser(user)}
                          className="h-10 w-10 text-red-500 hover:text-red-600 hover:bg-red-50 transition-all duration-200 border-red-200"
                        >
                          <Trash2 className="w-5 h-5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="px-6 pb-6">
            <ListPagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
              itemLabel="users"
            />
          </div>
        </div>

        {/* Edit User Dialog */}
        {editingUser &&
          createPortal(
            <div
              className="fixed inset-0 bg-black/50 flex items-center justify-center"
              onClick={cancelEditUser}
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                zIndex: 999999,
                isolation: "isolate",
              }}
            >
              <div
                className="bg-white rounded-2xl shadow-2xl max-w-4xl max-h-[95vh] overflow-y-auto mx-auto w-full m-4"
                onClick={(e) => e.stopPropagation()}
                style={{
                  backgroundColor: "white !important",
                  position: "relative",
                  zIndex: 1000000,
                }}
              >
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-2xl font-semibold text-slate-900">
                        Edit User: {editingUser.name}
                      </h3>
                      <p className="text-slate-600 mt-1">
                        Update user information and permissions
                      </p>
                    </div>
                    <Button
                      onClick={cancelEditUser}
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 hover:bg-gray-100"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Error State */}
                  {editError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                      <div className="flex items-center space-x-3">
                        <AlertCircle className="h-5 w-5 text-red-600" />
                        <div className="flex-1">
                          <h3 className="text-sm font-medium text-red-900">
                            Error Updating User
                          </h3>
                          <p className="text-sm text-red-700 mt-1">
                            {editError}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => setEditError("")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-8">
                    {/* Basic Information */}
                    <div className="bg-gradient-to-br from-primary-50 to-sidebar-50 p-8 rounded-xl space-y-6 border border-primary-200/30 shadow-lg">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg shadow-md">
                          <User className="h-6 w-6 text-white" />
                        </div>
                        <h4 className="text-xl font-bold text-slate-900">
                          Basic Information
                        </h4>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <Label
                            htmlFor="edit-name"
                            className="text-sm font-medium text-gray-700"
                          >
                            Full Name *
                          </Label>
                          <Input
                            id="edit-name"
                            value={editUser.name}
                            onChange={(e) =>
                              setEditUser({ ...editUser, name: e.target.value })
                            }
                            placeholder="e.g., John Doe"
                            className="h-11"
                            disabled={editSubmitting}
                            required
                          />
                        </div>
                        <div className="space-y-3">
                          <Label
                            htmlFor="edit-email"
                            className="text-sm font-medium text-gray-700"
                          >
                            Primary Email *
                          </Label>
                          <Input
                            id="edit-email"
                            type="email"
                            value={editUser.email}
                            onChange={(e) =>
                              setEditUser({
                                ...editUser,
                                email: e.target.value,
                              })
                            }
                            placeholder="e.g., john.doe@company.com"
                            className="h-11"
                            disabled={editSubmitting}
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <Label
                            htmlFor="edit-otherEmail"
                            className="text-sm font-medium text-gray-700"
                          >
                            Other Email
                          </Label>
                          <Input
                            id="edit-otherEmail"
                            type="email"
                            value={editUser.otherEmail}
                            onChange={(e) =>
                              setEditUser({
                                ...editUser,
                                otherEmail: e.target.value,
                              })
                            }
                            placeholder="e.g., john.personal@gmail.com"
                            className="h-11"
                            disabled={editSubmitting}
                          />
                        </div>
                        <div className="space-y-3">
                          <Label
                            htmlFor="edit-phoneNumber"
                            className="text-sm font-medium text-gray-700"
                          >
                            Primary Phone
                          </Label>
                          <Input
                            id="edit-phoneNumber"
                            type="tel"
                            value={editUser.phoneNumber}
                            onChange={(e) =>
                              setEditUser({
                                ...editUser,
                                phoneNumber: e.target.value,
                              })
                            }
                            placeholder="e.g., +1 (555) 123-4567"
                            className="h-11"
                            disabled={editSubmitting}
                          />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <Label
                          htmlFor="edit-phoneNumber2"
                          className="text-sm font-medium text-gray-700"
                        >
                          Secondary Phone
                        </Label>
                        <div className="max-w-md">
                          <Input
                            id="edit-phoneNumber2"
                            type="tel"
                            value={editUser.phoneNumber2}
                            onChange={(e) =>
                              setEditUser({
                                ...editUser,
                                phoneNumber2: e.target.value,
                              })
                            }
                            placeholder="e.g., +1 (555) 987-6543"
                            className="h-11"
                            disabled={editSubmitting}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Role & Permissions */}
                    <div className="bg-gradient-to-br from-sidebar-50 to-primary-50 p-8 rounded-xl space-y-6 border border-sidebar-200/30 shadow-lg">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-gradient-to-br from-sidebar-500 to-sidebar-600 rounded-lg shadow-md">
                          <Shield className="h-6 w-6 text-white" />
                        </div>
                        <h4 className="text-xl font-bold text-slate-900">
                          Role & Permissions
                        </h4>
                      </div>

                      <div className="space-y-4">
                        <Label className="text-sm font-medium text-gray-700">
                          User Roles *
                        </Label>
                        <div className="space-y-3">
                          <p className="text-sm text-gray-600">
                            Select one or more roles for this user:
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            {Object.entries(USER_ROLES).map(([key, value]) => (
                              <label
                                key={key}
                                className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-blue-25 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={editUser.roles.includes(key)}
                                  onChange={(e) =>
                                    handleEditRoleToggle(key, e.target.checked)
                                  }
                                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                  disabled={editSubmitting}
                                />
                                <span className="text-sm font-medium text-gray-700">
                                  {value}
                                </span>
                              </label>
                            ))}
                          </div>
                          {editUser.roles.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                              <span className="text-sm text-gray-600">
                                Selected roles:
                              </span>
                              {editUser.roles.map((role) => (
                                <Badge
                                  key={role}
                                  variant="secondary"
                                  className="text-xs"
                                >
                                  {USER_ROLES[role] || role}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Organization Details */}
                    <div className="bg-green-50 p-6 rounded-lg space-y-6">
                      <div className="flex items-center space-x-2">
                        <Building className="h-5 w-5 text-green-600" />
                        <h4 className="text-lg font-semibold text-gray-900">
                          Organization Details
                        </h4>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <Label
                            htmlFor="edit-departmentId"
                            className="text-sm font-medium text-gray-700"
                          >
                            Department
                          </Label>
                          <Select
                            value={editUser.departmentId}
                            onValueChange={(value) =>
                              setEditUser({ ...editUser, departmentId: value })
                            }
                            disabled={editSubmitting}
                          >
                            <SelectTrigger className="h-11">
                              <SelectValue placeholder="Select department" />
                            </SelectTrigger>
                            <SelectContent className="z-[9999]">
                              {departments.map((dept) => (
                                <SelectItem key={dept.$id} value={dept.$id}>
                                  {dept.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-3">
                          <Label className="text-sm font-medium text-gray-700">
                            Status
                          </Label>
                          <div className="flex items-center space-x-3">
                            <Checkbox
                              id="edit-active"
                              checked={editUser.active}
                              onCheckedChange={(checked) =>
                                setEditUser({ ...editUser, active: checked })
                              }
                              disabled={editSubmitting}
                            />
                            <Label
                              htmlFor="edit-active"
                              className="text-sm font-medium text-gray-700"
                            >
                              Active User
                            </Label>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
                    <p className="text-sm text-gray-500">
                      Fields marked with * are required
                    </p>
                    <div className="flex items-center space-x-3">
                      <Button
                        onClick={cancelEditUser}
                        variant="outline"
                        className="px-6"
                        disabled={editSubmitting}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={saveEditUser}
                        disabled={
                          !editUser.name ||
                          !editUser.email ||
                          editUser.roles.length === 0 ||
                          editSubmitting
                        }
                        className="px-6 bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                      >
                        {editSubmitting ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Updating...
                          </>
                        ) : (
                          <>
                            <Edit className="w-4 h-4 mr-2" />
                            Update User
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}

        {/* Custom Delete Confirmation Dialog */}
        {showDeleteDialog &&
          createPortal(
            <div
              className="fixed inset-0 bg-black/50 flex items-center justify-center"
              onClick={cancelDeleteUser}
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                zIndex: 999999,
                isolation: "isolate",
              }}
            >
              <div
                className="bg-white rounded-2xl shadow-2xl max-w-md mx-auto w-full m-4"
                onClick={(e) => e.stopPropagation()}
                style={{
                  backgroundColor: "white !important",
                  position: "relative",
                  zIndex: 1000000,
                }}
              >
                <div
                  className="flex flex-col items-center space-y-6 p-6"
                  style={{
                    backgroundColor: "white !important",
                    position: "relative",
                    zIndex: 52,
                  }}
                >
                  {/* Warning Icon */}
                  <div className="p-4 bg-gradient-to-br from-red-50 to-red-100 rounded-full">
                    <AlertTriangle className="h-12 w-12 text-red-500" />
                  </div>

                  {/* Dialog Content */}
                  <div className="text-center space-y-3">
                    <h3 className="text-xl font-semibold text-slate-900">
                      Delete User
                    </h3>
                    <p className="text-slate-600">
                      Are you sure you want to delete this user? This action
                      cannot be undone.
                    </p>

                    {/* User Details */}
                    {userToDelete && (
                      <div className="bg-slate-50 rounded-lg p-4 mt-4">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-gradient-to-br from-primary-100 to-primary-200 rounded-lg">
                            <User className="h-5 w-5 text-primary-600" />
                          </div>
                          <div className="text-left">
                            <p className="font-medium text-slate-900">
                              {userToDelete.name}
                            </p>
                            <p className="text-sm text-slate-500">
                              {userToDelete.email}
                            </p>
                            <p className="text-sm text-slate-500">
                              {userToDelete.roles &&
                              userToDelete.roles.length > 0
                                ? userToDelete.roles.join(", ")
                                : "No Role"}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center space-x-3 w-full">
                    <Button
                      onClick={cancelDeleteUser}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white border-0 shadow-md hover:shadow-lg transition-all duration-200"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={confirmDeleteUser}
                      disabled={deleteLoading}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white border-0 shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50"
                    >
                      {deleteLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Deleting...
                        </>
                      ) : (
                        <>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete User
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}
      </div>
    </div>
  );
}
