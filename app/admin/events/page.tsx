"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { requireAdminOrRedirect } from "@/lib/requireAdmin";

type EventRow = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: "draft" | "submitted" | "final";
  created_at: string;
  created_by: string;
};

function badgeStyle(status: EventRow["status"]) {
  if (status === "draft") return { bg: "rgba(192,208,176,.25)", col: "var(--olive)" };
  if (status === "submitted") return { bg: "rgba(234,179,8,.18)", col: "var(--olive)" };
  return { bg: "rgba(34,197,94,.18)", col: "var(--olive)" };
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return d;
}

export default function AdminEventsPage() {
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "submitted" | "final">("all");

  // Create user + event form
  const [newEmail, setNewEmail] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newName, setNewName] = useState("");
  const [newEventName, setNewEventName] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");

  const [createMsg, setCreateMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      await requireAdminOrRedirect();

      let query = supabase
        .from("events")
        .select("id,name,start_date,end_date,status,created_at,created_by")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") query = query.eq("status", statusFilter);

      const qq = q.trim();
      if (qq.length >= 2) query = query.ilike("name", `%${qq}%`);

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      setRows((data ?? []) as EventRow[]);
    } catch (e: any) {
      setErr(e?.message ?? "Errore caricamento eventi");
    } finally {
      setLoading(false);
    }
  }

  async function createUserAndEvent() {
    setCreateMsg(null);

    const email = newEmail.trim().toLowerCase();
    const password = newPass;
    const eventName = newEventName.trim();

    if (!email || !password || !eventName) {
      setCreateMsg({ type: "err", text: "Compila almeno: Email, Password, Nome evento." });
      return;
    }
    if (password.length < 6) {
      setCreateMsg({ type: "err", text: "Password troppo corta (min 6 caratteri)." });
      return;
    }

    setCreating(true);
    try {
      await requireAdminOrRedirect();

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sessione scaduta. Rifai login.");

      const res = await fetch("/api/admin/create-user-and-event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email,
          password,
          full_name: newName.trim() || undefined,
          event_name: eventName,
          start_date: newStart || null,
          end_date: newEnd || null,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Errore creazione");

      setCreateMsg({
        type: "ok",
        text: `Creato! Evento: ${json.event_id} • Utente: ${json.user_id}`,
      });

      // reset form
      setNewEmail("");
      setNewPass("");
      setNewName("");
      setNewEventName("");
      setNewStart("");
      setNewEnd("");

      // refresh list
      await load();
    } catch (e: any) {
      setCreateMsg({ type: "err", text: e?.message ?? "Errore creazione" });
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const filtered = useMemo(() => rows, [rows]);

  return (
    <>
      {/* TOPBAR */}
      <div className="topbar">
        <div className="topbar-inner">
          <div className="topbar-left">
            <img src="/logo.svg" className="logo" alt="Villa logo" />
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span className="badge draft">Admin</span>
            <button className="btn-ghost" onClick={() => (window.location.href = "/events")}>
              Area clienti
            </button>
            <button
              className="btn-ghost"
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = "/login";
              }}
            >
              Logout
            </button>
          </div>
        </div>
        <div className="green-line" />
      </div>

      <div className="container">
        {/* HEADER */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div className="h-serif" style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.05 }}>
              Eventi
            </div>
            <div className="muted" style={{ marginTop: 6 }}>
              Gestione matrimoni — crea utenti e controlla le liste
            </div>
          </div>

          {/* FILTERS */}
          <div className="card card-pad" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              className="input"
              style={{ width: 240 }}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cerca nome evento…"
              onKeyDown={(e) => {
                if (e.key === "Enter") load();
              }}
            />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} style={{ width: 190 }}>
              <option value="all">Tutti gli stati</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="final">Final</option>
            </select>
            <button className="btn-ghost" onClick={load}>
              Aggiorna
            </button>
          </div>
        </div>

        {/* ERR */}
        {err && (
          <div
            className="card card-pad"
            style={{
              marginTop: 12,
              borderColor: "rgba(239,68,68,.35)",
              color: "#b91c1c",
              background: "rgba(239,68,68,.06)",
            }}
          >
            {err}
          </div>
        )}

        {/* CREATE USER + EVENT */}
        <div className="card card-pad" style={{ marginTop: 12 }}>
          <div className="h-serif" style={{ fontSize: 18, fontWeight: 900 }}>
            Crea utente + evento
          </div>
          <div className="muted" style={{ marginTop: 4 }}>
            Genera account per gli sposi e collega subito l’evento (stato: draft).
          </div>

          {createMsg && (
            <div
              className="card card-pad"
              style={{
                marginTop: 12,
                boxShadow: "none",
                borderColor: createMsg.type === "ok" ? "rgba(34,197,94,.35)" : "rgba(239,68,68,.35)",
                color: createMsg.type === "ok" ? "#166534" : "#b91c1c",
                background: createMsg.type === "ok" ? "rgba(34,197,94,.08)" : "rgba(239,68,68,.06)",
              }}
            >
              {createMsg.text}
            </div>
          )}

          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div className="label">Nome completo (opz.)</div>
                <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} disabled={creating} />
              </div>
              <div>
                <div className="label">Email</div>
                <input className="input" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} disabled={creating} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div className="label">Password temporanea</div>
                <input className="input" type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} disabled={creating} />
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Suggerimento: poi gli sposi possono cambiarla (se vuoi lo aggiungiamo dopo).
                </div>
              </div>
              <div>
                <div className="label">Nome evento</div>
                <input
                  className="input"
                  value={newEventName}
                  onChange={(e) => setNewEventName(e.target.value)}
                  disabled={creating}
                  placeholder="Es. Matrimonio Rossi"
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div className="label">Start date (opz.)</div>
                <input className="input" type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} disabled={creating} />
              </div>
              <div>
                <div className="label">End date (opz.)</div>
                <input className="input" type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} disabled={creating} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btn" onClick={createUserAndEvent} disabled={creating}>
                {creating ? "Creazione..." : "Crea"}
              </button>

              <button
                className="btn-ghost"
                onClick={() => {
                  setCreateMsg(null);
                  setNewEmail("");
                  setNewPass("");
                  setNewName("");
                  setNewEventName("");
                  setNewStart("");
                  setNewEnd("");
                }}
                disabled={creating}
              >
                Pulisci
              </button>
            </div>
          </div>
        </div>

        {/* EVENTS LIST */}
        <div className="card card-pad" style={{ marginTop: 12 }}>
          <div className="h-serif" style={{ fontSize: 18, fontWeight: 900, marginBottom: 10 }}>
            Lista eventi
          </div>

          {loading ? (
            <div className="muted">Caricamento…</div>
          ) : filtered.length === 0 ? (
            <div className="muted">Nessun evento trovato.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {filtered.map((ev) => {
                const b = badgeStyle(ev.status);

                return (
                  <div
                    key={ev.id}
                    style={{
                      border: "1px solid rgba(48,64,48,.12)",
                      borderRadius: 16,
                      padding: 12,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 900 }}>{ev.name}</div>
                      <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                        {fmtDate(ev.start_date)} → {fmtDate(ev.end_date)} • Creato: {new Date(ev.created_at).toLocaleString()}
                      </div>
                      <div className="muted" style={{ marginTop: 4, fontSize: 12 }}>
                        Owner: <span style={{ fontFamily: "monospace" }}>{ev.created_by}</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <span className="badge" style={{ background: b.bg, color: b.col }}>
                        {ev.status}
                      </span>

                      <button className="btn-ghost" onClick={() => (window.location.href = `/events/${ev.id}`)}>
                        Apri come cliente
                      </button>

                      <button className="btn" onClick={() => (window.location.href = `/admin/events/${ev.id}`)}>
                        Apri riepilogo
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
