import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  verified: "Verified",
  rejected: "Rejected",
};

const PAYMENT_STATUS_CLASS: Record<string, string> = {
  pending: "bg-secondary text-secondary-foreground",
  verified: "bg-status-paid text-status-paid-foreground",
  rejected: "bg-status-overdue text-status-overdue-foreground",
};

function formatPeriod(periodMonth: string) {
  return new Date(`${periodMonth}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function PaymentHistoryPage() {
  const session = await getSessionRole();
  if (session.role !== "member") redirect("/");

  const supabase = await createClient();

  const { data: payments } = await supabase
    .from("payments")
    .select(
      "id, amount, paid_at, status, note, rejection_reason, receipt_url, payment_allocations(amount, contribution_periods(period_month))"
    )
    .eq("member_id", session.memberId)
    .order("submitted_at", { ascending: false });

  const withSignedUrls = await Promise.all(
    (payments ?? []).map(async (payment) => {
      let receiptSignedUrl: string | null = null;
      if (payment.receipt_url) {
        const { data } = await supabase.storage
          .from("receipts")
          .createSignedUrl(payment.receipt_url, 600);
        receiptSignedUrl = data?.signedUrl ?? null;
      }
      return { ...payment, receiptSignedUrl };
    })
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold">Payment history</h1>
      {withSignedUrls.length === 0 && (
        <p className="text-muted-foreground text-sm">No payments yet.</p>
      )}
      {withSignedUrls.map((payment) => {
        const periods = (payment.payment_allocations ?? [])
          .map((a) => {
            // Without generated DB types, supabase-js can't infer that
            // payment_allocations -> contribution_periods is many-to-one,
            // so the embedded relation types as an array even though it's
            // always exactly one row per allocation.
            const period = Array.isArray(a.contribution_periods)
              ? a.contribution_periods[0]
              : a.contribution_periods;
            return period ? formatPeriod(period.period_month) : null;
          })
          .filter((p): p is string => Boolean(p));

        return (
          <Card key={payment.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">
                ₦{Number(payment.amount).toLocaleString()} · {payment.paid_at}
              </CardTitle>
              <Badge className={PAYMENT_STATUS_CLASS[payment.status]}>
                {PAYMENT_STATUS_LABEL[payment.status] ?? payment.status}
              </Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {periods.length > 0 && (
                <p className="text-muted-foreground">
                  Covers: {periods.join(", ")}
                </p>
              )}
              {payment.note && <p>{payment.note}</p>}
              {payment.status === "rejected" && payment.rejection_reason && (
                <p className="text-status-overdue">
                  Reason: {payment.rejection_reason}
                </p>
              )}
              {payment.receiptSignedUrl && (
                <a
                  href={payment.receiptSignedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-4"
                >
                  View receipt
                </a>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
