"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ClavisTitle } from "@/components/ui/ClavisTitle";
import { CompanyRiskProfile } from "@/components/CompanyRiskProfile";
import { EntitySelector } from "@/components/EntitySelector";
import { useActiveEntity } from "@/contexts/EntityContext";

// ─── DESIGN TOKENS
const T = {
  navy:       "#0A0E1A",
  navyLight:  "#0F1424",
  slate400:   "#9AA3BD",
  slate600:   "#9AA3BD",
  bronze:     "#D9B25A",
  bronzeBg:   "rgba(217,178,90,.12)",
  critical:   "#E8634A",
  critBg:     "rgba(232,99,74,.12)",
  high:       "#5E86F5",
  highBg:     "rgba(94,134,245,.12)",
  medium:     "#D9B25A",
  low:        "#3ECF8E",
  lowBg:      "rgba(62,207,142,.10)",
  amber:      "#F59E0B",
  amberBg:    "rgba(245,158,11,.12)",
  orange:     "#F97316",
  orangeBg:   "rgba(249,115,22,.12)",
  boneDim:    "#9AA3BD",
  boneDimBg:  "rgba(154,163,189,.10)",
};

// ─── TIPI
type ComplianceStato = "MANCANTE" | "DICHIARATO" | "VERIFICATO" | "NON_CONFORME" | "SCADUTO";

interface ComplianceItem {
  id: string;
  entity_id: string;
  company_id: string | null;
  tipo: string;
  stato: ComplianceStato;
  documento_path: string | null;
  documento_nome: string | null;
  data_documento: string | null;
  data_scadenza: string | null;
  note: string | null;
  analisi_ok: boolean | null;
  analisi_note: string | null;
  dichiarato_da: string | null;
  dichiarato_at: string | null;
  created_at: string;
  updated_at: string | null;
}

interface CompanyComplianceItem {
  id: string;
  company_id: string;
  tipo: string;
  stato: ComplianceStato;
  documento_path: string | null;
  documento_nome: string | null;
  data_documento: string | null;
  data_scadenza: string | null;
  note: string | null;
  analisi_ok: boolean | null;
  analisi_note: string | null;
  dichiarato_da: string | null;
  dichiarato_at: string | null;
  created_at: string;
  updated_at: string | null;
}

interface Profile { id: string; full_name: string; email: string; tier: string; }
interface Company { id: string; name: string; }

type AdempimentoDef = {
  tipo: string;
  label: string;
  norma: string;
  descrizione: string;
  producibile: boolean;
  obbligatorio: boolean;
  icon: string;
  peso: number;
  maxPagine: number;
  cosaCaricare: string;
  linkEsterno?: string;
  linkLabel?: string;
  linkInterno?: string;
  automatico?: boolean;
  condizionale?: boolean;
  condizioneLabel?: string;
};

// ─── ADEMPIMENTI SOCIETÀ (7)
const ADEMPIMENTI_COMPANY: AdempimentoDef[] = [
  {
    tipo: "NOMINA_DPO",
    label: "Nomina DPO",
    norma: "GDPR Art. 37",
    descrizione: "Designazione del Data Protection Officer",
    producibile: true,
    obbligatorio: true,
    icon: "👤",
    peso: 9,
    maxPagine: 5,
    cosaCaricare: "Atto di nomina firmato dal legale rappresentante. Max 5 pagine."
  },
  {
    tipo: "DELIBERA_CDA",
    label: "Delibera CdA Cybersicurezza",
    norma: "NIS2 Art. 20",
    descrizione: "Approvazione piano sicurezza da parte del CdA",
    producibile: true,
    obbligatorio: true,
    icon: "⚖️",
    peso: 6,
    maxPagine: 10,
    cosaCaricare: "Verbale CdA con delibera specifica su cybersicurezza e piano approvato. Max 10 pagine."
  },
  {
    tipo: "REGISTRAZIONE_ACN",
    label: "Registrazione ACN NIS2",
    norma: "D.Lgs. 138/2024",
    descrizione: "Registrazione sulla piattaforma ACN — scadenza 31/01/2025",
    producibile: false,
    obbligatorio: true,
    icon: "🏛",
    peso: 11,
    maxPagine: 5,
    cosaCaricare: "Screenshot o email di conferma registrazione ACN. In alternativa dichiara di aver completato la registrazione.",
    linkEsterno: "https://registro.acn.gov.it",
    linkLabel: "Vai alla piattaforma ACN →"
  },
  {
    tipo: "NOMINA_AI_OFFICER",
    label: "Nomina AI Officer",
    norma: "AI Act Art. 26",
    descrizione: "Designazione responsabile sistemi AI in uso clinico",
    producibile: true,
    obbligatorio: true,
    icon: "🤖",
    peso: 7,
    maxPagine: 5,
    cosaCaricare: "Atto di nomina con scope e responsabilità definite. Max 5 pagine."
  },
  {
    tipo: "POLIZZA_RC_DM232",
    label: "Polizza RC DM 232/2023",
    norma: "DM 232/2023",
    descrizione: "Copertura assicurativa responsabilità civile sanitaria",
    producibile: false,
    obbligatorio: true,
    icon: "🛡",
    peso: 5,
    maxPagine: 20,
    cosaCaricare: "Frontespizio polizza + clausole principali. Max 20 pagine."
  },
  {
    tipo: "MODELLO_231",
    label: "Modello Organizzativo 231",
    norma: "D.Lgs. 231/2001",
    descrizione: "Modello di organizzazione gestione e controllo",
    producibile: true,
    obbligatorio: true,
    icon: "📑",
    peso: 7,
    maxPagine: 10,
    cosaCaricare: "Indice del Modello + verbale CdA di approvazione con data. NON caricare il documento completo. Max 10 pagine."
  },
  {
    tipo: "CODICE_ETICO_231",
    label: "Codice Etico 231",
    norma: "D.Lgs. 231/2001",
    descrizione: "Codice etico allegato al Modello 231",
    producibile: true,
    obbligatorio: true,
    icon: "📜",
    peso: 4,
    maxPagine: 20,
    cosaCaricare: "Documento completo del Codice Etico adottato. Max 20 pagine."
  },
];

// ─── ADEMPIMENTI STRUTTURA (8)
const ADEMPIMENTI_ENTITY: AdempimentoDef[] = [
  {
    tipo: "REGISTRO_TRATTAMENTI",
    label: "Registro Trattamenti Art. 30",
    norma: "GDPR Art. 30",
    descrizione: "Registro delle attività di trattamento dati",
    producibile: false,
    obbligatorio: true,
    icon: "📋",
    peso: 8,
    maxPagine: 50,
    cosaCaricare: "Export del registro trattamenti in PDF o Excel. Max 50 pagine."
  },
  {
    tipo: "INFORMATIVA_PRIVACY_PAZIENTI",
    label: "Informativa Privacy Pazienti",
    norma: "GDPR Art. 13",
    descrizione: "Informativa agli ospiti/pazienti sul trattamento dati",
    producibile: true,
    obbligatorio: true,
    icon: "📄",
    peso: 5,
    maxPagine: 5,
    cosaCaricare: "Testo dell'informativa consegnata agli ospiti. Max 5 pagine."
  },
  {
    tipo: "DPA_FORNITORI",
    label: "DPA Fornitori",
    norma: "GDPR Art. 28",
    descrizione: "Accordi di trattamento con i responsabili esterni",
    producibile: false,
    obbligatorio: true,
    icon: "🤝",
    peso: 6,
    maxPagine: 0,
    cosaCaricare: "Lo stato viene calcolato automaticamente dal Registro Fornitori.",
    automatico: true
  },
  {
    tipo: "DPIA",
    label: "DPIA",
    norma: "GDPR Art. 35",
    descrizione: "Valutazione impatto protezione dati",
    producibile: true,
    obbligatorio: false,
    icon: "🔍",
    peso: 5,
    maxPagine: 30,
    cosaCaricare: "Report di valutazione impatto. Max 30 pagine."
  },
  {
    tipo: "FRIA",
    label: "FRIA — Fundamental Rights Impact Assessment",
    norma: "AI Act Art. 27",
    descrizione: "Valutazione impatto sui diritti fondamentali per sistemi AI ad alto rischio",
    producibile: true,
    obbligatorio: false,
    condizionale: true,
    condizioneLabel: "Obbligatoria se usi sistemi AI clinici",
    icon: "⚖️",
    peso: 6,
    maxPagine: 30,
    cosaCaricare: "Report di valutazione impatto sui diritti fondamentali. Include: descrizione sistema AI, popolazioni impattate, rischi identificati, misure di mitigazione. Max 30 pagine."
  },
  {
    tipo: "IRP_INCIDENT_RESPONSE",
    label: "Incident Response Plan",
    norma: "NIS2 Art. 21",
    descrizione: "Procedura documentata gestione incidenti informatici",
    producibile: true,
    obbligatorio: true,
    icon: "🚨",
    peso: 9,
    maxPagine: 20,
    cosaCaricare: "Procedura con ruoli, timeline notifica ACN 24h/72h e contatti. Max 20 pagine."
  },
  {
    tipo: "BCP_BUSINESS_CONTINUITY",
    label: "Business Continuity Plan",
    norma: "NIS2 Art. 21",
    descrizione: "Piano di continuità operativa per scenari critici",
    producibile: true,
    obbligatorio: true,
    icon: "♻️",
    peso: 7,
    maxPagine: 50,
    cosaCaricare: "Piano con scenari (ransomware, blackout, blocco gestionale) e procedure di ripristino. Max 50 pagine."
  },
  {
    tipo: "PIANO_FORMATIVO",
    label: "Piano Formativo Annuale",
    norma: "NIS2 + D.Lgs. 231",
    descrizione: "Formazione cybersicurezza per tutto il personale",
    producibile: true,
    obbligatorio: true,
    icon: "🎓",
    peso: 5,
    maxPagine: 10,
    cosaCaricare: "Piano formativo annuale approvato con contenuti, destinatari e date. Max 10 pagine."
  },
  {
    tipo: "REGISTRO_FORNITORI",
    label: "Registro Fornitori Digitali",
    norma: "NIS2 Art. 21",
    descrizione: "Censimento fornitori con valutazione rischio",
    producibile: false,
    obbligatorio: true,
    icon: "🏢",
    peso: 6,
    maxPagine: 0,
    cosaCaricare: "Lo stato viene calcolato automaticamente dal modulo Fornitori.",
    automatico: true,
    linkInterno: "/fornitori",
    linkLabel: "Vai al Registro Fornitori →"
  },
];

const ALL_ADEMPIMENTI = [...ADEMPIMENTI_COMPANY, ...ADEMPIMENTI_ENTITY];

// ─── SSOT: helper esportabile per lettura stato da altre pagine
export async function getComplianceStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  entityId: string,
  companyId: string,
  tipo: string,
): Promise<ComplianceStato | null> {

  // Calcolo automatico per REGISTRO_FORNITORI
  if (tipo === "REGISTRO_FORNITORI") {
    const { count: fornCount } = await supabase
      .from("supplier_registry")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);
    return (fornCount ?? 0) > 0 ? "VERIFICATO" : "MANCANTE";
  }

  // Calcolo automatico per DPA_FORNITORI
  if (tipo === "DPA_FORNITORI") {
    const { data: fornitori } = await supabase
      .from("supplier_registry")
      .select("dpa_firmato")
      .eq("company_id", companyId);
    const totaleFornitori = fornitori?.length ?? 0;
    const fornitoriConDpa = fornitori?.filter((f: { dpa_firmato: boolean }) => f.dpa_firmato).length ?? 0;
    if (totaleFornitori === 0) return "MANCANTE";
    if (fornitoriConDpa === totaleFornitori) return "VERIFICATO";
    if (fornitoriConDpa > 0) return "DICHIARATO";
    return "MANCANTE";
  }

  const { data: entityItem } = await supabase
    .from("entity_compliance_items")
    .select("stato")
    .eq("entity_id", entityId)
    .eq("tipo", tipo)
    .single();
  if (entityItem) return entityItem.stato as ComplianceStato;

  const { data: companyItem } = await supabase
    .from("company_compliance_items")
    .select("stato")
    .eq("company_id", companyId)
    .eq("tipo", tipo)
    .single();
  return companyItem?.stato ?? null;
}

// ─── SCORE COMPLIANCE DOCUMENTALE
// Restituisce un punteggio di rischio 0-100 (0 = ottimo, 100 = critico)
export function calcScoreCompliance(
  entityItems: ComplianceItem[],
  companyItems: CompanyComplianceItem[]
): number {
  const PESI: Record<string, number> = {
    REGISTRAZIONE_ACN:           11,
    IRP_INCIDENT_RESPONSE:        9,
    NOMINA_DPO:                   9,
    REGISTRO_TRATTAMENTI:         8,
    BCP_BUSINESS_CONTINUITY:      7,
    MODELLO_231:                  7,
    NOMINA_AI_OFFICER:            7,
    DPA_FORNITORI:                6,
    DELIBERA_CDA:                 6,
    REGISTRO_FORNITORI:           6,
    INFORMATIVA_PRIVACY_PAZIENTI: 5,
    DPIA:                         5,
    FRIA:                         6,
    PIANO_FORMATIVO:              5,
    POLIZZA_RC_DM232:             5,
    CODICE_ETICO_231:             4,
  };

  const allItems = [...entityItems, ...companyItems];
  let rischioTotale = 0;

  for (const item of allItems) {
    const peso = PESI[item.tipo] ?? 0;
    switch (item.stato) {
      case "VERIFICATO":   rischioTotale += 0;            break;
      case "DICHIARATO":   rischioTotale += peso * 0.5;   break;
      case "MANCANTE":     rischioTotale += peso;         break;
      case "NON_CONFORME": rischioTotale += peso * 1.2;   break;
      case "SCADUTO":      rischioTotale += peso * 1.5;   break;
    }
  }

  return Math.min(100, Math.round(rischioTotale));
}

// ─── BADGE STATO
const STATO_CONFIG: Record<ComplianceStato, { label: string; color: string; bg: string }> = {
  MANCANTE:     { label: "MANCANTE",     color: T.critical, bg: T.critBg    },
  DICHIARATO:   { label: "DICHIARATO",   color: T.amber,    bg: T.amberBg   },
  VERIFICATO:   { label: "VERIFICATO",   color: T.low,      bg: T.lowBg     },
  NON_CONFORME: { label: "NON CONFORME", color: T.orange,   bg: T.orangeBg  },
  SCADUTO:      { label: "SCADUTO",      color: T.boneDim,  bg: T.boneDimBg },
};

function StatoBadge({ stato }: { stato: ComplianceStato }) {
  const cfg = STATO_CONFIG[stato];
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded"
      style={{ backgroundColor: cfg.bg, color: cfg.color, fontSize: "11px", letterSpacing: "0.06em" }}>
      {cfg.label}
    </span>
  );
}

// ─── NAV ITEM
function NavItem({ icon, label, active, onClick, collapsed }: {
  icon: string; label: string; active?: boolean; onClick: () => void; collapsed?: boolean;
}) {
  return (
    <button onClick={onClick} title={collapsed ? label : undefined}
      className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all text-sm"
      style={{
        backgroundColor: active ? "rgba(58,109,240,.12)" : undefined,
        color: active ? "var(--bone)" : "var(--bone-dim)",
        borderLeft: active ? "3px solid var(--shield-soft)" : "3px solid transparent",
        fontWeight: active ? 600 : 400,
      }}>
      <span className="text-base w-4 text-center flex-shrink-0">{icon}</span>
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
    </button>
  );
}

// ─── CARD ADEMPIMENTO
type AnyItem = ComplianceItem | CompanyComplianceItem;

interface CardProps {
  def: AdempimentoDef;
  item: AnyItem | null;
  livello: "company" | "entity";
  onUpload: (tipo: string, livello: "company" | "entity") => void;
  onProduce: (tipo: string) => void;
  onView: (path: string) => void;
  onDichiarato: (tipo: string, livello: "company" | "entity") => void;
  onAnnulla:    (tipo: string, livello: "company" | "entity") => void;
}

function AdempimentoCard({ def, item, livello, onUpload, onProduce, onView, onDichiarato, onAnnulla }: CardProps) {
  const router = useRouter();
  const stato: ComplianceStato = item?.stato ?? "MANCANTE";

  const borderColor =
    stato === "VERIFICATO"   ? `${T.low}40`           :
    stato === "MANCANTE"     ? `${T.critical}30`       :
    stato === "NON_CONFORME" ? `${T.orange}40`         :
    stato === "DICHIARATO"   ? `${T.amber}40`          :
    stato === "SCADUTO"      ? "rgba(154,163,189,.20)" :
    "var(--line2)";

  return (
    <div className="flex flex-col border rounded overflow-hidden"
      style={{ backgroundColor: "var(--ink2)", borderColor, borderRadius: "6px" }}>

      {/* HEADER */}
      <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3"
        style={{ borderBottom: "1px solid var(--line)", backgroundColor: "var(--ink3)" }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl flex-shrink-0">{def.icon}</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight truncate" style={{ color: "var(--bone)" }}>
              {def.label}
            </p>
            <p className="text-xs font-mono mt-0.5" style={{ color: T.slate400, fontSize: "10px" }}>
              {def.norma}
              {!def.obbligatorio && <span style={{ color: T.medium }}> · Facoltativo</span>}
              {def.automatico && <span style={{ color: T.boneDim }}> · Auto</span>}
            </p>
            {def.condizionale && def.condizioneLabel && (
              <p style={{ fontSize: "10px", color: T.amber, fontStyle: "italic", marginTop: "2px" }}>
                {def.condizioneLabel}
              </p>
            )}
          </div>
        </div>
        <StatoBadge stato={stato} />
      </div>

      {/* BODY */}
      <div className="flex-1 px-4 py-3 space-y-2">
        <p className="text-xs leading-snug" style={{ color: T.slate400 }}>{def.descrizione}</p>

        {/* Nota su cosa caricare */}
        <p style={{ fontSize: "12px", color: "var(--bone-dim)", fontStyle: "italic", marginTop: "4px" }}>
          {def.cosaCaricare}
        </p>

        {stato === "VERIFICATO" && (
          <>
            {item?.documento_nome && (
              <p className="text-xs" style={{ color: T.slate400 }}>
                {item.documento_nome}
                {item.data_documento ? ` · ${new Date(item.data_documento).toLocaleDateString("it-IT")}` : ""}
              </p>
            )}
            <p className="text-xs font-semibold" style={{ color: T.low }}>
              {item?.analisi_note ?? "✓ Documento verificato da AI."}
            </p>
          </>
        )}

        {stato === "DICHIARATO" && !def.automatico && (
          <p className="text-xs" style={{ color: T.amber }}>
            📋 Dichiarato dal responsabile{item?.dichiarato_at
              ? ` il ${new Date(item.dichiarato_at).toLocaleDateString("it-IT")}`
              : ""}. Nessun documento verificato da AI.
          </p>
        )}

        {item?.data_scadenza && (() => {
          const scadenzaDate = new Date(item.data_scadenza);
          const giorniRimasti = Math.floor(
            (scadenzaDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          );
          const isScaduta  = giorniRimasti < 0;
          const isUrgente  = !isScaduta && giorniRimasti < 90;
          return (
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs" style={{ color: T.slate400 }}>
                Scade: {scadenzaDate.toLocaleDateString("it-IT")}
              </p>
              {isScaduta ? (
                <span className="text-xs font-bold px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: T.critBg, color: T.critical, fontSize: "10px" }}>
                  SCADUTA
                </span>
              ) : isUrgente ? (
                <span className="text-xs font-bold px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: T.amberBg, color: T.amber, fontSize: "10px" }}>
                  Scade tra {giorniRimasti}gg
                </span>
              ) : null}
            </div>
          );
        })()}

        {stato === "NON_CONFORME" && item?.analisi_note && (
          <p className="text-xs font-semibold" style={{ color: T.orange }}>{item.analisi_note}</p>
        )}
      </div>

      {/* FOOTER */}
      <div className="px-4 pb-4 pt-2 flex flex-wrap gap-2" style={{ borderTop: "1px solid var(--line)" }}>

        {/* ── AUTOMATICO: solo link al modulo corrispondente */}
        {def.automatico ? (
          <div className="w-full flex flex-col gap-2">
            <p className="text-xs" style={{ color: T.boneDim }}>
              🔄 Stato calcolato automaticamente
            </p>
            {def.linkInterno && (
              <button
                onClick={() => router.push(def.linkInterno!)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 font-semibold transition-opacity hover:opacity-80 w-fit"
                style={{ border: `1px solid var(--shield-soft)`, color: "var(--shield-soft)", borderRadius: "4px" }}>
                {def.linkLabel ?? "Vai al modulo →"}
              </button>
            )}
            {def.linkEsterno && (
              <a href={def.linkEsterno} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: "12px", color: "var(--shield-soft)", textDecoration: "none" }}>
                {def.linkLabel}
              </a>
            )}
          </div>
        ) : (
          <>
            {/* Link esterno (es. ACN) prima dei bottoni */}
            {def.linkEsterno && (
              <a href={def.linkEsterno} target="_blank" rel="noopener noreferrer"
                className="w-full mb-1"
                style={{ fontSize: "12px", color: "var(--shield-soft)", textDecoration: "none" }}>
                {def.linkLabel}
              </a>
            )}

            {stato === "MANCANTE" && (<>
              <button onClick={() => onDichiarato(def.tipo, livello)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 font-semibold transition-opacity hover:opacity-80"
                style={{ border: `1px solid ${T.amber}60`, color: T.amber, borderRadius: "4px" }}>
                ✋ Dichiaro di averlo
              </button>
              <button onClick={() => onUpload(def.tipo, livello)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 font-semibold transition-opacity hover:opacity-80"
                style={{ backgroundColor: "var(--shield)", color: "var(--bone)", borderRadius: "4px" }}>
                🛡 Carica e verifica
              </button>
              {def.producibile && (
                <button onClick={() => onProduce(def.tipo)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 font-semibold transition-opacity hover:opacity-80"
                  style={{ border: "1px solid var(--line2)", color: "var(--bone-dim)", borderRadius: "4px" }}>
                  ✨ Produce documento
                </button>
              )}
            </>)}

            {stato === "DICHIARATO" && (<>
              <button onClick={() => onUpload(def.tipo, livello)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 font-semibold transition-opacity hover:opacity-80"
                style={{ backgroundColor: "var(--shield)", color: "var(--bone)", borderRadius: "4px" }}>
                🛡 Carica e verifica
              </button>
              <button onClick={() => onDichiarato(def.tipo, livello)}
                className="text-xs px-2.5 py-1 font-semibold transition-opacity hover:opacity-80"
                style={{ border: "1px solid var(--line2)", color: "var(--bone-dim)", borderRadius: "4px", fontSize: "11px" }}>
                Modifica dichiarazione
              </button>
              <button onClick={() => onAnnulla(def.tipo, livello)}
                title="Annulla dichiarazione"
                style={{ background: "none", border: "none", color: "var(--bone-dim)", cursor: "pointer", fontSize: "12px", textDecoration: "underline" }}>
                Annulla dichiarazione
              </button>
            </>)}

            {stato === "VERIFICATO" && (<>
              {item?.documento_path && (
                <button onClick={() => onView(item.documento_path!)}
                  className="text-xs px-2.5 py-1 font-semibold transition-opacity hover:opacity-80"
                  style={{ border: "1px solid var(--line2)", color: "var(--bone-dim)", borderRadius: "4px", fontSize: "11px" }}>
                  Vedi documento
                </button>
              )}
              <button onClick={() => onUpload(def.tipo, livello)}
                className="text-xs px-2.5 py-1 font-semibold transition-opacity hover:opacity-80"
                style={{ border: "1px solid var(--line2)", color: "var(--bone-dim)", borderRadius: "4px", fontSize: "11px" }}>
                Sostituisci
              </button>
            </>)}

            {stato === "NON_CONFORME" && (<>
              <button
                className="text-xs px-2.5 py-1 font-semibold transition-opacity hover:opacity-80"
                style={{ border: `1px solid ${T.orange}60`, color: T.orange, borderRadius: "4px", fontSize: "11px" }}>
                Vedi problemi rilevati
              </button>
              <button onClick={() => onUpload(def.tipo, livello)}
                className="text-xs px-2.5 py-1 font-semibold transition-opacity hover:opacity-80"
                style={{ border: `1px solid ${T.critical}60`, color: T.critical, borderRadius: "4px", fontSize: "11px" }}>
                Sostituisci documento
              </button>
            </>)}

            {stato === "SCADUTO" && (
              <button onClick={() => onUpload(def.tipo, livello)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 font-semibold transition-opacity hover:opacity-80"
                style={{ backgroundColor: "var(--shield)", color: "var(--bone)", borderRadius: "4px" }}>
                🛡 Carica e verifica
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── MAIN PAGE
export default function StrutturaPage() {
  const router   = useRouter();
  const supabase = createClient();
  const { entityVersion } = useActiveEntity();

  const [profile,      setProfile]      = useState<Profile | null>(null);
  const [company,      setCompany]      = useState<Company | null>(null);
  const [entityId,     setEntityId]     = useState<string | null>(null);
  const [entityName,   setEntityName]   = useState<string>("");
  const [companyId,    setCompanyId]    = useState<string | null>(null);
  const [userId,       setUserId]       = useState<string>("");

  const [entityItems,  setEntityItems]  = useState<ComplianceItem[]>([]);
  const [companyItems, setCompanyItems] = useState<CompanyComplianceItem[]>([]);
  const [loading,      setLoading]      = useState(true);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dropdownOpen,     setDropdownOpen]     = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Modal upload
  const [uploadTipo,     setUploadTipo]     = useState<string | null>(null);
  const [uploadLivello,  setUploadLivello]  = useState<"company" | "entity">("entity");
  const [uploadFile,     setUploadFile]     = useState<File | null>(null);
  const [uploadDate,     setUploadDate]     = useState("");
  const [uploadScadenza, setUploadScadenza] = useState("");
  const [uploadNote,     setUploadNote]     = useState("");
  const [uploading,      setUploading]      = useState(false);
  const [uploadError,    setUploadError]    = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal produce
  const [produceTipo, setProduceTipo] = useState<string | null>(null);

  // Modal dichiara
  const [dichiaraTipo,    setDichiaraTipo]    = useState<string | null>(null);
  const [dichiaraLivello, setDichiaraLivello] = useState<"company" | "entity">("entity");
  const [dichiaraNote,    setDichiaraNote]    = useState("");
  const [dichiaraChecked, setDichiaraChecked] = useState(false);
  const [dichiarando,     setDichiarando]     = useState(false);
  const [rischioToast,   setRischioToast]   = useState(false);
  const [usaAI,          setUsaAI]          = useState(false);

  // ─── DATA LOADING
  const loadData = useCallback(async () => {
    setLoading(true);
    // Reset adempimenti prima di caricare nuovi dati (cambio entity)
    setEntityItems([]);
    setCompanyItems([]);
    setCompany(null);
    setEntityName("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUserId(user.id);

      const storedEntityId = localStorage.getItem("clavis_active_entity_id");
      const entityQuery = storedEntityId
        ? supabase.from("entities").select("id, name, company_id").eq("id", storedEntityId).limit(1)
        : supabase.from("entities").select("id, name, company_id").eq("created_by", user.id).limit(1);

      const [profRes, entityRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        entityQuery,
      ]);

      if (profRes.data) setProfile(profRes.data as Profile);
      if (!entityRes.data || entityRes.data.length === 0) { router.push("/onboarding"); return; }

      const eid   = entityRes.data[0].id         as string;
      const ename = (entityRes.data[0].name       as string) ?? "";
      const cid   = entityRes.data[0].company_id  as string | null;
      setEntityId(eid);
      setEntityName(ename);
      setCompanyId(cid);
      if (!storedEntityId) localStorage.setItem("clavis_active_entity_id", eid);

      // Fetch company name
      if (cid) {
        const { data: companyData } = await supabase
          .from("companies").select("id, name").eq("id", cid).single();
        if (companyData) setCompany(companyData as Company);
      }

      // Fetch entity compliance
      const { data: entityData } = await supabase
        .from("entity_compliance_items").select("*").eq("entity_id", eid);

      // Fetch company compliance
      const { data: companyDbData } = cid
        ? await supabase.from("company_compliance_items").select("*").eq("company_id", cid)
        : { data: [] as CompanyComplianceItem[] };

      // Controlla se struttura usa AI (S2 Q1 > 0 nel triage più recente)
      const { data: triageSession } = await supabase
        .from("v_triage_dashboard")
        .select("answers")
        .eq("entity_id", eid)
        .eq("status", "generated")
        .order("completed_at", { ascending: false })
        .limit(1)
        .single();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s2Answers = (triageSession?.answers as any)?.S2 ?? [];
      const usaAIVal  = (s2Answers[0] ?? 0) > 0;
      setUsaAI(usaAIVal);

      // Inizializza mancanti entity (FRIA solo se struttura usa AI)
      const existingEntityTipi = (entityData ?? []).map((i: ComplianceItem) => i.tipo);
      const missingEntity = ADEMPIMENTI_ENTITY
        .filter(a => !existingEntityTipi.includes(a.tipo))
        .filter(a => a.tipo !== "FRIA" || usaAIVal)
        .map(a => ({ entity_id: eid, company_id: cid, tipo: a.tipo, stato: "MANCANTE", created_by: user.id }));
      if (missingEntity.length > 0)
        await supabase.from("entity_compliance_items").insert(missingEntity);

      // Inizializza mancanti company
      const existingCompanyTipi = (companyDbData ?? []).map((i: CompanyComplianceItem) => i.tipo);
      const missingCompany = cid
        ? ADEMPIMENTI_COMPANY
            .filter(a => !existingCompanyTipi.includes(a.tipo))
            .map(a => ({ company_id: cid, tipo: a.tipo, stato: "MANCANTE", created_by: user.id }))
        : [];
      if (missingCompany.length > 0)
        await supabase.from("company_compliance_items").insert(missingCompany);

      // Rileggi post-insert
      const { data: finalEntity } = await supabase
        .from("entity_compliance_items").select("*").eq("entity_id", eid);
      const { data: finalCompany } = cid
        ? await supabase.from("company_compliance_items").select("*").eq("company_id", cid)
        : { data: [] as CompanyComplianceItem[] };

      let entityItemsArr  = (finalEntity  ?? []) as ComplianceItem[];
      let companyItemsArr = (finalCompany ?? []) as CompanyComplianceItem[];

      // ── Calcolo stati automatici da supplier_registry
      if (cid) {
        const now = new Date().toISOString();

        // REGISTRO_FORNITORI: almeno 1 fornitore censito → VERIFICATO
        const { count: fornCount } = await supabase
          .from("supplier_registry")
          .select("id", { count: "exact", head: true })
          .eq("company_id", cid);

        const registroFornitoriStato: ComplianceStato = (fornCount ?? 0) > 0 ? "VERIFICATO" : "MANCANTE";

        await supabase
          .from("entity_compliance_items")
          .update({ stato: registroFornitoriStato, updated_at: now })
          .eq("entity_id", eid)
          .eq("tipo", "REGISTRO_FORNITORI");

        entityItemsArr = entityItemsArr.map(i =>
          i.tipo === "REGISTRO_FORNITORI" ? { ...i, stato: registroFornitoriStato } : i
        );

        // DPA_FORNITORI: basato su campo dpa_firmato in supplier_registry
        const { data: fornitori } = await supabase
          .from("supplier_registry")
          .select("dpa_firmato")
          .eq("company_id", cid);

        const totaleFornitori = fornitori?.length ?? 0;
        const fornitoriConDpa = fornitori?.filter((f: { dpa_firmato: boolean }) => f.dpa_firmato).length ?? 0;
        const dpaStato: ComplianceStato =
          totaleFornitori === 0              ? "MANCANTE"  :
          fornitoriConDpa === totaleFornitori ? "VERIFICATO" :
          fornitoriConDpa > 0                ? "DICHIARATO" :
          "MANCANTE";

        await supabase
          .from("entity_compliance_items")
          .update({ stato: dpaStato, updated_at: now })
          .eq("entity_id", eid)
          .eq("tipo", "DPA_FORNITORI");

        entityItemsArr = entityItemsArr.map(i =>
          i.tipo === "DPA_FORNITORI" ? { ...i, stato: dpaStato } : i
        );
      }

      // ── Alert scadenza automatico: aggiorna stato SCADUTO se data_scadenza passata
      const oggi = new Date();
      const nowIso = oggi.toISOString();
      const allItemsConScadenza = [
        ...entityItemsArr.filter(i => i.data_scadenza),
        ...companyItemsArr.filter(i => i.data_scadenza),
      ];

      for (const item of allItemsConScadenza) {
        const scadenza = new Date(item.data_scadenza!);
        const giorniRimasti = Math.floor(
          (scadenza.getTime() - oggi.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (giorniRimasti < 0 && item.stato !== "SCADUTO") {
          const isEntityItem = "entity_id" in item;
          const tabella = isEntityItem
            ? "entity_compliance_items"
            : "company_compliance_items";
          await supabase.from(tabella)
            .update({ stato: "SCADUTO", updated_at: nowIso })
            .eq("id", item.id);

          // Aggiorna array locale silenziosamente
          if (isEntityItem) {
            entityItemsArr = entityItemsArr.map(i =>
              i.id === item.id ? { ...i, stato: "SCADUTO" as ComplianceStato } : i
            );
          } else {
            companyItemsArr = companyItemsArr.map(i =>
              i.id === item.id ? { ...i, stato: "SCADUTO" as ComplianceStato } : i
            );
          }
        }
      }

      setEntityItems(entityItemsArr);
      setCompanyItems(companyItemsArr);
    } finally {
      setLoading(false);
    }
  }, [supabase, router]);

  useEffect(() => { loadData(); }, [loadData, entityVersion]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  async function handleSignout() { await supabase.auth.signOut(); router.push("/login"); }

  // ─── UPLOAD helpers
  function openUpload(tipo: string, livello: "company" | "entity") {
    setUploadTipo(tipo); setUploadLivello(livello);
    setUploadFile(null); setUploadDate(""); setUploadScadenza(""); setUploadNote(""); setUploadError(null);
  }
  function closeUpload() {
    setUploadTipo(null); setUploadFile(null);
    setUploadDate(""); setUploadScadenza(""); setUploadNote(""); setUploadError(null);
  }

  // ─── DICHIARA helpers
  function openDichiarato(tipo: string, livello: "company" | "entity") {
    setDichiaraTipo(tipo); setDichiaraLivello(livello);
    setDichiaraNote(""); setDichiaraChecked(false);
  }
  function closeDichiarato() {
    setDichiaraTipo(null); setDichiaraNote(""); setDichiaraChecked(false);
  }

  // ─── CONFERMA DICHIARAZIONE
  async function handleDichiaratoConfirm() {
    if (!dichiaraTipo || !dichiaraChecked) return;
    setDichiarando(true);
    try {
      const now   = new Date().toISOString();
      const table = dichiaraLivello === "company" ? "company_compliance_items" : "entity_compliance_items";
      let q = supabase.from(table).update({
        stato: "DICHIARATO", dichiarato_da: userId, dichiarato_at: now,
        note: dichiaraNote || null, updated_at: now,
      });
      if (dichiaraLivello === "company") {
        q = q.eq("company_id", companyId).eq("tipo", dichiaraTipo);
      } else {
        q = q.eq("entity_id", entityId).eq("tipo", dichiaraTipo);
      }
      await q;

      await supabase.from("compliance_activity_log").insert({
        entity_id: entityId, company_id: companyId, user_id: userId,
        tipo_item: dichiaraTipo, livello: dichiaraLivello,
        azione: "DICHIARATO", dettaglio: { note: dichiaraNote || null },
      });

      const tipoSaved = dichiaraTipo;
      closeDichiarato();
      await loadData();
      if (tipoSaved) await aggiornaRischioCompliance(tipoSaved, "DICHIARATO");
    } finally {
      setDichiarando(false);
    }
  }

  // ─── UPLOAD SAVE
  async function handleUploadSave() {
    if (!uploadFile || !entityId || !uploadTipo) {
      setUploadError("Seleziona un file da caricare"); return;
    }

    // Verifica limite pagine
    const uploadDef = ALL_ADEMPIMENTI.find(a => a.tipo === uploadTipo);
    if (uploadDef && uploadDef.maxPagine > 0) {
      const stimaPagine = uploadFile.size / 50000; // ~50KB per pagina PDF
      if (stimaPagine > uploadDef.maxPagine * 1.5) {
        setUploadError(
          `Il documento sembra troppo lungo. Carica solo le sezioni indicate (${uploadDef.cosaCaricare})`
        );
        return;
      }
    }

    setUploading(true); setUploadError(null);
    // snapshot prima di qualsiasi setState
    const tipoSnapshot = uploadTipo;
    let   finalStato: string | null = null;
    try {
      const isCompany = uploadLivello === "company";
      const table     = isCompany ? "company_compliance_items" : "entity_compliance_items";

      const ext  = uploadFile.name.split(".").pop() ?? "bin";
      const path = `${entityId}/${uploadTipo}_${Date.now()}.${ext}`;

      const { error: storageErr } = await supabase.storage
        .from("compliance-docs").upload(path, uploadFile, { upsert: true });
      if (storageErr) throw new Error("Upload fallito: " + storageErr.message);

      const now = new Date().toISOString();

      const buildQ = (updateData: Record<string, unknown>) => {
        let q = supabase.from(table).update(updateData);
        if (isCompany) q = q.eq("company_id", companyId).eq("tipo", uploadTipo);
        else           q = q.eq("entity_id",  entityId).eq("tipo", uploadTipo);
        return q;
      };

      await buildQ({
        stato: "DICHIARATO", documento_path: path, documento_nome: uploadFile.name,
        data_documento: uploadDate || null, data_scadenza: uploadScadenza || null,
        note: uploadNote || null, updated_at: now,
      });

      // Analisi AI
      try {
        const res = await fetch("/api/analyze-document", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filePath: path, documentType: uploadTipo }),
        });
        const analysisData = await res.json();
        const societa: string | undefined = analysisData.societa_indicata;
        const societa_match = !societa ||
          societa.toLowerCase() === (company?.name ?? "").toLowerCase();

        if (!societa_match) {
          await buildQ({
            stato: "NON_CONFORME", analisi_ok: false,
            analisi_note: `⚠ Documento intestato a '${societa}'. Struttura corrente: '${company?.name}'. Verificare.`,
            updated_at: new Date().toISOString(),
          });
          await supabase.from("compliance_activity_log").insert({
            entity_id: entityId, company_id: companyId, user_id: userId,
            tipo_item: uploadTipo, livello: uploadLivello, azione: "NON_CONFORME",
            dettaglio: { societa_indicata: societa, company_name: company?.name },
          });
        } else if (analysisData.success) {
          finalStato = "VERIFICATO";
          await buildQ({
            stato: "VERIFICATO", analisi_ok: true,
            analisi_note: societa
              ? `✓ Documento verificato — ${societa} corrisponde alla struttura corrente.`
              : "✓ Documento verificato da AI.",
            updated_at: new Date().toISOString(),
          });
          await supabase.from("compliance_activity_log").insert({
            entity_id: entityId, company_id: companyId, user_id: userId,
            tipo_item: uploadTipo, livello: uploadLivello, azione: "VERIFICATO",
            dettaglio: { documento_nome: uploadFile.name },
          });
        } else {
          await buildQ({ analisi_ok: false, updated_at: new Date().toISOString() });
          await supabase.from("compliance_activity_log").insert({
            entity_id: entityId, company_id: companyId, user_id: userId,
            tipo_item: uploadTipo, livello: uploadLivello, azione: "CARICATO",
            dettaglio: { documento_nome: uploadFile.name, analisi_ok: false },
          });
        }
      } catch {
        await buildQ({ analisi_ok: false, updated_at: new Date().toISOString() });
      }

      closeUpload();
      await loadData();
      if (finalStato && tipoSnapshot) await aggiornaRischioCompliance(tipoSnapshot, finalStato);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setUploading(false);
    }
  }

  // ─── VIEW DOCUMENTO
  async function handleViewDocument(path: string) {
    const { data } = await supabase.storage.from("compliance-docs").createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  // ─── ANNULLA DICHIARAZIONE
  async function handleAnnullaDichiarazione(tipo: string, livello: "company" | "entity") {
    const table = livello === "company" ? "company_compliance_items" : "entity_compliance_items";
    const now   = new Date().toISOString();
    let q = supabase.from(table).update({
      stato: "MANCANTE", dichiarato_da: null, dichiarato_at: null, updated_at: now,
    });
    if (livello === "company") q = q.eq("company_id", companyId).eq("tipo", tipo);
    else                       q = q.eq("entity_id",  entityId).eq("tipo",  tipo);
    await q;

    await supabase.from("compliance_activity_log").insert({
      entity_id: entityId, company_id: companyId, user_id: userId,
      tipo_item: tipo, livello,
      azione: "DICHIARAZIONE_ANNULLATA", dettaglio: {},
    });
    await loadData();
  }

  // ─── RICALCOLO RISCHIO COMPLIANCE
  async function aggiornaRischioCompliance(tipo: string, stato: string) {
    const COMPLIANCE_TO_TRIAGE: Record<string, { section: string; questionIndex: number; valueIfCompliant: number }> = {
      "NOMINA_DPO":             { section: "S5", questionIndex: 1, valueIfCompliant: 75 },
      "IRP_INCIDENT_RESPONSE":  { section: "S4", questionIndex: 0, valueIfCompliant: 75 },
      "BCP_BUSINESS_CONTINUITY":{ section: "S1", questionIndex: 3, valueIfCompliant: 75 },
      "PIANO_FORMATIVO":        { section: "S5", questionIndex: 0, valueIfCompliant: 75 },
      "REGISTRO_FORNITORI":     { section: "S1", questionIndex: 0, valueIfCompliant: 75 },
      "REGISTRO_TRATTAMENTI":   { section: "S3", questionIndex: 1, valueIfCompliant: 75 },
    };
    const mapping = COMPLIANCE_TO_TRIAGE[tipo];
    if (!mapping) return;

    const isCompliant = stato === "VERIFICATO" || stato === "DICHIARATO";
    const newValue    = isCompliant ? mapping.valueIfCompliant : 25;

    const { data: session } = await supabase
      .from("triage_sessions")
      .select("id, answers")
      .eq("entity_id", entityId)
      .eq("status", "generated")
      .order("completed_at", { ascending: false })
      .limit(1)
      .single();
    if (!session) return;

    const answers = (session.answers ?? {}) as Record<string, number[]>;
    const sectionAnswers = answers[mapping.section] ?? [];
    if (sectionAnswers.length > mapping.questionIndex) {
      sectionAnswers[mapping.questionIndex] = newValue;
      answers[mapping.section] = sectionAnswers;
      await supabase.from("triage_sessions").update({ answers }).eq("id", session.id);
    }

    setRischioToast(true);
    setTimeout(() => setRischioToast(false), 3500);
  }

  // ─── CONTATORI (entrambe le tabelle)
  const allItems  = [...entityItems, ...companyItems];
  const totale    = allItems.length;
  const conformi  = allItems.filter(i => i.stato === "VERIFICATO" || i.stato === "DICHIARATO").length;
  const mancanti  = allItems.filter(i => i.stato === "MANCANTE").length;
  const scaduti   = allItems.filter(i => i.stato === "SCADUTO").length;

  // ─── SCORE COMPLIANCE (memoizzato — ricalcola solo quando cambiano gli items)
  const score = useMemo(
    () => calcScoreCompliance(entityItems, companyItems),
    [entityItems, companyItems]
  );
  const scoreColor = score < 30 ? T.low : score <= 60 ? T.amber : T.critical;
  const scoreBg    = score < 30 ? T.lowBg : score <= 60 ? T.amberBg : T.critBg;

  const entityItemMap  = Object.fromEntries(entityItems.map(i  => [i.tipo, i]));
  const companyItemMap = Object.fromEntries(companyItems.map(i => [i.tipo, i]));

  const produceDef = produceTipo ? ALL_ADEMPIMENTI.find(a => a.tipo === produceTipo) : null;
  const uploadDef  = uploadTipo  ? ALL_ADEMPIMENTI.find(a => a.tipo === uploadTipo)  : null;

  const today = new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });

  // ─── LOADING
  if (loading) return (
    <div className="clavis-bg min-h-screen flex items-center justify-center">
      <div className="text-center space-y-2">
        <p className="font-mono text-sm uppercase tracking-widest" style={{ color: "var(--bone-dim)" }}>CLAVIS</p>
        <p className="text-sm" style={{ color: "var(--bone-dim)" }}>Caricamento adempimenti...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col clavis-bg" style={{ fontFamily: "DM Sans, system-ui" }}>

      {/* TOPBAR */}
      <header className="clavis-topbar flex-shrink-0 flex items-center justify-between px-4 border-b"
        style={{ height: "48px", minHeight: "48px" }}>
        <div className="flex items-center gap-4">
          <p className="font-black tracking-[0.12em] text-white text-lg">CLAVIS</p>
          <div className="h-4 w-px" style={{ backgroundColor: "var(--line2)" }} />
          <EntitySelector tier={profile?.tier} />
          <div className="h-4 w-px" style={{ backgroundColor: "var(--line2)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--bone-dim)" }}>Adempimenti Struttura</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-4 w-px" style={{ backgroundColor: "var(--line2)" }} />
          <div className="relative" ref={dropdownRef}>
            <button onClick={() => setDropdownOpen(v => !v)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <p className="text-xs" style={{ color: "var(--bone-dim)" }}>
                {profile?.full_name || profile?.email?.split("@")[0]}
              </p>
              <span className="text-xs px-1.5 py-0.5 font-mono font-bold uppercase rounded"
                style={{ backgroundColor: T.bronzeBg, color: T.bronze, fontSize: "10px" }}>
                {profile?.tier}
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--bone-dim)" strokeWidth="2">
                <path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
              </svg>
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 top-8 w-44 rounded-lg overflow-hidden z-50"
                style={{ background: "var(--ink2)", border: "1px solid var(--line2)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
                <button onClick={() => { setDropdownOpen(false); router.push("/profilo"); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/5 transition-colors"
                  style={{ color: "var(--bone)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                  Profilo
                </button>
                <div style={{ height: "1px", background: "rgba(255,255,255,0.06)" }} />
                <button onClick={() => { setDropdownOpen(false); handleSignout(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/5 transition-colors"
                  style={{ color: "#F87171" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
                  </svg>
                  Esci
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* BODY */}
      <div className="flex flex-1 overflow-hidden">

        {/* SIDEBAR */}
        <aside className="clavis-sidebar flex-shrink-0 flex flex-col border-r transition-all duration-200"
          style={{ width: sidebarCollapsed ? "48px" : "188px", borderColor: "var(--line)" }}>
          <div className="flex-1 py-2 space-y-0.5">
            <NavItem icon="📊" label="Panoramica"  onClick={() => router.push("/dashboard")}   collapsed={sidebarCollapsed} />
            <NavItem icon="📋" label="Remediation" onClick={() => router.push("/remediation")} collapsed={sidebarCollapsed} />
            <NavItem icon="⏰" label="Scadenze"    onClick={() => router.push("/scadenze")}    collapsed={sidebarCollapsed} />
            <NavItem icon="🏥" label="Struttura"   active onClick={() => {}}                   collapsed={sidebarCollapsed} />
            <NavItem icon="🏢" label="Fornitori"   onClick={() => router.push("/fornitori")}   collapsed={sidebarCollapsed} />
            <NavItem icon="🏢" label="Anagrafica"  onClick={() => router.push("/anagrafica")}  collapsed={sidebarCollapsed} />
          </div>
          <div className="border-t py-2" style={{ borderColor: "rgba(226,232,240,0.1)" }}>
            <button onClick={() => setSidebarCollapsed(v => !v)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs"
              style={{ color: T.slate400 }}>
              <span>{sidebarCollapsed ? "▶" : "◀"}</span>
              {!sidebarCollapsed && <span>Comprimi</span>}
            </button>
          </div>
        </aside>

        {/* MAIN */}
        <main className="clavis-workspace flex-1 flex flex-col overflow-auto p-6 gap-6">

          {/* HEADER PAGINA */}
          <div className="flex flex-col gap-3 flex-shrink-0">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <ClavisTitle it="Adempimenti Struttura" en="Compliance Requirements" as="h1" variant="page" />
                <p className="text-xs font-mono mt-1" style={{ color: T.slate400 }}>
                  GDPR · NIS2 · AI Act · D.Lgs. 231 — {today}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold px-3 py-1.5 rounded"
                  style={{ backgroundColor: "var(--ink3)", color: "var(--bone-dim)", border: "1px solid var(--line2)" }}>
                  {totale} totali
                </span>
                <span className="text-xs font-bold px-3 py-1.5 rounded"
                  style={{ backgroundColor: T.lowBg, color: T.low }}>
                  {conformi} conformi
                </span>
                <span className="text-xs font-bold px-3 py-1.5 rounded"
                  style={{ backgroundColor: T.critBg, color: T.critical }}>
                  {mancanti} mancanti
                </span>
                <span className="text-xs font-bold px-3 py-1.5 rounded"
                  style={{ backgroundColor: T.boneDimBg, color: T.boneDim }}>
                  {scaduti} scaduti
                </span>
                {/* Score compliance documentale */}
                <span className="text-xs font-bold px-3 py-1.5 rounded"
                  title="Rischio documentale ponderato: 0 = ottima compliance, 100 = massimo rischio"
                  style={{ backgroundColor: scoreBg, color: scoreColor, border: `1px solid ${scoreColor}40` }}>
                  ⚡ Rischio: {score}/100
                </span>
              </div>
            </div>

            {/* Barra conformità complessiva */}
            <div className="flex-shrink-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs" style={{ color: T.slate400 }}>Conformità complessiva</p>
                <p className="text-xs font-bold font-mono" style={{ color: conformi === totale ? T.low : T.bronze }}>
                  {totale > 0 ? Math.round((conformi / totale) * 100) : 0}%
                </p>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--ink3)" }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${totale > 0 ? (conformi / totale) * 100 : 0}%`,
                    backgroundColor: conformi === totale ? T.low : T.bronze,
                  }} />
              </div>
              <p style={{ fontSize: "12px", color: "var(--bone-dim)", fontStyle: "italic", marginTop: "6px" }}>
                Questa valutazione contribuisce per il 30% allo score globale di rischio della struttura.
              </p>
            </div>
          </div>

          {/* ── SEZIONE 0: PROFILO RISCHIO SOCIETARIO */}
          {companyId && entityId && (
            <section className="flex flex-col gap-2">
              <CompanyRiskProfile
                companyId={companyId}
                entityId={entityId}
              />
            </section>
          )}

          {/* ── SEZIONE 1: ADEMPIMENTI SOCIETÀ */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: "var(--bone)" }}>
                  Adempimenti Società
                </h2>
                <p className="text-xs font-mono mt-0.5" style={{ color: T.slate400 }}>
                  Validi per tutte le strutture collegate
                </p>
              </div>
              {company && (
                <span className="text-xs font-mono font-bold px-2.5 py-1 rounded"
                  style={{ backgroundColor: T.highBg, color: T.high, border: `1px solid ${T.high}30` }}>
                  {company.name}
                </span>
              )}
            </div>
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
              {ADEMPIMENTI_COMPANY.map(def => (
                <AdempimentoCard key={def.tipo} def={def} item={companyItemMap[def.tipo] ?? null}
                  livello="company" onUpload={openUpload} onProduce={t => setProduceTipo(t)}
                  onView={handleViewDocument} onDichiarato={openDichiarato}
                  onAnnulla={handleAnnullaDichiarazione} />
              ))}
            </div>
          </section>

          {/* ── SEZIONE 2: ADEMPIMENTI STRUTTURA */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: "var(--bone)" }}>
                  Adempimenti Struttura
                </h2>
                <p className="text-xs font-mono mt-0.5" style={{ color: T.slate400 }}>
                  Specifici per questa struttura
                </p>
              </div>
              {entityName && (
                <span className="text-xs font-mono font-bold px-2.5 py-1 rounded"
                  style={{ backgroundColor: T.bronzeBg, color: T.bronze, border: `1px solid ${T.bronze}30` }}>
                  {entityName}
                </span>
              )}
            </div>
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
              {ADEMPIMENTI_ENTITY.filter(def => def.tipo !== "FRIA" || usaAI).map(def => (
                <AdempimentoCard key={def.tipo} def={def} item={entityItemMap[def.tipo] ?? null}
                  livello="entity" onUpload={openUpload} onProduce={t => setProduceTipo(t)}
                  onView={handleViewDocument} onDichiarato={openDichiarato}
                  onAnnulla={handleAnnullaDichiarazione} />
              ))}
            </div>
          </section>

        </main>
      </div>

      {/* ── MODAL DICHIARA */}
      {dichiaraTipo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
          onClick={e => { if (e.target === e.currentTarget) closeDichiarato(); }}>
          <div className="w-full max-w-md rounded-lg overflow-hidden"
            style={{ background: "var(--ink2)", border: "1px solid var(--line2)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>

            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid var(--line2)", backgroundColor: "var(--ink3)" }}>
              <p className="font-bold text-sm uppercase tracking-wider" style={{ color: "var(--bone)" }}>
                Dichiarazione — {ALL_ADEMPIMENTI.find(a => a.tipo === dichiaraTipo)?.label}
              </p>
              <button onClick={closeDichiarato} className="hover:opacity-60 transition-opacity"
                style={{ color: T.slate400, fontSize: "18px", lineHeight: 1 }}>✕</button>
            </div>

            <div className="px-5 py-5 space-y-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={dichiaraChecked}
                  onChange={e => setDichiaraChecked(e.target.checked)}
                  className="mt-0.5 flex-shrink-0" />
                <span className="text-sm leading-snug" style={{ color: "var(--bone)" }}>
                  Dichiaro sotto mia responsabilità di essere in possesso di questo documento
                </span>
              </label>
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wider font-semibold" style={{ color: T.slate400 }}>
                  Note (opzionale)
                </label>
                <textarea value={dichiaraNote} onChange={e => setDichiaraNote(e.target.value)}
                  rows={3} placeholder="Riferimenti, revisore, data prevista caricamento..."
                  className="w-full px-3 py-2 text-sm resize-none outline-none rounded"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--line2)", color: "var(--bone)" }} />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-5 py-4"
              style={{ borderTop: "1px solid var(--line2)" }}>
              <button onClick={closeDichiarato} disabled={dichiarando}
                className="text-sm px-4 py-2 transition-opacity hover:opacity-70"
                style={{ color: T.slate400 }}>
                Annulla
              </button>
              <button onClick={handleDichiaratoConfirm} disabled={dichiarando || !dichiaraChecked}
                className="text-sm px-5 py-2 font-bold uppercase tracking-widest transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ backgroundColor: T.amber, color: "#0A0E1A", borderRadius: "4px" }}>
                {dichiarando ? "Salvataggio..." : "Conferma dichiarazione"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CARICA DOCUMENTO */}
      {uploadTipo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
          onClick={e => { if (e.target === e.currentTarget) closeUpload(); }}>
          <div className="w-full max-w-md rounded-lg overflow-hidden"
            style={{ background: "var(--ink2)", border: "1px solid var(--line2)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>

            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid var(--line2)", backgroundColor: "var(--ink3)" }}>
              <p className="font-bold text-sm uppercase tracking-wider" style={{ color: "var(--bone)" }}>
                Carica — {ALL_ADEMPIMENTI.find(a => a.tipo === uploadTipo)?.label}
              </p>
              <button onClick={closeUpload} className="hover:opacity-60 transition-opacity"
                style={{ color: T.slate400, fontSize: "18px", lineHeight: 1 }}>✕</button>
            </div>

            <div className="px-5 py-5 space-y-4">
              {/* Nota su cosa caricare con limite pagine */}
              {uploadDef && (
                <div className="px-3 py-2.5 rounded"
                  style={{ backgroundColor: "rgba(94,134,245,0.08)", border: "1px solid rgba(94,134,245,0.2)" }}>
                  <p className="text-xs leading-snug" style={{ color: T.boneDim, fontStyle: "italic" }}>
                    {uploadDef.cosaCaricare}
                  </p>
                  {uploadDef.maxPagine > 0 && (
                    <p className="text-xs font-semibold mt-1" style={{ color: T.high }}>
                      Max {uploadDef.maxPagine} pagine — file più grandi verranno rifiutati
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wider font-semibold" style={{ color: T.slate400 }}>
                  File documento *
                </label>
                <div className="border rounded px-4 py-6 text-center cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ borderColor: uploadFile ? `${T.low}60` : "var(--line2)", borderStyle: "dashed", backgroundColor: "var(--ink3)" }}
                  onClick={() => fileInputRef.current?.click()}>
                  <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) setUploadFile(f); }} />
                  {uploadFile ? (
                    <div>
                      <p className="text-sm font-semibold" style={{ color: T.low }}>✓ {uploadFile.name}</p>
                      <p className="text-xs mt-1" style={{ color: T.slate400 }}>{(uploadFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm" style={{ color: T.slate400 }}>Clicca per selezionare</p>
                      <p className="text-xs mt-1" style={{ color: T.slate600, fontSize: "11px" }}>PDF, Word (.docx)</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wider font-semibold" style={{ color: T.slate400 }}>Data documento</label>
                <input type="date" value={uploadDate} onChange={e => setUploadDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm outline-none rounded"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--line2)", color: "var(--bone)" }} />
              </div>

              <div className="space-y-1.5">
                <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--bone-dim)", textTransform: "uppercase", letterSpacing: ".08em", display: "block", marginBottom: "6px" }}>
                  Data scadenza <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(se applicabile)</span>
                </label>
                <input type="date" value={uploadScadenza} onChange={e => setUploadScadenza(e.target.value)}
                  className="w-full px-3 py-2 text-sm outline-none rounded"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--line2)", color: "var(--bone)" }} />
                <p style={{ fontSize: "11px", color: "var(--bone-dim)", marginTop: "4px" }}>
                  Obbligatoria per: Polizza RC, Nomina DPO, Codice Etico
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-wider font-semibold" style={{ color: T.slate400 }}>Note (opzionale)</label>
                <textarea value={uploadNote} onChange={e => setUploadNote(e.target.value)}
                  rows={3} placeholder="Annotazioni, riferimenti, revisore..."
                  className="w-full px-3 py-2 text-sm resize-none outline-none rounded"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--line2)", color: "var(--bone)" }} />
              </div>

              {uploadError && <p className="text-xs font-semibold" style={{ color: T.critical }}>✗ {uploadError}</p>}

              {uploading && (
                <div className="space-y-1">
                  <p className="text-xs" style={{ color: T.amber }}>⏳ Caricamento e analisi AI in corso...</p>
                  <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: "var(--ink3)" }}>
                    <div className="h-full rounded-full animate-pulse" style={{ width: "60%", backgroundColor: T.bronze }} />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-5 py-4"
              style={{ borderTop: "1px solid var(--line2)" }}>
              <button onClick={closeUpload} disabled={uploading}
                className="text-sm px-4 py-2 transition-opacity hover:opacity-70"
                style={{ color: T.slate400 }}>
                Annulla
              </button>
              <button onClick={handleUploadSave} disabled={uploading || !uploadFile}
                className="text-sm px-5 py-2 font-bold uppercase tracking-widest transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ backgroundColor: "var(--shield)", color: "var(--bone)", borderRadius: "4px" }}>
                {uploading ? "Analisi AI..." : "Analizza e salva"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL PRODUCE DOCUMENTO */}
      {produceTipo && produceDef && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
          onClick={e => { if (e.target === e.currentTarget) setProduceTipo(null); }}>
          <div className="w-full max-w-sm rounded-lg overflow-hidden"
            style={{ background: "var(--ink2)", border: "1px solid var(--line2)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>

            <div className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid var(--line2)", backgroundColor: "var(--ink3)" }}>
              <p className="font-bold text-sm uppercase tracking-wider" style={{ color: "var(--bone)" }}>
                {produceDef.icon} {produceDef.label}
              </p>
              <button onClick={() => setProduceTipo(null)} className="hover:opacity-60 transition-opacity"
                style={{ color: T.slate400, fontSize: "18px", lineHeight: 1 }}>✕</button>
            </div>

            <div className="px-5 py-6 space-y-4 text-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
                style={{ backgroundColor: "var(--ink3)", fontSize: "28px" }}>🛡</div>
              <div className="space-y-2">
                <p className="font-semibold" style={{ color: "var(--bone)" }}>
                  Generatore {produceDef.label} in arrivo.
                </p>
                <p className="text-sm" style={{ color: T.slate400 }}>Puoi già caricare il documento se lo hai.</p>
              </div>
              <button
                onClick={() => {
                  const lv = ADEMPIMENTI_COMPANY.some(a => a.tipo === produceTipo) ? "company" : "entity";
                  setProduceTipo(null);
                  openUpload(produceTipo, lv);
                }}
                className="w-full py-2.5 text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ border: "1px solid var(--line2)", color: "var(--bone-dim)", borderRadius: "4px" }}>
                ↑ Carica documento esistente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST RISCHIO */}
      {rischioToast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-xl"
          style={{ backgroundColor: "#0A2E1A", border: `1px solid ${T.low}60`, color: T.low, fontSize: "13px", fontWeight: 600 }}>
          <span>✓</span>
          <span>Rischio aggiornato automaticamente</span>
        </div>
      )}

    </div>
  );
}
