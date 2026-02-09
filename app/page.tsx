"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function HomePage() {
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      // non loggato -> login
      if (!session) {
        window.location.href = "/login";
        return;
      }

      // loggato -> events (poi da lì se admin vuoi reindirizzare ad admin/events)
      window.location.href = "/events";
    })();
  }, []);

  return (
    <div className="container">
      <div className="card card-pad">
        <div className="muted">Caricamento…</div>
      </div>
    </div>
  );
}
