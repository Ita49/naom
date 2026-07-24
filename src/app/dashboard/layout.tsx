import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { NotificationPrompt } from "@/components/notification-prompt";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionRole();

  if (session.role === "unauthenticated") redirect("/login");
  if (session.role === "unregistered") redirect("/onboarding");
  if (session.role === "admin") redirect("/admin");

  return (
    <AppShell name={session.fullName}>
      <NotificationPrompt memberId={session.memberId} />
      {children}
    </AppShell>
  );
}
