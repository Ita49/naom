"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type MemberOption = { id: string; full_name: string };

// Random, unguessable token for the share link. Not derived from the title
// so it never leaks the beneficiary's identity, and short enough to paste.
function makeSlug() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 14);
}

export function CreateEventDialog({ members }: { members: MemberOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [beneficiaryMemberId, setBeneficiaryMemberId] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [goal, setGoal] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setTitle("");
      setDescription("");
      setBeneficiaryMemberId("");
      setBeneficiaryName("");
      setGoal("");
    }
  }

  async function handleCreate() {
    if (!title.trim()) {
      toast.error("A title is required.");
      return;
    }
    const goalAmount = goal ? Number(goal) : null;
    if (goalAmount !== null && (!Number.isFinite(goalAmount) || goalAmount <= 0)) {
      toast.error("Goal must be a positive amount, or left blank.");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();

    // Retry once on the (rare) slug collision — the unique index is the
    // real guard; this just avoids surfacing it to the admin.
    let lastError: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data, error } = await supabase
        .from("contribution_events")
        .insert({
          slug: makeSlug(),
          title: title.trim(),
          description: description.trim() || null,
          beneficiary_member_id: beneficiaryMemberId || null,
          beneficiary_name: beneficiaryName.trim() || null,
          goal_amount: goalAmount,
        })
        .select("id")
        .single();

      if (!error && data) {
        setSubmitting(false);
        setOpen(false);
        toast.success("Event created.");
        router.push(`/admin/events/${data.id}`);
        router.refresh();
        return;
      }
      lastError = error?.message ?? "Could not create the event.";
    }

    setSubmitting(false);
    toast.error(lastError ?? "Could not create the event.");
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">New event</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a contribution event</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="event-title">
              Title
            </label>
            <Input
              id="event-title"
              placeholder="e.g. Support for Sgt. Bello"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="event-beneficiary">
              Beneficiary — a member (optional)
            </label>
            <select
              id="event-beneficiary"
              className="border-input bg-transparent dark:bg-input/30 h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs"
              value={beneficiaryMemberId}
              onChange={(e) => setBeneficiaryMemberId(e.target.value)}
            >
              <option value="">— none / general cause —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </div>

          {!beneficiaryMemberId && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" htmlFor="event-beneficiary-name">
                Or a beneficiary name (optional)
              </label>
              <Input
                id="event-beneficiary-name"
                placeholder="e.g. a non-member, or a cause"
                value={beneficiaryName}
                onChange={(e) => setBeneficiaryName(e.target.value)}
              />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="event-desc">
              Description (optional)
            </label>
            <Textarea
              id="event-desc"
              placeholder="What the contribution is for; how to pay (account details)."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="event-goal">
              Goal amount ₦ (optional)
            </label>
            <Input
              id="event-goal"
              type="number"
              min="1"
              step="1"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button disabled={submitting} onClick={handleCreate}>
            {submitting ? "Creating…" : "Create event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
