"use client";

import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { assetReturnsService } from "../../lib/appwrite/provider.js";
import { ENUMS } from "../../lib/appwrite/config.js";
import { getCurrentStaff } from "../../lib/utils/auth.js";
import { RotateCcw } from "lucide-react";

/**
 * Admin dialog to mark an issued asset / returnable consumable as returned
 * so it shows as available (or restocked) again.
 */
export function MarkReturnedDialog({
  open,
  onOpenChange,
  asset,
  issue = null,
  onSuccess,
}) {
  const [postCondition, setPostCondition] = useState(
    ENUMS.CURRENT_CONDITION.GOOD
  );
  const [delta, setDelta] = useState(ENUMS.RETURN_DELTA.GOOD);
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !asset) return;
    setPostCondition(
      issue?.preCondition ||
        asset.currentCondition ||
        ENUMS.CURRENT_CONDITION.GOOD
    );
    setDelta(ENUMS.RETURN_DELTA.GOOD);
    setRemarks("");
    setError("");
  }, [open, asset, issue]);

  const isConsumable = asset?.itemType === ENUMS.ITEM_TYPE.CONSUMABLE;
  const qty = Math.max(1, Number(issue?.quantity) || 1);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!asset?.$id) return;

    setSubmitting(true);
    setError("");
    try {
      const staff = await getCurrentStaff();
      if (!staff?.$id) {
        throw new Error("You must be signed in to process a return");
      }

      const result = await assetReturnsService.processReturn({
        assetId: asset.$id,
        issueId: issue?.$id || null,
        receivedByStaffId: staff.$id,
        postCondition,
        delta,
        remarks: remarks.trim(),
      });

      onOpenChange?.(false);
      onSuccess?.(result);
    } catch (err) {
      console.error("Failed to process return:", err);
      setError(err?.message || "Failed to mark item as returned");
    } finally {
      setSubmitting(false);
    }
  };

  if (!asset) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-[var(--org-primary)]" />
            Mark as returned
          </DialogTitle>
          <DialogDescription>
            {isConsumable
              ? `Restore ${qty} unit${qty === 1 ? "" : "s"} of "${asset.name}" to stock so it is available again.`
              : `Set "${asset.name}" back to Available after it has been returned.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-4">
          {!isConsumable && (
            <div className="space-y-2">
              <Label htmlFor="postCondition">Condition on return</Label>
              <Select value={postCondition} onValueChange={setPostCondition}>
                <SelectTrigger id="postCondition">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(ENUMS.CURRENT_CONDITION).map((condition) => (
                    <SelectItem key={condition} value={condition}>
                      {condition.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="delta">Return outcome</Label>
            <Select value={delta} onValueChange={setDelta}>
              <SelectTrigger id="delta">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(ENUMS.RETURN_DELTA).map((value) => (
                  <SelectItem key={value} value={value}>
                    {value.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="returnRemarks">Notes (optional)</Label>
            <Textarea
              id="returnRemarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Received from holder, all accessories present"
              rows={3}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange?.(false)}
              disabled={submitting}
              className="!bg-white !text-slate-700"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-[var(--org-primary)] hover:bg-[var(--org-primary-dark)] text-white"
            >
              {submitting
                ? "Saving…"
                : isConsumable
                  ? "Restock & mark returned"
                  : "Mark available"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
