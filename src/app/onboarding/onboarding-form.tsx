"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";

export function OnboardingForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setSubmitting(false);
      toast.error("Your session expired — please sign in again.");
      router.push("/login");
      return;
    }

    const { error } = await supabase.from("members").insert({
      auth_user_id: user.id,
      email: user.email,
      full_name: fullName.trim(),
      phone: phone.trim() || null,
    });

    setSubmitting(false);

    // A duplicate auth_user_id means this account already has a member
    // row (e.g. a double submit) — treat that as success rather than
    // an error, since the outcome the user wants already happened.
    if (error && error.code !== "23505") {
      toast.error(error.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="full-name">Full name</FieldLabel>
        <Input
          id="full-name"
          placeholder="Your full name"
          required
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="phone">Phone (optional)</FieldLabel>
        <Input
          id="phone"
          type="tel"
          placeholder="080…"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </Field>
      <Button type="submit" disabled={submitting}>
        {submitting ? "Setting up…" : "Continue"}
      </Button>
    </form>
  );
}
