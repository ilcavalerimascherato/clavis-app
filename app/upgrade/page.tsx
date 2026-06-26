"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Check, Lock, Zap, Shield, Building2, ArrowLeft } from "lucide-react";
import { type UserTier, TIER_RANK } from "@/lib/tier";

// ─── TOKENS
const T = {
  ink:      "#080c14",
  ink2:     "#0F1424",
  slate100: "#141B30",
  slate200: "rgba(238,241,248,.16)",
  slate400: "#9AA3BD",
  bone:     "#f0ece0",
  boneDim:  "#c8c2b4",
  shield:   "#2563eb",
  shieldBg: "rgba(37,99,235,.12)",
  gold:     "#D9B25A",
  goldBg:   "rgba(217,178,90,.10)",
  emerald:  "#3ECF8E",
  line:     "rgba(238,241,248,.08)",
};

interface Profile { id: string; full_name: string; email: string; tier: string; }

// ─── TIER DEFINITIONS
const TIERS = [
  {
    id:       "free" as UserTier,
    label:    "Free",
    price:    "€0",
    period:   "sempre",
    icon:     <Shield size={20} />,
    color:    T.slate400,
    colorBg:  "rgba(156,163,175,.10)",
    border:   T.slate200,
    features: [
      { label: "Triage normativo completo",         included: true  },
      { label: "Dashboard rischio",                 included: true  },
      { label: "Caricamento documenti",             included: true  },
      { label: "Autocertificazione manuale",        included: true  },
      { label: "1 struttura",                       included: true  },
      { label: "Analisi AI documenti",              included: false },
      { label: "Piano di remediation attivo",       included: false },
      { label: "Registro fornitori + DPA",          included: false },
      { label: "Modulo NIS2 + ANAC",                included: false },
      { label: "Export report",                     included: false },
    ],
    cta:      null,
  },
  {
    id:       "silver" as UserTier,
    label:    "Silver",
    price:    "€1.500",
    period:   "anno · 1 struttura",
    icon:     <Zap size={20} />,
    color:    T.shield,
    colorBg:  T.shieldBg,
    border:   "rgba(37,99,235,.35)",
    highlight: true,
    features: [
      { label: "Tutto il piano Free",               included: true  },
      { label: "Analisi AI documenti",              included: true  },
      { label: "Piano di remediation attivo",       included: true  },
      { label: "Registro fornitori + DPA",          included: true  },
      { label: "Modulo NIS2 + ANAC",                included: true  },
      { label: "Export report PDF",                 included: true  },
      { label: "Strutture multiple",                included: false },
      { label: "API access",                        included: false },
    ],
    cta: {
      label: "Attiva Silver",
      subject: "Richiesta attivazione CLAVIS Silver",
      body: "Salve,\n\nVorrei attivare il piano Silver per la mia struttura.\n\nNome struttura:\nEmail account CLAVIS:\n\nGrazie",
    },
  },
  {
    id:       "gold" as UserTier,
    label:    "Gold",
    price:    "Su misura",
    period:   "strutture multiple",
    icon:     <Building2 size={20} />,
    color:    T.gold,
    colorBg:  T.goldBg,
    border:   "rgba(217,178,90,.30)",
    features: [
      { label: "Tutto il piano Silver",             included: true  },
      { label: "Strutture multiple (portfolio)",    included: true  },
      { label: "Dashboard di gruppo",               included: true  },
      { label: "API access",                        included: true  },
      { label: "Formazione on-demand per ruolo",    included: true  },
      { label: "Supporto prioritario",              included: true  },
    ],
    cta: {
      label: "Contattaci",
      subject: "Richiesta piano CLAVIS Gold — portfolio strutture",
      body: "Salve,\n\nVorrei ricevere informazioni sul piano Gold per la gestione di più strutture.\n\nNumero strutture:\nEmail account CLAVIS:\n\nGrazie",
    },
  },
];

export default function UpgradePage() {
  const router   = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setProfile(data);
    }
    load();
  }, []);

  const userTier = (profile?.tier ?? "free") as UserTier;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: T.ink, fontFamily: "DM Sans, system-ui" }}>

      {/* Topbar minimal */}
      <header
        className="flex items-center justify-between px-6 flex-shrink-0"
        style={{ height: "48px", borderBottom: `1px solid ${T.line}`, backgroundColor: T.ink2 }}
      >
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm transition-colors hover:opacity-80 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
          style={{ color: T.slate400 }}
        >
          <ArrowLeft size={14} />
          Torna indietro
        </button>
        <p className="font-black tracking-[0.12em] text-base" style={{ color: T.bone }}>CLAVIS</p>
        <div style={{ width: "100px" }} />
      </header>

      {/* Hero */}
      <div className="flex flex-col items-center pt-12 pb-8 px-6 text-center">
        <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: T.shield }}>
          Piani e prezzi
        </p>
        <h1 className="text-2xl font-black mb-2 leading-relaxed" style={{ color: T.bone }}>
          Scegli il piano giusto
          <br />
          <span style={{ color: T.slate400 }}>per la tua struttura</span>
        </h1>
        <p className="text-sm leading-relaxed max-w-lg" style={{ color: T.boneDim }}>
          CLAVIS accompagna la tua struttura verso la conformità normativa.
          Inizia gratis, passa a Silver quando sei pronto.
        </p>

        {/* Tier attuale */}
        {profile && (
          <div
            className="mt-4 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider"
            style={{ backgroundColor: T.shieldBg, color: T.shield, border: `1px solid rgba(37,99,235,.25)` }}
          >
            Piano attuale: {userTier}
          </div>
        )}
      </div>

      {/* Cards */}
      <div className="flex-1 px-6 pb-12">
        <div
          className="grid gap-4 max-w-4xl mx-auto"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}
        >
          {TIERS.map((tier) => {
            const isCurrent  = userTier === tier.id;
            const isUpgrade  = TIER_RANK[tier.id] > TIER_RANK[userTier];

            return (
              <div
                key={tier.id}
                className="flex flex-col rounded-xl overflow-hidden"
                style={{
                  backgroundColor: T.ink2,
                  border: `1px solid ${isCurrent ? tier.border : T.slate200}`,
                  boxShadow: tier.highlight && isUpgrade ? `0 0 32px rgba(37,99,235,.15)` : "none",
                }}
              >
                {/* Header card */}
                <div
                  className="px-5 py-5 flex flex-col gap-2"
                  style={{ borderBottom: `1px solid ${T.line}`, backgroundColor: isCurrent ? tier.colorBg : "transparent" }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2" style={{ color: tier.color }}>
                      {tier.icon}
                      <span className="text-base font-black tracking-wide">{tier.label}</span>
                    </div>
                    {isCurrent && (
                      <span
                        className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                        style={{ backgroundColor: tier.colorBg, color: tier.color, border: `1px solid ${tier.border}` }}
                      >
                        Attivo
                      </span>
                    )}
                    {tier.highlight && isUpgrade && (
                      <span
                        className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                        style={{ backgroundColor: T.shieldBg, color: T.shield, border: `1px solid rgba(37,99,235,.3)` }}
                      >
                        Consigliato
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-xl font-black" style={{ color: T.bone }}>{tier.price}</span>
                    <span className="text-xs ml-1 leading-relaxed" style={{ color: T.slate400 }}>/ {tier.period}</span>
                  </div>
                </div>

                {/* Feature list */}
                <div className="flex-1 px-5 py-4 flex flex-col gap-2">
                  {tier.features.map((f, i) => (
                    <div key={i} className="flex items-center gap-3">
                      {f.included ? (
                        <Check size={14} style={{ color: T.emerald, flexShrink: 0 }} />
                      ) : (
                        <Lock size={14} style={{ color: T.slate400, opacity: 0.4, flexShrink: 0 }} />
                      )}
                      <span
                        className="text-sm leading-relaxed"
                        style={{ color: f.included ? T.boneDim : T.slate400, opacity: f.included ? 1 : 0.5 }}
                      >
                        {f.label}
                      </span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <div className="px-5 pb-5">
                  {isCurrent ? (
                    <div
                      className="w-full py-2.5 text-sm font-bold text-center rounded-lg"
                      style={{ backgroundColor: tier.colorBg, color: tier.color, border: `1px solid ${tier.border}` }}
                    >
                      Piano attuale
                    </div>
                  ) : tier.cta ? (
                    <a
                      href={`mailto:info@clavisapp.io?subject=${encodeURIComponent(tier.cta.subject)}&body=${encodeURIComponent(tier.cta.body)}`}
                      className="w-full py-2.5 text-sm font-bold text-center rounded-lg flex items-center justify-center transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
                      style={{
                        backgroundColor: isUpgrade ? tier.colorBg : "transparent",
                        color: tier.color,
                        border: `1px solid ${tier.border}`,
                      }}
                    >
                      {tier.cta.label} →
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <p className="text-xs text-center mt-8 leading-relaxed" style={{ color: T.slate400 }}>
          Attivazione manuale — ti risponderemo entro 24 ore lavorative.
          <br />
          Hai domande? Scrivi a{" "}
          <a href="mailto:info@clavisapp.io" style={{ color: T.shield }}>info@clavisapp.io</a>
        </p>
      </div>
    </div>
  );
}
