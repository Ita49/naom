import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { currentPeriodMonth } from "@/lib/period";
import { MemberRoster } from "./member-roster";

export default async function MemberRosterPage() {
  const session = await getSessionRole();
  if (session.role !== "admin") redirect("/");

  const supabase = await createClient();
  const periodMonth = currentPeriodMonth();

  const { data: members } = await supabase
    .from("members")
    .select("id, full_name, phone, status")
    .order("full_name", { ascending: true });

  const memberIds = (members ?? []).map((m) => m.id);

  let currentStatusByMember = new Map<string, string>();
  const arrearsByMember = new Map<string, number>();

  if (memberIds.length > 0) {
    const { data: currentStatusRows } = await supabase
      .from("member_period_status")
      .select("member_id, status")
      .in("member_id", memberIds)
      .eq("period_month", periodMonth);

    currentStatusByMember = new Map(
      (currentStatusRows ?? []).map((row) => [row.member_id, row.status])
    );

    const { data: arrearsRows } = await supabase
      .from("member_period_status")
      .select("member_id, dues_amount, amount_paid")
      .in("member_id", memberIds)
      .in("status", ["unpaid", "partial"])
      .lte("period_month", periodMonth);

    for (const row of arrearsRows ?? []) {
      const owed = Number(row.dues_amount) - Number(row.amount_paid);
      arrearsByMember.set(
        row.member_id,
        (arrearsByMember.get(row.member_id) ?? 0) + owed
      );
    }
  }

  const roster = (members ?? []).map((member) => ({
    id: member.id as string,
    fullName: member.full_name as string,
    phone: member.phone as string | null,
    membershipStatus: member.status as string,
    currentStatus: currentStatusByMember.get(member.id) ?? "unpaid",
    arrears: arrearsByMember.get(member.id) ?? 0,
  }));

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold">Member Roster</h1>
      <MemberRoster members={roster} />
    </div>
  );
}
