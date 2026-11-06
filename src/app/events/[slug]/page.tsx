import { notFound } from "next/navigation";
import Image from "next/image";
import { createServiceClient } from "@/lib/supabase/service";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ContributeForm } from "./contribute-form";

// Public share page — reached by anyone with the link, no sign-in. Rendered
// with the service-role client (no session to scope RLS to), so it never
// relies on an anon read policy on the events table. Only open events accept
// new contributions; the contributor list itself is members-only and lives
// in the authenticated app, so this page intentionally shows the running
// total, not who gave what.
export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createServiceClient();

  const { data: event } = await supabase
    .from("contribution_events")
    .select(
      "id, title, description, goal_amount, status, beneficiary_name, beneficiary_member_id, members:beneficiary_member_id(full_name)"
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!event) notFound();

  const { data: verifiedRows } = await supabase
    .from("event_contributions")
    .select("amount")
    .eq("event_id", event.id)
    .eq("status", "verified");

  const verifiedTotal = (verifiedRows ?? []).reduce(
    (sum, row) => sum + Number(row.amount),
    0
  );

  const beneficiaryRelation = Array.isArray(event.members)
    ? event.members[0]
    : event.members;
  const beneficiary =
    beneficiaryRelation?.full_name ?? event.beneficiary_name ?? null;

  const goal = event.goal_amount ? Number(event.goal_amount) : null;
  const pct = goal ? Math.min(100, Math.round((verifiedTotal / goal) * 100)) : null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 p-4">
      <header className="flex items-center gap-3 pt-2">
        <Image
          src="/icons/icon-192.png"
          alt="NAOM"
          width={36}
          height={36}
          className="rounded-md"
        />
        <span className="text-muted-foreground text-sm font-medium">
          NAOM Contributions
        </span>
      </header>

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

          <div className="flex flex-col gap-1">
            <p className="text-2xl font-semibold tabular-nums">
              ₦{verifiedTotal.toLocaleString()}
            </p>
            <p className="text-muted-foreground text-xs">
              confirmed so far
              {goal ? ` · goal ₦${goal.toLocaleString()}` : ""}
            </p>
            {pct !== null && (
              <div className="bg-muted mt-1 h-2 w-full overflow-hidden rounded-full">
                <div
                  className="bg-status-paid h-full rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {event.status === "open" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload your contribution</CardTitle>
            <p className="text-muted-foreground text-sm">
              Enter your details and attach your transfer receipt. The treasurer
              confirms the amount in the account before it&apos;s marked
              verified.
            </p>
          </CardHeader>
          <CardContent>
            <ContributeForm slug={slug} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="text-muted-foreground text-sm">
            This contribution drive is now closed. Thank you for your support.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
