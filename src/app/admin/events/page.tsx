import Link from "next/link";
import { getSessionRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreateEventDialog } from "./create-event-dialog";
import { ShareLink } from "./share-link";

export default async function AdminEventsPage() {
  const session = await getSessionRole();
  if (session.role !== "admin") return null;

  const supabase = await createClient();

  const { data: events } = await supabase
    .from("contribution_events")
    .select("id, slug, title, status, goal_amount, beneficiary_name")
    .order("created_at", { ascending: false });

  const { data: members } = await supabase
    .from("members")
    .select("id, full_name")
    .eq("status", "active")
    .order("full_name", { ascending: true });

  // Totals per event, read through the security-invoker view (admins see all).
  const { data: totals } = await supabase
    .from("event_totals")
    .select("event_id, verified_total, pending_total, pending_count");
  const totalsById = new Map((totals ?? []).map((t) => [t.event_id, t]));

  // Roll-up across every event: what's been confirmed in total, how many
  // contributions are still waiting on the treasurer, and how many drives
  // are currently open to new contributions.
  const totalConfirmed = (totals ?? []).reduce(
    (sum, t) => sum + Number(t.verified_total ?? 0),
    0
  );
  const totalPending = (totals ?? []).reduce(
    (sum, t) => sum + Number(t.pending_count ?? 0),
    0
  );
  const openCount = (events ?? []).filter((e) => e.status === "open").length;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Events</h1>
        <CreateEventDialog members={members ?? []} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-normal">
              Total confirmed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums">
              ₦{totalConfirmed.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-normal">
              Awaiting review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums">{totalPending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-normal">Open events</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums">
              {openCount}
              <span className="text-muted-foreground text-xs font-normal">
                {" "}
                / {events?.length ?? 0}
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      {events && events.length > 0 ? (
        <div className="flex flex-col gap-3">
          {events.map((event) => {
            const t = totalsById.get(event.id);
            const verified = Number(t?.verified_total ?? 0);
            const pendingCount = Number(t?.pending_count ?? 0);
            return (
              <Card key={event.id}>
                <CardHeader className="flex-row items-start justify-between gap-2">
                  <div className="flex flex-col">
                    <CardTitle className="text-base">
                      <Link
                        href={`/admin/events/${event.id}`}
                        className="hover:underline"
                      >
                        {event.title}
                      </Link>
                    </CardTitle>
                    {event.beneficiary_name && (
                      <p className="text-muted-foreground text-xs">
                        For {event.beneficiary_name}
                      </p>
                    )}
                  </div>
                  <Badge
                    className={
                      event.status === "open"
                        ? "bg-status-paid text-status-paid-foreground"
                        : "bg-secondary text-secondary-foreground"
                    }
                  >
                    {event.status === "open" ? "Open" : "Closed"}
                  </Badge>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-semibold tabular-nums">
                      ₦{verified.toLocaleString()}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      confirmed
                      {event.goal_amount
                        ? ` of ₦${Number(event.goal_amount).toLocaleString()}`
                        : ""}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/events/${event.id}`}>
                        Review
                        {pendingCount > 0 ? ` (${pendingCount} pending)` : ""}
                      </Link>
                    </Button>
                    <ShareLink slug={event.slug} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          No events yet. Create one to start collecting contributions.
        </p>
      )}
    </div>
  );
}
