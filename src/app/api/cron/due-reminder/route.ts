import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendPushToMember } from "@/lib/push";
import { currentPeriodMonth, formatPeriod } from "@/lib/period";

/**
 * Scheduled a few days before month-end (see vercel.ts) but safe to call
 * anytime — recipients are derived from live data and dedup'd against
 * the notifications log, so re-running it never double-sends. That also
 * makes it possible to trigger manually for the M6 demo check.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const periodMonth = currentPeriodMonth();

  const { data: period } = await supabase
    .from("contribution_periods")
    .select("id, period_month")
    .eq("period_month", periodMonth)
    .maybeSingle();

  if (!period) {
    return NextResponse.json({ sent: 0, reason: "no current period" });
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
    .eq("type", "due_reminder")
    .eq("payload->>period_id", period.id);
  const notifiedIds = new Set((alreadyNotified ?? []).map((n) => n.member_id));

  const recipients = (unpaidRows ?? []).filter(
    (row) => activeIds.has(row.member_id) && !notifiedIds.has(row.member_id)
  );

  await Promise.all(
    recipients.map((row) => {
      const owed = Number(row.dues_amount) - Number(row.amount_paid);
      return sendPushToMember(supabase, row.member_id, {
        type: "due_reminder",
        title: "Dues reminder",
        body: `₦${owed.toLocaleString()} still due for ${formatPeriod(period.period_month)}.`,
        url: "/dashboard/submit",
        payload: { period_id: period.id, period_month: period.period_month },
      });
    })
  );

  return NextResponse.json({ sent: recipients.length });
}
