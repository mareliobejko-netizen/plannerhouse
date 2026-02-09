import { supabase } from "@/lib/supabaseClient";

export async function requireAdminOrRedirect(): Promise<{ userId: string }> {
  const { data: u, error: uErr } = await supabase.auth.getUser();
  if (uErr) throw new Error(uErr.message);
  if (!u?.user) {
    window.location.href = "/login";
    throw new Error("Not logged in");
  }

  const { data: prof, error: pErr } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", u.user.id)
    .single();

  if (pErr) throw new Error(pErr.message);
  if (!prof?.is_admin) {
    window.location.href = "/events";
    throw new Error("Not admin");
  }

  return { userId: u.user.id };
}
