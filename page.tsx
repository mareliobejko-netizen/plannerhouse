"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Page() {
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      window.location.href = data.session ? "/events" : "/login";
    })();
  }, []);

  return null;
}
