"use client";

import React from "react";

// ─── Palette CLAVIS — allineata alla dashboard (ink/bone/shield)
// --ink-950:  #080c14  sfondo principale
// --ink-900:  #0d1220  surface card
// --ink-800:  #141b2e  border primario
// --ink-700:  #1e2640  border secondario
// --bone-100: #f0ece0  testo primario
// --bone-300: #c8c2b4  testo secondario  (WCAG AA 7.8:1)
// --bone-500: #8c8579  testo muted        (WCAG AA 4.6:1)
// --shield:   #2563eb  accent blu istituzionale
// --emerald:  #2ed588  accent verde compliance

export function ClavisTitle({
  it,
  en,
  size = "xl",
  center = false,
  variant,
  as: Tag = "div",
  className = "",
}: {
  it: string;
  en: string;
  size?: "sm" | "lg" | "xl";
  center?: boolean;
  variant?: string;
  as?: "div" | "h1" | "h2" | "h3";
  className?: string;
}) {
  const cls =
    size === "xl" ? "text-3xl font-bold tracking-tight"
    : size === "lg" ? "text-2xl font-bold tracking-tight"
    : "text-lg font-semibold tracking-tight";

  return (
    <Tag className={`${center ? "text-center" : ""} ${className}`}>
      <p className={`${cls} text-white uppercase leading-tight`}>{it}</p>
      <p className="text-sm tracking-widest mt-1" style={{ color: "#8c8579" }}>({en})</p>
    </Tag>
  );
}

export function BgLayout({
  children,
  centered = true,
}: {
  children: React.ReactNode;
  centered?: boolean;
}) {
  return (
    <div
      className={`min-h-screen text-white relative overflow-hidden text-base ${
        centered ? "flex flex-col items-center justify-center" : ""
      }`}
      style={{
        backgroundColor: "#080c14",
        backgroundImage: `
          radial-gradient(ellipse 80% 60% at 50% 0%, rgba(37,99,235,0.06) 0%, transparent 70%),
          radial-gradient(ellipse 60% 40% at 80% 100%, rgba(46,213,136,0.04) 0%, transparent 60%),
          radial-gradient(circle, rgba(148,163,184,0.12) 1px, transparent 1px)
        `,
        backgroundSize: "100% 100%, 100% 100%, 28px 28px",
      }}
    >
      {/* Griglia orizzontale sottile */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(rgba(148,163,184,0.025) 1px, transparent 1px)",
          backgroundSize: "100% 56px",
        }}
      />
      {/* Vignette bordi */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 100% 100% at 50% 50%, transparent 40%, rgba(8,12,20,0.75) 100%)",
        }}
      />
      {/* Linea superiore accent shield */}
      <div
        className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{ background: "linear-gradient(90deg, transparent, rgba(37,99,235,0.4), transparent)" }}
      />
      <div className="relative z-10 w-full px-6 py-12 max-w-screen-xl mx-auto">{children}</div>
    </div>
  );
}

// ─── Card container standard triage
export function TriageCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`border p-6 ${className}`}
      style={{ borderColor: "#141b2e", backgroundColor: "#0d1220" }}
    >
      {children}
    </div>
  );
}

// ─── Label sezione uppercase mono
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-mono uppercase tracking-widest" style={{ color: "#8c8579" }}>
      {children}
    </p>
  );
}
