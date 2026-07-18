import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionRole();

  if (session.role === "unauthenticated") redirect("/login");
  if (session.role === "unregistered") redirect("/not-registered");
  if (session.role === "member") redirect("/dashboard");

  return <AppShell name={`${session.fullName} · Admin`}>{children}</AppShell>;
}
