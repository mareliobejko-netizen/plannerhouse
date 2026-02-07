"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function onLogin() {
    setMsg(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
console.log("LOGIN", { data, error });
if (error) setMsg(error.message);
    else window.location.href = "/events";
  }

  return (
    <div style={{ maxWidth: 420, margin: "60px auto", display: "grid", gap: 10 }}>
      <h1>Login</h1>
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button onClick={onLogin}>Entra</button>
      {msg && <p>{msg}</p>}
    </div>
  );
}
