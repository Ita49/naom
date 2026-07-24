import { NextResponse } from "next/server";
import { getSessionRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sendPushToMember } from "@/lib/push";
import { formatPeriod } from "@/lib/period";

export async function POST(request: Request) {
  const session = await getSessionRole();
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { paymentId, type } = (await request.json()) as {
    paymentId?: string;
    type?: "payment_verified" | "payment_rejected";
  };

  if (!paymentId || (type !== "payment_verified" && type !== "payment_rejected")) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: payment } = await supabase
    .from("payments")
    .select(
      "id, member_id, amount, status, rejection_reason, payment_allocations(amount, contribution_periods(period_month))"
    )
    .eq("id", paymentId)
    .maybeSingle();

  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  const periods = (payment.payment_allocations ?? [])
    .map((a) => {
      const period = Array.isArray(a.contribution_periods)
        ? a.contribution_periods[0]
        : a.contribution_periods;
      return period ? formatPeriod(period.period_month) : null;
    })
    .filter((p): p is string => Boolean(p));

  const amount = Number(payment.amount).toLocaleString();

  const notification =
    type === "payment_verified"
      ? {
          type,
          title: "Payment verified",
          body:
            periods.length > 0
              ? `₦${amount} confirmed for ${periods.join(", ")}.`
              : `₦${amount} confirmed.`,
        }
      : {
          type,
          title: "Payment rejected",
          body: payment.rejection_reason
            ? `₦${amount} payment rejected: ${payment.rejection_reason}`
            : `₦${amount} payment was rejected.`,
        };

  await sendPushToMember(supabase, payment.member_id, {
    ...notification,
    url: "/dashboard/history",
    payload: { payment_id: payment.id, amount: payment.amount },
  });

  return NextResponse.json({ ok: true });
}
