"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useActiveEntity } from "@/contexts/EntityContext";
import LEGAL_DICT from "@/config/legal_dictionary.json";
import AppShell from "@/components/layout/AppShell";
import { T } from "@/lib/clavis-tokens";
import {
  classificaSistema,
  preClassificaDaSottocategoria,
  CLASSIFICAZIONE_BADGE,
  QUESTIONARIO,
  RUOLO_SCELTA_LABEL,
  type AiClassificationType,
  type QuestionarioRuoloType,
  type QuestionarioRisposte,
} from "@/lib/aiClassification";
import {
  Cpu, Plus, ChevronDown, ChevronUp, X,
  AlertTriangle, CheckCircle, HelpCircle, Circle, Info, Shield,
} from "lucide-react";

// ─── TIPI ────────────────────────────────────────────────────────────────────

/**
 * Criticità NIS2 a livello di singolo sistema — campo indipendente da
 * ai_classificazione, mdr_classe e dalla soggettività NIS2 aziendale
 * (fn_verifica_soggettivita_nis2 / pagina /nis2). Impostato manualmente.
 */
type CriticitaNis2Type = "non_valutata" | "bassa" | "media" | "alta" | "critica";

const CRITICITA_NIS2_LABEL: Record<CriticitaNis2Type, string> = {
  non_valutata: "Da valutare",
  bassa: "Bassa",
  media: "Media",
  alta: "Alta",
  critica: "Critica",
};

const CRITICITA_NIS2_COLORI: Record<CriticitaNis2Type, { border: string; bg: string; text: string }> = {
  non_valutata: { border: "#3f3f46", bg: "rgba(63,63,70,0.3)", text: "#a1a1aa" },
  bassa:        { border: "#14532d", bg: "rgba(20,83,45,0.3)", text: "#86efac" },
  media:        { border: "#78350f", bg: "rgba(120,53,15,0.3)", text: "#fcd34d" },
  alta:         { border: "#7c2d12", bg: "rgba(124,45,18,0.3)", text: "#fdba74" },
  critica:      { border: "#7f1d1d", bg: "rgba(127,29,29,0.3)", text: "#fca5a5" },
};

/** Risposte grezze del questionario NIS2 di sistema (indipendenti dal questionario AI Act) */
interface Nis2Risposte {
  dati_clinici?: boolean;        // Q1 — tratta/dà accesso a dati clinici/sanitari
  continuita_24h?: boolean;      // Q2 — fermo impatta l'assistenza entro 24h
  fallback_documentato?: boolean; // Q3 — procedura manuale di fallback testata (inverte il rischio)
  esposizione_remota?: boolean;  // Q4 — raggiungibile da remoto / esposto su rete esterna
}

interface DomandaNis2 {
  id: string;
  testo: string;
  sottotesto?: string;
  flag: keyof Nis2Risposte;
}

const DOMANDE_NIS2: DomandaNis2[] = [
  {
    id: "N_Q1",
    testo: "Il sistema tratta o dà accesso a dati clinici/sanitari degli ospiti?",
    flag: "dati_clinici",
  },
  {
    id: "N_Q2",
    testo: "Se si ferma, l'assistenza agli ospiti è impattata entro 24h (continuità di cura)?",
    flag: "continuita_24h",
  },
  {
    id: "N_Q3",
    testo: "Esiste una procedura manuale di fallback già documentata e testata?",
    sottotesto: "Attenzione: rispondere \"Sì\" qui abbassa il livello di rischio, non lo alza.",
    flag: "fallback_documentato",
  },
  {
    id: "N_Q4",
    testo: "Il sistema è raggiungibile da remoto o esposto su rete esterna?",
    flag: "esposizione_remota",
  },
];

/** Punteggio → livello di criticità NIS2. Q1=+2, Q2=+1, Q4=+1, Q3=-1 (fallback riduce il rischio). */
function calcolaCriticitaNis2(r: Nis2Risposte): { livello: CriticitaNis2Type; punti: number } {
  let punti = 0;
  if (r.dati_clinici) punti += 2;
  if (r.continuita_24h) punti += 1;
  if (r.esposizione_remota) punti += 1;
  if (r.fallback_documentato) punti -= 1;
  punti = Math.max(0, Math.min(4, punti));

  const livello: CriticitaNis2Type =
    punti === 0 ? "bassa" : punti <= 2 ? "media" : punti === 3 ? "alta" : "critica";

  return { livello, punti };
}

/** Profilo minimo di chi ha compilato una valutazione — ruolo opzionale in vista di profiles.ruolo (non ancora esistente) */
interface ProfiloValutatore {
  full_name: string;
  ruolo?: string | null;
}

function formatNomeRuolo(nome?: string | null, ruolo?: string | null): string | null {
  const parti = [nome, ruolo].filter((x): x is string => !!x);
  return parti.length > 0 ? parti.join(" · ") : null;
}

interface SistemaDigitale {
  id: string;
  supplier_id: string;
  entity_id: string;
  company_id: string;
  nome_sistema: string;
  versione: string | null;
  descrizione_uso: string | null;
  in_uso_dal: string | null;
  ai_classificazione: AiClassificationType;
  criticita_nis2: CriticitaNis2Type;
  questionario_risposte: QuestionarioRisposte;
  questionario_ruolo: QuestionarioRuoloType | null;
  questionario_completato_at: string | null;
  questionario_compilato_da: string | null;
  nis2_risposte: Nis2Risposte | null;
  nis2_valutato_da: string | null;
  nis2_valutato_at: string | null;
  flags_attivati: string[];
  supervisore_designato: string | null;
  log_retention_attivo: boolean | null;
  log_retention_mesi: number | null;
  conformita_aiact_dichiarata: boolean | null;
  mdr_classe: string | null;
  mdr_verificato: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
  // join
  supplier?: { categoria: string; sottocategoria: string; fornitore?: { ragione_sociale: string } | null };
  entity?: { name: string };
}

interface Profile { id: string; full_name: string; email: string; tier: string; }
interface EntityOption { id: string; name: string; company_id: string; }

interface FornitoreOption {
  id: string;
  categoria: string;
  sottocategoria: string;
  sistema_non_applicabile: boolean;
  supplier_registry: { ragione_sociale: string } | null;
}

/** Label leggibili per suppliers.categoria — stessa nomenclatura di app/fornitori/page.tsx */
const CATEGORIA_LABEL: Record<string, string> = {
  INFRASTRUTTURA_IT: "Infrastruttura IT",
  SOFTWARE_GESTIONALE: "Software Gestionale",
  DISPOSITIVI_CONNESSI: "Dispositivi Connessi",
  SERVIZI_ESTERNI: "Servizi Esterni",
};

/** Priorità visiva nella sezione "Fornitori senza sistema censito": le categorie con
 * più probabilità di avere un sistema digitale reale vengono prima; SERVIZI_ESTERNI in coda. */
const CATEGORIA_ORDINE_COPERTURA: Record<string, number> = {
  INFRASTRUTTURA_IT: 0,
  SOFTWARE_GESTIONALE: 1,
  DISPOSITIVI_CONNESSI: 2,
  SERVIZI_ESTERNI: 3,
};

interface NuovoSistemaForm {
  supplier_id: string;
  nome_sistema: string;
  versione: string;
  descrizione_uso: string;
  in_uso_dal: string;
  note: string;
}

const FORM_INIT: NuovoSistemaForm = {
  supplier_id: "",
  nome_sistema: "",
  versione: "",
  descrizione_uso: "",
  in_uso_dal: "",
  note: "",
};

// ─── STILI ───────────────────────────────────────────────────────────────────

const S = {
  card: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "8px",
  } as React.CSSProperties,
  input: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "4px",
    color: "#F1F5F9",
    colorScheme: "dark",
    padding: "8px 12px",
    fontSize: "14px",
    width: "100%",
  } as React.CSSProperties,
  label: {
    color: "#94A3B8",
    fontSize: "12px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    marginBottom: "6px",
    display: "block",
  } as React.CSSProperties,
  btn: {
    primary: {
      background: T.bronze,
      color: "#0F1117",
      border: "none",
      borderRadius: "6px",
      padding: "8px 16px",
      fontSize: "14px",
      fontWeight: 600,
      cursor: "pointer",
    } as React.CSSProperties,
    ghost: {
      background: "transparent",
      color: "#94A3B8",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: "6px",
      padding: "8px 16px",
      fontSize: "14px",
      cursor: "pointer",
    } as React.CSSProperties,
  },
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function BadgeClassificazione({ tipo, onClick }: { tipo: AiClassificationType; onClick?: (e: React.MouseEvent) => void }) {
  const b = CLASSIFICAZIONE_BADGE[tipo];
  const iconMap: Record<AiClassificationType, React.ReactNode> = {
    NON_VALUTATO:    <Circle size={12} />,
    NON_AI:          <CheckCircle size={12} />,
    RULE_BASED:      <HelpCircle size={12} />,
    AI_BASSO_RISCHIO: <Info size={12} />,
    AI_ALTO_RISCHIO: <AlertTriangle size={12} />,
  };
  return (
    <span
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{
        display: "inline-flex", alignItems: "center", gap: "4px",
        padding: "3px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: 600,
        cursor: onClick ? "pointer" : undefined,
        border: `1px solid`,
        borderColor: tipo === "AI_ALTO_RISCHIO" ? "#7f1d1d"
          : tipo === "RULE_BASED" ? "#78350f"
          : tipo === "AI_BASSO_RISCHIO" ? "#1e3a5f"
          : tipo === "NON_AI" ? "#14532d"
          : "#3f3f46",
        background: tipo === "AI_ALTO_RISCHIO" ? "rgba(127,29,29,0.3)"
          : tipo === "RULE_BASED" ? "rgba(120,53,15,0.3)"
          : tipo === "AI_BASSO_RISCHIO" ? "rgba(30,58,95,0.3)"
          : tipo === "NON_AI" ? "rgba(20,83,45,0.3)"
          : "rgba(63,63,70,0.3)",
        color: tipo === "AI_ALTO_RISCHIO" ? "#fca5a5"
          : tipo === "RULE_BASED" ? "#fcd34d"
          : tipo === "AI_BASSO_RISCHIO" ? "#93c5fd"
          : tipo === "NON_AI" ? "#86efac"
          : "#a1a1aa",
      }}>
      {iconMap[tipo]}
      {b.labelBreve}
    </span>
  );
}

function BadgeCriticitaNis2({ valore, onClick }: { valore: CriticitaNis2Type; onClick?: (e: React.MouseEvent) => void }) {
  const c = CRITICITA_NIS2_COLORI[valore];
  return (
    <span
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{
        display: "inline-flex", alignItems: "center", gap: "4px",
        padding: "3px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: 600,
        cursor: onClick ? "pointer" : undefined,
        border: `1px solid ${c.border}`, background: c.bg, color: c.text,
      }}>
      <Shield size={12} />
      NIS2 {CRITICITA_NIS2_LABEL[valore]}
    </span>
  );
}

// ─── MODAL VALUTAZIONE AI ACT ────────────────────────────────────────────────

function ModalValutazioneAiAct({
  sistema,
  onClose,
  onSalva,
}: {
  sistema: SistemaDigitale;
  onClose: () => void;
  onSalva: (
    id: string,
    risposte: QuestionarioRisposte,
    ruolo: QuestionarioRuoloType
  ) => Promise<void>;
}) {
  const [fase, setFase] = useState<"scelta_ruolo" | "domande" | "risultato">("scelta_ruolo");
  const [ruolo, setRuolo] = useState<QuestionarioRuoloType | null>(null);
  const [risposte, setRisposte] = useState<QuestionarioRisposte>({});
  const [indiceDomanda, setIndiceDomanda] = useState(0);
  const [saving, setSaving] = useState(false);

  const domande = ruolo ? QUESTIONARIO[ruolo] : [];
  const domandaCorrente = domande[indiceDomanda];
  const risultato = Object.keys(risposte).length > 0 ? classificaSistema(risposte) : null;

  function rispondi(flagTrigger: keyof QuestionarioRisposte, valore: boolean | string) {
    const nuoveRisposte = { ...risposte };
    if (typeof valore === "boolean") {
      (nuoveRisposte as Record<string, boolean | string>)[flagTrigger] = valore;
    } else {
      (nuoveRisposte as Record<string, boolean | string>)[flagTrigger] = valore;
    }
    setRisposte(nuoveRisposte);

    if (indiceDomanda < domande.length - 1) {
      setIndiceDomanda(i => i + 1);
    } else {
      setFase("risultato");
    }
  }

  async function handleSalva() {
    if (!ruolo || !risultato) return;
    setSaving(true);
    await onSalva(sistema.id, risposte, ruolo);
    setSaving(false);
    onClose();
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50,
      background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px",
    }}>
      <div style={{
        background: "#0F1117", border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: "12px", width: "100%", maxWidth: "560px",
        maxHeight: "90vh", overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        }}>
          <div>
            <p style={{ color: "#94A3B8", fontSize: "12px", marginBottom: "4px" }}>
              Valutazione AI Act
            </p>
            <h3 style={{ color: "#F1F5F9", fontSize: "16px", fontWeight: 600, margin: 0 }}>
              {sistema.nome_sistema}
            </h3>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: "24px" }}>

          {/* FASE 1 — Scelta ruolo */}
          {fase === "scelta_ruolo" && (
            <div>
              <p style={{ color: "#94A3B8", fontSize: "14px", marginBottom: "20px", lineHeight: "1.6" }}>
                Per mostrarti le domande più adatte, dimmi chi sta effettuando questa valutazione.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {(["direttore", "qualita", "it"] as QuestionarioRuoloType[]).map(r => (
                  <button
                    key={r}
                    onClick={() => { setRuolo(r); setFase("domande"); }}
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: "8px", padding: "14px 16px",
                      textAlign: "left", cursor: "pointer",
                      transition: "border-color 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = T.bronze)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")}
                  >
                    <p style={{ color: "#F1F5F9", fontSize: "14px", fontWeight: 600, margin: "0 0 4px" }}>
                      {RUOLO_SCELTA_LABEL[r].label}
                    </p>
                    <p style={{ color: "#94A3B8", fontSize: "13px", margin: 0 }}>
                      {RUOLO_SCELTA_LABEL[r].sublabel}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* FASE 2 — Domande */}
          {fase === "domande" && domandaCorrente && (
            <div>
              {/* Progressione */}
              <div style={{ marginBottom: "24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ color: "#94A3B8", fontSize: "12px" }}>
                    Domanda {indiceDomanda + 1} di {domande.length}
                  </span>
                  <span style={{ color: "#94A3B8", fontSize: "12px" }}>
                    {Math.round(((indiceDomanda) / domande.length) * 100)}%
                  </span>
                </div>
                <div style={{ height: "3px", background: "rgba(255,255,255,0.08)", borderRadius: "2px" }}>
                  <div style={{
                    height: "100%", borderRadius: "2px", background: T.bronze,
                    width: `${(indiceDomanda / domande.length) * 100}%`,
                    transition: "width 0.3s",
                  }} />
                </div>
              </div>

              <p style={{ color: "#F1F5F9", fontSize: "16px", fontWeight: 500, lineHeight: "1.6", marginBottom: "12px" }}>
                {domandaCorrente.testo}
              </p>
              {domandaCorrente.sottotesto && (
                <p style={{ color: "#64748B", fontSize: "13px", lineHeight: "1.6", marginBottom: "24px" }}>
                  {domandaCorrente.sottotesto}
                </p>
              )}

              {domandaCorrente.tipo === "boolean" && (
                <div style={{ display: "flex", gap: "12px" }}>
                  <button
                    onClick={() => rispondi(domandaCorrente.flag_trigger, true)}
                    style={{ ...S.btn.primary, flex: 1, textAlign: "center" }}
                  >
                    Sì
                  </button>
                  <button
                    onClick={() => rispondi(domandaCorrente.flag_trigger, false)}
                    style={{ ...S.btn.ghost, flex: 1, textAlign: "center" }}
                  >
                    No
                  </button>
                </div>
              )}

              {domandaCorrente.tipo === "tristate" && domandaCorrente.opzioni_tristate && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {domandaCorrente.opzioni_tristate.map(opzione => (
                    <button
                      key={opzione}
                      onClick={() => rispondi(domandaCorrente.flag_trigger, opzione)}
                      style={{
                        ...S.btn.ghost,
                        textAlign: "left",
                        padding: "12px 16px",
                      }}
                    >
                      {opzione}
                    </button>
                  ))}
                </div>
              )}

              {indiceDomanda > 0 && (
                <button
                  onClick={() => setIndiceDomanda(i => i - 1)}
                  style={{ ...S.btn.ghost, marginTop: "16px", fontSize: "13px", padding: "6px 12px" }}
                >
                  ← Torna indietro
                </button>
              )}
            </div>
          )}

          {/* FASE 3 — Risultato */}
          {fase === "risultato" && risultato && (
            <div>
              <div style={{ textAlign: "center", marginBottom: "24px" }}>
                <p style={{ color: "#94A3B8", fontSize: "13px", marginBottom: "12px" }}>
                  Classificazione AI Act
                </p>
                <BadgeClassificazione tipo={risultato.classificazione} />
              </div>

              <div style={{
                ...S.card,
                padding: "16px",
                marginBottom: "16px",
                borderColor: risultato.classificazione === "AI_ALTO_RISCHIO"
                  ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.08)",
              }}>
                <p style={{ color: "#CBD5E1", fontSize: "14px", lineHeight: "1.7", margin: 0 }}>
                  {risultato.motivazione}
                </p>
              </div>

              {risultato.azione_richiesta && (
                <div style={{
                  background: "rgba(217,178,90,0.08)",
                  border: "1px solid rgba(217,178,90,0.2)",
                  borderRadius: "6px", padding: "12px 16px", marginBottom: "20px",
                }}>
                  <p style={{ color: T.bronze, fontSize: "13px", fontWeight: 600, margin: "0 0 4px" }}>
                    Azione raccomandata
                  </p>
                  <p style={{ color: "#CBD5E1", fontSize: "13px", margin: 0 }}>
                    {risultato.azione_richiesta}
                  </p>
                </div>
              )}

              {risultato.flags_attivati.length > 0 && (
                <div style={{ marginBottom: "20px" }}>
                  <p style={{ ...S.label }}>Flag AI Act attivati</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {risultato.flags_attivati.map(f => (
                      <span key={f} style={{
                        background: "rgba(239,68,68,0.1)",
                        border: "1px solid rgba(239,68,68,0.2)",
                        borderRadius: "4px", padding: "3px 8px",
                        fontSize: "11px", color: "#fca5a5", fontFamily: "monospace",
                      }}>
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: "12px" }}>
                <button onClick={handleSalva} disabled={saving} style={S.btn.primary}>
                  {saving ? "Salvataggio…" : "Salva classificazione"}
                </button>
                <button
                  onClick={() => { setFase("scelta_ruolo"); setRisposte({}); setIndiceDomanda(0); }}
                  style={S.btn.ghost}
                >
                  Rifai valutazione
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── MODAL VALUTAZIONE NIS2 ──────────────────────────────────────────────────

function ModalValutazioneNis2({
  sistema,
  onClose,
  onSalva,
}: {
  sistema: SistemaDigitale;
  onClose: () => void;
  onSalva: (id: string, risposte: Nis2Risposte, criticita: CriticitaNis2Type) => Promise<void>;
}) {
  const [fase, setFase] = useState<"domande" | "risultato">("domande");
  const [risposte, setRisposte] = useState<Nis2Risposte>({});
  const [indiceDomanda, setIndiceDomanda] = useState(0);
  const [saving, setSaving] = useState(false);

  const domandaCorrente = DOMANDE_NIS2[indiceDomanda];
  const risultato = Object.keys(risposte).length === DOMANDE_NIS2.length
    ? calcolaCriticitaNis2(risposte)
    : null;

  function rispondi(flag: keyof Nis2Risposte, valore: boolean) {
    const nuoveRisposte = { ...risposte, [flag]: valore };
    setRisposte(nuoveRisposte);

    if (indiceDomanda < DOMANDE_NIS2.length - 1) {
      setIndiceDomanda(i => i + 1);
    } else {
      setFase("risultato");
    }
  }

  async function handleSalva() {
    if (!risultato) return;
    setSaving(true);
    await onSalva(sistema.id, risposte, risultato.livello);
    setSaving(false);
    onClose();
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50,
      background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px",
    }}>
      <div style={{
        background: "#0F1117", border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: "12px", width: "100%", maxWidth: "560px",
        maxHeight: "90vh", overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        }}>
          <div>
            <p style={{ color: "#94A3B8", fontSize: "12px", marginBottom: "4px" }}>
              Valutazione NIS2
            </p>
            <h3 style={{ color: "#F1F5F9", fontSize: "16px", fontWeight: 600, margin: 0 }}>
              {sistema.nome_sistema}
            </h3>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: "24px" }}>

          {/* FASE 1 — Domande */}
          {fase === "domande" && domandaCorrente && (
            <div>
              {/* Progressione */}
              <div style={{ marginBottom: "24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ color: "#94A3B8", fontSize: "12px" }}>
                    Domanda {indiceDomanda + 1} di {DOMANDE_NIS2.length}
                  </span>
                  <span style={{ color: "#94A3B8", fontSize: "12px" }}>
                    {Math.round((indiceDomanda / DOMANDE_NIS2.length) * 100)}%
                  </span>
                </div>
                <div style={{ height: "3px", background: "rgba(255,255,255,0.08)", borderRadius: "2px" }}>
                  <div style={{
                    height: "100%", borderRadius: "2px", background: T.bronze,
                    width: `${(indiceDomanda / DOMANDE_NIS2.length) * 100}%`,
                    transition: "width 0.3s",
                  }} />
                </div>
              </div>

              <p style={{ color: "#F1F5F9", fontSize: "16px", fontWeight: 500, lineHeight: "1.6", marginBottom: "12px" }}>
                {domandaCorrente.testo}
              </p>
              {domandaCorrente.sottotesto && (
                <p style={{ color: "#64748B", fontSize: "13px", lineHeight: "1.6", marginBottom: "24px" }}>
                  {domandaCorrente.sottotesto}
                </p>
              )}

              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  onClick={() => rispondi(domandaCorrente.flag, true)}
                  style={{ ...S.btn.primary, flex: 1, textAlign: "center" }}
                >
                  Sì
                </button>
                <button
                  onClick={() => rispondi(domandaCorrente.flag, false)}
                  style={{ ...S.btn.ghost, flex: 1, textAlign: "center" }}
                >
                  No
                </button>
              </div>

              {indiceDomanda > 0 && (
                <button
                  onClick={() => setIndiceDomanda(i => i - 1)}
                  style={{ ...S.btn.ghost, marginTop: "16px", fontSize: "13px", padding: "6px 12px" }}
                >
                  ← Torna indietro
                </button>
              )}
            </div>
          )}

          {/* FASE 2 — Risultato */}
          {fase === "risultato" && risultato && (
            <div>
              <div style={{ textAlign: "center", marginBottom: "24px" }}>
                <p style={{ color: "#94A3B8", fontSize: "13px", marginBottom: "12px" }}>
                  Criticità NIS2
                </p>
                <BadgeCriticitaNis2 valore={risultato.livello} />
              </div>

              <div style={{
                ...S.card,
                padding: "16px",
                marginBottom: "20px",
                borderColor: risultato.livello === "critica" || risultato.livello === "alta"
                  ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.08)",
              }}>
                <p style={{ color: "#CBD5E1", fontSize: "14px", lineHeight: "1.7", margin: 0 }}>
                  Punteggio calcolato: {risultato.punti}/4.{" "}
                  {risposte.dati_clinici && "Il sistema tratta dati clinici/sanitari. "}
                  {risposte.continuita_24h && "Un fermo impatta l'assistenza entro 24h. "}
                  {risposte.esposizione_remota && "Il sistema è esposto su rete esterna. "}
                  {risposte.fallback_documentato && "È presente una procedura di fallback documentata e testata, che riduce il rischio complessivo."}
                </p>
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                <button onClick={handleSalva} disabled={saving} style={S.btn.primary}>
                  {saving ? "Salvataggio…" : "Salva valutazione"}
                </button>
                <button
                  onClick={() => { setFase("domande"); setRisposte({}); setIndiceDomanda(0); }}
                  style={S.btn.ghost}
                >
                  Rifai valutazione
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── MODAL NUOVO SISTEMA ─────────────────────────────────────────────────────

function ModalNuovoSistema({
  fornitori,
  initialSupplierId,
  onClose,
  onSalva,
}: {
  fornitori: FornitoreOption[];
  initialSupplierId?: string | null;
  onClose: () => void;
  onSalva: (form: NuovoSistemaForm) => Promise<void>;
}) {
  const [form, setForm] = useState<NuovoSistemaForm>(() => ({
    ...FORM_INIT,
    supplier_id: initialSupplierId ?? "",
  }));
  const [saving, setSaving] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const fornitorePreselezionato = initialSupplierId
    ? fornitori.find(f => f.id === initialSupplierId) ?? null
    : null;

  const set = (k: keyof NuovoSistemaForm, v: string) =>
    setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit() {
    if (!form.supplier_id) { setErrore("Seleziona il fornitore del sistema."); return; }
    if (!form.nome_sistema.trim()) { setErrore("Inserisci il nome del sistema."); return; }
    setSaving(true);
    setErrore(null);
    await onSalva(form);
    setSaving(false);
    onClose();
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50,
      background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px",
    }}>
      <div style={{
        background: "#0F1117", border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: "12px", width: "100%", maxWidth: "520px",
        maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{
          padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <p style={{ color: "#94A3B8", fontSize: "12px", marginBottom: "2px" }}>
              Inventario Sistemi Digitali
            </p>
            <h3 style={{ color: "#F1F5F9", fontSize: "16px", fontWeight: 600, margin: 0 }}>
              Aggiungi sistema
            </h3>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>

          <div>
            <label style={S.label}>Fornitore *</label>
            {fornitorePreselezionato ? (
              <div style={{ ...S.input, background: "rgba(255,255,255,0.03)", color: "#CBD5E1" }}>
                {fornitorePreselezionato.supplier_registry?.ragione_sociale ?? "—"} ({fornitorePreselezionato.sottocategoria})
              </div>
            ) : (
              <select
                value={form.supplier_id}
                onChange={e => set("supplier_id", e.target.value)}
                style={{ ...S.input, backgroundColor: "#1a1f2e", color: "#F1F5F9" }}
              >
                <option value="" style={{ backgroundColor: "#1a1f2e", color: "#F1F5F9" }}>— Seleziona fornitore —</option>
                {fornitori.map(f => (
                  <option key={f.id} value={f.id} style={{ backgroundColor: "#1a1f2e", color: "#F1F5F9" }}>
                    {f.supplier_registry?.ragione_sociale ?? "—"} ({f.sottocategoria})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label style={S.label}>Nome sistema / prodotto *</label>
            <input
              type="text"
              placeholder="es. SaniCare RSA, GestiorePlus, ClinicalAI..."
              value={form.nome_sistema}
              onChange={e => set("nome_sistema", e.target.value)}
              style={S.input}
            />
          </div>

          <div>
            <label style={S.label}>Versione</label>
            <input
              type="text"
              placeholder="es. 4.2.1"
              value={form.versione}
              onChange={e => set("versione", e.target.value)}
              style={S.input}
            />
          </div>

          <div>
            <label style={S.label}>Descrizione uso in struttura</label>
            <textarea
              rows={3}
              placeholder="Come viene utilizzato questo sistema nella vostra attività quotidiana?"
              value={form.descrizione_uso}
              onChange={e => set("descrizione_uso", e.target.value)}
              style={{ ...S.input, resize: "vertical" }}
            />
          </div>

          <div>
            <label style={S.label}>In uso dal</label>
            <input
              type="date"
              value={form.in_uso_dal}
              onChange={e => set("in_uso_dal", e.target.value)}
              style={S.input}
            />
          </div>

          <div>
            <label style={S.label}>Note</label>
            <textarea
              rows={2}
              value={form.note}
              onChange={e => set("note", e.target.value)}
              style={{ ...S.input, resize: "vertical" }}
            />
          </div>

          {errore && (
            <p style={{ color: "#fca5a5", fontSize: "13px", margin: 0 }}>{errore}</p>
          )}

          <div style={{ display: "flex", gap: "12px", paddingTop: "8px" }}>
            <button onClick={handleSubmit} disabled={saving} style={S.btn.primary}>
              {saving ? "Salvataggio…" : "Aggiungi sistema"}
            </button>
            <button onClick={onClose} style={S.btn.ghost}>Annulla</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CARD SISTEMA ────────────────────────────────────────────────────────────

function CardSistema({
  sistema,
  profiliValutatori,
  onValutaAiAct,
  onValutaNis2,
}: {
  sistema: SistemaDigitale;
  profiliValutatori: Record<string, ProfiloValutatore>;
  onValutaAiAct: (s: SistemaDigitale, chainNis2: boolean) => void;
  onValutaNis2: (s: SistemaDigitale) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const b = CLASSIFICAZIONE_BADGE[sistema.ai_classificazione];

  const aiNonValutato = sistema.ai_classificazione === "NON_VALUTATO";
  const nis2NonValutato = sistema.criticita_nis2 === "non_valutata";

  const compilatoreAiAct = sistema.questionario_compilato_da
    ? profiliValutatori[sistema.questionario_compilato_da]
    : undefined;
  const valutatoreNis2 = sistema.nis2_valutato_da
    ? profiliValutatori[sistema.nis2_valutato_da]
    : undefined;

  return (
    <div style={{
      ...S.card,
      borderColor: sistema.ai_classificazione === "AI_ALTO_RISCHIO"
        ? "rgba(239,68,68,0.25)"
        : sistema.ai_classificazione === "NON_VALUTATO"
        ? "rgba(255,255,255,0.06)"
        : "rgba(255,255,255,0.08)",
      overflow: "hidden",
    }}>
      {/* Riga principale */}
      <div style={{
        padding: "16px 20px",
        display: "flex", alignItems: "center", gap: "16px",
        cursor: "pointer",
      }} onClick={() => setExpanded(e => !e)}>

        {/* Icona classificazione */}
        <div style={{
          width: "40px", height: "40px", borderRadius: "8px", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: sistema.ai_classificazione === "AI_ALTO_RISCHIO" ? "rgba(239,68,68,0.15)"
            : sistema.ai_classificazione === "RULE_BASED" ? "rgba(251,191,36,0.15)"
            : sistema.ai_classificazione === "AI_BASSO_RISCHIO" ? "rgba(59,130,246,0.15)"
            : sistema.ai_classificazione === "NON_AI" ? "rgba(34,197,94,0.1)"
            : "rgba(255,255,255,0.06)",
        }}>
          <Cpu size={18} color={
            sistema.ai_classificazione === "AI_ALTO_RISCHIO" ? "#fca5a5"
            : sistema.ai_classificazione === "RULE_BASED" ? "#fcd34d"
            : sistema.ai_classificazione === "AI_BASSO_RISCHIO" ? "#93c5fd"
            : sistema.ai_classificazione === "NON_AI" ? "#86efac"
            : "#64748B"
          } />
        </div>

        {/* Info principale */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ color: "#F1F5F9", fontSize: "15px", fontWeight: 600 }}>
              {sistema.nome_sistema}
            </span>
            {sistema.versione && (
              <span style={{ color: "#64748B", fontSize: "12px" }}>v{sistema.versione}</span>
            )}
            <BadgeClassificazione
              tipo={sistema.ai_classificazione}
              onClick={e => { e.stopPropagation(); onValutaAiAct(sistema, false); }}
            />
            <BadgeCriticitaNis2
              valore={sistema.criticita_nis2}
              onClick={e => { e.stopPropagation(); onValutaNis2(sistema); }}
            />
          </div>
          <p style={{ color: "#64748B", fontSize: "13px", margin: "4px 0 0" }}>
            {(sistema.supplier?.fornitore as any)?.ragione_sociale ?? "—"} · {sistema.supplier?.sottocategoria ?? ""}
          </p>
        </div>

        {/* CTA */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          {aiNonValutato && (
            <button
              onClick={e => { e.stopPropagation(); onValutaAiAct(sistema, aiNonValutato && nis2NonValutato); }}
              style={{ ...S.btn.primary, padding: "6px 14px", fontSize: "13px" }}
            >
              Valuta
            </button>
          )}
          {!aiNonValutato && (
            <button
              onClick={e => { e.stopPropagation(); onValutaAiAct(sistema, aiNonValutato && nis2NonValutato); }}
              style={{ ...S.btn.ghost, padding: "6px 14px", fontSize: "13px" }}
            >
              Rivaluta
            </button>
          )}
          {expanded ? <ChevronUp size={16} color="#64748B" /> : <ChevronDown size={16} color="#64748B" />}
        </div>
      </div>

      {/* Dettaglio espanso */}
      {expanded && (
        <div style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          padding: "16px 20px",
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px",
        }}>
          {sistema.descrizione_uso && (
            <div style={{ gridColumn: "1 / -1" }}>
              <p style={S.label}>Descrizione uso</p>
              <p style={{ color: "#CBD5E1", fontSize: "14px", margin: 0, lineHeight: "1.6" }}>
                {sistema.descrizione_uso}
              </p>
            </div>
          )}

          {sistema.questionario_completato_at && (
            <div>
              <p style={S.label}>Valutato il — AI Act</p>
              <p style={{ color: "#CBD5E1", fontSize: "14px", margin: 0 }}>
                {new Date(sistema.questionario_completato_at).toLocaleDateString("it-IT")}
              </p>
              {formatNomeRuolo(
                compilatoreAiAct?.full_name,
                sistema.questionario_ruolo ? RUOLO_SCELTA_LABEL[sistema.questionario_ruolo].label : null
              ) && (
                <p style={{ color: "#64748B", fontSize: "12px", margin: "2px 0 0" }}>
                  {formatNomeRuolo(
                    compilatoreAiAct?.full_name,
                    sistema.questionario_ruolo ? RUOLO_SCELTA_LABEL[sistema.questionario_ruolo].label : null
                  )}
                </p>
              )}
            </div>
          )}

          {sistema.nis2_valutato_at && (
            <div>
              <p style={S.label}>Valutato il — NIS2</p>
              <p style={{ color: "#CBD5E1", fontSize: "14px", margin: 0 }}>
                {new Date(sistema.nis2_valutato_at).toLocaleDateString("it-IT")}
              </p>
              {formatNomeRuolo(valutatoreNis2?.full_name, valutatoreNis2?.ruolo) && (
                <p style={{ color: "#64748B", fontSize: "12px", margin: "2px 0 0" }}>
                  {formatNomeRuolo(valutatoreNis2?.full_name, valutatoreNis2?.ruolo)}
                </p>
              )}
            </div>
          )}

          {sistema.flags_attivati.length > 0 && (
            <div style={{ gridColumn: "1 / -1" }}>
              <p style={S.label}>Flag AI Act attivati</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {sistema.flags_attivati.map(f => (
                  <span key={f} style={{
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    borderRadius: "4px", padding: "2px 8px",
                    fontSize: "11px", color: "#fca5a5", fontFamily: "monospace",
                  }}>
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {sistema.log_retention_attivo !== null && (
            <div>
              <p style={S.label}>Log retention</p>
              <p style={{ color: sistema.log_retention_attivo ? "#86efac" : "#fca5a5", fontSize: "14px", margin: 0 }}>
                {sistema.log_retention_attivo
                  ? `Attivo — ${sistema.log_retention_mesi ?? "?"} mesi`
                  : "Non configurato"}
              </p>
            </div>
          )}

          {sistema.mdr_classe && (
            <div>
              <p style={S.label}>Classificazione MDR</p>
              <p style={{ color: "#CBD5E1", fontSize: "14px", margin: 0 }}>
                Classe {sistema.mdr_classe}
                {sistema.mdr_verificato && (
                  <span style={{ color: "#86efac", fontSize: "12px" }}> · Verificato</span>
                )}
              </p>
            </div>
          )}

          {sistema.note && (
            <div style={{ gridColumn: "1 / -1" }}>
              <p style={S.label}>Note</p>
              <p style={{ color: "#64748B", fontSize: "13px", margin: 0 }}>{sistema.note}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── PAGINA PRINCIPALE ───────────────────────────────────────────────────────

export default function SistemiPage() {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const { activeEntityId, entityVersion } = useActiveEntity();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [sistemi, setSistemi] = useState<SistemaDigitale[]>([]);
  const [fornitori, setFornitori] = useState<FornitoreOption[]>([]);
  const [profiliValutatori, setProfiliValutatori] = useState<Record<string, ProfiloValutatore>>({});
  const [loading, setLoading] = useState(true);

  // Filtri
  const [filtroClassificazione, setFiltroClassificazione] =
    useState<AiClassificationType | "TUTTI">("TUTTI");

  // Modal — AI Act e NIS2 sono indipendenti, ognuno col proprio ciclo fetch/salva/chiudi
  const [modalNuovo, setModalNuovo] = useState(false);
  const [supplierIdPreselezionato, setSupplierIdPreselezionato] = useState<string | null>(null);
  const [sistemaInValutazioneAiAct, setSistemaInValutazioneAiAct] = useState<SistemaDigitale | null>(null);
  const [sistemaInValutazioneNis2, setSistemaInValutazioneNis2] = useState<SistemaDigitale | null>(null);
  const [chainNis2DopoAiAct, setChainNis2DopoAiAct] = useState(false);

  // ── Fetch dati ──
  const fetchDati = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const [profileRes, sistemiRes] = await Promise.all([
      supabase.from("profiles").select("id,full_name,email,tier").eq("id", user.id).single(),
      activeEntityId
        ? supabase
            .from("supplier_systems")
            .select(`
              *,
              supplier:suppliers(sottocategoria, categoria, fornitore:supplier_registry!fornitore_id(ragione_sociale)),
              entity:entities(name)
            `)
            .eq("entity_id", activeEntityId)
            .order("ai_classificazione", { ascending: false })
            .order("nome_sistema")
        : supabase
            .from("supplier_systems")
            .select(`
              *,
              supplier:suppliers(sottocategoria, categoria, fornitore:supplier_registry!fornitore_id(ragione_sociale)),
              entity:entities(name)
            `)
            .order("ai_classificazione", { ascending: false })
            .order("nome_sistema"),
    ]);

    if (profileRes.data) setProfile(profileRes.data);
    if (sistemiRes.data) setSistemi(sistemiRes.data as SistemaDigitale[]);

    // Fetch profili di chi ha compilato le valutazioni (AI Act e NIS2) — nessuna FK
    // dichiarata su questionario_compilato_da/nis2_valutato_da, quindi risolti a parte.
    const idValutatori = Array.from(new Set(
      ((sistemiRes.data ?? []) as SistemaDigitale[])
        .flatMap(s => [s.questionario_compilato_da, s.nis2_valutato_da])
        .filter((id): id is string => !!id)
    ));
    if (idValutatori.length > 0) {
      const { data: profiliData } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", idValutatori);
      if (profiliData) {
        setProfiliValutatori(Object.fromEntries(
          profiliData.map(p => [p.id, { full_name: p.full_name, ruolo: null as string | null }])
        ));
      }
    } else {
      setProfiliValutatori({});
    }

    // Fetch fornitori per modal nuovo sistema + sezione copertura
    if (activeEntityId) {
      const { data: fornitoriData } = await supabase
        .from("suppliers")
        .select(`
          id,
          categoria,
          sottocategoria,
          sistema_non_applicabile,
          supplier_registry!fornitore_id(ragione_sociale)
        `)
        .eq("entity_id", activeEntityId)
        .order("sottocategoria");
      if (fornitoriData) setFornitori(fornitoriData as unknown as typeof fornitori);
    }

    setLoading(false);
  }, [supabase, router, activeEntityId]);

  useEffect(() => { fetchDati(); }, [fetchDati, entityVersion]);

  // ── Aggiungi sistema ──
  async function handleNuovoSistema(form: NuovoSistemaForm) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !activeEntityId) return;

    // Pre-classificazione automatica da sottocategoria
    const fornitore = fornitori.find(f => f.id === form.supplier_id);
    const preClassifica = fornitore
      ? preClassificaDaSottocategoria(fornitore.sottocategoria)
      : null;

    // Ricava company_id dal fornitore
    const { data: supplierData } = await supabase
      .from("suppliers")
      .select("company_id")
      .eq("id", form.supplier_id)
      .single();

    await supabase.from("supplier_systems").insert({
      supplier_id: form.supplier_id,
      entity_id: activeEntityId,
      company_id: supplierData?.company_id,
      nome_sistema: form.nome_sistema.trim(),
      versione: form.versione || null,
      descrizione_uso: form.descrizione_uso || null,
      in_uso_dal: form.in_uso_dal || null,
      note: form.note || null,
      ai_classificazione: preClassifica ?? "NON_VALUTATO",
      created_by: user.id,
    });

    await fetchDati();
  }

  // ── Salva classificazione AI Act ──
  async function handleSalvaClassificazione(
    sistemaId: string,
    risposte: QuestionarioRisposte,
    ruolo: QuestionarioRuoloType
  ) {
    await supabase.rpc("fn_classifica_sistema_ai", {
      p_system_id: sistemaId,
      p_risposte: risposte,
      p_ruolo: ruolo,
    });
    await fetchDati();

    // Seed/downgrade dei 4 obblighi AI Act entity-level in base alla presenza
    // residua di ALMENO UN sistema AI_ALTO_RISCHIO sull'entity (non solo quello
    // appena salvato — la decisione dipende dall'insieme dei sistemi censiti).
    if (activeEntityId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dict = LEGAL_DICT as any;
      const flagsAltoRischio = [
        "Flag_AIACT_HumanOversight",
        "Flag_AIACT_LogRetention",
        "Flag_AIACT_IncidentPlan",
        "Flag_AIACT_Transparency",
      ];

      const { data: sistemiEntity } = await supabase
        .from("supplier_systems")
        .select("ai_classificazione")
        .eq("entity_id", activeEntityId);
      const haAltoRischio = (sistemiEntity ?? []).some(
        (s: { ai_classificazione: string | null }) => s.ai_classificazione === "AI_ALTO_RISCHIO"
      );

      if (haAltoRischio) {
        const { data: existing } = await supabase
          .from("remediation_plans")
          .select("flag_key")
          .eq("entity_id", activeEntityId)
          .in("flag_key", flagsAltoRischio);
        const existingKeys = new Set((existing ?? []).map((r: { flag_key: string | null }) => r.flag_key));
        const missing = flagsAltoRischio.filter(f => !existingKeys.has(f));
        if (missing.length > 0) {
          const { error: seedError } = await supabase.from("remediation_plans").insert(
            missing.map(flag_key => ({
              entity_id: activeEntityId,
              company_id: null,
              flag_key,
              status: "open",
              session_id: null,
              control_code: dict.flags?.[flag_key]?.control_code ?? null,
              planned_action: dict.flags?.[flag_key]?.remediation?.action ?? null,
            }))
          );
          if (seedError) console.error("Errore insert remediation_plans (seed flag AI Act):", seedError);
        }
      } else {
        // Sinonimi "completato" — stessa lista del raw-status check in
        // useRemediationRows.computeEffectiveStatus: un piano già chiuso da
        // ActionModal.markPlanCompleted/StepFlowModal.handleNext ha status "completed"
        // (inglese), mai "completato" — escluderlo qui evita il downgrade silenzioso a "waived".
        const { error: downgradeError } = await supabase
          .from("remediation_plans")
          .update({ status: "waived" })
          .eq("entity_id", activeEntityId)
          .in("flag_key", flagsAltoRischio)
          .not("status", "in", "(completato,done,verified,completed,waived)");
        if (downgradeError) console.error("Errore downgrade remediation_plans a waived:", downgradeError);
      }
      await fetchDati();
    }
  }

  // ── Salva valutazione NIS2 ── ciclo indipendente dall'AI Act
  async function handleSalvaNis2(
    sistemaId: string,
    risposte: Nis2Risposte,
    criticita: CriticitaNis2Type
  ) {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from("supplier_systems")
      .update({
        nis2_risposte: risposte,
        criticita_nis2: criticita,
        nis2_valutato_da: user?.id ?? null,
        nis2_valutato_at: new Date().toISOString(),
      })
      .eq("id", sistemaId);
    await fetchDati();
  }

  // ── Apertura/chiusura modal AI Act — se chainNis2 è true ed entrambe le
  // valutazioni erano ancora da fare, alla chiusura si apre anche il modal NIS2 ──
  function apriValutazioneAiAct(sistema: SistemaDigitale, chainNis2: boolean) {
    setChainNis2DopoAiAct(chainNis2);
    setSistemaInValutazioneAiAct(sistema);
  }

  function chiudiValutazioneAiAct() {
    const chain = chainNis2DopoAiAct;
    const sistemaId = sistemaInValutazioneAiAct?.id;
    setSistemaInValutazioneAiAct(null);
    setChainNis2DopoAiAct(false);
    if (chain && sistemaId) {
      const aggiornato = sistemi.find(s => s.id === sistemaId);
      if (aggiornato && aggiornato.criticita_nis2 === "non_valutata") {
        setSistemaInValutazioneNis2(aggiornato);
      }
    }
  }

  // ── Apertura modal "Aggiungi sistema" — con o senza fornitore pre-selezionato ──
  function apriModalNuovoSistema(supplierId: string | null) {
    setSupplierIdPreselezionato(supplierId);
    setModalNuovo(true);
  }

  function chiudiModalNuovoSistema() {
    setModalNuovo(false);
    setSupplierIdPreselezionato(null);
  }

  // ── Segna fornitore come "sistema non applicabile" — solo stato locale, nessun refetch ──
  async function handleNonApplicabile(supplierId: string) {
    await supabase.from("suppliers").update({ sistema_non_applicabile: true }).eq("id", supplierId);
    setFornitori(prev => prev.map(f =>
      f.id === supplierId ? { ...f, sistema_non_applicabile: true } : f
    ));
  }

  // ── Sistemi filtrati ──
  const sistemiFiltrati = filtroClassificazione === "TUTTI"
    ? sistemi
    : sistemi.filter(s => s.ai_classificazione === filtroClassificazione);

  // ── Fornitori senza sistema censito — derivato client-side da fornitori + sistemi già caricati ──
  const idFornitoriConSistema = new Set(sistemi.map(s => s.supplier_id));
  const fornitoriSenzaSistema = fornitori
    .filter(f => !f.sistema_non_applicabile && !idFornitoriConSistema.has(f.id))
    .sort((a, b) =>
      (CATEGORIA_ORDINE_COPERTURA[a.categoria] ?? 99) - (CATEGORIA_ORDINE_COPERTURA[b.categoria] ?? 99)
    );

  // ── Contatori per header ──
  const contatoriClassificazione = {
    totale: sistemi.length,
    da_valutare: sistemi.filter(s => s.ai_classificazione === "NON_VALUTATO").length,
    alto_rischio: sistemi.filter(s => s.ai_classificazione === "AI_ALTO_RISCHIO").length,
  };

  // ── Score per AppShell ──
  const score = contatoriClassificazione.alto_rischio > 0
    ? { value: contatoriClassificazione.alto_rischio, label: "sistemi ad alto rischio AI", color: "#ef4444", bg: "rgba(239,68,68,0.1)" }
    : contatoriClassificazione.da_valutare > 0
    ? { value: contatoriClassificazione.da_valutare, label: "sistemi da valutare", color: T.bronze, bg: "rgba(217,178,90,0.1)" }
    : null;

  return (
    <AppShell profile={profile} activeRoute="/sistemi" score={score}>

      {/* Modals */}
      {modalNuovo && (
        <ModalNuovoSistema
          fornitori={fornitori}
          initialSupplierId={supplierIdPreselezionato}
          onClose={chiudiModalNuovoSistema}
          onSalva={handleNuovoSistema}
        />
      )}
      {sistemaInValutazioneAiAct && (
        <ModalValutazioneAiAct
          sistema={sistemaInValutazioneAiAct}
          onClose={chiudiValutazioneAiAct}
          onSalva={handleSalvaClassificazione}
        />
      )}
      {sistemaInValutazioneNis2 && (
        <ModalValutazioneNis2
          sistema={sistemaInValutazioneNis2}
          onClose={() => setSistemaInValutazioneNis2(null)}
          onSalva={handleSalvaNis2}
        />
      )}

      <div style={{ padding: "32px", maxWidth: "1200px", margin: "0 auto" }}>

      <div className={`grid gap-20 ${fornitoriSenzaSistema.length > 0 ? "grid-cols-1 lg:grid-cols-[1fr_340px]" : "grid-cols-1"}`}>

      {/* Colonna sinistra — header, KPI, filtri, lista sistemi (invariati) */}
      <div>

        {/* Header pagina */}
        <div style={{ marginBottom: "32px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
            <div>
              <h1 style={{ color: "#F1F5F9", fontSize: "22px", fontWeight: 700, margin: "0 0 4px" }}>
                Inventario Sistemi Digitali
              </h1>
              <p style={{ color: "#64748B", fontSize: "13px", margin: 0, fontStyle: "italic" }}>
                (Digital Systems Inventory)
              </p>
              <p style={{ color: "#94A3B8", fontSize: "14px", margin: "8px 0 0", lineHeight: "1.6" }}>
                Censimento e classificazione AI Act di tutti i software in uso.
                {!activeEntityId && " Visualizzazione su tutte le strutture."}
              </p>
            </div>
            <button
              onClick={() => apriModalNuovoSistema(null)}
              disabled={!activeEntityId}
              style={{
                ...S.btn.primary,
                display: "flex", alignItems: "center", gap: "8px",
                opacity: activeEntityId ? 1 : 0.4,
                flexShrink: 0,
              }}
              title={!activeEntityId ? "Seleziona una struttura per aggiungere sistemi" : ""}
            >
              <Plus size={16} />
              Aggiungi sistema
            </button>
          </div>
        </div>

        {/* KPI bar */}
        {!loading && sistemi.length > 0 && (
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px",
            marginBottom: "24px",
          }}>
            {[
              {
                label: "Sistemi censiti",
                value: contatoriClassificazione.totale,
                color: "#94A3B8",
                bg: "rgba(255,255,255,0.04)",
              },
              {
                label: "Da valutare",
                value: contatoriClassificazione.da_valutare,
                color: T.bronze,
                bg: "rgba(217,178,90,0.08)",
                attivo: contatoriClassificazione.da_valutare > 0,
              },
              {
                label: "AI alto rischio",
                value: contatoriClassificazione.alto_rischio,
                color: contatoriClassificazione.alto_rischio > 0 ? "#fca5a5" : "#94A3B8",
                bg: contatoriClassificazione.alto_rischio > 0 ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.04)",
              },
            ].map(kpi => (
              <div key={kpi.label} style={{
                ...S.card,
                padding: "16px 20px",
                background: kpi.bg,
              }}>
                <p style={{ color: "#64748B", fontSize: "12px", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {kpi.label}
                </p>
                <p style={{ color: kpi.color, fontSize: "28px", fontWeight: 700, margin: 0, lineHeight: 1 }}>
                  {kpi.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Filtri classificazione */}
        {!loading && sistemi.length > 0 && (
          <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
            {(["TUTTI", "NON_VALUTATO", "AI_ALTO_RISCHIO", "RULE_BASED", "AI_BASSO_RISCHIO", "NON_AI"] as const).map(f => {
              const isActive = filtroClassificazione === f;
              const count = f === "TUTTI" ? sistemi.length : sistemi.filter(s => s.ai_classificazione === f).length;
              if (f !== "TUTTI" && count === 0) return null;
              return (
                <button
                  key={f}
                  onClick={() => setFiltroClassificazione(f)}
                  style={{
                    background: isActive ? "rgba(217,178,90,0.15)" : "rgba(255,255,255,0.04)",
                    border: isActive ? `1px solid ${T.bronze}` : "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "6px", padding: "6px 14px", cursor: "pointer",
                    color: isActive ? T.bronze : "#94A3B8", fontSize: "13px", fontWeight: isActive ? 600 : 400,
                  }}
                >
                  {f === "TUTTI" ? "Tutti" : CLASSIFICAZIONE_BADGE[f].labelBreve} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* Lista sistemi */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#64748B" }}>
            Caricamento sistemi…
          </div>
        ) : sistemi.length === 0 ? (
          <div style={{
            ...S.card,
            padding: "48px", textAlign: "center",
          }}>
            <Cpu size={40} color="#334155" style={{ marginBottom: "16px" }} />
            <p style={{ color: "#94A3B8", fontSize: "16px", fontWeight: 600, margin: "0 0 8px" }}>
              Nessun sistema censito
            </p>
            <p style={{ color: "#64748B", fontSize: "14px", margin: "0 0 24px", lineHeight: "1.6" }}>
              {activeEntityId
                ? "Aggiungi i software in uso nella struttura per avviare la classificazione AI Act."
                : "Seleziona una struttura dal menu in alto per aggiungere i sistemi."}
            </p>
            {activeEntityId && (
              <button onClick={() => apriModalNuovoSistema(null)} style={{ ...S.btn.primary, display: "inline-flex", alignItems: "center", gap: "8px" }}>
                <Plus size={16} />
                Aggiungi primo sistema
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {sistemiFiltrati.map(s => (
              <CardSistema
                key={s.id}
                sistema={s}
                profiliValutatori={profiliValutatori}
                onValutaAiAct={apriValutazioneAiAct}
                onValutaNis2={setSistemaInValutazioneNis2}
              />
            ))}
            {sistemiFiltrati.length === 0 && (
              <p style={{ color: "#64748B", fontSize: "14px", textAlign: "center", padding: "32px 0" }}>
                Nessun sistema con questa classificazione.
              </p>
            )}
          </div>
        )}

      </div>

      {/* Colonna destra — Fornitori senza sistema censito, sticky mentre si scrolla la lista */}
      {!loading && fornitoriSenzaSistema.length > 0 && (
        <div className="lg:sticky lg:top-6 lg:self-start">
            <h2 style={{ color: "#F1F5F9", fontSize: "16px", fontWeight: 600, margin: "0 0 4px" }}>
              Fornitori senza sistema censito
            </h2>
            <p style={{ color: "#64748B", fontSize: "13px", margin: "0 0 16px", lineHeight: "1.6" }}>
              Fornitori collegati alla struttura per cui non è ancora stato registrato un sistema digitale.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {fornitoriSenzaSistema.map(f => {
                const tenue = f.categoria === "SERVIZI_ESTERNI";
                return (
                  <div key={f.id} style={{
                    ...S.card,
                    padding: "12px 16px",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    gap: "16px", flexWrap: "wrap",
                    opacity: tenue ? 0.65 : 1,
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ color: "#F1F5F9", fontSize: "14px", fontWeight: 600, margin: "0 0 2px" }}>
                        {f.supplier_registry?.ragione_sociale ?? "—"}
                      </p>
                      <p style={{ color: "#64748B", fontSize: "12px", margin: 0 }}>
                        {CATEGORIA_LABEL[f.categoria] ?? f.categoria} · {f.sottocategoria}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                      <button
                        onClick={() => apriModalNuovoSistema(f.id)}
                        style={{ ...S.btn.primary, padding: "6px 12px", fontSize: "13px" }}
                      >
                        Censisci sistema
                      </button>
                      <button
                        onClick={() => handleNonApplicabile(f.id)}
                        style={{ ...S.btn.ghost, padding: "6px 12px", fontSize: "13px" }}
                      >
                        Non applicabile
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
        </div>
      )}

      </div>

      </div>
    </AppShell>
  );
}
