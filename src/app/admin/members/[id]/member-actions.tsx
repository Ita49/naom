"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function MemberActions({
  memberId,
  membershipStatus,
}: {
  memberId: string;
  membershipStatus: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const isActive = membershipStatus === "active";

  async function handleToggleStatus() {
    const nextStatus = isActive ? "inactive" : "active";
    const confirmed = window.confirm(
      isActive
        ? "Deactivate this member? They'll stop appearing as active in dashboards and roster totals."
        : "Reactivate this member?"
    );
    if (!confirmed) return;

    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("members")
      .update({ status: nextStatus })
      .eq("id", memberId);
    setSubmitting(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(isActive ? "Member deactivated." : "Member reactivated.");
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled
          title="Coming in M5"
        >
          Record payment
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled
          title="Coming in M5"
        >
          Backfill arrears
        </Button>
        <span className="text-muted-foreground text-xs">Coming in M5</span>
        <div className="flex-1" />
        <Button
          variant={isActive ? "destructive" : "secondary"}
          size="sm"
          disabled={submitting}
          onClick={handleToggleStatus}
        >
          {isActive ? "Deactivate member" : "Reactivate member"}
        </Button>
      </CardContent>
    </Card>
  );
}
