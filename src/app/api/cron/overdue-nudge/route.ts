import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendPushToMember } from "@/lib/push";
import { previousPeriodMonth, formatPeriod } from "@/lib/period";

/**
 * Scheduled early in the new month (see vercel.ts) but safe to call
 * anytime — same dedup-via-notifications-log approach as due-reminder,
 * so it can also be triggered manually for the M6 demo check.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const periodMonth = previousPeriodMonth();

  const { data: period } = await supabase
    .from("contribution_periods")
    .select("id, period_month")
    .eq("period_month", periodMonth)
    .maybeSingle();

  if (!period) {
    return NextResponse.json({ sent: 0, reason: "no previous period" });
  }

  const { data: activeMembers } = await supabase
    .from("members")
    .select("id")
    .eq("status", "active");
  const activeIds = new Set((activeMembers ?? []).map((m) => m.id));

  const { data: unpaidRows } = await supabase
    .from("member_period_status")
    .select("member_id, dues_amount, amount_paid")
    .eq("period_id", period.id)
    .in("status", ["unpaid", "partial"]);

  const { data: alreadyNotified } = await supabase
    .from("notifications")
    .select("member_id")
    .eq("type", "overdue_nudge")
    .eq("payload->>period_id", period.id);
  const notifiedIds = new Set((alreadyNotified ?? []).map((n) => n.member_id));

  const recipients = (unpaidRows ?? []).filter(
    (row) => activeIds.has(row.member_id) && !notifiedIds.has(row.member_id)
  );

  await Promise.all(
    recipients.map((row) => {
      const owed = Number(row.dues_amount) - Number(row.amount_paid);
      return sendPushToMember(supabase, row.member_id, {
        type: "overdue_nudge",
        title: "Overdue dues",
        body: `₦${owed.toLocaleString()} still owed for ${formatPeriod(period.period_month)}.`,
        url: "/dashboard",
        payload: { period_id: period.id, period_month: period.period_month },
      });
    })
  );

  return NextResponse.json({ sent: recipients.length });
}
