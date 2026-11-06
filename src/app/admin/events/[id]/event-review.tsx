"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_CLASS,
} from "@/lib/status-labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ReviewContribution = {
  id: string;
  contributorName: string;
  contributorPhone: string | null;
  amount: number;
  paidAt: string | null;
  note: string | null;
  status: string;
  rejectionReason: string | null;
  isMember: boolean;
  receiptSignedUrl: string | null;
};

export function EventReview({
  eventId,
  eventStatus,
  contributions,
}: {
  eventId: string;
  eventStatus: string;
  contributions: ReviewContribution[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<ReviewContribution | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function toggleEventStatus() {
    const next = eventStatus === "open" ? "closed" : "open";
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("contribution_events")
      .update({ status: next })
      .eq("id", eventId);
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(next === "open" ? "Event reopened." : "Event closed.");
    router.refresh();
  }

  function openReview(c: ReviewContribution) {
    setSelected(c);
    setReason("");
  }

  async function handleVerify() {
    if (!selected) return;
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("verify_event_contribution", {
      p_contribution_id: selected.id,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Contribution verified.");
    setSelected(null);
    router.refresh();
  }

  async function handleReject() {
    if (!selected) return;
    if (!reason.trim()) {
      toast.error("A rejection reason is required.");
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("reject_event_contribution", {
      p_contribution_id: selected.id,
      p_reason: reason.trim(),
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Contribution rejected.");
    setSelected(null);
    router.refresh();
  }

  const pending = contributions.filter((c) => c.status === "pending");
  const settled = contributions.filter((c) => c.status !== "pending");

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">
          Contributions ({contributions.length})
        </h2>
        <Button
          variant="outline"
          size="sm"
          disabled={submitting}
          onClick={toggleEventStatus}
        >
          {eventStatus === "open" ? "Close event" : "Reopen event"}
        </Button>
      </div>

      {contributions.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No contributions yet. Share the link to start collecting.
        </p>
      )}

      {pending.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs font-medium uppercase">
            Awaiting review
          </p>
          {pending.map((c) => (
            <ContributionCard key={c.id} c={c} onReview={openReview} />
          ))}
        </div>
      )}

      {settled.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs font-medium uppercase">
            Reviewed
          </p>
          {settled.map((c) => (
            <ContributionCard key={c.id} c={c} onReview={openReview} />
          ))}
        </div>
      )}

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selected?.contributorName} · ₦
              {selected?.amount.toLocaleString()}
            </DialogTitle>
          </DialogHeader>

          {selected?.contributorPhone && (
            <p className="text-muted-foreground text-sm">
              Phone: {selected.contributorPhone}
            </p>
          )}
          {selected?.paidAt && (
            <p className="text-muted-foreground text-sm">
              Date paid: {selected.paidAt}
            </p>
          )}
          {selected?.receiptSignedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selected.receiptSignedUrl}
              alt="Receipt"
              className="max-h-64 w-full rounded-md border object-contain"
            />
          ) : (
            <p className="text-muted-foreground text-sm">No receipt attached.</p>
          )}
          {selected?.note && (
            <p className="text-muted-foreground text-sm">
              Note: {selected.note}
            </p>
          )}

          {selected?.status === "pending" ? (
            <>
              <p className="text-muted-foreground text-sm">
                Confirm this amount has landed in the account before verifying.
              </p>
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
                <Button disabled={submitting} onClick={handleVerify}>
                  Verify
                </Button>
              </DialogFooter>
            </>
          ) : (
            <p className="text-sm">
              Status:{" "}
              <Badge className={PAYMENT_STATUS_CLASS[selected?.status ?? ""]}>
                {PAYMENT_STATUS_LABEL[selected?.status ?? ""] ?? selected?.status}
              </Badge>
              {selected?.rejectionReason && (
                <span className="text-muted-foreground block pt-2">
                  Reason: {selected.rejectionReason}
                </span>
              )}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ContributionCard({
  c,
  onReview,
}: {
  c: ReviewContribution;
  onReview: (c: ReviewContribution) => void;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        {c.receiptSignedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={c.receiptSignedUrl}
            alt="Receipt thumbnail"
            className="size-12 shrink-0 rounded-md border object-cover"
          />
        ) : (
          <div className="bg-muted text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-md border text-[10px]">
            No photo
          </div>
        )}
        <div className="flex flex-1 flex-col text-sm">
          <span className="font-medium">
            {c.contributorName}
            {c.isMember && (
              <span className="text-muted-foreground font-normal"> · member</span>
            )}
          </span>
          <span className="text-muted-foreground">
            ₦{c.amount.toLocaleString()}
            {c.paidAt ? ` · ${c.paidAt}` : ""}
          </span>
        </div>
        <Badge className={PAYMENT_STATUS_CLASS[c.status]}>
          {PAYMENT_STATUS_LABEL[c.status] ?? c.status}
        </Badge>
        <Button size="sm" variant="outline" onClick={() => onReview(c)}>
          {c.status === "pending" ? "Review" : "View"}
        </Button>
      </CardContent>
    </Card>
  );
}
