"use client";

import { useEffect, useState } from "react";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Textarea } from "../../../components/ui/textarea";
import { Label } from "../../../components/ui/label";
import { PageLoading } from "../../../components/ui/loading";
import { assetsService, staffService } from "../../../lib/appwrite/provider.js";
import { getCurrentStaff, permissions } from "../../../lib/utils/auth.js";
import { ENUMS } from "../../../lib/appwrite/config.js";
import { notifyAvailabilityDecided } from "../../../lib/services/return-availability-notifications.js";
import { CheckCircle2, XCircle, Package } from "lucide-react";

export default function AdminAvailabilityPage() {
  const [staff, setStaff] = useState(null);
  const [items, setItems] = useState([]);
  const [adminView, setAdminView] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState({});
  const [busyId, setBusyId] = useState("");

  const canL2 = staff && permissions.canApproveL2(staff);
  const canAdmin =
    staff &&
    (permissions.canManageAssets(staff) ||
      permissions.canManageConsumables(staff));

  const enrich = async (docs) => {
    return Promise.all(
      (docs || []).map(async (item) => {
        let assignee = null;
        try {
          if (item.assignedAvailabilityL2StaffId) {
            assignee = await staffService.get(
              item.assignedAvailabilityL2StaffId
            );
          }
        } catch {
          /* ignore */
        }
        return { item, assignee };
      })
    );
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const current = await getCurrentStaff();
      setStaff(current);
      if (!current) {
        setError("Please sign in.");
        return;
      }

      const l2Ok = permissions.canApproveL2(current);
      const adminOk =
        permissions.canManageAssets(current) ||
        permissions.canManageConsumables(current);

      if (!l2Ok && !adminOk) {
        setError("You do not have access to availability confirmation.");
        return;
      }

      if (l2Ok) {
        const mine = await assetsService.listPendingAvailability(current.$id);
        const all = await assetsService.listPendingAvailability();
        const pool = (mine.documents || []).length
          ? mine.documents
          : (all.documents || []).filter(
              (d) =>
                !d.assignedAvailabilityL2StaffId ||
                d.assignedAvailabilityL2StaffId === current.$id
            );
        setItems(await enrich(pool));
      } else {
        setItems([]);
      }

      if (adminOk) {
        const all = await assetsService.listPendingAvailability();
        setAdminView(await enrich(all.documents || []));
      } else {
        setAdminView([]);
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to load pending availability");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const decide = async (row, confirmed) => {
    const { item } = row;
    setBusyId(item.$id);
    setError("");
    try {
      const note = (notes[item.$id] || "").trim();
      const updated = confirmed
        ? await assetsService.confirmAvailability(item.$id, {
            decidedByStaffId: staff.$id,
            note,
          })
        : await assetsService.rejectAvailability(item.$id, {
            decidedByStaffId: staff.$id,
            note,
          });

      await notifyAvailabilityDecided({
        item: updated,
        decidedBy: staff,
        confirmed,
        note,
        orgId: item.orgId,
      });
      await load();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to update availability");
    } finally {
      setBusyId("");
    }
  };

  if (loading) return <PageLoading message="Loading availability queue…" />;

  const listForL2 = canL2 ? items : [];
  const listForAdmin = canAdmin ? adminView : [];

  return (
    <div
      className="min-h-screen"
      style={{
        background:
          "linear-gradient(160deg, var(--org-background), #ffffff 55%)",
      }}
    >
      <div className="mx-auto max-w-5xl space-y-8 p-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Catalog availability
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            New assets and consumables stay pending until an L2 confirms they
            are ready to request.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {canL2 && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">
              Assigned to you
            </h2>
            {listForL2.length === 0 ? (
              <EmptyState />
            ) : (
              listForL2.map((row) => (
                <AvailabilityCard
                  key={row.item.$id}
                  row={row}
                  note={notes[row.item.$id] || ""}
                  onNoteChange={(v) =>
                    setNotes((prev) => ({ ...prev, [row.item.$id]: v }))
                  }
                  busy={busyId === row.item.$id}
                  showActions
                  onConfirm={() => decide(row, true)}
                  onReject={() => decide(row, false)}
                />
              ))
            )}
          </section>
        )}

        {canAdmin && (
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">
              All pending (admin view)
            </h2>
            {listForAdmin.length === 0 ? (
              <EmptyState />
            ) : (
              listForAdmin.map((row) => (
                <AvailabilityCard
                  key={`admin-${row.item.$id}`}
                  row={row}
                  showActions={false}
                />
              ))
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="border-slate-200 shadow-none">
      <CardContent className="flex flex-col items-center gap-2 py-12 text-sm text-slate-500">
        <Package className="h-8 w-8 text-slate-300" />
        Nothing pending.
      </CardContent>
    </Card>
  );
}

function AvailabilityCard({
  row,
  note,
  onNoteChange,
  showActions,
  onConfirm,
  onReject,
  busy,
}) {
  const { item, assignee } = row;
  const isConsumable = item.itemType === ENUMS.ITEM_TYPE.CONSUMABLE;
  return (
    <Card className="border-slate-200/80 shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {item.name}
          <Badge variant="secondary">
            {isConsumable ? "Consumable" : "Asset"}
          </Badge>
          {item.assetTag && <Badge variant="outline">{item.assetTag}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-slate-600">
        <p>
          Assigned L2: {assignee?.name || "Any superadmin"}
          {item.$createdAt
            ? ` · Added ${new Date(item.$createdAt).toLocaleDateString()}`
            : ""}
        </p>
        {item.availabilityNote && (
          <p>
            <span className="font-medium text-slate-800">Note:</span>{" "}
            {item.availabilityNote}
          </p>
        )}
        {showActions && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor={`av-note-${item.$id}`}>Decision note</Label>
              <Textarea
                id={`av-note-${item.$id}`}
                value={note}
                onChange={(e) => onNoteChange?.(e.target.value)}
                rows={2}
                placeholder="Optional"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={onConfirm}
                disabled={busy}
                className="gap-1.5"
              >
                <CheckCircle2 className="h-4 w-4" />
                {busy ? "Working…" : "Confirm available"}
              </Button>
              <Button
                variant="outline"
                onClick={onReject}
                disabled={busy}
                className="gap-1.5"
              >
                <XCircle className="h-4 w-4" />
                Reject
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
