import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ShareLink } from "../share-link";
import { EventReview, type ReviewContribution } from "./event-review";

export default async function AdminEventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionRole();
  if (session.role !== "admin") return null;

  const { id } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("contribution_events")
    .select(
      "id, slug, title, description, status, goal_amount, beneficiary_name, members:beneficiary_member_id(full_name)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!event) notFound();

  const { data: contributions } = await supabase
    .from("event_contributions")
    .select(
      "id, contributor_name, contributor_phone, amount, paid_at, note, status, rejection_reason, receipt_url, submitted_at, member_id"
    )
    .eq("event_id", id)
    .order("submitted_at", { ascending: false });

  // Signed URLs for receipts (10 min) — admins hold the storage select policy
  // on the private event-receipts bucket; members never see these images.
  const rows: ReviewContribution[] = await Promise.all(
    (contributions ?? []).map(async (c) => {
      let receiptSignedUrl: string | null = null;
      if (c.receipt_url) {
        const { data } = await supabase.storage
          .from("event-receipts")
          .createSignedUrl(c.receipt_url, 600);
        receiptSignedUrl = data?.signedUrl ?? null;
      }
      return {
        id: c.id,
        contributorName: c.contributor_name,
        contributorPhone: c.contributor_phone,
        amount: Number(c.amount),
        paidAt: c.paid_at,
        note: c.note,
        status: c.status,
        rejectionReason: c.rejection_reason,
        isMember: c.member_id !== null,
        receiptSignedUrl,
      };
    })
  );

  const verifiedTotal = rows
    .filter((r) => r.status === "verified")
    .reduce((sum, r) => sum + r.amount, 0);
  const pendingCount = rows.filter((r) => r.status === "pending").length;

  const beneficiaryRelation = Array.isArray(event.members)
    ? event.members[0]
    : event.members;
  const beneficiary =
    beneficiaryRelation?.full_name ?? event.beneficiary_name ?? null;

  return (
    <div className="flex flex-col gap-4 p-4">
      <Button asChild variant="link" className="w-fit px-0">
        <Link href="/admin/events">← All events</Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{event.title}</CardTitle>
          {beneficiary && (
            <p className="text-muted-foreground text-sm">
              In support of {beneficiary}
            </p>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {event.description && (
            <p className="text-sm whitespace-pre-line">{event.description}</p>
          )}
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">
              ₦{verifiedTotal.toLocaleString()}
            </span>
            <span className="text-muted-foreground text-xs">
              confirmed
              {event.goal_amount
                ? ` of ₦${Number(event.goal_amount).toLocaleString()}`
                : ""}
              {pendingCount > 0 ? ` · ${pendingCount} awaiting review` : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ShareLink slug={event.slug} />
          </div>
        </CardContent>
      </Card>

      <EventReview
        eventId={event.id}
        eventStatus={event.status}
        contributions={rows}
      />
    </div>
  );
}
