"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";

type Career = { id: string; manager_name: string; reputation: number; created_at: string };
export default function CareerPage() {
  const [session, setSession] = useState<Session | null>(null);
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.startsWith("replace-"));
  const [ready, setReady] = useState(!configured);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [careers, setCareers] = useState<Career[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  useEffect(() => {
    const client = getSupabase();
    if (!client) return;
    client.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = client.auth.onAuthStateChange((_event, value) => { setSession(value); setCareers([]); setLoaded(false); });
    return () => data.subscription.unsubscribe();
  }, []);

  async function loadCareers() {
    setBusy(true); setMessage("");
    try {
      const { data, error } = await getSupabase()!.functions.invoke("careers", { method: "GET" });
      if (error) throw error;
      setCareers(data.careers); setLoaded(true);
    } catch { setMessage("No pudimos cargar tu carrera. Revisá tu conexión y volvé a intentar."); }
    finally { setBusy(false); }
  }
  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const credentials = { email: String(form.get("email")), password: String(form.get("password")) };
    try {
      const result = mode === "login" ? await getSupabase()!.auth.signInWithPassword(credentials) : await getSupabase()!.auth.signUp(credentials);
      if (result.error) throw result.error;
      if (mode === "signup" && !result.data.session) setMessage("Revisá tu correo para confirmar la cuenta y después iniciá sesión.");
    } catch { setMessage(mode === "login" ? "No pudimos iniciar sesión. Verificá tus datos y la confirmación de tu correo." : "No pudimos completar el registro. Probá nuevamente en unos minutos."); }
    finally { setBusy(false); }
  }
  async function createCareer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const managerName = String(new FormData(event.currentTarget).get("managerName")).trim();
    try {
      const { data, error } = await getSupabase()!.functions.invoke("careers", { body: { managerName } });
      if (error) {
        const status = (error as { context?: Response }).context?.status;
        if (status === 409) { setMessage("Ya tenés una carrera. Usá «Cargar mi carrera» para verla."); return; }
        throw error;
      }
      setCareers([data.career]); setLoaded(true); setMessage("Tu carrera quedó guardada. Este es el primer paso de tu historia.");
    } catch { setMessage("No pudimos guardar tu carrera. Volvé a intentar; si ya se guardó, podés recuperarla con «Cargar mi carrera»."); }
    finally { setBusy(false); }
  }

  return <main className="wrap workspace"><Link className="back" href="/">← Volver al inicio</Link><p className="eyebrow">TU HISTORIA</p><h1>Todo empieza<br />con tu nombre.</h1><p className="lead">Creá tu perfil de director técnico y guardá tu primera carrera.</p>
    {!ready ? <p role="status">Cargando sesión…</p> : !configured ? <section className="panel"><h2>Estamos preparando el vestuario.</h2><p>El registro todavía no está habilitado en este entorno. Volvé cuando el servicio esté conectado.</p><Link href="/estado">Consultar el estado del servicio →</Link></section> : !session ? <section className="panel"><div className="tabs"><button className={mode === "login" ? "selected" : ""} onClick={() => { setMode("login"); setMessage(""); }}>Iniciar sesión</button><button className={mode === "signup" ? "selected" : ""} onClick={() => { setMode("signup"); setMessage(""); }}>Crear cuenta</button></div><form onSubmit={authenticate}><label htmlFor="email">Correo electrónico</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={254}/><label htmlFor="password">Contraseña</label><input id="password" name="password" type="password" minLength={8} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} required/><p className="fine">Usá al menos 8 caracteres.</p><button className="button" disabled={busy}>{busy ? "Un momento…" : mode === "login" ? "Entrar" : "Crear mi cuenta"}</button></form></section> : <section className="panel"><div className="session-line"><span>Sesión iniciada</span><button className="text-button" disabled={busy} onClick={async () => { const { error } = await getSupabase()!.auth.signOut(); setMessage(error ? "No pudimos cerrar la sesión. Volvé a intentar." : ""); }}>Cerrar sesión</button></div><button className="button secondary" disabled={busy} onClick={loadCareers}>{busy ? "Cargando…" : "Cargar mi carrera"}</button>{careers.length ? careers.map(career => <article className="career-card" key={career.id}><p className="eyebrow">DIRECTOR TÉCNICO</p><h2>{career.manager_name}</h2><p>Reputación inicial <strong>{career.reputation}</strong></p><p className="fine">Carrera guardada. Próximamente: ofertas de clubes y simulación de partidos.</p></article>) : <><p>{loaded ? "Todavía no creaste una carrera." : "Cargá tu carrera existente o creá la primera."}</p><form onSubmit={createCareer}><label htmlFor="managerName">Nombre del director técnico</label><input id="managerName" name="managerName" minLength={2} maxLength={60} required placeholder="¿Cómo te llama la hinchada?"/><button className="button" disabled={busy}>Guardar mi primera carrera ↗</button></form></>}<p className="fine">Una carrera por cuenta. Esta entrega permite crearla y recuperarla; el juego se ampliará en las próximas versiones.</p></section>}
    <p className="feedback" role="status" aria-live="polite">{message}</p>
  </main>;
}
