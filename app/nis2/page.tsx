"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useFeatureGate } from "@/lib/tier";
import { type UserTier } from "@/lib/tier";
import AppShell from "@/components/layout/AppShell";
import {
  Shield, ShieldAlert, ShieldCheck, ShieldX,
  RefreshCw,
  Upload, FileText, CheckCircle2, AlertTriangle,
  Clock, Lock, ExternalLink, Info,
  Building2, ClipboardList, Siren, FileCode2,
  ChevronUp, ChevronDown,
} from "lucide-react";

// ─── TOKENS (allineati al design system CLAVIS)
const T = {
  ink:      "#080c14",
  ink2:     "#0F1424",
  slate100: "#141B30",
  slate200: "rgba(238,241,248,.10)",
  slate400: "#9AA3BD",
  bone:     "#f0ece0",
  boneDim:  "#c8c2b4",
  shield:   "#2563eb",
  shieldBg: "rgba(37,99,235,.12)",
  gold:     "#D9B25A",
  goldBg:   "rgba(217,178,90,.10)",
  emerald:  "#3ECF8E",
  emeraldBg:"rgba(62,207,142,.10)",
  amber:    "#F59E0B",
  amberBg:  "rgba(245,158,11,.10)",
  red:      "#EF4444",
  redBg:    "rgba(239,68,68,.10)",
  line:     "rgba(238,241,248,.08)",
};

// ─── TIPI
type Nis2Tier = "soggetto_essenziale" | "borderline" | "non_soggetto";
type OverrideTipo = "blu" | "ambra";

interface Nis2Assessment {
  id: string;
  esito: Nis2Tier;
  motivazioni: string[];
  esito_effettivo: Nis2Tier;
  override_tipo: OverrideTipo | null;
  override_esito: Nis2Tier | null;
  override_motivazione: string | null;
  override_at: string | null;
  parere_legale_file_url: string | null;
  parere_legale_professionista: string | null;
  parere_legale_data: string | null;
  ai_analysis: { esito: string; reasoning: string; confidence: string } | null;
  snapshot_dipendenti: string | null;
  snapshot_fatturato: string | null;
  snapshot_is_pa: boolean | null;
  created_at: string;
}

interface Profile {
  id: string;
  full_name: string;
  email: string;
  tier: UserTier;
  company_id: string;
}

// ─── HELPERS
function esitoLabel(esito: Nis2Tier) {
  switch (esito) {
    case "soggetto_essenziale": return "Soggetto Essenziale NIS2";
    case "borderline":          return "Valutazione richiesta";
    case "non_soggetto":        return "Non soggetto NIS2";
  }
}

function esitoColor(esito: Nis2Tier) {
  switch (esito) {
    case "soggetto_essenziale": return T.shield;
    case "borderline":          return T.amber;
    case "non_soggetto":        return T.slate400;
  }
}

function esitoColorBg(esito: Nis2Tier) {
  switch (esito) {
    case "soggetto_essenziale": return T.shieldBg;
    case "borderline":          return T.amberBg;
    case "non_soggetto":        return "rgba(154,163,189,.08)";
  }
}

function esitoIcon(esito: Nis2Tier, size = 20) {
  switch (esito) {
    case "soggetto_essenziale": return <ShieldCheck size={size} />;
    case "borderline":          return <ShieldAlert size={size} />;
    case "non_soggetto":        return <ShieldX size={size} />;
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
}

// ─── SCADENZE NIS2 (con stato retroattivo/attivo)
const SCADENZE = [
  { label: "Registrazione ACN",          data: "Febbraio 2025", stato: "retroattivo", note: "Registrazione obbligatoria portale ACN" },
  { label: "Notifica inserimento NIS",   data: "Aprile 2025",   stato: "retroattivo", note: "ACN notifica formale soggettività" },
  { label: "Procedure incident reporting", data: "Gennaio 2026", stato: "retroattivo", note: "Pre-notifica CSIRT entro 24h da incidente" },
  { label: "Misure tecniche complete",   data: "Ottobre 2026",  stato: "attivo",      note: "Attuazione completa misure sicurezza" },
];

// ─── COMPONENTE PRINCIPALE
export default function Nis2Page() {
  const router   = useRouter();
  const supabase = React.useMemo(() => createClient(), []);

  const [profile,    setProfile]    = useState<Profile | null>(null);
  const [assessment, setAssessment] = useState<Nis2Assessment | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [rivalutando, setRivalutando] = useState(false);

  // override state
  const [showOverride,      setShowOverride]      = useState(false);
  const [overrideTipo,      setOverrideTipo]      = useState<OverrideTipo>("ambra");
  const [overrideEsito,     setOverrideEsito]     = useState<"soggetto_essenziale" | "non_soggetto">("soggetto_essenziale");
  const [overrideMotivazione, setOverrideMotivazione] = useState("");
  const [overrideLegale,    setOverrideLegale]    = useState("");
  const [overrideFile,      setOverrideFile]      = useState<File | null>(null);
  const [overrideSaving,    setOverrideSaving]    = useState(false);
  const [overrideError,     setOverrideError]     = useState("");

  // accordion moduli rimosso — layout 2x2 sempre espanso

  const isPro = useFeatureGate("nis2_module", profile?.tier ?? "free");

  // ─── LOAD
  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const { data: prof } = await supabase
      .from("profiles").select("*").eq("id", user.id).single();
    if (!prof) { router.push("/login"); return; }
    setProfile(prof);

    const { data: ass } = await supabase
      .from("v_nis2_last_assessment")
      .select("*")
      .eq("company_id", prof.company_id)
      .maybeSingle();
    setAssessment(ass ?? null);
    setLoading(false);
  }, [supabase, router]);

  useEffect(() => { load(); }, [load]);

  // ─── RIVALUTA
  async function rivaluta() {
    if (!profile) return;
    setRivalutando(true);
    await supabase.rpc("fn_verifica_soggettivita_nis2", { p_company_id: profile.company_id });
    await load();
    setRivalutando(false);
  }

  // ─── SALVA OVERRIDE
  async function salvaOverride() {
    if (!assessment || !profile) return;
    if (!overrideMotivazione.trim()) { setOverrideError("La motivazione è obbligatoria."); return; }
    if (overrideTipo === "blu" && !overrideFile) { setOverrideError("Carica il documento del parere legale."); return; }
    setOverrideError("");
    setOverrideSaving(true);

    let fileUrl: string | null = null;

    // Upload file se strada blu
    if (overrideTipo === "blu" && overrideFile) {
      const path = `nis2-pareri/${profile.company_id}/${Date.now()}_${overrideFile.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("documents")
        .upload(path, overrideFile, { upsert: false });
      if (uploadError) { setOverrideError("Errore upload file: " + uploadError.message); setOverrideSaving(false); return; }
      const { data: urlData } = supabase.storage.from("documents").getPublicUrl(path);
      fileUrl = urlData?.publicUrl ?? null;
    }

    const { error } = await supabase
      .from("nis2_assessments")
      .update({
        override_tipo:               overrideTipo,
        override_esito:              overrideEsito,
        override_motivazione:        overrideMotivazione,
        override_by:                 profile.id,
        override_at:                 new Date().toISOString(),
        ...(overrideTipo === "blu" ? {
          parere_legale_file_url:         fileUrl,
          parere_legale_professionista:   overrideLegale,
          parere_legale_data:             new Date().toISOString().split("T")[0],
        } : {}),
      })
      .eq("id", assessment.id);

    if (error) { setOverrideError("Errore salvataggio: " + error.message); setOverrideSaving(false); return; }
    setShowOverride(false);
    setOverrideMotivazione("");
    setOverrideLegale("");
    setOverrideFile(null);
    await load();
    setOverrideSaving(false);
  }

  // ─── RENDER LOADING
  if (loading) {
    return (
      <AppShell profile={profile} activeRoute="/nis2">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw size={24} className="animate-spin" style={{ color: T.shield }} />
            <p className="text-sm leading-relaxed" style={{ color: T.slate400 }}>Caricamento modulo NIS2…</p>
          </div>
        </div>
      </AppShell>
    );
  }

  const esito = assessment?.esito_effettivo ?? null;
  const isGated = !isPro;

  return (
    <AppShell profile={profile} activeRoute="/nis2">
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col gap-6">

        {/* ── HEADER ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-black leading-relaxed" style={{ color: T.bone }}>
              Modulo NIS2
              <span className="block text-sm font-normal mt-0.5" style={{ color: T.slate400 }}>
                (Network and Information Security — D.Lgs. 138/2024)
              </span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {esito && (
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold"
                style={{ backgroundColor: esitoColorBg(esito), color: esitoColor(esito), border: `1px solid ${esitoColor(esito)}33` }}
              >
                {esitoIcon(esito, 15)}
                {esitoLabel(esito)}
              </div>
            )}
            <button
              onClick={rivaluta}
              disabled={rivalutando}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-opacity hover:opacity-80"
              style={{ backgroundColor: T.slate200, color: T.boneDim, border: `1px solid ${T.line}` }}
            >
              <RefreshCw size={13} className={rivalutando ? "animate-spin" : ""} />
              {rivalutando ? "Rivalutazione…" : "Rivaluta"}
            </button>
          </div>
        </div>

        {/* ── PRO NUDGE (se free) ── */}
        {isGated && (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm leading-relaxed"
            style={{ backgroundColor: T.shieldBg, border: `1px solid rgba(37,99,235,.25)`, color: T.boneDim }}
          >
            <Lock size={15} style={{ color: T.shield, flexShrink: 0 }} />
            <span>
              I moduli operativi NIS2 richiedono il piano Silver o superiore.{" "}
              <button
                onClick={() => router.push("/upgrade")}
                className="font-bold underline underline-offset-2 transition-opacity hover:opacity-80"
                style={{ color: T.shield }}
              >
                Vedi i piani →
              </button>
            </span>
          </div>
        )}

        {/* ── BOX 1: VERIFICA SOGGETTIVITÀ (sempre attivo) ── */}
        <SoggetivitaBox
          assessment={assessment}
          onRivaluta={rivaluta}
          rivalutando={rivalutando}
          showOverride={showOverride}
          setShowOverride={setShowOverride}
          overrideTipo={overrideTipo}
          setOverrideTipo={setOverrideTipo}
          overrideEsito={overrideEsito}
          setOverrideEsito={setOverrideEsito}
          overrideMotivazione={overrideMotivazione}
          setOverrideMotivazione={setOverrideMotivazione}
          overrideLegale={overrideLegale}
          setOverrideLegale={setOverrideLegale}
          overrideFile={overrideFile}
          setOverrideFile={setOverrideFile}
          overrideSaving={overrideSaving}
          overrideError={overrideError}
          onSalvaOverride={salvaOverride}
        />

        {/* ── SCADENZE (sempre visibili) ── */}
        <ScadenzeBox />

        {/* ── MODULI OPERATIVI (4 box gated — griglia 2x2) ── */}
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))" }}
        >
          {[
            {
              id:    "acn",
              icon:  <Building2 size={18} />,
              title: "Registrazione ACN/ANAC",
              sub:   "(Registration — ACN Portal)",
              desc:  "Workflow guidato per la registrazione obbligatoria sul portale dell'Agenzia per la Cybersicurezza Nazionale.",
              retroattivo: true,
            },
            {
              id:    "incident",
              icon:  <Siren size={18} />,
              title: "Incident Reporting",
              sub:   "(Incident Notification — CSIRT Italia)",
              desc:  "Modulo di notifica incidenti con tassonomia ACN. Pre-notifica entro 24h, notifica completa entro 72h.",
              retroattivo: true,
            },
            {
              id:    "policy",
              icon:  <FileCode2 size={18} />,
              title: "Policy Generator",
              sub:   "(Security Policy — NIS2 Compliant)",
              desc:  "Genera le policy di sicurezza informatica richieste dalla NIS2, calibrate sulla tipologia di struttura.",
              retroattivo: false,
            },
            {
              id:    "checklist",
              icon:  <ClipboardList size={18} />,
              title: "Checklist Misure Tecniche",
              sub:   "(Technical Measures — October 2026)",
              desc:  "Verifica e documenta l'adozione delle misure tecniche e organizzative obbligatorie entro ottobre 2026.",
              retroattivo: false,
            },
          ].map((modulo) => (
            <ModuloBox
              key={modulo.id}
              modulo={modulo}
              esito={esito}
              isPro={isPro}
              onUpgrade={() => router.push("/upgrade")}
            />
          ))}
        </div>

      </div>
    </AppShell>
  );
}

// ─────────────────────────────────────────────
// BOX 1: SOGGETTIVITÀ
// ─────────────────────────────────────────────
function SoggetivitaBox({
  assessment,
  onRivaluta,
  rivalutando,
  showOverride,
  setShowOverride,
  overrideTipo,
  setOverrideTipo,
  overrideEsito,
  setOverrideEsito,
  overrideMotivazione,
  setOverrideMotivazione,
  overrideLegale,
  setOverrideLegale,
  overrideFile,
  setOverrideFile,
  overrideSaving,
  overrideError,
  onSalvaOverride,
}: {
  assessment: Nis2Assessment | null;
  onRivaluta: () => void;
  rivalutando: boolean;
  showOverride: boolean;
  setShowOverride: (v: boolean) => void;
  overrideTipo: OverrideTipo;
  setOverrideTipo: (v: OverrideTipo) => void;
  overrideEsito: "soggetto_essenziale" | "non_soggetto";
  setOverrideEsito: (v: "soggetto_essenziale" | "non_soggetto") => void;
  overrideMotivazione: string;
  setOverrideMotivazione: (v: string) => void;
  overrideLegale: string;
  setOverrideLegale: (v: string) => void;
  overrideFile: File | null;
  setOverrideFile: (v: File | null) => void;
  overrideSaving: boolean;
  overrideError: string;
  onSalvaOverride: () => void;
}) {
  const esito = assessment?.esito_effettivo ?? null;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: T.ink2, border: `1px solid ${T.line}` }}
    >
      {/* Header box */}
      <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
        <Shield size={18} style={{ color: T.shield }} />
        <div>
          <p className="text-sm font-bold leading-relaxed" style={{ color: T.bone }}>
            Verifica Soggettività NIS2
          </p>
          <p className="text-xs leading-relaxed" style={{ color: T.slate400 }}>
            (Applicability Check — D.Lgs. 138/2024 art. 3)
          </p>
        </div>
      </div>

      <div className="px-5 py-5 flex flex-col gap-4">

        {/* Nessuna valutazione */}
        {!assessment && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <ShieldAlert size={36} style={{ color: T.slate400, opacity: 0.4 }} />
            <div>
              <p className="text-sm font-bold leading-relaxed" style={{ color: T.bone }}>
                Nessuna valutazione effettuata
              </p>
              <p className="text-xs leading-relaxed mt-1" style={{ color: T.slate400 }}>
                Avvia la verifica per determinare se la tua organizzazione è soggetta alla normativa NIS2.
              </p>
            </div>
            <button
              onClick={onRivaluta}
              disabled={rivalutando}
              className="px-5 py-2.5 rounded-lg text-sm font-bold transition-opacity hover:opacity-80"
              style={{ backgroundColor: T.shieldBg, color: T.shield, border: `1px solid rgba(37,99,235,.35)` }}
            >
              {rivalutando ? "Analisi in corso…" : "Avvia verifica soggettività →"}
            </button>
            <p className="text-xs leading-relaxed" style={{ color: T.slate400, opacity: 0.6 }}>
              Assicurati di aver compilato i dati societari in Anagrafica prima di procedere.
            </p>
          </div>
        )}

        {/* Esito presente */}
        {assessment && esito && (
          <>
            {/* Badge esito */}
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-lg"
              style={{ backgroundColor: esitoColorBg(esito), border: `1px solid ${esitoColor(esito)}33` }}
            >
              <span style={{ color: esitoColor(esito) }}>{esitoIcon(esito, 22)}</span>
              <div>
                <p className="text-sm font-black leading-relaxed" style={{ color: esitoColor(esito) }}>
                  {esitoLabel(esito)}
                </p>
                <p className="text-xs leading-relaxed" style={{ color: T.slate400 }}>
                  Valutazione del {formatDate(assessment.created_at)}
                  {assessment.override_at && ` · Confermato il ${formatDate(assessment.override_at)}`}
                </p>
              </div>
            </div>

            {/* Override badge */}
            {assessment.override_tipo && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                style={{ backgroundColor: T.emeraldBg, color: T.emerald, border: `1px solid rgba(62,207,142,.2)` }}
              >
                <CheckCircle2 size={13} />
                {assessment.override_tipo === "blu"
                  ? `Parere legale acquisito${assessment.parere_legale_professionista ? ` — ${assessment.parere_legale_professionista}` : ""}`
                  : "Soggettività autocertificata"}
                {assessment.parere_legale_file_url && (
                  <a
                    href={assessment.parere_legale_file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto flex items-center gap-1 hover:opacity-80"
                    style={{ color: T.emerald }}
                  >
                    <ExternalLink size={11} /> Documento
                  </a>
                )}
              </div>
            )}

            {/* Motivazioni */}
            <div className="flex flex-col gap-2">
              {assessment.motivazioni.map((m, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Info size={13} style={{ color: T.slate400, flexShrink: 0, marginTop: 2 }} />
                  <p className="text-xs leading-relaxed" style={{ color: T.boneDim }}>{m}</p>
                </div>
              ))}
              {assessment.override_motivazione && (
                <div className="flex items-start gap-2 mt-1">
                  <FileText size={13} style={{ color: T.amber, flexShrink: 0, marginTop: 2 }} />
                  <p className="text-xs leading-relaxed" style={{ color: T.boneDim }}>
                    <span style={{ color: T.amber }}>Motivazione dichiarata: </span>
                    {assessment.override_motivazione}
                  </p>
                </div>
              )}
            </div>

            {/* Snapshot dati */}
            <div
              className="flex gap-4 px-3 py-2 rounded-lg flex-wrap"
              style={{ backgroundColor: "rgba(238,241,248,.04)", border: `1px solid ${T.line}` }}
            >
              {assessment.snapshot_dipendenti && (
                <span className="text-xs leading-relaxed" style={{ color: T.slate400 }}>
                  Dipendenti: <span style={{ color: T.boneDim }}>{assessment.snapshot_dipendenti}</span>
                </span>
              )}
              {assessment.snapshot_fatturato && (
                <span className="text-xs leading-relaxed" style={{ color: T.slate400 }}>
                  Fatturato: <span style={{ color: T.boneDim }}>{assessment.snapshot_fatturato}</span>
                </span>
              )}
              {assessment.snapshot_is_pa && (
                <span className="text-xs leading-relaxed" style={{ color: T.amber }}>
                  Ente Pubblico / PA
                </span>
              )}
            </div>

            {/* Pannello override borderline */}
            {esito === "borderline" && (
              <div
                className="rounded-lg overflow-hidden"
                style={{ border: `1px solid ${T.amber}44` }}
              >
                <button
                  onClick={() => setShowOverride(!showOverride)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold transition-opacity hover:opacity-80"
                  style={{ backgroundColor: T.amberBg, color: T.amber }}
                >
                  <span className="flex items-center gap-2">
                    <AlertTriangle size={14} />
                    Registra decisione sulla soggettività
                  </span>
                  {showOverride ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {showOverride && (
                  <div className="px-4 py-4 flex flex-col gap-4" style={{ backgroundColor: "rgba(245,158,11,.04)" }}>

                    {/* Scelta strada */}
                    <div className="flex gap-2">
                      {(["ambra", "blu"] as OverrideTipo[]).map((t) => (
                        <button
                          key={t}
                          onClick={() => setOverrideTipo(t)}
                          className="flex-1 py-2 rounded-lg text-xs font-bold transition-opacity hover:opacity-80"
                          style={{
                            backgroundColor: overrideTipo === t ? (t === "blu" ? T.shieldBg : T.amberBg) : "transparent",
                            color: overrideTipo === t ? (t === "blu" ? T.shield : T.amber) : T.slate400,
                            border: `1px solid ${overrideTipo === t ? (t === "blu" ? "rgba(37,99,235,.35)" : "rgba(245,158,11,.35)") : T.line}`,
                          }}
                        >
                          {t === "ambra" ? "🟡 Autocertifica" : "🔵 Carica parere legale"}
                        </button>
                      ))}
                    </div>

                    {/* Scelta esito */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold" style={{ color: T.slate400 }}>Decisione *</label>
                      <div className="flex gap-2">
                        {([
                          { v: "soggetto_essenziale", label: "Soggetto NIS2" },
                          { v: "non_soggetto",         label: "Non soggetto NIS2" },
                        ] as const).map(({ v, label }) => (
                          <button
                            key={v}
                            onClick={() => setOverrideEsito(v)}
                            className="flex-1 py-2 rounded-lg text-xs font-bold transition-opacity hover:opacity-80"
                            style={{
                              backgroundColor: overrideEsito === v ? T.shieldBg : "transparent",
                              color: overrideEsito === v ? T.shield : T.slate400,
                              border: `1px solid ${overrideEsito === v ? "rgba(37,99,235,.35)" : T.line}`,
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Motivazione */}
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-bold" style={{ color: T.slate400 }}>
                        Motivazione * {overrideTipo === "ambra" && <span style={{ color: T.amber }}>(dichiarazione sotto tua responsabilità)</span>}
                      </label>
                      <textarea
                        value={overrideMotivazione}
                        onChange={(e) => setOverrideMotivazione(e.target.value)}
                        rows={3}
                        placeholder="Es. Verificato con Studio Legale Rossi — organico FTE reale sotto soglia 50 unità…"
                        className="rounded-lg px-3 py-2 text-xs leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                        style={{ backgroundColor: T.slate100, color: T.bone, border: `1px solid ${T.line}` }}
                      />
                    </div>

                    {/* Strada blu: upload + nome legale */}
                    {overrideTipo === "blu" && (
                      <>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-bold" style={{ color: T.slate400 }}>Nome professionista / studio legale</label>
                          <input
                            type="text"
                            value={overrideLegale}
                            onChange={(e) => setOverrideLegale(e.target.value)}
                            placeholder="Es. Studio Legale Rossi, Avv. Mario Rossi"
                            className="rounded-lg px-3 py-2 text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500"
                            style={{ backgroundColor: T.slate100, color: T.bone, border: `1px solid ${T.line}` }}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-bold" style={{ color: T.slate400 }}>Documento parere legale (PDF) *</label>
                          <label
                            className="flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-opacity hover:opacity-80"
                            style={{ backgroundColor: T.shieldBg, border: `1px dashed rgba(37,99,235,.35)`, color: T.shield }}
                          >
                            <Upload size={15} />
                            <span className="text-xs font-bold">
                              {overrideFile ? overrideFile.name : "Seleziona file PDF…"}
                            </span>
                            <input
                              type="file"
                              accept=".pdf"
                              className="hidden"
                              onChange={(e) => setOverrideFile(e.target.files?.[0] ?? null)}
                            />
                          </label>
                        </div>
                      </>
                    )}

                    {/* Disclaimer */}
                    <p className="text-xs leading-relaxed" style={{ color: T.slate400, opacity: 0.7 }}>
                      {overrideTipo === "ambra"
                        ? "⚠️ Questa dichiarazione è sotto la tua esclusiva responsabilità. CLAVIS ne traccia l'autore, la data e la motivazione per finalità di audit."
                        : "Il documento caricato sarà conservato a fini di audit. CLAVIS non esprime pareri legali."}
                    </p>

                    {/* Error */}
                    {overrideError && (
                      <p className="text-xs font-bold" style={{ color: T.red }}>{overrideError}</p>
                    )}

                    {/* Azioni */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowOverride(false)}
                        className="flex-1 py-2 rounded-lg text-xs font-bold transition-opacity hover:opacity-80"
                        style={{ color: T.slate400, border: `1px solid ${T.line}` }}
                      >
                        Annulla
                      </button>
                      <button
                        onClick={onSalvaOverride}
                        disabled={overrideSaving}
                        className="flex-1 py-2 rounded-lg text-xs font-bold transition-opacity hover:opacity-80"
                        style={{ backgroundColor: T.shieldBg, color: T.shield, border: `1px solid rgba(37,99,235,.35)` }}
                      >
                        {overrideSaving ? "Salvataggio…" : "Conferma decisione →"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// BOX SCADENZE
// ─────────────────────────────────────────────
function ScadenzeBox() {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ backgroundColor: T.ink2, border: `1px solid ${T.line}` }}
    >
      <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
        <Clock size={18} style={{ color: T.slate400 }} />
        <div>
          <p className="text-sm font-bold leading-relaxed" style={{ color: T.bone }}>Cronoprogramma NIS2</p>
          <p className="text-xs leading-relaxed" style={{ color: T.slate400 }}>(Compliance Timeline — D.Lgs. 138/2024)</p>
        </div>
      </div>
      <div className="px-5 py-4 flex flex-col gap-3">
        {SCADENZE.map((s, i) => (
          <div key={i} className="flex items-start gap-3">
            <div
              className="mt-0.5 w-2 h-2 rounded-full flex-shrink-0"
              style={{
                backgroundColor: s.stato === "retroattivo" ? T.amber : T.shield,
                boxShadow: s.stato === "attivo" ? `0 0 6px ${T.shield}` : "none",
              }}
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold leading-relaxed" style={{ color: T.bone }}>{s.label}</span>
                <span
                  className="text-xs px-2 py-0.5 rounded font-bold uppercase tracking-wider"
                  style={{
                    backgroundColor: s.stato === "retroattivo" ? T.amberBg : T.shieldBg,
                    color: s.stato === "retroattivo" ? T.amber : T.shield,
                  }}
                >
                  {s.stato === "retroattivo" ? "⚠ Da sanare" : "Scadenza attiva"}
                </span>
              </div>
              <p className="text-xs leading-relaxed mt-0.5" style={{ color: T.slate400 }}>
                {s.data} · {s.note}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// BOX MODULO OPERATIVO (gated)
// ─────────────────────────────────────────────
function ModuloBox({
  modulo,
  esito,
  isPro,
  onUpgrade,
}: {
  modulo: { id: string; icon: React.ReactNode; title: string; sub: string; desc: string; retroattivo: boolean };
  esito: Nis2Tier | null;
  isPro: boolean;
  onUpgrade: () => void;
}) {
  const isNonSoggetto    = esito === "non_soggetto";
  const nessunValutazione = esito === null;
  const isLocked         = !isPro || nessunValutazione;

  // colore header in base allo stato
  const headerColor = isNonSoggetto
    ? T.slate400
    : isLocked
      ? T.slate400
      : T.bone;

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col"
      style={{
        backgroundColor: T.ink2,
        border: `1px solid ${T.line}`,
        opacity: isNonSoggetto ? 0.55 : 1,
        minHeight: "220px",
      }}
    >
      {/* Barra stato non soggetto */}
      {isNonSoggetto && (
        <div
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold"
          style={{ backgroundColor: "rgba(154,163,189,.08)", color: T.slate400, borderBottom: `1px solid ${T.line}` }}
        >
          <ShieldX size={13} />
          Non soggetto NIS2 — modulo non applicabile
        </div>
      )}

      {/* Header modulo */}
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: `1px solid ${T.line}` }}
      >
        <div className="flex items-center gap-3">
          <span style={{ color: isNonSoggetto ? T.slate400 : isLocked ? T.slate400 : T.shield }}>
            {isLocked && !isNonSoggetto ? <Lock size={18} /> : modulo.icon}
          </span>
          <div>
            <p className="text-sm font-bold leading-relaxed" style={{ color: headerColor }}>
              {modulo.title}
              {modulo.retroattivo && !isNonSoggetto && (
                <span
                  className="ml-2 text-xs px-1.5 py-0.5 rounded font-bold uppercase tracking-wider"
                  style={{ backgroundColor: T.amberBg, color: T.amber }}
                >
                  Da sanare
                </span>
              )}
            </p>
            <p className="text-xs leading-relaxed" style={{ color: T.slate400 }}>{modulo.sub}</p>
          </div>
        </div>
      </div>

      {/* Contenuto — sempre visibile */}
      {!isNonSoggetto && (
        <div className="flex-1 px-5 py-5 flex flex-col gap-4">
          <p className="text-sm leading-relaxed" style={{ color: T.boneDim }}>{modulo.desc}</p>

          {/* Gate Pro */}
          {!isPro && (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm leading-relaxed"
              style={{ backgroundColor: T.shieldBg, border: `1px solid rgba(37,99,235,.25)`, color: T.boneDim }}
            >
              <Lock size={14} style={{ color: T.shield, flexShrink: 0 }} />
              <span>
                Funzione disponibile dal piano Silver.{" "}
                <button
                  onClick={onUpgrade}
                  className="font-bold underline underline-offset-2 transition-opacity hover:opacity-80"
                  style={{ color: T.shield }}
                >
                  Vedi i piani →
                </button>
              </span>
            </div>
          )}

          {/* Gate nessuna valutazione */}
          {isPro && nessunValutazione && (
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm leading-relaxed"
              style={{ backgroundColor: T.amberBg, border: `1px solid rgba(245,158,11,.25)`, color: T.boneDim }}
            >
              <AlertTriangle size={14} style={{ color: T.amber, flexShrink: 0 }} />
              Completa prima la verifica di soggettività per sbloccare i moduli operativi.
            </div>
          )}

          {/* Contenuto Pro attivo — placeholder per i moduli reali */}
          {isPro && !nessunValutazione && (
            <div
              className="flex items-center justify-center py-8 rounded-lg text-sm"
              style={{ backgroundColor: "rgba(238,241,248,.03)", border: `1px dashed ${T.line}`, color: T.slate400 }}
            >
              Modulo in sviluppo — disponibile nel prossimo sprint
            </div>
          )}
        </div>
      )}
    </div>
  );
}
