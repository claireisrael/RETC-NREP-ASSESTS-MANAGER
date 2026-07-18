"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Checkbox } from "../ui/checkbox";
import { Plus, X } from "lucide-react";

/**
 * Reusable accessories editor.
 *
 * Shows a "has accessories" checkbox; when checked, reveals inputs to add one or
 * more accessory names (e.g. Charger, Remote, HDMI cable). Controlled via
 * `value` (string[]) and `onChange(nextArray)`.
 */
export function AccessoriesEditor({
  value = [],
  onChange,
  disabled = false,
  itemLabel = "item",
}) {
  const [enabled, setEnabled] = useState(
    Array.isArray(value) && value.length > 0
  );
  const autoInit = useRef(false);

  // Auto-enable once when accessories arrive (e.g. edit forms loading async data).
  useEffect(() => {
    if (!autoInit.current && Array.isArray(value) && value.length > 0) {
      setEnabled(true);
      autoInit.current = true;
    }
  }, [value]);

  const handleToggle = (checked) => {
    setEnabled(!!checked);
    if (!checked) {
      onChange([]);
    } else if (!value || value.length === 0) {
      onChange([""]);
    }
  };

  const addRow = () => onChange([...(value || []), ""]);
  const updateRow = (index, next) => {
    const copy = [...(value || [])];
    copy[index] = next;
    onChange(copy);
  };
  const removeRow = (index) =>
    onChange((value || []).filter((_, i) => i !== index));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <Checkbox
          id="hasAccessories"
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={disabled}
        />
        <Label htmlFor="hasAccessories" className="cursor-pointer text-sm font-medium text-slate-700">
          This {itemLabel} has accessories
        </Label>
      </div>

      {enabled && (
        <div className="space-y-3">
          {(value || []).length === 0 && (
            <p className="text-sm text-slate-500">No accessories added yet.</p>
          )}
          {(value || []).map((accessory, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={accessory}
                onChange={(e) => updateRow(index, e.target.value)}
                placeholder={`Accessory ${index + 1} (e.g. Charger)`}
                disabled={disabled}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeRow(index)}
                disabled={disabled}
                className="shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Remove accessory</span>
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={addRow}
            disabled={disabled}
            className="mt-1"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Accessory
          </Button>
        </div>
      )}
    </div>
  );
}
