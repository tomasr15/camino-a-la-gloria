"use client";
import Link from "next/link";
import { useState } from "react";
import { getSupabase } from "@/lib/supabase";
export default function StatusPage() {
  const [status, setStatus] = useState("Todavía no se comprobó la conexión.");
  const [busy, setBusy] = useState(false);
  async function check() {
    const client = getSupabase();
    if (!client) { setStatus("El servicio todavía no está configurado en este entorno."); return; }
    setBusy(true);
    try {
      const { data, error } = await client.functions.invoke("health", { method: "GET" });
      setStatus(error || data?.status !== "ok" ? "El servicio no está disponible. Intentá nuevamente más tarde." : `Conexión comprobada: servicio y base de datos disponibles. Referencia: ${data.requestId}`);
    } catch { setStatus("No se pudo comprobar la conexión."); }
    finally { setBusy(false); }
  }
  return <main className="wrap workspace"><Link className="back" href="/">← Volver al inicio</Link><p className="eyebrow">DISPONIBILIDAD</p><h1>Estado del<br />servicio.</h1><section className="panel"><h2>Una conexión, comprobada.</h2><p>Verificá si el servicio está listo para guardar y recuperar tu carrera.</p><button className="button" disabled={busy} onClick={check}>{busy ? "Comprobando…" : "Comprobar conexión ↗"}</button><p role="status" aria-live="polite">{status}</p></section></main>;
}
