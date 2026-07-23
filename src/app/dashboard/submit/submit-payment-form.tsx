"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import imageCompression from "browser-image-compression";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";

function todayDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function SubmitPaymentForm({ memberId }: { memberId: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(todayDateString());
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const supabase = createClient();

    try {
      let receiptPath: string | null = null;

      // Receipt is optional (research §5) — a member can log a claimed
      // payment without a photo; the admin verify flow (M3) is still the
      // gate that actually confirms it.
      if (file) {
        const compressed = await imageCompression(file, {
          maxSizeMB: 0.5,
          maxWidthOrHeight: 1600,
          useWebWorker: true,
        });
        const path = `${memberId}/${crypto.randomUUID()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("receipts")
          .upload(path, compressed, { contentType: compressed.type });
        if (uploadError) throw uploadError;
        receiptPath = path;
      }

      const { error: insertError } = await supabase.from("payments").insert({
        member_id: memberId,
        amount: Number(amount),
        paid_at: paidAt,
        receipt_url: receiptPath,
        note: note || null,
        source: "member_submitted",
      });
      if (insertError) throw insertError;

      toast.success("Payment submitted — pending admin verification.");
      router.push("/dashboard/history");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
        <FieldLabel htmlFor="receipt">Receipt photo (optional)</FieldLabel>
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
          placeholder="e.g. covers May–July"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <Button type="submit" disabled={submitting}>
        {submitting ? "Submitting…" : "Submit payment"}
      </Button>
    </form>
  );
}
