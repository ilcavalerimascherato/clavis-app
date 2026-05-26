"use client";

/**
 * components/CompanyRiskProfile.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Form riutilizzabile per il profilo di rischio societario.
 * Aggiorna le colonne di rischio su `companies` e `entities`.
 *
 * Props:
 *  companyId — UUID della società
 *  entityId  — UUID della struttura collegata
 *  onSaved   — callback opzionale dopo salvataggio ok
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { ClavisTitle } from "@/components/ui/ClavisTitle";

// ─── Opzioni select ──────────────────────────────────────────────────────────

const FATTURATO_OPTIONS = [
  { value: "sotto_1M",  label: "< 1 M €" },
  { value: "1M_5M",    label: "1 M — 5 M €" },
  { value: "5M_20M",   label: "5 M — 20 M €" },
  { value: "20M_50M",  label: "20 M — 50 M €" },
  { value: "oltre_50M",label: "> 50 M €" },
] as const;

const DIPENDENTI_OPTIONS = [
  { value: "sotto_20",  label: "< 20 dipendenti" },
  { value: "20_49",    label: "20 — 49 dipendenti" },
  { value: "50_249",   label: "50 — 249 dipendenti" },
  { value: "250_piu",  label: "≥ 250 dipendenti" },
] as const;

const CONVENZIONE_OPTIONS = [
  { value: "privato", label: "Privato — nessuna convenzione" },
  { value: "SSN",     label: "SSN — Servizio Sanitario Nazionale" },
  { value: "SSR",     label: "SSR — Servizio Sanitario Regionale" },
  { value: "mista",   label: "Mista (SSN + privato)" },
] as const;

// ─── Tipi interni ────────────────────────────────────────────────────────────

interface CompanyRiskRow {
  fatturato_fascia:        string | null;
  n_dipendenti_fascia:     string | null;
  storico_violazioni:      boolean | null;
  storico_violazioni_note: string | null;
}

interface EntitySsnRow {
  convenzione_ssn:  boolean | null;
  tipo_convenzione: string | null;
}

export interface CompanyRiskProfileProps {
  companyId: string;
  entityId:  string;
  onSaved?:  () => void;
}

// ─── Helper UI ────────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-xs font-semibold uppercase tracking-wider"
      style={{ color: "var(--bone-dim)" }}
    >
      {children}
    </span>
  );
}

function SelectField({
  value,
  onChange,
  options,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className="w-full px-3 py-2 text-sm outline-none rounded transition-opacity"
      style={{
        background:  "rgba(255,255,255,0.05)",
        border:      "1px solid var(--line2)",
        color:       disabled ? "var(--bone-dim)" : "var(--bone)",
        opacity:     disabled ? 0.55 : 1,
        cursor:      disabled ? "not-allowed" : "auto",
      }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value} style={{ background: "var(--ink2)" }}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ─── NIS2 Badge ──────────────────────────────────────────────────────────────

function Nis2Badge({ soggettivita }: { soggettivita: "essenziale" | "importante" | "non_soggetto" }) {
  const cfg = {
    essenziale:    { label: "NIS2 Essenziale",    color: "#E8634A", bg: "rgba(232,99,74,.12)"  },
    importante:    { label: "NIS2 Importante",    color: "#D9B25A", bg: "rgba(217,178,90,.12)" },
    non_soggetto:  { label: "Fuori soglie NIS2",  color: "#9AA3BD", bg: "rgba(154,163,189,.10)"},
  }[soggettivita];

  return (
    <span
      className="text-xs font-bold px-2.5 py-1 rounded"
      style={{ color: cfg.color, backgroundColor: cfg.bg, fontSize: "11px", letterSpacing: "0.06em" }}
    >
      {cfg.label}
    </span>
  );
}

// ─── Componente principale ───────────────────────────────────────────────────

export function CompanyRiskProfile({ companyId, entityId, onSaved }: CompanyRiskProfileProps) {
  const supabase = createClient();

  // ── Stato campi società ───────────────────────────────────────────────────
  const [fatturatoFascia,  setFatturatoFascia]  = useState("sotto_1M");
  const [dipendentiFascia, setDipendentiFascia] = useState("sotto_20");
  const [storicoViolazioni,setStoricoViolazioni]= useState(false);
  const [storicoNote,      setStoricoNote]      = useState("");

  // ── Stato campi entity ───────────────────────────────────────────────────
  const [convenzioneSsn,  setConvenzioneSsn]  = useState(false);
  const [tipoConvenzione, setTipoConvenzione] = useState("privato");

  // ── UI state ─────────────────────────────────────────────────────────────
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [savedOk,  setSavedOk]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  // ── Caricamento dati ─────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [compRes, entRes] = await Promise.all([
        supabase
          .from("companies")
          .select("fatturato_fascia, n_dipendenti_fascia, storico_violazioni, storico_violazioni_note")
          .eq("id", companyId)
          .maybeSingle(),
        supabase
          .from("entities")
          .select("convenzione_ssn, tipo_convenzione")
          .eq("id", entityId)
          .maybeSingle(),
      ]);

      if (compRes.data) {
        const c = compRes.data as CompanyRiskRow;
        setFatturatoFascia(c.fatturato_fascia        ?? "sotto_1M");
        setDipendentiFascia(c.n_dipendenti_fascia    ?? "sotto_20");
        setStoricoViolazioni(c.storico_violazioni    ?? false);
        setStoricoNote(c.storico_violazioni_note     ?? "");
      }

      if (entRes.data) {
        const e = entRes.data as EntitySsnRow;
        setConvenzioneSsn(e.convenzione_ssn   ?? false);
        setTipoConvenzione(e.tipo_convenzione ?? "privato");
      }
    } finally {
      setLoading(false);
    }
  }, [supabase, companyId, entityId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── NIS2 soggettività (preview live, senza chiamate) ─────────────────────
  const nis2Preview = useMemo<"essenziale" | "importante" | "non_soggetto">(() => {
    const dip50  = ["50_249", "250_piu"].includes(dipendentiFascia);
    const fat10M = ["5M_20M", "20M_50M", "oltre_50M"].includes(fatturatoFascia);
    if (dip50 || fat10M || convenzioneSsn) return "essenziale";
    const dip20  = ["20_49", "50_249", "250_piu"].includes(dipendentiFascia);
    const fat1M  = ["1M_5M", "5M_20M", "20M_50M", "oltre_50M"].includes(fatturatoFascia);
    if (dip20 || fat1M) return "importante";
    return "non_soggetto";
  }, [dipendentiFascia, fatturatoFascia, convenzioneSsn]);

  // ── Salvataggio ───────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const [compRes, entRes] = await Promise.all([
        supabase.from("companies").update({
          fatturato_fascia:        fatturatoFascia,
          n_dipendenti_fascia:     dipendentiFascia,
          storico_violazioni:      storicoViolazioni,
          storico_violazioni_note: storicoNote || null,
        }).eq("id", companyId),

        supabase.from("entities").update({
          convenzione_ssn:  convenzioneSsn,
          tipo_convenzione: tipoConvenzione,
        }).eq("id", entityId),
      ]);

      if (compRes.error || entRes.error) {
        throw new Error(
          compRes.error?.message || entRes.error?.message || "Errore nel salvataggio"
        );
      }

      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3_500);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setSaving(false);
    }
  }, [
    supabase, companyId, entityId,
    fatturatoFascia, dipendentiFascia, storicoViolazioni, storicoNote,
    convenzioneSsn, tipoConvenzione, onSaved,
  ]);

  // ── Render — loading ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center gap-3 py-5"
        style={{ border: "1px solid var(--line2)", borderRadius: "6px", padding: "20px", background: "var(--ink2)" }}>
        <span className="clavis-pulse" />
        <span className="text-sm" style={{ color: "var(--bone-dim)" }}>
          Caricamento profilo rischio...
        </span>
      </div>
    );
  }

  // ── Render — form ─────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ background: "var(--ink2)", border: "1px solid var(--line2)", borderRadius: "6px" }}
    >

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div
        className="flex items-start justify-between gap-4 px-5 py-4"
        style={{ borderBottom: "1px solid var(--line)", background: "var(--ink3)" }}
      >
        <div>
          <ClavisTitle
            it="Profilo Rischio Societario"
            en="Company Risk Profile"
            variant="section"
          />
          <p className="text-xs mt-1.5 leading-snug" style={{ color: "var(--bone-dim)" }}>
            I dati aziendali qui inseriti calibrano la stima sanzionatoria nel report di triage normativo.
          </p>
        </div>
        <Nis2Badge soggettivita={nis2Preview} />
      </div>

      {/* ── BODY — due colonne ──────────────────────────────────────────────── */}
      <div className="grid gap-6 px-5 py-5" style={{ gridTemplateColumns: "1fr 1fr" }}>

        {/* Colonna sinistra — Dati Società */}
        <div className="flex flex-col gap-4">
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--shield-soft)" }}>
            Dati Società
          </p>

          {/* Fatturato */}
          <div className="flex flex-col gap-1.5">
            <Label>Fascia Fatturato Annuo</Label>
            <SelectField
              value={fatturatoFascia}
              onChange={setFatturatoFascia}
              options={FATTURATO_OPTIONS}
            />
          </div>

          {/* Dipendenti */}
          <div className="flex flex-col gap-1.5">
            <Label>Fascia Numero Dipendenti</Label>
            <SelectField
              value={dipendentiFascia}
              onChange={setDipendentiFascia}
              options={DIPENDENTI_OPTIONS}
            />
          </div>

          {/* Storico violazioni */}
          <div className="flex flex-col gap-2.5">
            <label
              className="flex items-start gap-3 cursor-pointer group"
              style={{ userSelect: "none" }}
            >
              <input
                type="checkbox"
                checked={storicoViolazioni}
                onChange={e => setStoricoViolazioni(e.target.checked)}
                className="mt-0.5 flex-shrink-0 cursor-pointer"
                style={{ accentColor: "var(--warn)" }}
              />
              <span className="text-sm leading-snug" style={{ color: "var(--bone)" }}>
                Storico violazioni normative precedenti
              </span>
            </label>
            {storicoViolazioni && (
              <textarea
                value={storicoNote}
                onChange={e => setStoricoNote(e.target.value)}
                rows={3}
                placeholder="Sintesi delle violazioni: norma, anno, autorità, esito..."
                className="w-full px-3 py-2 text-sm resize-none outline-none rounded"
                style={{
                  background:  "rgba(255,255,255,0.05)",
                  border:      "1px solid rgba(232,99,74,.40)",
                  color:       "var(--bone)",
                }}
              />
            )}
            {storicoViolazioni && (
              <p className="text-xs" style={{ color: "var(--warn)", fontStyle: "italic" }}>
                ⚠ Lo storico violazioni aumenta la stima sanzionatoria del +50%.
              </p>
            )}
          </div>
        </div>

        {/* Colonna destra — Dati Struttura */}
        <div className="flex flex-col gap-4">
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--gold)" }}>
            Dati Struttura
          </p>

          {/* Convenzione SSN */}
          <label
            className="flex items-start gap-3 cursor-pointer"
            style={{ userSelect: "none" }}
          >
            <input
              type="checkbox"
              checked={convenzioneSsn}
              onChange={e => {
                setConvenzioneSsn(e.target.checked);
                if (!e.target.checked) setTipoConvenzione("privato");
              }}
              className="mt-0.5 flex-shrink-0 cursor-pointer"
              style={{ accentColor: "var(--shield-soft)" }}
            />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold" style={{ color: "var(--bone)" }}>
                Convenzione con SSN / SSR
              </span>
              <span className="text-xs" style={{ color: "var(--bone-dim)" }}>
                Determina automaticamente soggettività NIS2 essenziale
              </span>
            </div>
          </label>

          {/* Tipo convenzione */}
          <div className="flex flex-col gap-1.5">
            <Label>Tipo Convenzione</Label>
            <SelectField
              value={tipoConvenzione}
              onChange={setTipoConvenzione}
              options={CONVENZIONE_OPTIONS}
              disabled={!convenzioneSsn}
            />
          </div>

          {/* Info box */}
          <div
            className="flex flex-col gap-1.5 px-3 py-3 rounded"
            style={{
              background: "rgba(58,109,240,0.08)",
              border:     "1px solid rgba(58,109,240,0.2)",
            }}
          >
            <p className="text-xs font-semibold" style={{ color: "var(--shield-soft)" }}>
              Impatto sulla stima sanzionatoria
            </p>
            <p className="text-xs leading-relaxed" style={{ color: "var(--bone-dim)" }}>
              {nis2Preview === "essenziale" && (
                <>La struttura è classificata <strong style={{ color: "var(--bone)" }}>NIS2 Essenziale</strong>:
                massimale 10 M € o 2% del fatturato globale.</>
              )}
              {nis2Preview === "importante" && (
                <>La struttura è classificata <strong style={{ color: "var(--bone)" }}>NIS2 Importante</strong>:
                massimale 7 M € o 1,4% del fatturato globale.</>
              )}
              {nis2Preview === "non_soggetto" && (
                <>La struttura è sotto le soglie NIS2. Il GDPR e D.Lgs. 231 si applicano comunque.</>
              )}
            </p>
          </div>

          {/* Avviso coerenza tipo_convenzione */}
          {!convenzioneSsn && tipoConvenzione !== "privato" && (
            <p className="text-xs" style={{ color: "var(--warn)", fontStyle: "italic" }}>
              ⚠ Attiva la spunta "Convenzione SSN/SSR" se l&apos;accordo è in essere.
            </p>
          )}
        </div>
      </div>

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between gap-3 px-5 py-4"
        style={{ borderTop: "1px solid var(--line)" }}
      >
        {/* Feedback */}
        <div style={{ minHeight: "20px" }}>
          {error && (
            <p className="text-xs font-semibold" style={{ color: "var(--warn)" }}>
              ✗ {error}
            </p>
          )}
          {savedOk && !error && (
            <p className="text-xs font-semibold" style={{ color: "var(--emerald)" }}>
              ✓ Profilo rischio aggiornato
            </p>
          )}
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="text-sm px-5 py-2 font-bold uppercase tracking-widest transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ backgroundColor: "var(--shield)", color: "var(--bone)", borderRadius: "4px" }}
        >
          {saving ? "Salvataggio..." : "Salva profilo rischio"}
        </button>
      </div>

    </div>
  );
}
