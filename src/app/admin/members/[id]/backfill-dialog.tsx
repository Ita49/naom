"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { computeDefaultAllocation, type UnpaidPeriod } from "@/lib/allocation";
import { formatPeriod } from "@/lib/period";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type AllocationRow = UnpaidPeriod & { amount: number };

function todayDateInput() {
  return new Date().toISOString().slice(0, 10);
}

export function BackfillDialog({ memberId }: { memberId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(todayDateInput());
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<AllocationRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setAmount("");
      setPaidAt(todayDateInput());
      setNote("");
      setRows([]);
    }
  }

  async function handleAmountBlur() {
    const parsed = Number(amount);
    if (!parsed || parsed <= 0) return;

    setLoadingRows(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("member_period_status")
      .select("period_id, period_month, dues_amount, amount_paid")
      .eq("member_id", memberId)
      .in("status", ["unpaid", "partial"])
      .order("period_month", { ascending: true });
    setLoadingRows(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    const unpaidPeriods: UnpaidPeriod[] = (data ?? []).map((row) => ({
      periodId: row.period_id,
      periodMonth: row.period_month,
      owed: Number(row.dues_amount) - Number(row.amount_paid),
    }));

    const defaults = computeDefaultAllocation(parsed, unpaidPeriods);
    const defaultByPeriod = new Map(defaults.map((d) => [d.periodId, d.amount]));

    setRows(
      unpaidPeriods.map((p) => ({
        ...p,
        amount: defaultByPeriod.get(p.periodId) ?? 0,
      }))
    );
  }

  function updateRowAmount(periodId: string, value: number) {
    setRows((prev) =>
      prev.map((r) => (r.periodId === periodId ? { ...r, amount: value } : r))
    );
  }

  const parsedAmount = Number(amount) || 0;
  const allocated = rows.reduce((sum, r) => sum + (r.amount || 0), 0);

  async function handleSave() {
    if (parsedAmount <= 0) {
      toast.error("Enter an amount greater than zero.");
      return;
    }
    if (!paidAt) {
      toast.error("A payment date is required.");
      return;
    }

    const allocations = rows
      .filter((r) => r.amount > 0)
      .map((r) => ({ period_id: r.periodId, amount: r.amount }));

    if (allocations.length === 0) {
      toast.error("Allocate at least one period.");
      return;
    }
    if (allocated > parsedAmount) {
      toast.error("Allocated amount exceeds the payment amount.");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("backfill_payment", {
      p_member_id: memberId,
      p_amount: parsedAmount,
      p_paid_at: paidAt,
      p_note: note.trim() || null,
      p_allocations: allocations,
    });
    setSubmitting(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Payment backfilled.");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Backfill payment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Backfill a payment</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="backfill-amount">
              Amount
            </label>
            <Input
              id="backfill-amount"
              type="number"
              min="0"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={handleAmountBlur}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="backfill-date">
              Date paid
            </label>
            <Input
              id="backfill-date"
              type="date"
              max={todayDateInput()}
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="backfill-note">
              Note (optional)
            </label>
            <Textarea
              id="backfill-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Allocate to periods</p>
            {loadingRows && (
              <p className="text-muted-foreground text-sm">Loading…</p>
            )}
            {!loadingRows && parsedAmount > 0 && rows.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No unpaid periods found for this member.
              </p>
            )}
            {!loadingRows && parsedAmount <= 0 && (
              <p className="text-muted-foreground text-sm">
                Enter an amount to see suggested allocation.
              </p>
            )}
            {rows.map((row) => (
              <div
                key={row.periodId}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span>
                  {formatPeriod(row.periodMonth)}{" "}
                  <span className="text-muted-foreground">
                    (owes ₦{row.owed.toLocaleString()})
                  </span>
                </span>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  className="w-28"
                  value={row.amount || ""}
                  onChange={(e) =>
                    updateRowAmount(row.periodId, Number(e.target.value) || 0)
                  }
                />
              </div>
            ))}
            {rows.length > 0 && (
              <p className="text-muted-foreground text-right text-xs">
                Allocated ₦{allocated.toLocaleString()} of ₦
                {parsedAmount.toLocaleString()}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button disabled={submitting} onClick={handleSave}>
            Save backfilled payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
