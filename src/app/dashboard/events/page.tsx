import Link from "next/link";
import { getSessionRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function MemberEventsPage() {
  const session = await getSessionRole();
  if (session.role !== "member") return null;

  const supabase = await createClient();

  const { data: events } = await supabase
    .from("contribution_events")
    .select("id, title, status, goal_amount, beneficiary_name")
    .order("created_at", { ascending: false });

  const { data: totals } = await supabase
    .from("event_totals")
    .select("event_id, verified_total");
  const totalsById = new Map((totals ?? []).map((t) => [t.event_id, t]));

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold">Events</h1>

      {events && events.length > 0 ? (
        <div className="flex flex-col gap-3">
          {events.map((event) => {
            const verified = Number(
              totalsById.get(event.id)?.verified_total ?? 0
            );
            return (
              <Card key={event.id}>
                <CardHeader className="flex-row items-start justify-between gap-2">
                  <div className="flex flex-col">
                    <CardTitle className="text-base">
                      <Link
                        href={`/dashboard/events/${event.id}`}
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
                <CardContent>
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
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">No events yet.</p>
      )}
    </div>
  );
}
