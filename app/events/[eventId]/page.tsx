"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

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

type PlanKey = "lake0" | "lake1" | "wc";
type Status = "free" | "partial" | "full";

function statusOf(capacity: number, guests: number): Status {
  if (guests <= 0) return "free";
  if (guests >= capacity) return "full";
  return "partial";
}

async function loadSvg(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load SVG: ${url}`);
  return await res.text();
}

function friendlyAptLabel(aptId: string) {
  if (aptId === "apt_wc") return "Woodcutter’s House";
  return `Apartment ${aptId.replace("apt_", "")}`;
}

function guestLabel(g: GuestRow) {
  const base = `${g.first_name} ${g.last_name}`;
  if (g.guest_type === "child") {
    return `${base} (bambino${g.child_age != null ? `, ${g.child_age}` : ""})`;
  }
  return `${base} (adulto)`;
}

export default function EventPlannerPage() {
  const params = useParams();
  const eventId = params?.eventId as string | undefined;

  const [err, setErr] = useState<string | null>(null);
  const [uiMsg, setUiMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [eventStatus, setEventStatus] = useState<"draft" | "submitted" | "final">("draft");
  const statusLabel = eventStatus === "draft" ? "Bozza" : eventStatus === "submitted" ? "Inviata" : "Completa";
  const locked = eventStatus !== "draft";

  const [submitting, setSubmitting] = useState(false);

  // Occupancy
  const [occ, setOcc] = useState<OccRow[]>([]);

  // SVG
  const [activePlan, setActivePlan] = useState<PlanKey>("lake0");
  const [svgs, setSvgs] = useState<Record<PlanKey, string>>({ lake0: "", lake1: "", wc: "" });

  // Zoom
  const [zoom, setZoom] = useState(1);

  // Sidebar: unassigned
  const [unassigned, setUnassigned] = useState<GuestRow[]>([]);
  const [assignTo, setAssignTo] = useState<Record<string, string>>({});
  const [sidebarErr, setSidebarErr] = useState<string | null>(null);




  // Search
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<GuestRow[]>([]);

  // Modal
  const [openAptId, setOpenAptId] = useState<string | null>(null);
  const [aptGuests, setAptGuests] = useState<GuestRow[]>([]);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Photos
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [photoCache, setPhotoCache] = useState<Record<string, string[]>>({});

  // Form add guest
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [guestType, setGuestType] = useState<"adult" | "child">("adult");
  const [childAge, setChildAge] = useState<number | "">("");
  const [arrivalMode, setArrivalMode] = useState<"" | "car" | "transfer">("");
  const [checkinDate, setCheckinDate] = useState<string>("");
  const [checkoutDate, setCheckoutDate] = useState<string>("");
  const [eventStart, setEventStart] = useState<string>(""); // YYYY-MM-DD
const [eventEnd, setEventEnd] = useState<string>("");     // YYYY-MM-DD
//busta
const [confirmOpen, setConfirmOpen] = useState(false);
const [mailStage, setMailStage] = useState<"open" | "closing" | "closed">("open");


  const [extraNights, setExtraNights] = useState<number>(0);
  const [allergies, setAllergies] = useState("");
  const [notes, setNotes] = useState("");

  const statusMap = useMemo(() => {
    const m: Record<string, { status: Status; capacity: number; guests: number }> = {};
    for (const r of occ) {
      m[r.apartment_id] = {
        status: statusOf(r.capacity, r.guests_count),
        capacity: r.capacity,
        guests: r.guests_count,
      };
    }
    return m;
  }, [occ]);

  const apartmentOptions = useMemo(() => {
    const sorted = [...occ].sort((a, b) => {
      const s = a.structure.localeCompare(b.structure);
      if (s !== 0) return s;
      const f = a.floor - b.floor;
      if (f !== 0) return f;
      return a.apartment_id.localeCompare(b.apartment_id);
    });

    return sorted.map((r) => {
      const st = statusOf(r.capacity, r.guests_count);
      const label = `${r.structure} • ${friendlyAptLabel(r.apartment_id)} • ${r.guests_count}/${r.capacity}`;
      return { id: r.apartment_id, label, status: st };
    });
  }, [occ]);
function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysIso(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return isoDate(dt);
}

  function resetForm() {
    setFirstName("");
    setLastName("");
    setGuestType("adult");
    setChildAge("");
    setArrivalMode("");
    setCheckinDate("");
    setCheckoutDate("");
    setExtraNights(0);
    setAllergies("");
    setNotes("");
  }

  async function refreshEventStatus() {
    if (!eventId) return;
    const { data, error } = await supabase.from("events").select("status").eq("id", eventId).single();
    if (error) throw new Error(error.message);
    if (data?.status) setEventStatus(data.status);
  }

  async function refreshOccupancy() {
    if (!eventId) return;
    const { data, error } = await supabase
      .from("apartment_occupancy")
      .select("event_id,apartment_id,capacity,guests_count,structure,floor")
      .eq("event_id", eventId);

    if (error) throw new Error(error.message);
    setOcc((data ?? []) as OccRow[]);
  }

  async function loadUnassigned(usingOcc?: OccRow[]) {
    if (!eventId) return;

    const { data, error } = await supabase
      .from("guests")
      .select(
        "id,event_id,apartment_id,first_name,last_name,guest_type,child_age,arrival_mode,checkin_date,checkout_date,extra_nights,allergies,notes"
      )
      .eq("event_id", eventId)
      .is("apartment_id", null)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);

    const rows = (data ?? []) as GuestRow[];
    setUnassigned(rows);

    const occNow = usingOcc ?? occ;
    const firstNotFull =
      occNow.find((r) => statusOf(r.capacity, r.guests_count) !== "full")?.apartment_id ?? "";

    setAssignTo((prev) => {
      const next = { ...prev };
      for (const g of rows) {
        if (!next[g.id]) next[g.id] = firstNotFull;
      }
      return next;
    });
  }

  async function loadGuestsForApartment(apartmentId: string) {
    if (!eventId) return;
    const { data, error } = await supabase
      .from("guests")
      .select(
        "id,event_id,apartment_id,first_name,last_name,guest_type,child_age,arrival_mode,checkin_date,checkout_date,extra_nights,allergies,notes"
      )
      .eq("event_id", eventId)
      .eq("apartment_id", apartmentId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
    setAptGuests((data ?? []) as GuestRow[]);
  }

  async function loadApartmentPhotos(apartmentId: string) {
    setPhotoIndex(0);

    const cached = photoCache[apartmentId];
    if (cached && cached.length) {
      setPhotoUrls(cached);
      return;
    }

    setPhotoUrls([]);

    const { data, error } = await supabase.storage
      .from("apartment-photos")
      .list(apartmentId, { limit: 100, sortBy: { column: "name", order: "asc" } });

    if (error) throw new Error(error.message);

    const files = (data ?? [])
      .filter((f) => f.name && !f.name.endsWith("/"))
      .map((f) => `${apartmentId}/${f.name}`);

    const urls = files.map((path) => supabase.storage.from("apartment-photos").getPublicUrl(path).data.publicUrl);

    setPhotoCache((prev) => ({ ...prev, [apartmentId]: urls }));
    setPhotoUrls(urls);

    // prefetch leggero per fluidità
    urls.slice(0, 5).forEach((u) => {
      const img = new Image();
      img.src = u;
    });
  }

  function refreshPhotoCache(apartmentId: string) {
    setPhotoCache((prev) => {
      const next = { ...prev };
      delete next[apartmentId];
      return next;
    });
  }

  async function submitEvent() {
  if (!eventId) return;

  setSubmitting(true);

  try {
    const { data: u, error: uErr } = await supabase.auth.getUser();
    if (uErr) throw new Error(uErr.message);
    if (!u?.user) throw new Error("Non autenticato. Rifai login.");

    const { error } = await supabase
      .from("events")
      .update({
        status: "submitted",
        submitted_at: new Date().toISOString(),
        submitted_by: u.user.id,
      })
      .eq("id", eventId)
      .eq("created_by", u.user.id)
      .eq("status", "draft");

    if (error) throw new Error(error.message);

    await refreshEventStatus();
    setUiMsg({ type: "ok", text: "✅ Lista inviata a Lucia e al team." });
  } catch (e: any) {
    setUiMsg({ type: "err", text: `❌ Invio fallito: ${e?.message ?? "errore sconosciuto"}` });
    throw e;
  } finally {
    setSubmitting(false);
  }
}


  async function runSearch() {
    if (!eventId) return;
    const q = search.trim();
    setSearchErr(null);

    if (q.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const { data, error } = await supabase
        .from("guests")
        .select(
          "id,event_id,apartment_id,first_name,last_name,guest_type,child_age,arrival_mode,checkin_date,checkout_date,extra_nights,allergies,notes"
        )
        .eq("event_id", eventId)
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
        .order("last_name", { ascending: true })
        .limit(30);

      if (error) {
        setSearchErr(error.message);
        return;
      }
      setSearchResults((data ?? []) as GuestRow[]);
    } catch (e: any) {
      setSearchErr(e?.message ?? "Errore ricerca");
    } finally {
      setSearching(false);
    }
  }

  async function openApartment(apartmentId: string) {
    setModalErr(null);
    setOpenAptId(apartmentId);
    // ✅ ogni volta che apro il modal, riparto dalle date evento
setCheckinDate(eventStart || "");
setCheckoutDate(eventEnd || "");

    resetForm();
    try {
      await Promise.all([loadGuestsForApartment(apartmentId), loadApartmentPhotos(apartmentId)]);
    } catch (e: any) {
      setModalErr(e?.message ?? "Errore caricando dati");
    }
  }

  function onSvgClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const id = target.getAttribute("id");
    if (!id || !id.startsWith("apt_")) return;
    openApartment(id);
  }

  async function deleteGuest(guestId: string) {
    if (locked) {
      setModalErr("Lista confermata: non puoi più modificare.");
      return;
    }
    setModalErr(null);
    setSidebarErr(null);

    try {
      const { error } = await supabase.from("guests").delete().eq("id", guestId);
      if (error) throw new Error(error.message);

      await refreshOccupancy();
      await loadUnassigned();
      if (openAptId) await loadGuestsForApartment(openAptId);
    } catch (e: any) {
      setModalErr(e?.message ?? "Errore eliminando ospite");
    }
  }

  async function setGuestApartment(guestId: string, apartmentId: string | null, fromModal?: boolean) {
    if (locked) {
      const msg = "Lista confermata: non puoi più modificare.";
      if (fromModal) setModalErr(msg);
      else setSidebarErr(msg);
      return;
    }

    setModalErr(null);
    setSidebarErr(null);

    if (apartmentId) {
      const st = statusMap[apartmentId]?.status ?? "free";
      if (st === "full") {
        const msg = "Questo appartamento è pieno.";
        if (fromModal) setModalErr(msg);
        else setSidebarErr(msg);
        return;
      }
    }

    try {
      const { error } = await supabase.from("guests").update({ apartment_id: apartmentId }).eq("id", guestId);
      if (error) throw new Error(error.message);

      await refreshOccupancy();
      await loadUnassigned();
      if (openAptId) await loadGuestsForApartment(openAptId);
    } catch (e: any) {
      const msg = e?.message ?? "Errore spostando ospite";
      if (fromModal) setModalErr(msg);
      else setSidebarErr(msg);
    }
  }

  async function addGuest(toUnassigned: boolean) {
    if (locked) {
      setModalErr("Lista confermata: non puoi più modificare.");
      return;
    }
    if (!eventId) return;

    setModalErr(null);

    if (!firstName.trim() || !lastName.trim()) {
      setModalErr("Nome e Cognome sono obbligatori.");
      return;
    }
    if (guestType === "child" && (childAge === "" || Number.isNaN(Number(childAge)))) {
      setModalErr("Inserisci età bambino.");
      return;
    }

    const aptId = toUnassigned ? null : openAptId;

    if (!toUnassigned && aptId) {
      const st = statusMap[aptId]?.status ?? "free";
      if (st === "full") {
        setModalErr("Questo appartamento è pieno.");
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        event_id: eventId,
        apartment_id: aptId,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        guest_type: guestType,
        child_age: guestType === "child" ? Number(childAge) : null,
        arrival_mode: arrivalMode ? arrivalMode : null,
        checkin_date: checkinDate ? checkinDate : null,
        checkout_date: checkoutDate ? checkoutDate : null,
        extra_nights: extraNights ?? 0,
        allergies: allergies ? allergies : null,
        notes: notes ? notes : null,
      };

      const { error } = await supabase.from("guests").insert(payload);
      if (error) throw new Error(error.message);

      await refreshOccupancy();
      await loadUnassigned();
      if (openAptId) await loadGuestsForApartment(openAptId);

      resetForm();
    } catch (e: any) {
      setModalErr(e?.message ?? "Errore inserendo ospite");
    } finally {
      setSaving(false);
    }
  }

  // INIT: auth + load once
  useEffect(() => {
    
    (async () => {
      
      try {
        setErr(null);
        setUiMsg(null);

        if (!eventId) {
          setErr("eventId mancante nella route.");
          return;
        }

        const { data: u } = await supabase.auth.getUser();
        if (!u?.user) {
          window.location.href = "/login";
          return;
        }

        // Occupancy
        const { data: occData, error: occErr } = await supabase
          .from("apartment_occupancy")
          .select("event_id,apartment_id,capacity,guests_count,structure,floor")
          .eq("event_id", eventId);
        if (occErr) throw new Error(occErr.message);

        const occRows = (occData ?? []) as OccRow[];
        setOcc(occRows);

        // Status
const { data: ev, error: evErr } = await supabase
  .from("events")
  .select("status,start_date,end_date")
  .eq("id", eventId)
  .single();

if (evErr) throw new Error(evErr.message);

if (ev?.status) setEventStatus(ev.status);

// ✅ queste sono le date decise dall'admin
const s = (ev?.start_date ?? "") as string;
const e = (ev?.end_date ?? "") as string;

setEventStart(s);
setEventEnd(e);

// ✅ default quando apri il form: check-in = start_date, check-out = end_date
setCheckinDate(s || "");
setCheckoutDate(e || "");
        if (ev?.status) setEventStatus(ev.status);

        // Unassigned
        await loadUnassigned(occRows);

        // SVG only once
        if (!svgs.lake0) {
          const [s0, s1, sw] = await Promise.all([
            loadSvg("/plans/lakehouse_0floor.svg"),
            loadSvg("/plans/lakehouse_1floor.svg"),
            loadSvg("/plans/woodcutter_0floor.svg"),
          ]);
          setSvgs({ lake0: s0, lake1: s1, wc: sw });
        }
      } catch (e: any) {
        setErr(e?.message ?? "Errore sconosciuto");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const svgHtml = useMemo(() => {
    const raw = svgs[activePlan];
    if (!raw) return "";

    const style = `
      <style>
        .apartment { cursor:pointer; transition: fill .15s ease; }
        .apartment.free { fill: rgba(34,197,94,.30); }
        .apartment.partial { fill: rgba(234,179,8,.28); }
        .apartment.full { fill: rgba(239,68,68,.35); cursor:not-allowed; }
        .apartment:hover{ filter: brightness(1.03); }
      </style>
    `;

    let out = raw.replace(/<svg\b([^>]*)>/, (m) => `${m}\n${style}\n`);
    out = out.replace(/id="(apt_[^"]+)"/g, `id="$1" class="apartment free"`);

    for (const [aptId, v] of Object.entries(statusMap)) {
      const re = new RegExp(`id="${aptId}" class="apartment free"`, "g");
      out = out.replace(re, `id="${aptId}" class="apartment ${v.status}"`);
    }
    return out;
  }, [svgs, activePlan, statusMap]);

  const openAptInfo = openAptId ? statusMap[openAptId] : null;

  const totalGuests = useMemo(
    () => occ.reduce((sum, r) => sum + (r.guests_count ?? 0), 0) + unassigned.length,
    [occ, unassigned.length]
  );
  const assignedGuests = useMemo(() => totalGuests - unassigned.length, [totalGuests, unassigned.length]);
  const progressPct = totalGuests > 0 ? Math.round((assignedGuests / totalGuests) * 100) : 0;

  return (
    <>
      {/* TOPBAR */}
      <div className="topbar">
        <div className="green-line" />
        <div className="topbar-inner">
          <div className="topbar-left">
            <img src="/logo.svg" className="logo" alt="Villa logo" />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span className={`badge ${eventStatus}`}>Stato: {statusLabel}</span>

            <button
  className="btn"
  onClick={() => setConfirmOpen(true)}
  disabled={submitting || eventStatus !== "draft"}
  title={eventStatus !== "draft" ? "Evento già confermato" : "Conferma lista"}
>
  {submitting ? "Confermo..." : "Conferma lista"}
</button>


            <button className="btn-ghost" onClick={() => (window.location.href = "/events")}>
              Home Page
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
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "end", flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <div className="h-serif" style={{ fontSize: 34, lineHeight: 1.05, fontWeight: 700 }}>
              Planner Camere
            </div>
            <div className="muted" style={{ marginTop: 6 }}>
              Gestione ospiti e assegnazioni
            </div>
          </div>

          <div className="card card-pad" style={{ minWidth: 280 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Progresso assegnazione</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              <div style={{ fontWeight: 700 }}>{progressPct}%</div>
              <div className="muted" style={{ fontSize: 12 }}>{assignedGuests}/{totalGuests} assegnati</div>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: "rgba(48,64,48,.10)", overflow: "hidden", marginTop: 8 }}>
              <div style={{ width: `${progressPct}%`, height: "100%", background: "rgba(192,208,176,.95)" }} />
            </div>
          </div>
        </div>

        {err && (
          <div className="card card-pad" style={{ borderColor: "rgba(239,68,68,.35)", marginBottom: 12, color: "#b91c1c", background: "rgba(239,68,68,.06)" }}>
            {err}
          </div>
        )}

        {uiMsg && (
          <div
            className="card card-pad"
            style={{
              marginBottom: 12,
              borderColor: uiMsg.type === "ok" ? "rgba(34,197,94,.35)" : "rgba(239,68,68,.35)",
              color: uiMsg.type === "ok" ? "#166534" : "#b91c1c",
              background: uiMsg.type === "ok" ? "rgba(34,197,94,.08)" : "rgba(239,68,68,.06)",
            }}
          >
            {uiMsg.text}
          </div>
        )}

        {locked && (
          <div className="card card-pad" style={{ marginBottom: 12, background: "rgba(234,179,8,.10)" }}>
            <b>Lista confermata:</b> modifiche bloccate.
          </div>
        )}

        <div className="grid-main">
          {/* MAIN */}
          <div className="card card-pad">
            <div className="tabs" style={{ marginBottom: 12 }}>
              <button className={`tab ${activePlan === "lake0" ? "active" : ""}`} onClick={() => setActivePlan("lake0")}>Lake House — 0 Floor</button>
              <button className={`tab ${activePlan === "lake1" ? "active" : ""}`} onClick={() => setActivePlan("lake1")}>Lake House — 1st Floor</button>
              <button className={`tab ${activePlan === "wc" ? "active" : ""}`} onClick={() => setActivePlan("wc")}>Woodcutter</button>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btn-ghost btn-sm" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(1)))}>−</button>
              <span className="badge draft">Zoom {Math.round(zoom * 100)}%</span>
              <button className="btn-ghost btn-sm" onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(1)))}>+</button>
              <button className="btn-ghost btn-sm" onClick={() => setZoom(1)}>Reset</button>
            </div>

            <div className="svg-box plan-wrap" onClick={onSvgClick}>
              <div style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }} dangerouslySetInnerHTML={{ __html: svgHtml }} />
            </div>

            <div className="legend">
              <span><span className="dot" style={{ background: "rgba(34,197,94,.45)" }} /> Libero</span>
              <span><span className="dot" style={{ background: "rgba(234,179,8,.45)" }} /> Parziale</span>
              <span><span className="dot" style={{ background: "rgba(239,68,68,.50)" }} /> Pieno</span>
            </div>
          </div>

          {/* SIDEBAR */}
          <aside className="card card-pad">
            <div className="h-serif" style={{ fontSize: 20, fontWeight: 700 }}>Ospiti</div>
            <div className="muted" style={{ marginTop: 4 }}>Cerca e assegna rapidamente</div>

            <div style={{ marginTop: 12 }}>
              <div className="label">Ricerca</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                <input
                  className="input"
                  placeholder="Nome o cognome…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
                />
                <button className="btn-ghost" onClick={runSearch}>{searching ? "..." : "Cerca"}</button>
              </div>
              {searchErr && <div style={{ color: "#b91c1c", marginTop: 8 }}>{searchErr}</div>}
            </div>

            {searchResults.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="label">Risultati</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {searchResults.map((g) => (
                    <div key={g.id} style={{ border: "1px solid rgba(48,64,48,.12)", borderRadius: 14, padding: 10 }}>
                      <div style={{ fontWeight: 700 }}>{guestLabel(g)}</div>
                      <div className="muted" style={{ marginTop: 3 }}>
                        {g.apartment_id ? `Dove: ${friendlyAptLabel(g.apartment_id)}` : "Non assegnato"}
                      </div>
                      <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                        {g.apartment_id ? (
                          <button className="btn-sm btn-ghost" onClick={() => openApartment(g.apartment_id!)}>Apri</button>
                        ) : (
                          <button className="btn-sm btn-ghost" onClick={() => document.getElementById("unassigned-block")?.scrollIntoView({ behavior: "smooth" })}>
                            Vai ai non assegnati
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div id="unassigned-block" style={{ marginTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div className="h-serif" style={{ fontSize: 18, fontWeight: 700 }}>Non assegnati</div>
                <span className="badge draft">{unassigned.length}</span>
              </div>

              {sidebarErr && <div style={{ color: "#b91c1c", marginTop: 8 }}>{sidebarErr}</div>}

              {unassigned.length === 0 ? (
                <div className="muted" style={{ marginTop: 10 }}>Tutto assegnato 🎉</div>
              ) : (
                <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                  {unassigned.map((g) => {
                    const selectedApt = assignTo[g.id] ?? "";
                    return (
                      <div key={g.id} style={{ border: "1px solid rgba(48,64,48,.12)", borderRadius: 14, padding: 10 }}>
                        <div style={{ fontWeight: 700 }}>{guestLabel(g)}</div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginTop: 8 }}>
                          <select
                            value={selectedApt}
                            onChange={(e) => setAssignTo((p) => ({ ...p, [g.id]: e.target.value }))}
                            disabled={locked}
                          >
                            <option value="">Seleziona appartamento</option>
                            {apartmentOptions.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.label} {o.status === "full" ? "• PIENO" : ""}
                              </option>
                            ))}
                          </select>

                          <button
                            className="btn"
                            disabled={locked}
                            onClick={() => {
                              if (!selectedApt) {
                                setSidebarErr("Seleziona un appartamento prima di assegnare.");
                                return;
                              }
                              setGuestApartment(g.id, selectedApt, false);
                            }}
                          >
                            Assegna
                          </button>
                        </div>

                        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button className="btn-sm btn-ghost" disabled={locked} onClick={() => deleteGuest(g.id)}>Elimina</button>
                          {selectedApt && <button className="btn-sm btn-ghost" onClick={() => openApartment(selectedApt)}>Apri</button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* MODAL */}
        {openAptId && (
          <div className="modal-backdrop" onClick={() => setOpenAptId(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <div>
                  <div className="h-serif" style={{ fontSize: 22, fontWeight: 700 }}>
                    {friendlyAptLabel(openAptId)}
                  </div>
                  <div className="muted" style={{ marginTop: 4 }}>
                    Stato: <b>{openAptInfo?.status ?? "free"}</b> • Ospiti: <b>{openAptInfo?.guests ?? 0}</b> / <b>{openAptInfo?.capacity ?? "?"}</b>
                  </div>
                </div>
                <button className="btn-ghost" onClick={() => setOpenAptId(null)}>Chiudi</button>
              </div>

              <div className="modal-body">
                {modalErr && (
                  <div className="card card-pad" style={{ borderColor: "rgba(239,68,68,.35)", color: "#b91c1c", marginBottom: 12, background: "rgba(239,68,68,.06)" }}>
                    {modalErr}
                  </div>
                )}

                <div className="modal-body-grid">
                  {/* COLONNA SINISTRA */}
                  <div className="card card-pad" style={{ boxShadow: "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <div className="h-serif" style={{ fontSize: 18, fontWeight: 700 }}>
                        Foto
                      </div>

                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => {
                          if (!openAptId) return;
                          refreshPhotoCache(openAptId);
                          loadApartmentPhotos(openAptId);
                        }}
                      >
                        Aggiorna
                      </button>
                    </div>

                    {photoUrls.length === 0 ? (
                      <div className="muted" style={{ marginTop: 10 }}>Nessuna foto caricata.</div>
                    ) : (
                      <>
                        <div className="photo-hero" style={{ marginTop: 10 }}>
                          <img src={photoUrls[photoIndex]} alt="Apartment photo" />
                        </div>

                        {/* mini strip 5 foto */}
                        <div className="photo-strip">
                          {photoUrls.slice(0, 5).map((url, idx) => (
                            <div
                              key={url}
                              className={`thumb ${idx === photoIndex ? "active" : ""}`}
                              onClick={() => setPhotoIndex(idx)}
                              role="button"
                              aria-label={`Foto ${idx + 1}`}
                            >
                              <img src={url} alt={`Thumb ${idx + 1}`} />
                            </div>
                          ))}
                        </div>

                        {/* frecce */}
                        <div className="photo-nav">
                          <button
                            className="btn-ghost btn-sm"
                            onClick={() => setPhotoIndex((i) => Math.max(0, i - 1))}
                            disabled={photoIndex === 0}
                          >
                            ←
                          </button>

                          <span className="muted">
                            {photoIndex + 1} / {photoUrls.length}
                          </span>

                          <button
                            className="btn-ghost btn-sm"
                            onClick={() => setPhotoIndex((i) => Math.min(photoUrls.length - 1, i + 1))}
                            disabled={photoIndex >= photoUrls.length - 1}
                          >
                            →
                          </button>
                        </div>
                      </>
                    )}

                    <div style={{ height: 14 }} />

                    <div className="h-serif" style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                      Ospiti
                    </div>

                    {aptGuests.length === 0 ? (
                      <div className="muted">Nessun ospite assegnato.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 10 }}>
                        {aptGuests.map((g) => (
                          <div key={g.id} style={{ border: "1px solid rgba(48,64,48,.12)", borderRadius: 14, padding: 10 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                              <div style={{ fontWeight: 700 }}>{guestLabel(g)}</div>
                              <button className="btn-ghost btn-sm" disabled={locked} onClick={() => deleteGuest(g.id)}>
                                Elimina
                              </button>
                            </div>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, marginTop: 8 }}>
                              <select
                                defaultValue=""
                                disabled={locked}
                                onChange={(e) => { (e.target as any).dataset.sel = e.target.value; }}
                              >
                                <option value="">Sposta in...</option>
                                <option value="__unassign">Non assegnato</option>
                                {apartmentOptions.map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.label} {o.status === "full" ? "• PIENO" : ""}
                                  </option>
                                ))}
                              </select>

                              <button
                                className="btn"
                                disabled={locked}
                                onClick={(e) => {
                                  const sel = (e.currentTarget.parentElement?.querySelector("select") as any)?.dataset?.sel as string | undefined;
                                  if (!sel) { setModalErr("Seleziona una destinazione prima di spostare."); return; }
                                  if (sel === "__unassign") setGuestApartment(g.id, null, true);
                                  else setGuestApartment(g.id, sel, true);
                                }}
                              >
                                Sposta
                              </button>

                              <button className="btn-ghost" disabled={locked} onClick={() => setGuestApartment(g.id, null, true)}>
                                ⇢ Non assegnato
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* COLONNA DESTRA */}
                  <div className="card card-pad" style={{ boxShadow: "none" }}>
                    <div className="h-serif" style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                      Aggiungi ospite
                    </div>

                    <div style={{ display: "grid", gap: 10 }}>
                      {/* Nome/Cognome */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <div className="label">Nome</div>
                          <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={saving || locked} />
                        </div>
                        <div>
                          <div className="label">Cognome</div>
                          <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={saving || locked} />
                        </div>
                      </div>

                      {/* Tipo / Età */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div>
                          <div className="label">Tipo</div>
                          <select value={guestType} onChange={(e) => setGuestType(e.target.value as any)} disabled={saving || locked}>
                            <option value="adult">Adulto</option>
                            <option value="child">Bambino</option>
                          </select>
                        </div>
                        <div>
                          <div className="label">Età (solo bambino)</div>
                          <input
                            className="input"
                            value={childAge}
                            onChange={(e) => setChildAge(e.target.value === "" ? "" : Number(e.target.value))}
                            disabled={saving || locked || guestType !== "child"}
                            type="number"
                            min={0}
                            max={17}
                          />
                        </div>
                      </div>

                      {/* Arrivo */}
                      <div>
                        <div className="label">Arrivo</div>
                        <select value={arrivalMode} onChange={(e) => setArrivalMode(e.target.value as any)} disabled={saving || locked}>
                          <option value="">—</option>
                          <option value="car">Auto</option>
                          <option value="transfer">Transfer</option>
                        </select>
                      </div>

                    {/* Check-in/out */}
{/* ✅ Date evento decise dall'admin: cliente può scegliere solo check-in = start oppure start-1; check-out fisso = end */}
<div style={{ display: "grid", minWidth: 0, gridTemplateColumns: "1fr 1fr", gap: 10 }}>
  <div>
    <div className="label">Check-in</div>

    <select
      value={checkinDate || eventStart}
      disabled={saving || locked || !eventStart}
      onChange={(e) => setCheckinDate(e.target.value)}
    >
      <option value={eventStart}>{eventStart}</option>
      <option value={addDaysIso(eventStart, -1)}>
        {addDaysIso(eventStart, -1)} (one day before)
      </option>
    </select>

    <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
      Se vuoi arrivare prima, scegli “1 giorno prima”.
    </div>
  </div>

  <div>
    <div className="label">Check-out</div>

    <select
      value={checkoutDate || eventEnd}
      disabled={saving || locked || !eventEnd}
      onChange={(e) => setCheckoutDate(e.target.value)} // ✅ fix
    >
      <option value={eventEnd}>{eventEnd}</option>
    </select>

    <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
      Check-out fissato dall’evento.
    </div>
  </div>
</div>

                      <div>
                        <div className="label">Notti extra</div>
                        <input className="input" type="number" min={0} value={extraNights} onChange={(e) => setExtraNights(Number(e.target.value))} disabled={saving || locked} />
                      </div>

                      <div>
                        <div className="label">Allergie / intolleranze</div>
                        <input className="input" value={allergies} onChange={(e) => setAllergies(e.target.value)} disabled={saving || locked} />
                      </div>

                      <div>
                        <div className="label">Note</div>
                        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={saving || locked} rows={3} />
                      </div>

                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button className="btn" onClick={() => addGuest(false)} disabled={saving || locked}>
                          Aggiungi qui
                        </button>
                        <button className="btn-ghost" onClick={() => addGuest(true)} disabled={saving || locked}>
                          Aggiungi non assegnato
                        </button>
                      </div>

                      <div className="muted" style={{ fontSize: 12 }}>
                        Suggerimento: “Aggiungi non assegnato” se vuoi decidere dopo l’appartamento.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>{/* Bottone nella topbar */}
<button
  className="btn"
  onClick={() => {
    setMailStage("open");
    setConfirmOpen(true);
  }}
  disabled={submitting || eventStatus !== "draft"}
  title={eventStatus !== "draft" ? "Evento già confermato" : "Conferma lista"}
>
  {submitting ? "Confermo..." : "Conferma lista"}
</button>

{/* POPUP MAILBOX */}
{confirmOpen && (
  <div
    className="mbox-backdrop"
    onClick={() => {
      if (submitting || mailStage !== "open") return;
      setConfirmOpen(false);
    }}
  >
    <div className={`mbox-modal ${mailStage}`} onClick={(e) => e.stopPropagation()}>
      {/* titolo piccolo */}
      

      <div className="mbox-scene">
        {/* MAILBOX */}
        <div className="mailbox">
          {/* logo fuori */}
          <div className="mailbox-logo">
            <img src="/logo.svg" alt="logo" />
          </div>

          {/* bandierina */}
          <div className="mailbox-flag" aria-hidden />

          {/* sportello */}
          <div className="mailbox-door" aria-hidden />

          {/* interno + lettera */}
          <div className="mailbox-inner">
            <div className="letter">
              <div className="letter-head">
                <div className="letter-chip">Guests List</div>
                <div className="letter-seal">
                  <img src="/logo.svg" alt="seal" />
                </div>
              </div>

              <div className="letter-body">
                Please click the button below when your list is completed and you would like to send it to Lucia and her team.
              </div>

              <div className="letter-actions">
                <button
                  className="btn letter-send"
                  disabled={submitting || mailStage !== "open"}
                  onClick={async () => {
                    try {
                      // anima chiusura
                      setMailStage("closing");
                      setTimeout(() => setMailStage("closed"), 520);

                      // esegue submit reale
                      await submitEvent();

                      // chiude popup dopo l’animazione
                      setTimeout(() => {
                        setConfirmOpen(false);
                        setMailStage("open");
                      }, 850);
                    } catch (e) {
                      // se fallisce, riapri
                      setMailStage("open");
                    }
                  }}
                >
                  {submitting ? "Sending…" : "Send to Lucia & team"}
                </button>

                <button
                  className="btn-ghost letter-notyet"
                  disabled={submitting || mailStage !== "open"}
                  onClick={() => setConfirmOpen(false)}
                >
                  Not yet
                </button>
              </div>

              <div className="letter-hint">
                Once sent, you won’t be able to edit the list.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* piccola nota */}
      <div className="mbox-foot muted">
        Tap outside to close (only while open).
      </div>
    </div>
  </div>
)}

    </>
  );
}
