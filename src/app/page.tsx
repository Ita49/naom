import { redirect } from "next/navigation";
import { getSessionRole } from "@/lib/auth";

export default async function Home() {
  const session = await getSessionRole();

  switch (session.role) {
    case "admin":
      redirect("/admin");
    case "member":
      redirect("/dashboard");
    case "unregistered":
      redirect("/onboarding");
    default:
      redirect("/login");
  }
}
