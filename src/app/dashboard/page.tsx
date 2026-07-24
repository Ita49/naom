import Link from "next/link";
import { getSessionRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { currentPeriodMonth } from "@/lib/period";
import {
  PERIOD_STATUS_LABEL,
  PERIOD_STATUS_CLASS,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_CLASS,
} from "@/lib/status-labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function MemberDashboard() {
  const session = await getSessionRole();
  if (session.role !== "member") return null;

  const supabase = await createClient();
  const periodMonth = currentPeriodMonth();

  const { data: currentStatus } = await supabase
    .from("member_period_status")
    .select("status, dues_amount, amount_paid")
    .eq("member_id", session.memberId)
    .eq("period_month", periodMonth)
    .maybeSingle();

  const { data: arrearsRows } = await supabase
    .from("member_period_status")
    .select("dues_amount, amount_paid")
    .eq("member_id", session.memberId)
    .in("status", ["unpaid", "partial"])
    .lte("period_month", periodMonth);

  const arrears = (arrearsRows ?? []).reduce(
    (sum, row) => sum + Number(row.dues_amount) - Number(row.amount_paid),
    0
  );

  const { data: recentPayments } = await supabase
    .from("payments")
    .select("id, amount, paid_at, status")
    .eq("member_id", session.memberId)
    .order("submitted_at", { ascending: false })
    .limit(3);

  const status = currentStatus?.status ?? "unpaid";

  return (
    <div className="flex flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>This month</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div>
            <Badge className={PERIOD_STATUS_CLASS[status]}>
              {PERIOD_STATUS_LABEL[status] ?? status}
            </Badge>
          </div>
          {arrears > 0 && (
            <p className="text-muted-foreground text-sm">
              You owe ₦{arrears.toLocaleString()} in arrears.
            </p>
          )}
          <Button asChild>
            <Link href="/dashboard/submit">Submit a payment</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent payments</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {recentPayments && recentPayments.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {recentPayments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span>
                    ₦{Number(payment.amount).toLocaleString()} · {payment.paid_at}
                  </span>
                  <Badge className={PAYMENT_STATUS_CLASS[payment.status]}>
                    {PAYMENT_STATUS_LABEL[payment.status] ?? payment.status}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">No payments yet.</p>
          )}
          <Button asChild variant="link" className="w-fit px-0">
            <Link href="/dashboard/history">View full history</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
