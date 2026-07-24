"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { subscribeToPush } from "@/lib/push-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const DISMISSED_KEY = "naom-notif-prompt-dismissed";

export function NotificationPrompt({ memberId }: { memberId: string }) {
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    if (localStorage.getItem(DISMISSED_KEY)) return;
    // Notification/localStorage don't exist during SSR, so this can only
    // be known post-mount — the one-render flash from false to true here
    // is the accepted tradeoff, not an oversight.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(true);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  }

  async function handleEnable() {
    setSubmitting(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        await subscribeToPush(memberId);
        toast.success("Notifications enabled.");
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't enable notifications."
      );
    } finally {
      setSubmitting(false);
      dismiss();
    }
  }

  if (!visible) return null;

  return (
    <Card className="m-4">
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm">
          Get notified the moment your payment is verified, and a reminder
          before dues are due.
        </p>
        <p className="text-muted-foreground text-xs">
          On iPhone, first add this app to your Home Screen (Share → Add to
          Home Screen) — notifications only work from there.
        </p>
        <div className="flex gap-2">
          <Button size="sm" disabled={submitting} onClick={handleEnable}>
            Enable notifications
          </Button>
          <Button size="sm" variant="outline" onClick={dismiss}>
            Not now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
