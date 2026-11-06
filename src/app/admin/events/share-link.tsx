"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// Copies the public share link to the clipboard. The absolute origin is read
// at click time (window.location.origin) so the same component works in
// local dev, preview, and production without any env wiring.
export function ShareLink({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}/events/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Share link copied.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (insecure context / permissions) — fall
      // back to showing the URL so the admin can copy it by hand.
      toast.message(url);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={copy}>
      {copied ? "Copied!" : "Copy share link"}
    </Button>
  );
}
