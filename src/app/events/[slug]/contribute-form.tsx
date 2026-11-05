"use client";

import { useState } from "react";
import { toast } from "sonner";
import imageCompression from "browser-image-compression";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";

function todayDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ContributeForm({ slug }: { slug: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(todayDateString());
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      const form = new FormData();
      form.set("contributor_name", name.trim());
      form.set("contributor_phone", phone.trim());
      form.set("amount", amount);
      form.set("paid_at", paidAt);
      form.set("note", note.trim());

      // Compress client-side before upload — same budget as the dues submit
      // flow (0.5MB / 1600px) so a phone photo of a transfer receipt stays
      // small over mobile data.
      if (file) {
        const compressed = await imageCompression(file, {
          maxSizeMB: 0.5,
          maxWidthOrHeight: 1600,
          useWebWorker: true,
        });
        form.set("receipt", compressed, file.name);
      }

      const res = await fetch(`/api/events/${slug}/contribute`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Something went wrong.");
      }

      setDone(true);
      toast.success("Contribution submitted — pending the treasurer's review.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <p className="font-medium">Thank you, {name || "friend"}!</p>
        <p className="text-muted-foreground">
          Your contribution has been recorded and is awaiting the treasurer&apos;s
          confirmation against the account. You can close this page.
        </p>
        <Button
          variant="outline"
          className="mt-1 w-fit"
          onClick={() => {
            setDone(false);
            setAmount("");
            setNote("");
            setFile(null);
          }}
        >
          Submit another
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="name">Your name</FieldLabel>
        <Input
          id="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="phone">Phone (optional)</FieldLabel>
        <Input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="amount">Amount (₦)</FieldLabel>
        <Input
          id="amount"
          type="number"
          min="1"
          step="1"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="paid_at">Date paid</FieldLabel>
        <Input
          id="paid_at"
          type="date"
          required
          max={todayDateString()}
          value={paidAt}
          onChange={(e) => setPaidAt(e.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="receipt">Receipt photo</FieldLabel>
        <Input
          id="receipt"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="note">Note (optional)</FieldLabel>
        <Textarea
          id="note"
          placeholder="e.g. transfer from GTBank ***1234"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <Button type="submit" disabled={submitting}>
        {submitting ? "Submitting…" : "Submit contribution"}
      </Button>
    </form>
  );
}
