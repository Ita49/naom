import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export type NotificationType =
  | "payment_verified"
  | "payment_rejected"
  | "due_reminder"
  | "overdue_nudge";

/**
 * Sends a web push to every device a member has subscribed on, then
 * logs one `notifications` row for the event regardless of delivery
 * outcome (the row is the audit trail / dedup check, not a delivery
 * receipt). Takes the caller's own Supabase client so RLS — not this
 * function — stays the privilege boundary: the admin-triggered path
 * passes its cookie-scoped client, the cron routes pass the
 * service-role client (no user session exists for those to scope to).
 */
export async function sendPushToMember(
  supabase: SupabaseClient,
  memberId: string,
  notification: {
    type: NotificationType;
    title: string;
    body: string;
    url?: string;
    payload?: Record<string, unknown>;
  }
) {
  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("member_id", memberId);

  await Promise.all(
    (subscriptions ?? []).map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify({
            title: notification.title,
            body: notification.body,
            url: notification.url ?? "/",
          })
        );
      } catch (error) {
        // 404/410 means the push service considers this endpoint gone
        // for good (browser reset, uninstall, etc.) — prune it so
        // future sends don't keep paying the failed round-trip.
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    })
  );

  await supabase.from("notifications").insert({
    member_id: memberId,
    type: notification.type,
    channel: "web_push",
    payload: notification.payload ?? null,
  });
}
