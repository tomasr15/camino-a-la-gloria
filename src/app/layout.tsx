import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Camino a la Gloria | Tu carrera empieza acá",
  description: "Del ascenso local a las grandes ligas. Un simulador web de carrera de director técnico."
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es-AR"><body>{children}</body></html>;
}
