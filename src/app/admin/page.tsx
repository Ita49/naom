import Link from "next/link";
import { getSessionRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { currentPeriodMonth } from "@/lib/period";
import { PAYMENT_STATUS_LABEL, PAYMENT_STATUS_CLASS } from "@/lib/status-labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function AdminHome() {
  const session = await getSessionRole();
  if (session.role !== "admin") return null;

  const supabase = await createClient();
  const periodMonth = currentPeriodMonth();

  const { data: activeMembers } = await supabase
    .from("members")
    .select("id")
    .eq("status", "active");
  const activeIds = (activeMembers ?? []).map((m) => m.id);

  const { data: periodConfig } = await supabase
    .from("contribution_periods")
    .select("dues_amount")
    .eq("period_month", periodMonth)
    .maybeSingle();
  const duesAmount = Number(periodConfig?.dues_amount ?? 0);
  const totalDue = duesAmount * activeIds.length;

  let totalCollected = 0;
  let arrearsMemberCount = 0;

  if (activeIds.length > 0) {
    const { data: currentStatusRows } = await supabase
      .from("member_period_status")
      .select("amount_paid")
      .in("member_id", activeIds)
      .eq("period_month", periodMonth);

    totalCollected = (currentStatusRows ?? []).reduce(
      (sum, row) => sum + Number(row.amount_paid),
      0
    );

    const { data: arrearsRows } = await supabase
      .from("member_period_status")
      .select("member_id")
      .in("member_id", activeIds)
      .in("status", ["unpaid", "partial"])
      .lte("period_month", periodMonth);

    arrearsMemberCount = new Set((arrearsRows ?? []).map((r) => r.member_id))
      .size;
  }

  const collectionPct =
    totalDue > 0 ? Math.round((totalCollected / totalDue) * 100) : 0;

  const { count: pendingCount } = await supabase
    .from("payments")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  const { data: recentActivity } = await supabase
    .from("payments")
    .select("id, amount, status, verified_at, member_id, members(full_name)")
    .in("status", ["verified", "rejected"])
    .order("verified_at", { ascending: false })
    .limit(10);

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold">Admin Dashboard</h1>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal">
              This month&apos;s collection
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{collectionPct}%</p>
            <p className="text-muted-foreground text-xs">
              ₦{totalCollected.toLocaleString()} of ₦
              {totalDue.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal">
              Members in arrears
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{arrearsMemberCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal">
              Pending verification
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-2xl font-semibold">{pendingCount ?? 0}</p>
            <Button asChild size="sm" variant="outline" className="w-fit">
              <Link href="/admin/queue">Review queue</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal">Members</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-2xl font-semibold">{activeIds.length}</p>
            <Button asChild size="sm" variant="outline" className="w-fit">
              <Link href="/admin/members">View roster</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {recentActivity && recentActivity.length > 0 ? (
            recentActivity.map((activity) => {
              const memberRelation = Array.isArray(activity.members)
                ? activity.members[0]
                : activity.members;
              return (
                <div
                  key={activity.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span>
                    {memberRelation?.full_name ?? "Unknown member"} · ₦
                    {Number(activity.amount).toLocaleString()}
                  </span>
                  <Badge className={PAYMENT_STATUS_CLASS[activity.status]}>
                    {PAYMENT_STATUS_LABEL[activity.status] ?? activity.status}
                  </Badge>
                </div>
              );
            })
          ) : (
            <p className="text-muted-foreground text-sm">No activity yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
