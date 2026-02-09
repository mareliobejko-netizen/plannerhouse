"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type EventRow = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: "draft" | "submitted" | "final";
  created_at: string;
};

const WEBSITE_URL = "https://agriturismodogana.it"; // TODO: cambia
const INSTAGRAM_URL = "https://instagram.com/"; // TODO: cambia
const FACEBOOK_URL = "https://facebook.com/"; // TODO: cambia

function IconGlobe(props: { size?: number }) {
  const s = props.size ?? 18;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M2 12h20"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M12 2c3 2.9 5 6.4 5 10s-2 7.1-5 10c-3-2.9-5-6.4-5-10s2-7.1 5-10Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconInstagram(props: { size?: number }) {
  const s = props.size ?? 18;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M12 16.2a4.2 4.2 0 1 0-4.2-4.2A4.2 4.2 0 0 0 12 16.2Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M17.6 6.6h.01"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconFacebook(props: { size?: number }) {
  const s = props.size ?? 18;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 8.5V7.2c0-.9.6-1.2 1.2-1.2H17V2.8h-2.7c-2.9 0-4.3 1.8-4.3 4.2v1.5H7v3.2h3V22h4v-10.3h3l.7-3.2H14Z"
        fill="currentColor"
      />
    </svg>
  );
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return d;
}

function statusBadge(status: EventRow["status"]) {
  if (status === "draft") return { text: "Bozza", cls: "badge draft" };
  if (status === "submitted") return { text: "Inviata", cls: "badge submitted" };
  return { text: "Completa", cls: "badge final" };
}

export default function EventsHomePage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [event, setEvent] = useState<EventRow | null>(null);

  async function loadMySingleEvent(uid: string) {
    // 1) prova come owner (created_by)
    const owned = await supabase
      .from("events")
      .select("id,name,start_date,end_date,status,created_at")
      .eq("created_by", uid)
      .order("created_at", { ascending: false })
      .limit(1);

    if (owned.error) throw new Error(owned.error.message);
    if (owned.data && owned.data.length > 0) return owned.data[0] as EventRow;

    // 2) fallback: membership
    const mem = await supabase
      .from("event_members")
      .select("event_id")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(1);

    if (mem.error) throw new Error(mem.error.message);
    const eventId = mem.data?.[0]?.event_id;
    if (!eventId) return null;

    const ev = await supabase
      .from("events")
      .select("id,name,start_date,end_date,status,created_at")
      .eq("id", eventId)
      .single();

    if (ev.error) throw new Error(ev.error.message);
    return ev.data as EventRow;
  }

  useEffect(() => {
    (async () => {
      try {
        setErr(null);
        const { data } = await supabase.auth.getSession();
        const session = data.session;

        if (!session) {
          window.location.href = "/login";
          return;
        }

        const uid = session.user.id;

        // admin? -> admin dashboard
        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("id", uid)
          .single();

        if (profErr) throw new Error(profErr.message);
        if (prof?.is_admin) {
          window.location.href = "/admin/events";
          return;
        }

        const e = await loadMySingleEvent(uid);
        setEvent(e);
      } catch (e: any) {
        setErr(e?.message ?? "Errore caricamento");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <>
      {/* TOPBAR */}
      <div className="topbar">
        <div className="topbar-inner">
          <div className="topbar-left">
            <img src="/logo.svg" alt="Villa logo" className="logo" />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <a className="btn-ghost" href={WEBSITE_URL} target="_blank" rel="noreferrer">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <IconGlobe /> Sito
              </span>
            </a>

            <a className="btn-ghost" href={INSTAGRAM_URL} target="_blank" rel="noreferrer">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <IconInstagram /> Instagram
              </span>
            </a>

            <a className="btn-ghost" href={FACEBOOK_URL} target="_blank" rel="noreferrer">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <IconFacebook /> Facebook
              </span>
            </a>

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
        {/* HERO */}
        <div className="card card-pad" style={{ padding: 18 }}>
          <div className="h-serif" style={{ fontSize: 34, fontWeight: 900, lineHeight: 1.05 }}>
            Benvenuti nella vostra area riservata
          </div>

          <div className="muted" style={{ marginTop: 10, fontSize: 15, lineHeight: 1.75, maxWidth: 980 }}>
            Siamo felici che abbiate scelto la nostra villa per un momento così speciale.
            Questa pagina è pensata per rendere semplice e ordinata la gestione degli appartamenti e degli ospiti: potrete
            inserire i nominativi, indicare eventuali esigenze (come allergie o intolleranze), e assegnare le persone alle camere
            in modo chiaro e veloce.
            <br /><br />
            Il nostro obiettivo è farvi vivere l’organizzazione con serenità: ci impegniamo a soddisfare tutte le vostre richieste
            e a supportarvi in ogni passaggio, così che possiate concentrarvi su ciò che conta davvero.
            Se avete dubbi o necessità particolari, potete contattarci tramite i nostri canali ufficiali qui sopra.
            <br /><br />
            Grazie ancora per la fiducia — siamo pronti ad accogliervi!
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
            <span className="badge draft">Suggerimento</span>
            <span className="muted" style={{ fontSize: 13 }}>
              Aprite il planner e iniziate ad aggiungere gli ospiti. Quando avete finito, inviate la lista.
            </span>
          </div>
        </div>

        {/* CONTENT */}
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

        {loading ? (
          <div className="card card-pad" style={{ marginTop: 12 }}>
            <div className="muted">Caricamento…</div>
          </div>
        ) : !event ? (
          <div className="card card-pad" style={{ marginTop: 12 }}>
            <div className="h-serif" style={{ fontSize: 18, fontWeight: 900 }}>
              Nessun evento trovato
            </div>
            <div className="muted" style={{ marginTop: 6 }}>
              Se pensate sia un errore, contattate l’amministrazione della struttura.
            </div>
          </div>
        ) : (
          <div className="card card-pad" style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <div className="h-serif" style={{ fontSize: 22, fontWeight: 900 }}>
                  Il vostro evento
                </div>
                <div className="muted" style={{ marginTop: 6 }}>
                  {event.name} • {fmtDate(event.start_date)} → {fmtDate(event.end_date)}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                {(() => {
                  const b = statusBadge(event.status);
                  return <span className={b.cls}>Stato: {b.text}</span>;
                })()}

                <button className="btn" onClick={() => (window.location.href = `/events/${event.id}`)}>
                  Apri Planner
                </button>
              </div>
            </div>

            <div className="muted" style={{ marginTop: 12, fontSize: 13, lineHeight: 1.7 }}>
              Nel planner potete cliccare sugli appartamenti per vedere foto e dettagli, aggiungere ospiti e gestire le assegnazioni.
              Quando siete pronti, inviate la lista: dopo l’invio non sarà più modificabile (a meno che l’admin non la riapra).
            </div>
          </div>
        )}

        {/* FOOTER NOTE */}
        <div className="muted" style={{ marginTop: 14, fontSize: 12, textAlign: "center" }}>
          © {new Date().getFullYear()} • Area riservata • Tutti i dati sono gestiti in sicurezza
        </div>
      </div>
    </>
  );
}
