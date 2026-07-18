import { createClient } from "@/lib/supabase/server";

export type SessionRole =
  | { role: "unauthenticated" }
  | { role: "admin"; adminId: string; fullName: string }
  | { role: "member"; memberId: string; fullName: string }
  | { role: "unregistered"; email: string | null };

export async function getSessionRole(): Promise<SessionRole> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { role: "unauthenticated" };

  const { data: admin } = await supabase
    .from("admins")
    .select("id, full_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (admin) {
    return { role: "admin", adminId: admin.id, fullName: admin.full_name };
  }

  const { data: member } = await supabase
    .from("members")
    .select("id, full_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (member) {
    return { role: "member", memberId: member.id, fullName: member.full_name };
  }

  return { role: "unregistered", email: user.email ?? null };
}
