import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { VerificationQueue } from "./verification-queue";

export default async function VerificationQueuePage() {
  const session = await getSessionRole();
  if (session.role !== "admin") redirect("/");

  const supabase = await createClient();

  const { data: pending } = await supabase
    .from("payments")
    .select("id, amount, paid_at, note, receipt_url, member_id, members(full_name)")
    .eq("status", "pending")
    .order("submitted_at", { ascending: false });

  const payments = await Promise.all(
    (pending ?? []).map(async (payment) => {
      const memberRelation = Array.isArray(payment.members)
        ? payment.members[0]
        : payment.members;

      let receiptSignedUrl: string | null = null;
      if (payment.receipt_url) {
        const { data } = await supabase.storage
          .from("receipts")
          .createSignedUrl(payment.receipt_url, 600);
        receiptSignedUrl = data?.signedUrl ?? null;
      }

      return {
        id: payment.id,
        amount: Number(payment.amount),
        paidAt: payment.paid_at as string,
        note: payment.note as string | null,
        memberId: payment.member_id as string,
        memberName: memberRelation?.full_name ?? "Unknown member",
        receiptSignedUrl,
      };
    })
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold">Verification Queue</h1>
      <VerificationQueue payments={payments} />
    </div>
  );
}
