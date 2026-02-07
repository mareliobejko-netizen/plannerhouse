"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type EventRow = { id: string; name: string; start_date: string | null; end_date: string | null };

export default function EventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        window.location.href = "/login";
        return;
      }

      // grazie a RLS vedrai solo i tuoi eventi
      const { data, error } = await supabase
        .from("events")
        .select("id,name,start_date,end_date")
        .order("start_date", { ascending: true });

      if (error) setErr(error.message);
      else setEvents(data ?? []);
    })();
  }, []);

  return (
    <div style={{ maxWidth: 720, margin: "40px auto" }}>
      <h1>Eventi</h1>
      {err && <p>{err}</p>}
      <ul>
        {events.map((e) => (
          <li key={e.id} style={{ marginBottom: 10 }}>
            <button onClick={() => (window.location.href = `/events/${e.id}`)}>
              {e.name} {e.start_date ? `(${e.start_date})` : ""}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
