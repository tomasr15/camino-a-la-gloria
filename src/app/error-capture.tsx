"use client";
import { useEffect } from "react";
import { installGlobalErrorCapture } from "@/lib/errors";

// Mounted once in the root layout; it renders nothing.
export default function ErrorCapture() {
  useEffect(() => { installGlobalErrorCapture(); }, []);
  return null;
}
