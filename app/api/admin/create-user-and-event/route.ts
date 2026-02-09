import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Body = {
  email: string;
  password: string;
  full_name?: string;
  event_name: string;
  start_date?: string | null;
  end_date?: string | null;
};

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!url || !anon || !service) {
      return NextResponse.json({ error: "Missing env vars" }, { status: 500 });
    }

    // Client "normale" per validare il token dell'admin (RLS)
    const supabase = createClient(url, anon);

    // Client admin con service_role (bypassa RLS, può creare auth users)
    const supabaseAdmin = createClient(url, service);

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return NextResponse.json({ error: "Missing Authorization Bearer token" }, { status: 401 });
    }

    // Verifica chi sta chiamando
    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const adminId = userRes.user.id;

    // Controlla che sia admin (profiles.is_admin = true)
   const { data: prof, error: profErr } = await supabaseAdmin
  .from("profiles")
  .select("is_admin")
  .eq("id", adminId)
  .single();

if (profErr || !prof?.is_admin) {
  return NextResponse.json({ error: "Not allowed" }, { status: 403 });
}

    // Body
    const body = (await req.json()) as Body;
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";
    const full_name = (body.full_name || "").trim();
    const event_name = (body.event_name || "").trim();

    if (!email || !password || !event_name) {
      return NextResponse.json({ error: "Missing fields: email/password/event_name" }, { status: 400 });
    }

    // 1) Crea utente Auth
    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // così può loggare subito senza conferma email
      user_metadata: full_name ? { full_name } : {},
    });

    if (cErr || !created?.user) {
      return NextResponse.json({ error: cErr?.message ?? "Create user failed" }, { status: 400 });
    }

    const newUserId = created.user.id;

    // (opzionale) salva nome in profiles (se vuoi)
    // Se hai trigger handle_new_user, la riga profiles viene creata da sola.
    // Qui aggiorniamo solo full_name se la colonna esiste:
    if (full_name) {
      await supabaseAdmin.from("profiles").update({ full_name }).eq("id", newUserId);
    }

    // 2) Crea evento "del cliente" (created_by = utente creato)
    const { data: ev, error: evErr } = await supabaseAdmin
      .from("events")
      .insert({
        name: event_name,
        start_date: body.start_date ?? null,
        end_date: body.end_date ?? null,
        created_by: newUserId,
        status: "draft",
      })
      .select("id")
      .single();

    if (evErr || !ev?.id) {
      return NextResponse.json({ error: evErr?.message ?? "Create event failed" }, { status: 400 });
    }

    // 3) (consigliato) aggiungi anche in event_members per compatibilità con le tue policy
    await supabaseAdmin.from("event_members").insert({
      event_id: ev.id,
      user_id: newUserId,
      role: "client",
    });

    return NextResponse.json({
      ok: true,
      user_id: newUserId,
      event_id: ev.id,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
