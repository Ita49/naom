import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

// Public ingest for guest contributions from the share link. Runs with the
// service-role key so the publicly-held anon key never gets direct write
// access to event_contributions (which would make the link a spam/forgery
// primitive). Every write is gated here: the slug must resolve to an event
// that is currently 'open'. If the submitter happens to be a signed-in
// member, we link their member_id so the members-only list can flag their
// own entries — but membership is never required to contribute.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const service = createServiceClient();

  const { data: event } = await service
    .from("contribution_events")
    .select("id, status")
    .eq("slug", slug)
    .maybeSingle();

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  if (event.status !== "open") {
    return NextResponse.json(
      { error: "This contribution drive is closed." },
      { status: 409 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const name = String(form.get("contributor_name") ?? "").trim();
  const phone = String(form.get("contributor_phone") ?? "").trim();
  const amount = Number(form.get("amount"));
  const paidAtRaw = String(form.get("paid_at") ?? "").trim();
  const note = String(form.get("note") ?? "").trim();
  const receipt = form.get("receipt");

  if (!name) {
    return NextResponse.json({ error: "Your name is required." }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "Enter a valid amount." },
      { status: 400 }
    );
  }
  // Guard against a future-dated receipt, matching the dues submit rule.
  const paidAt = /^\d{4}-\d{2}-\d{2}$/.test(paidAtRaw) ? paidAtRaw : null;
  if (paidAt && paidAt > new Date().toISOString().slice(0, 10)) {
    return NextResponse.json(
      { error: "Date paid cannot be in the future." },
      { status: 400 }
    );
  }

  let receiptPath: string | null = null;
  if (receipt instanceof File && receipt.size > 0) {
    // Defence in depth: the client compresses to ~0.5MB, but a direct POST
    // could send anything, so cap server-side too.
    if (receipt.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Receipt image is too large." },
        { status: 413 }
      );
    }
    if (!receipt.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Receipt must be an image." },
        { status: 415 }
      );
    }
    const safeName = receipt.name.replace(/[^\w.-]/g, "_").slice(-60);
    const path = `${event.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await service.storage
      .from("event-receipts")
      .upload(path, receipt, { contentType: receipt.type });
    if (uploadError) {
      return NextResponse.json(
        { error: "Could not upload the receipt. Please try again." },
        { status: 500 }
      );
    }
    receiptPath = path;
  }

  // Link a signed-in member if there is a session on this request; a guest
  // simply has no session and stays unlinked.
  let memberId: string | null = null;
  try {
    const cookieClient = await createClient();
    const {
      data: { user },
    } = await cookieClient.auth.getUser();
    if (user) {
      const { data: member } = await cookieClient
        .from("members")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      memberId = member?.id ?? null;
    }
  } catch {
    // No session / cookie issues — treat as a guest.
  }

  const { error: insertError } = await service
    .from("event_contributions")
    .insert({
      event_id: event.id,
      member_id: memberId,
      contributor_name: name,
      contributor_phone: phone || null,
      amount,
      paid_at: paidAt,
      receipt_url: receiptPath,
      note: note || null,
    });

  if (insertError) {
    return NextResponse.json(
      { error: "Could not record your contribution. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
