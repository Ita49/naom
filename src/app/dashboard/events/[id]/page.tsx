import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
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

// View-only contributor list for every signed-in member (the explicit
// product decision: names + amounts + status are visible to all members).
// No receipts and no admin actions here — those stay in the admin area.
export default async function MemberEventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionRole();
  if (session.role !== "member") return null;

  const { id } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("contribution_events")
    .select(
      "id, title, description, status, goal_amount, beneficiary_name, members:beneficiary_member_id(full_name)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!event) notFound();

  const { data: contributions } = await supabase
    .from("event_contributions")
    .select("id, contributor_name, amount, status, submitted_at")
    .eq("event_id", id)
    .order("submitted_at", { ascending: false });

  const rows = contributions ?? [];
  const verifiedTotal = rows
    .filter((r) => r.status === "verified")
    .reduce((sum, r) => sum + Number(r.amount), 0);

  const beneficiaryRelation = Array.isArray(event.members)
    ? event.members[0]
    : event.members;
  const beneficiary =
    beneficiaryRelation?.full_name ?? event.beneficiary_name ?? null;

  return (
    <div className="flex flex-col gap-4 p-4">
      <Button asChild variant="link" className="w-fit px-0">
        <Link href="/dashboard/events">← All events</Link>
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
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Contributions ({rows.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.contributor_name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      ₦{Number(r.amount).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge className={PAYMENT_STATUS_CLASS[r.status]}>
                        {PAYMENT_STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm">
              No contributions yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
