"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // se uno è già loggato e apre /login, mandalo subito dove deve andare
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;

      const uid = data.session.user.id;
      const { data: prof } = await supabase.from("profiles").select("is_admin").eq("id", uid).single();
      const isAdmin = !!prof?.is_admin;

      const next = new URLSearchParams(window.location.search).get("next");
      if (next) {
        window.location.href = next;
        return;
      }

      window.location.href = isAdmin ? "/admin/events" : "/events";
    })();
  }, []);

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    const em = email.trim().toLowerCase();
    if (!em || !password) {
      setErr("Inserisci email e password.");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: em,
        password,
      });

      if (error) throw new Error(error.message);
      if (!data.session) throw new Error("Login non riuscito (sessione mancante).");

      const uid = data.session.user.id;

      // leggi profilo e redireziona
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", uid)
        .single();

      if (profErr) throw new Error(profErr.message);

      const isAdmin = !!prof?.is_admin;

      // se esiste ?next=... vai lì, altrimenti routing standard
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next || (isAdmin ? "/admin/events" : "/events");
    } catch (e: any) {
      setErr(e?.message ?? "Errore login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* TOPBAR semplice */}
      <div className="topbar">
        <div className="topbar-inner">
          <div className="topbar-left">
            <img src="/logo.svg" alt="Villa logo" className="logo" />
          </div>
        </div>
        <div className="green-line" />
      </div>

      <div className="container" style={{ maxWidth: 560 }}>
        <div className="card card-pad" style={{ marginTop: 18 }}>
          <div className="h-serif" style={{ fontSize: 28, fontWeight: 900 }}>
            Accedi
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            Inserisci le credenziali ricevute.
          </div>

          {err && (
            <div
              className="card card-pad"
              style={{
                marginTop: 12,
                boxShadow: "none",
                borderColor: "rgba(239,68,68,.35)",
                color: "#b91c1c",
                background: "rgba(239,68,68,.06)",
              }}
            >
              {err}
            </div>
          )}

          <form onSubmit={doLogin} style={{ display: "grid", gap: 12, marginTop: 14 }}>
            <div>
              <div className="label">Email</div>
              <input
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={loading}
                placeholder="nome@email.com"
              />
            </div>

            <div>
              <div className="label">Password</div>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={loading}
                placeholder="••••••••"
              />
            </div>

            <button className="btn" disabled={loading}>
              {loading ? "Accesso..." : "Accedi"}
            </button>

            <div className="muted" style={{ fontSize: 12 }}>
              Se sei admin verrai portato nella dashboard. Gli sposi vanno nel planner.
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
