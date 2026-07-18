import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignOutButton } from "@/components/sign-out-button";

export default async function NotRegisteredPage() {
  const session = await getSessionRole();

  if (session.role === "unauthenticated") redirect("/login");
  if (session.role === "admin") redirect("/admin");
  if (session.role === "member") redirect("/dashboard");

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Not registered yet</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            {session.email} isn&apos;t linked to a member or admin record yet.
            Ask the treasurer to add you, then sign in again.
          </p>
          <SignOutButton />
        </CardContent>
      </Card>
    </div>
  );
}
