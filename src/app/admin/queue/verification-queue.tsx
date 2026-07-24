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
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type QueuedPayment = {
  id: string;
  amount: number;
  paidAt: string;
  note: string | null;
  memberId: string;
  memberName: string;
  receiptSignedUrl: string | null;
};

type AllocationRow = UnpaidPeriod & { amount: number };

// Best-effort: the approve/reject action has already succeeded and been
// shown to the admin by the time this fires, so a push-delivery failure
// here shouldn't surface as if the approval/rejection itself failed.
function notifyPaymentStatus(
  paymentId: string,
  type: "payment_verified" | "payment_rejected"
) {
  fetch("/api/notifications/payment-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentId, type }),
  }).catch(() => {});
}

export function VerificationQueue({
  payments,
}: {
  payments: QueuedPayment[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<QueuedPayment | null>(null);
  const [rows, setRows] = useState<AllocationRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function openReview(payment: QueuedPayment) {
    setSelected(payment);
    setReason("");
    setLoadingRows(true);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("member_period_status")
      .select("period_id, period_month, dues_amount, amount_paid")
      .eq("member_id", payment.memberId)
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

    const defaults = computeDefaultAllocation(payment.amount, unpaidPeriods);
    const defaultByPeriod = new Map(defaults.map((d) => [d.periodId, d.amount]));

    setRows(
      unpaidPeriods.map((p) => ({
        ...p,
        amount: defaultByPeriod.get(p.periodId) ?? 0,
      }))
    );
  }

  function updateRowAmount(periodId: string, amount: number) {
    setRows((prev) =>
      prev.map((r) => (r.periodId === periodId ? { ...r, amount } : r))
    );
  }

  const allocated = rows.reduce((sum, r) => sum + (r.amount || 0), 0);

  async function handleApprove() {
    if (!selected) return;

    const allocations = rows
      .filter((r) => r.amount > 0)
      .map((r) => ({ period_id: r.periodId, amount: r.amount }));

    if (allocations.length === 0) {
      toast.error("Allocate at least one period.");
      return;
    }
    if (allocated > selected.amount) {
      toast.error("Allocated amount exceeds the payment amount.");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("approve_payment", {
      p_payment_id: selected.id,
      p_allocations: allocations,
    });
    setSubmitting(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Payment approved.");
    setSelected(null);
    router.refresh();
    notifyPaymentStatus(selected.id, "payment_verified");
  }

  async function handleReject() {
    if (!selected) return;
    if (!reason.trim()) {
      toast.error("A rejection reason is required.");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("reject_payment", {
      p_payment_id: selected.id,
      p_reason: reason.trim(),
    });
    setSubmitting(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Payment rejected.");
    setSelected(null);
    router.refresh();
    notifyPaymentStatus(selected.id, "payment_rejected");
  }

  if (payments.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No pending submissions.
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {payments.map((payment) => (
          <Card key={payment.id}>
            <CardContent className="flex items-center gap-3">
              {payment.receiptSignedUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={payment.receiptSignedUrl}
                  alt="Receipt thumbnail"
                  className="size-12 shrink-0 rounded-md border object-cover"
                />
              ) : (
                <div className="bg-muted text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-md border text-[10px]">
                  No photo
                </div>
              )}
              <div className="flex flex-1 flex-col text-sm">
                <span className="font-medium">{payment.memberName}</span>
                <span className="text-muted-foreground">
                  ₦{payment.amount.toLocaleString()} · {payment.paidAt}
                </span>
              </div>
              <Button size="sm" onClick={() => openReview(payment)}>
                Review
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selected?.memberName} · ₦{selected?.amount.toLocaleString()}
            </DialogTitle>
          </DialogHeader>

          {selected?.receiptSignedUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selected.receiptSignedUrl}
              alt="Receipt"
              className="max-h-64 w-full rounded-md border object-contain"
            />
          )}
          {selected?.note && (
            <p className="text-muted-foreground text-sm">
              Note: {selected.note}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Allocate to periods</p>
            {loadingRows && (
              <p className="text-muted-foreground text-sm">Loading…</p>
            )}
            {!loadingRows && rows.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No unpaid periods found for this member.
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
                {selected?.amount.toLocaleString()}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Reject instead</p>
            <Textarea
              placeholder="Reason (required to reject)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              variant="destructive"
              disabled={submitting}
              onClick={handleReject}
            >
              Reject
            </Button>
            <Button disabled={submitting} onClick={handleApprove}>
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
