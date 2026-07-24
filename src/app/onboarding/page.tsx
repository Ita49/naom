import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const session = await getSessionRole();

  if (session.role === "unauthenticated") redirect("/login");
  if (session.role === "admin") redirect("/admin");
  if (session.role === "member") redirect("/dashboard");

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4 text-sm">
            You&apos;re signed in as {session.email}. Tell us your name to
            finish setting up your account.
          </p>
          <OnboardingForm />
        </CardContent>
      </Card>
    </div>
  );
}
