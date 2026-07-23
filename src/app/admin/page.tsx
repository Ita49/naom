import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AdminHome() {
  return (
    <div className="flex flex-col gap-3 p-6">
      <h1 className="text-lg font-semibold">Admin Dashboard</h1>
      <p className="text-muted-foreground text-sm">
        Collection stats and arrears land here in M4.
      </p>
      <Button asChild className="w-fit">
        <Link href="/admin/queue">Verification queue</Link>
      </Button>
    </div>
  );
}
