"use client";

import React from "react";

export function ClavisTitle({
  it, en, size = "xl", center = false,
}: {
  it: string;
  en: string;
  size?: "sm" | "lg" | "xl";
  center?: boolean;
}) {
  const cls =
    size === "xl" ? "text-3xl font-bold tracking-tight"
    : size === "lg" ? "text-2xl font-bold tracking-tight"
    : "text-lg font-semibold tracking-tight";
  return (
    <div className={center ? "text-center" : ""}>
      <p className={`${cls} text-white uppercase leading-tight`}>{it}</p>
      <p className="text-sm text-zinc-500 tracking-widest mt-0.5">({en})</p>
    </div>
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
      className={`min-h-screen text-white relative overflow-hidden text-base ${centered ? "flex flex-col items-center justify-center" : ""}`}
      style={{
        backgroundColor: "#080c14",
        backgroundImage: `
          radial-gradient(ellipse 80% 60% at 50% 0%, rgba(14,165,233,0.07) 0%, transparent 70%),
          radial-gradient(ellipse 60% 40% at 80% 100%, rgba(99,102,241,0.05) 0%, transparent 60%),
          radial-gradient(circle, rgba(148,163,184,0.15) 1px, transparent 1px)
        `,
        backgroundSize: "100% 100%, 100% 100%, 28px 28px",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(rgba(148,163,184,0.03) 1px, transparent 1px)",
          backgroundSize: "100% 56px",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 100% 100% at 50% 50%, transparent 40%, rgba(8,12,20,0.8) 100%)",
        }}
      />
      <div className="relative z-10 w-full px-4 py-10">{children}</div>
    </div>
  );
}
