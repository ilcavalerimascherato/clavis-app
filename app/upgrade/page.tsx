"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Zap, Building2, Crown, ArrowLeft } from "lucide-react";
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

// ─── 6 PUNTI DI FORZA — validi per tutti gli abbonamenti a pagamento
const STRENGTHS = [
  "Unica piattaforma multi-normativa — NIS2, AI Act, GDPR, D.Lgs 231, normativa sanitaria specifica, tutto in un posto",
  "Verifica automatica dei documenti con AI, non solo caricamento",
  "Genera i documenti sulla tua struttura specifica, non moduli generici",
  "Piano di remediation con scadenze reali, incluse quelle ricorrenti",
  "Dashboard di portfolio per chi gestisce più strutture — rischio aggregato, non dashboard separate",
  "Certificazione CLAVIS con QR tracciabile",
];

// ─── TIER DEFINITIONS
const TIERS = [
  {
    id:       "silver" as UserTier,
    label:    "Silver",
    price:    "€1.500",
    period:   "+IVA / anno",
    covers:   "Copre: 1 struttura",
    icon:     <Zap size={20} />,
    color:    T.shield,
    colorBg:  T.shieldBg,
    border:   "rgba(37,99,235,.35)",
    highlight: true,
    cta: {
      label: "Attiva Silver",
      subject: "Richiesta attivazione CLAVIS Silver",
      body: "Salve,\n\nVorrei attivare il piano Silver per la mia struttura.\n\nNome struttura:\nEmail account CLAVIS:\n\nGrazie",
    },
  },
  {
    id:       "gold" as UserTier,
    label:    "Gold",
    price:    "€1.200",
    period:   "+IVA / anno / struttura",
    covers:   "Copre: 1 società, fino a 9 strutture",
    icon:     <Building2 size={20} />,
    color:    T.gold,
    colorBg:  T.goldBg,
    border:   "rgba(217,178,90,.30)",
    cta: {
      label: "Contattaci",
      subject: "Richiesta piano CLAVIS Gold — portfolio strutture",
      body: "Salve,\n\nVorrei ricevere informazioni sul piano Gold per la gestione di più strutture.\n\nNumero strutture:\nEmail account CLAVIS:\n\nGrazie",
    },
  },
  {
    id:       "premium" as UserTier,
    label:    "Premium",
    price:    "€1.000",
    period:   "+IVA / anno / struttura",
    covers:   "Copre: più società, 10+ strutture",
    icon:     <Crown size={20} />,
    color:    T.emerald,
    colorBg:  "rgba(62,207,142,.10)",
    border:   "rgba(62,207,142,.30)",
    cta: {
      label: "Contattaci",
      subject: "Richiesta piano CLAVIS Premium — portfolio strutture",
      body: "Salve,\n\nVorrei ricevere informazioni sul piano Premium per la gestione di più società e strutture.\n\nNumero società/strutture:\nEmail account CLAVIS:\n\nGrazie",
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
          Abbonamento
        </p>
        <h1 className="text-2xl font-black mb-2 leading-relaxed" style={{ color: T.bone }}>
          Scegli il piano giusto
          <br />
          <span style={{ color: T.slate400 }}>per la tua realtà</span>
        </h1>
        <p className="text-sm leading-relaxed max-w-lg" style={{ color: T.boneDim }}>
          CLAVIS ti accompagna verso la conformità normativa. Inizia gratis, passa a Silver
          se vuoi testare tutti gli adempimenti su una struttura. In base alle dimensioni
          della tua realtà scegli il piano giusto per le tue esigenze.
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

      {/* 6 punti di forza — validi per tutti gli abbonamenti a pagamento */}
      <div className="max-w-3xl mx-auto w-full px-6 pb-10">
        <ul className="flex flex-col gap-3">
          {STRENGTHS.map((strength, i) => (
            <li key={i} className="flex items-start gap-3">
              <span
                className="flex-shrink-0 flex items-center justify-center rounded-full font-mono font-bold text-xs"
                style={{ width: "22px", height: "22px", backgroundColor: T.shieldBg, color: T.shield }}
              >
                {i + 1}
              </span>
              <span className="text-sm leading-relaxed pt-0.5" style={{ color: T.boneDim }}>
                {strength}
              </span>
            </li>
          ))}
        </ul>
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
                    <span className="text-xs ml-1 leading-relaxed" style={{ color: T.slate400 }}>{tier.period}</span>
                  </div>
                </div>

                {/* Copertura */}
                <div className="flex-1 px-5 py-4 flex items-center">
                  <span className="text-sm font-semibold leading-relaxed" style={{ color: T.boneDim }}>
                    {tier.covers}
                  </span>
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
