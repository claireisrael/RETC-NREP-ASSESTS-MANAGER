"use client";

import { useEffect, useState } from "react";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Textarea } from "../ui/textarea";
import { listSuperadminStaff } from "../../lib/utils/approvers.js";
import { ENUMS } from "../../lib/appwrite/config.js";

/**
 * Pick an L2 (superadmin) who must confirm catalog availability
 * before the item becomes requestable.
 */
export function L2AvailabilityPicker({
  value = "",
  onChange,
  note = "",
  onNoteChange,
  disabled = false,
  required = true,
}) {
  const [superadmins, setSuperadmins] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const staff = await listSuperadminStaff();
        if (!cancelled) setSuperadmins(staff || []);
      } catch (e) {
        console.warn("Failed to load L2 staff", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <div>
        <p className="text-sm font-semibold text-slate-800">
          L2 availability confirmation{required ? " *" : ""}
        </p>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          Select an L2 final approver to confirm this item is ready before
          staff can request it. Status stays{" "}
          <span className="font-medium">
            {ENUMS.AVAILABILITY_CONFIRM_STATUS.PENDING}
          </span>{" "}
          until they confirm.
        </p>
      </div>
      <div className="space-y-2">
        <Label>Confirming L2 approver</Label>
        <Select
          value={value || undefined}
          onValueChange={onChange}
          disabled={disabled || loading}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={loading ? "Loading…" : "Select L2 approver"}
            />
          </SelectTrigger>
          <SelectContent>
            {superadmins.map((sa) => (
              <SelectItem key={sa.$id} value={sa.$id}>
                {sa.name || sa.email}
                {sa.email ? ` (${sa.email})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {typeof onNoteChange === "function" && (
        <div className="space-y-2">
          <Label htmlFor="availabilityNote">Note for L2 (optional)</Label>
          <Textarea
            id="availabilityNote"
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="e.g. Verified in store room B, serial checked…"
            rows={2}
            disabled={disabled}
            className="resize-none"
          />
        </div>
      )}
    </div>
  );
}
