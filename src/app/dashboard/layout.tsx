import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionRole();

  if (session.role === "unauthenticated") redirect("/login");
  if (session.role === "unregistered") redirect("/not-registered");
  if (session.role === "admin") redirect("/admin");

  return <AppShell name={session.fullName}>{children}</AppShell>;
}
