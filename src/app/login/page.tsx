import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await getSessionRole();
  if (session.role !== "unauthenticated") {
    redirect("/");
  }

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden p-6">
      <div
        aria-hidden
        className="bg-camo absolute inset-0 opacity-35 dark:opacity-45"
      />
      <Card className="relative w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to NAOM Dues</CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
