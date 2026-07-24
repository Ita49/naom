import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { currentPeriodMonth, formatPeriod } from "@/lib/period";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MemberActions } from "./member-actions";

const SOURCE_LABEL: Record<string, string> = {
  member_submitted: "Member submitted",
  admin_backfill: "Backfilled",
  admin_manual: "Recorded by admin",
};

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionRole();
  if (session.role !== "admin") redirect("/");

  const { id } = await params;
  const supabase = await createClient();

  const { data: member } = await supabase
    .from("members")
    .select("id, full_name, phone, email, status, joined_at")
    .eq("id", id)
    .maybeSingle();

  if (!member) notFound();

  const periodMonth = currentPeriodMonth();

  const { data: periodRows } = await supabase
    .from("member_period_status")
    .select("period_id, period_month, dues_amount, amount_paid, status")
    .eq("member_id", id)
    .order("period_month", { ascending: true });

  const periods = periodRows ?? [];
  const currentPeriod = periods.find((p) => p.period_month === periodMonth);
  const totalArrears = periods
    .filter((p) => p.period_month <= periodMonth)
    .filter((p) => p.status === "unpaid" || p.status === "partial")
    .reduce(
      (sum, p) => sum + Number(p.dues_amount) - Number(p.amount_paid),
      0
    );

  const { data: payments } = await supabase
    .from("payments")
    .select(
      "id, amount, paid_at, status, source, note, rejection_reason, receipt_url, payment_allocations(amount, contribution_periods(period_month))"
    )
    .eq("member_id", id)
    .order("submitted_at", { ascending: false });

  const paymentsWithSignedUrls = await Promise.all(
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
      <div className="flex flex-col gap-1">
        <Button asChild variant="link" className="w-fit px-0">
          <Link href="/admin/members">← All members</Link>
        </Button>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">{member.full_name}</h1>
          {member.status === "inactive" && (
            <Badge variant="secondary">Inactive</Badge>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          {[member.phone, member.email].filter(Boolean).join(" · ") ||
            "No contact info on file"}
          {" · Joined "}
          {member.joined_at}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal">This month</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge
              className={
                PERIOD_STATUS_CLASS[currentPeriod?.status ?? "unpaid"]
              }
            >
              {PERIOD_STATUS_LABEL[currentPeriod?.status ?? "unpaid"] ??
                "Unpaid"}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal">
              Total arrears
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              ₦{totalArrears.toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      <MemberActions memberId={member.id} membershipStatus={member.status} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Period history</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Dues</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.map((period) => (
                <TableRow key={period.period_id}>
                  <TableCell>{formatPeriod(period.period_month)}</TableCell>
                  <TableCell>
                    ₦{Number(period.dues_amount).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    ₦{Number(period.amount_paid).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge className={PERIOD_STATUS_CLASS[period.status]}>
                      {PERIOD_STATUS_LABEL[period.status] ?? period.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment history</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {paymentsWithSignedUrls.length === 0 && (
            <p className="text-muted-foreground text-sm">No payments yet.</p>
          )}
          {paymentsWithSignedUrls.map((payment) => {
            const coveredPeriods = (payment.payment_allocations ?? [])
              .map((a) => {
                const period = Array.isArray(a.contribution_periods)
                  ? a.contribution_periods[0]
                  : a.contribution_periods;
                return period ? formatPeriod(period.period_month) : null;
              })
              .filter((p): p is string => Boolean(p));

            return (
              <div
                key={payment.id}
                className="flex flex-col gap-1 border-b pb-3 text-sm last:border-b-0 last:pb-0"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    ₦{Number(payment.amount).toLocaleString()} ·{" "}
                    {payment.paid_at}
                  </span>
                  <Badge className={PAYMENT_STATUS_CLASS[payment.status]}>
                    {PAYMENT_STATUS_LABEL[payment.status] ?? payment.status}
                  </Badge>
                </div>
                <p className="text-muted-foreground text-xs">
                  {SOURCE_LABEL[payment.source] ?? payment.source}
                  {coveredPeriods.length > 0 &&
                    ` · Covers: ${coveredPeriods.join(", ")}`}
                </p>
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
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
