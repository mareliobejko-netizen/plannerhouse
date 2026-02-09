"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { requireAdminOrRedirect } from "@/lib/requireAdmin";

type OccRow = {
  event_id: string;
  apartment_id: string;
  capacity: number;
  guests_count: number;
  structure: string;
  floor: number;
};

type GuestRow = {
  id: string;
  event_id: string;
  apartment_id: string | null;
  first_name: string;
  last_name: string;
  guest_type: "adult" | "child";
  child_age: number | null;
  arrival_mode: "car" | "transfer" | null;
  checkin_date: string | null;
  checkout_date: string | null;
  extra_nights: number;
  allergies: string | null;
  notes: string | null;
};

type EvRow = {
  id: string;
  name: string;
  status: "draft" | "submitted" | "final";
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  created_by: string;
  submitted_at: string | null;
  submitted_by: string | null;
};

function friendlyAptLabel(aptId: string) {
  if (aptId === "apt_wc") return "Woodcutter’s House";
  return `Apartment ${aptId.replace("apt_", "")}`;
}

function guestLabel(g: GuestRow) {
  const base = `${g.first_name} ${g.last_name}`;
  if (g.guest_type === "child") return `${base} (bambino${g.child_age != null ? `, ${g.child_age}` : ""})`;
  return `${base} (adulto)`;
}

function toCsvCell(v: any) {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function badgeStyle(status: EvRow["status"]) {
  if (status === "draft") return { bg: "rgba(192,208,176,.25)", col: "var(--olive)" };
  if (status === "submitted") return { bg: "rgba(234,179,8,.18)", col: "var(--olive)" };
  return { bg: "rgba(34,197,94,.18)", col: "var(--olive)" };
}

function fmt(d: string | null) {
  return d ?? "—";
}

export default function AdminEventPage() {
  const params = useParams();
  const eventId = params?.eventId as string | undefined;

  const [err, setErr] = useState<string | null>(null);
  const [ev, setEv] = useState<EvRow | null>(null);
  const [occ, setOcc] = useState<OccRow[]>([]);
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [loading, setLoading] = useState(true);

  // status change
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      await requireAdminOrRedirect();
      if (!eventId) throw new Error("eventId mancante nella route");

      const [evRes, occRes, gRes] = await Promise.all([
        supabase
          .from("events")
          .select("id,name,status,start_date,end_date,created_at,created_by,submitted_at,submitted_by")
          .eq("id", eventId)
          .single(),
        supabase
          .from("apartment_occupancy")
          .select("event_id,apartment_id,capacity,guests_count,structure,floor")
          .eq("event_id", eventId),
        supabase
          .from("guests")
          .select(
            "id,event_id,apartment_id,first_name,last_name,guest_type,child_age,arrival_mode,checkin_date,checkout_date,extra_nights,allergies,notes"
          )
          .eq("event_id", eventId)
          .order("last_name", { ascending: true }),
      ]);

      if (evRes.error) throw new Error(evRes.error.message);
      if (occRes.error) throw new Error(occRes.error.message);
      if (gRes.error) throw new Error(gRes.error.message);

      setEv(evRes.data as EvRow);
      setOcc((occRes.data ?? []) as OccRow[]);
      setGuests((gRes.data ?? []) as GuestRow[]);
    } catch (e: any) {
      setErr(e?.message ?? "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const occInfo = useMemo(() => {
    const m = new Map<string, OccRow>();
    occ.forEach((o) => m.set(o.apartment_id, o));
    return m;
  }, [occ]);

  const orderedApts = useMemo(() => {
    return [...occ]
      .sort((a, b) => {
        const s = a.structure.localeCompare(b.structure);
        if (s !== 0) return s;
        const f = a.floor - b.floor;
        if (f !== 0) return f;
        return a.apartment_id.localeCompare(b.apartment_id);
      })
      .map((o) => o.apartment_id);
  }, [occ]);

  const unassigned = useMemo(() => guests.filter((g) => !g.apartment_id), [guests]);

  const guestsByApt = useMemo(() => {
    const m = new Map<string, GuestRow[]>();
    guests.forEach((g) => {
      const key = g.apartment_id ?? "__unassigned";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(g);
    });
    for (const [k, v] of m.entries()) {
      v.sort((a, b) => a.last_name.localeCompare(b.last_name));
      m.set(k, v);
    }
    return m;
  }, [guests]);

  const totalGuests = guests.length;
  const badge = ev ? badgeStyle(ev.status) : null;

  async function setStatusAdmin(nextStatus: "draft" | "submitted" | "final") {
    if (!eventId) return;
    setStatusMsg(null);

    const ok = confirm(`Cambiare stato evento in "${nextStatus}"?`);
    if (!ok) return;

    setStatusBusy(true);
    try {
      const { error } = await supabase.rpc("admin_set_event_status", {
        p_event_id: eventId,
        p_status: nextStatus,
      });
      if (error) throw new Error(error.message);

      setStatusMsg({ type: "ok", text: `✅ Stato aggiornato a "${nextStatus}".` });
      await load();
    } catch (e: any) {
      setStatusMsg({ type: "err", text: `❌ ${e?.message ?? "Errore"}` });
    } finally {
      setStatusBusy(false);
    }
  }

  function exportCsv() {
    if (!ev) return;

    const headers = [
      "event_id",
      "event_name",
      "event_status",
      "structure",
      "floor",
      "apartment_id",
      "apartment_label",
      "first_name",
      "last_name",
      "guest_type",
      "child_age",
      "arrival_mode",
      "checkin_date",
      "checkout_date",
      "extra_nights",
      "allergies",
      "notes",
    ];

    const lines: string[] = [];
    lines.push(headers.map(toCsvCell).join(","));

    guests.forEach((g) => {
      const o = g.apartment_id ? occInfo.get(g.apartment_id) : null;

      const row = [
        ev.id,
        ev.name,
        ev.status,
        o?.structure ?? "",
        o?.floor ?? "",
        g.apartment_id ?? "",
        g.apartment_id ? friendlyAptLabel(g.apartment_id) : "NON ASSEGNATO",
        g.first_name,
        g.last_name,
        g.guest_type,
        g.child_age ?? "",
        g.arrival_mode ?? "",
        g.checkin_date ?? "",
        g.checkout_date ?? "",
        g.extra_nights ?? 0,
        g.allergies ?? "",
        g.notes ?? "",
      ];
      lines.push(row.map(toCsvCell).join(","));
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `event_${ev.id}_guests.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportPrettyReportHtml() {
    if (!ev) return;

    const esc = (s: any) =>
      String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");

    const unassignedCount = (guestsByApt.get("__unassigned") ?? []).length;

    const html = `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(ev.name)} - Report Ospiti</title>
  <style>
    :root{
      --bg:#F7F5F0; --card:#fff; --text:#2b2b25; --muted:#6B6B5F;
      --olive:#304030; --border:rgba(48,64,48,.18);
    }
    body{ margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
      background:var(--bg); color:var(--text); }
    .wrap{ max-width: 980px; margin: 0 auto; padding: 24px 16px; }
    .header{ background: var(--card); border:1px solid var(--border); border-radius:18px; padding:18px; }
    h1{ margin:0; font-size: 26px; }
    .muted{ color: var(--muted); margin-top:6px; line-height:1.5; }
    .grid{ display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px; margin-top:12px; }
    .pill{ border:1px solid var(--border); border-radius:999px; padding:8px 10px; background:#fff; font-size:12px; }
    .section{ margin-top: 14px; background: var(--card); border:1px solid var(--border); border-radius:18px; padding:16px; }
    .sec-title{ display:flex; justify-content:space-between; align-items:baseline; gap:10px; flex-wrap:wrap; }
    .sec-title h2{ margin:0; font-size: 18px; }
    .cap{ font-weight:700; }
    table{ width:100%; border-collapse: collapse; margin-top: 10px; overflow:hidden; border-radius: 14px; }
    th, td{ border:1px solid rgba(48,64,48,.12); padding:8px 10px; font-size: 13px; vertical-align: top; }
    th{ background: rgba(192,208,176,.25); text-align:left; }
    .small{ font-size:12px; color:var(--muted); }
    @media print{
      body{ background:#fff; }
      .header, .section{ border-color:#ddd; }
      .wrap{ max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>Report Ospiti — ${esc(ev.name)}</h1>
      <div class="muted">
        Stato: <b>${esc(ev.status)}</b> • Date: <b>${esc(ev.start_date ?? "—")}</b> → <b>${esc(ev.end_date ?? "—")}</b><br/>
        Totale ospiti: <b>${esc(totalGuests)}</b> • Non assegnati: <b>${esc(unassignedCount)}</b>
      </div>
      <div class="grid">
        <div class="pill"><b>Evento ID:</b> <span class="small">${esc(ev.id)}</span></div>
        <div class="pill"><b>Creato:</b> ${esc(new Date(ev.created_at).toLocaleString())}</div>
        <div class="pill"><b>Export:</b> ${esc(new Date().toLocaleString())}</div>
      </div>
      <div class="muted small" style="margin-top:10px;">
        Suggerimento: apri questo file con Chrome → Stampa → Salva come PDF.
      </div>
    </div>

    ${orderedApts
      .map((aptId) => {
        const o = occInfo.get(aptId);
        const cap = o?.capacity ?? "?";
        const cnt = o?.guests_count ?? (guestsByApt.get(aptId)?.length ?? 0);
        const gList = guestsByApt.get(aptId) ?? [];

        const rows =
          gList.length === 0
            ? `<div class="muted" style="margin-top:10px;">Nessun ospite.</div>`
            : `<table>
                <thead>
                  <tr>
                    <th>Ospite</th>
                    <th>Arrivo</th>
                    <th>Check-in</th>
                    <th>Check-out</th>
                    <th>Extra</th>
                    <th>Allergie</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  ${gList
                    .map(
                      (g) => `<tr>
                        <td>${esc(guestLabel(g))}</td>
                        <td>${esc(g.arrival_mode ?? "—")}</td>
                        <td>${esc(g.checkin_date ?? "—")}</td>
                        <td>${esc(g.checkout_date ?? "—")}</td>
                        <td>${esc(g.extra_nights ?? 0)}</td>
                        <td>${esc(g.allergies ?? "—")}</td>
                        <td>${esc(g.notes ?? "—")}</td>
                      </tr>`
                    )
                    .join("")}
                </tbody>
              </table>`;

        return `<div class="section">
          <div class="sec-title">
            <h2>${esc(o?.structure ?? "")} • Piano ${esc(o?.floor ?? "")} • ${esc(friendlyAptLabel(aptId))}</h2>
            <div class="cap">${esc(cnt)}/${esc(cap)}</div>
          </div>
          ${rows}
        </div>`;
      })
      .join("")}

    ${
      (guestsByApt.get("__unassigned") ?? []).length > 0
        ? `<div class="section">
          <div class="sec-title">
            <h2>Non assegnati</h2>
            <div class="cap">${esc((guestsByApt.get("__unassigned") ?? []).length)}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Ospite</th>
                <th>Arrivo</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Extra</th>
                <th>Allergie</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              ${(guestsByApt.get("__unassigned") ?? [])
                .map(
                  (g) => `<tr>
                    <td>${esc(guestLabel(g))}</td>
                    <td>${esc(g.arrival_mode ?? "—")}</td>
                    <td>${esc(g.checkin_date ?? "—")}</td>
                    <td>${esc(g.checkout_date ?? "—")}</td>
                    <td>${esc(g.extra_nights ?? 0)}</td>
                    <td>${esc(g.allergies ?? "—")}</td>
                    <td>${esc(g.notes ?? "—")}</td>
                  </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>`
        : ""
    }
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `event_${ev.id}_report.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

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

            <button className="btn-ghost" onClick={() => (window.location.href = "/admin/events")}>
              ← Eventi
            </button>

            <button className="btn-ghost" onClick={exportPrettyReportHtml} disabled={!ev || loading}>
              Esporta Report (PDF)
            </button>

            <button className="btn" onClick={exportCsv} disabled={!ev || loading}>
              Esporta CSV
            </button>
          </div>
        </div>
        <div className="green-line" />
      </div>

      <div className="container">
        {err && (
          <div
            className="card card-pad"
            style={{
              marginBottom: 12,
              borderColor: "rgba(239,68,68,.35)",
              color: "#b91c1c",
              background: "rgba(239,68,68,.06)",
            }}
          >
            {err}
          </div>
        )}

        {statusMsg && (
          <div
            className="card card-pad"
            style={{
              marginBottom: 12,
              borderColor: statusMsg.type === "ok" ? "rgba(34,197,94,.35)" : "rgba(239,68,68,.35)",
              color: statusMsg.type === "ok" ? "#166534" : "#b91c1c",
              background: statusMsg.type === "ok" ? "rgba(34,197,94,.08)" : "rgba(239,68,68,.06)",
            }}
          >
            {statusMsg.text}
          </div>
        )}

        {loading || !ev ? (
          <div className="card card-pad">
            <div className="muted">{loading ? "Caricamento…" : "Evento non trovato."}</div>
          </div>
        ) : (
          <>
            {/* HEADER */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div className="h-serif" style={{ fontSize: 34, fontWeight: 900, lineHeight: 1.05 }}>
                  {ev.name}
                </div>
                <div className="muted" style={{ marginTop: 6 }}>
                  Stato:{" "}
                  <span className="badge" style={{ background: badge!.bg, color: badge!.col }}>
                    {ev.status}
                  </span>{" "}
                  • Date: <b>{fmt(ev.start_date)}</b> → <b>{fmt(ev.end_date)}</b> • Ospiti: <b>{totalGuests}</b> • Non assegnati:{" "}
                  <b>{unassigned.length}</b>
                </div>
              </div>

              {/* ADMIN STATUS ACTIONS */}
              <div className="card card-pad" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn-ghost" onClick={() => setStatusAdmin("draft")} disabled={statusBusy}>
                  Rimetti in bozza
                </button>
                <button className="btn-ghost" onClick={() => setStatusAdmin("submitted")} disabled={statusBusy}>
                  Segna consegnato
                </button>
                <button className="btn-ghost" onClick={() => setStatusAdmin("final")} disabled={statusBusy}>
                  Chiudi (final)
                </button>
                <button className="btn-ghost" onClick={load} disabled={statusBusy}>
                  Aggiorna
                </button>
              </div>
            </div>

            {/* UNASSIGNED */}
            {unassigned.length > 0 && (
              <div className="card card-pad" style={{ marginTop: 12 }}>
                <div className="h-serif" style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>
                  Non assegnati
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {unassigned.map((g) => (
                    <div key={g.id} style={{ border: "1px solid rgba(48,64,48,.12)", borderRadius: 14, padding: 10 }}>
                      <div style={{ fontWeight: 900 }}>{guestLabel(g)}</div>
                      <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                        Arrivo: {g.arrival_mode ?? "—"} • Check-in: {g.checkin_date ?? "—"} • Check-out: {g.checkout_date ?? "—"} • Extra:{" "}
                        {g.extra_nights ?? 0}
                      </div>
                      {(g.allergies || g.notes) && (
                        <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                          {g.allergies ? `Allergie: ${g.allergies}` : ""}
                          {g.allergies && g.notes ? " • " : ""}
                          {g.notes ? `Note: ${g.notes}` : ""}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SUMMARY PER APPARTAMENTO */}
            <div className="card card-pad" style={{ marginTop: 12 }}>
              <div className="h-serif" style={{ fontSize: 18, fontWeight: 900 }}>
                Appartamenti
              </div>
              <div className="muted" style={{ marginTop: 6 }}>
                Ogni sezione mostra gli ospiti e le informazioni principali (perfetto per controllo veloce).
              </div>

              <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                {orderedApts.map((aptId) => {
                  const o = occInfo.get(aptId);
                  const cap = o?.capacity ?? "?";
                  const cnt = o?.guests_count ?? (guestsByApt.get(aptId)?.length ?? 0);
                  const gList = guestsByApt.get(aptId) ?? [];

                  return (
                    <div key={aptId} style={{ border: "1px solid rgba(48,64,48,.12)", borderRadius: 16, padding: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 900 }}>
                          {o?.structure ?? "—"} • Piano {o?.floor ?? "—"} • {friendlyAptLabel(aptId)}
                        </div>
                        <span className="badge">{cnt}/{cap}</span>
                      </div>

                      {gList.length === 0 ? (
                        <div className="muted" style={{ marginTop: 8 }}>Nessun ospite.</div>
                      ) : (
                        <div style={{ overflowX: "auto", marginTop: 10 }}>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                              <tr>
                                <th style={th}>Ospite</th>
                                <th style={th}>Arrivo</th>
                                <th style={th}>Check-in</th>
                                <th style={th}>Check-out</th>
                                <th style={th}>Extra</th>
                                <th style={th}>Allergie</th>
                                <th style={th}>Note</th>
                              </tr>
                            </thead>
                            <tbody>
                              {gList.map((g) => (
                                <tr key={g.id}>
                                  <td style={td}><b>{guestLabel(g)}</b></td>
                                  <td style={td}>{g.arrival_mode ?? "—"}</td>
                                  <td style={td}>{g.checkin_date ?? "—"}</td>
                                  <td style={td}>{g.checkout_date ?? "—"}</td>
                                  <td style={td}>{g.extra_nights ?? 0}</td>
                                  <td style={td}>{g.allergies ?? "—"}</td>
                                  <td style={td}>{g.notes ?? "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  border: "1px solid rgba(48,64,48,.12)",
  background: "rgba(192,208,176,.25)",
  fontSize: 13,
};

const td: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid rgba(48,64,48,.10)",
  fontSize: 13,
  verticalAlign: "top",
};
