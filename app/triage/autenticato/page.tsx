"use client";

/**
 * CLAVIS — Triage Autenticato v1.0
 * Path: app/triage/autenticato/page.tsx
 *
 * Esperienza Pro per utenti loggati:
 * - Dati struttura precompilati da DB
 * - Scelta: nuovo triage o aggiorna esistente
 * - Stesse 6 sezioni del pubblico + domande aperte Pro
 * - Result operativo: briefing legale + piano remediation automatico
 * - Delta score vs sessione precedente
 * - Salvataggio in triage_sessions + remediation_plans
 */

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useActiveEntity } from "@/contexts/EntityContext";

// ─── TIPI
interface Entity {
  id: string;
  name: string;
  entity_type: string;
  region: string;
  total_beds: number | null;
  company_id: string | null;
  convenzione_ssn: boolean | null;
  tipo_convenzione: string | null;
  gestione_it: string | null;
  modello_231: string | null;
  n_ospiti: string | null;
  n_dipendenti: string | null;
}

interface CompanyRiskData {
  fatturato_fascia: string | null;
  n_dipendenti_fascia: string | null;
  storico_violazioni: boolean | null;
}

interface PreviousSession {
  id: string;
  risk_score: number;
  completed_at: string;
  answers: Record<string, { label: string; values: number[]; section_risk: number }>;
  flags_triggered: Array<{ section: string; label: string; risk: number }>;
}

type Step = "profilo" | "scelta" | "triage" | "finalNote" | "result";
type TriageMode = "nuovo" | "aggiorna";

// ─── SEZIONI (identiche al pubblico — SSOT: legal_dictionary.json)
const SECTIONS = [
  {
    id: "S1", label_it: "Catena di Fornitura Digitale", label_en: "Digital Supply Chain",
    weight_pct: 20, framework: "NIS2",
    questions: [
      { id: "S1Q1", weight: 30, threshold: 50, flag: "Flag_NIS2_SC_01", text: "La struttura ha censito tutti i fornitori software che accedono o trattano dati clinici degli ospiti?", sublabel: "Gestionale clinico, cartella elettronica, telemedicina, piattaforme cloud per referti", normativa: "Art. 21 D.Lgs. 138/2024 — Art. 28 GDPR", labels: ["Nessun censimento effettuato", "Censimento parziale, molti fornitori ignoti", "Elenco incompleto o non aggiornato", "Censimento completo, valutazione sicurezza assente", "Registro completo con valutazione sicurezza per ogni fornitore"] },
      { id: "S1Q2", weight: 25, threshold: 50, flag: "Flag_GDPR_Art28", text: "Con ogni fornitore che tratta dati clinici è stato stipulato un contratto DPA conforme GDPR?", sublabel: "Data Processing Agreement — obbligatorio per ogni soggetto esterno", normativa: "Art. 28 GDPR", labels: ["Nessun DPA con alcun fornitore", "DPA solo con il fornitore principale", "DPA con la maggior parte, alcuni mancanti", "DPA con tutti, ma non aggiornati", "DPA aggiornati e firmati con tutti i fornitori"] },
      { id: "S1Q3", weight: 20, threshold: 50, flag: "Flag_GDPR_DataResidency", text: "I fornitori cloud/software sono stati valutati per la localizzazione dei dati e il rispetto GDPR per trasferimenti extra-UE?", sublabel: "Server in USA, UK o paesi terzi richiedono Standard Contractual Clauses", normativa: "Art. 44-49 GDPR — Schrems II", labels: ["Non so dove risiedono i dati degli ospiti", "Dati in UE senza documentazione formale", "Dati in UE verificati, trasferimenti extra-UE non gestiti", "Tutti i trasferimenti documentati con SCC", "Data residency verificata, SCC aggiornate, audit annuale"] },
      { id: "S1Q4", weight: 25, threshold: 50, flag: "Flag_NIS2_BCP", text: "In caso di incidente o interruzione di un fornitore critico, la struttura ha un piano di continuità operativa documentato?", sublabel: "Business Continuity Plan, procedure di backup, contatti di emergenza", normativa: "Art. 21 par. 2 lett. c D.Lgs. 138/2024", labels: ["Nessun piano — non sappiamo come procedere", "Procedure informali non documentate", "Piano esistente ma non testato né aggiornato", "Piano documentato, test occasionali", "BCP documentato, testato annualmente, personale formato"] },
    ],
  },
  {
    id: "S2", label_it: "Sistemi AI e Dispositivi Medici", label_en: "AI Systems & Medical Devices",
    weight_pct: 25, framework: "AI Act",
    questions: [
      { id: "S2Q1", weight: 30, threshold: 25, flag: "Flag_AIACT_HR_01", text: "La struttura utilizza sistemi algoritmici o AI per supportare decisioni cliniche o monitorare gli ospiti?", sublabel: "Rilevamento cadute, deterioramento cognitivo, gestione terapia, monitoraggio parametri vitali", normativa: "Art. 6 + Allegato III punto 5(b) AI Act — MDR 2017/745", labels: ["Nessun sistema AI in uso", "Uso sperimentale occasionale, non integrato", "Sistemi AI integrati, non classificati né valutati", "Classificazione effettuata, FRIA in corso", "Classificati, FRIA completata, Dossier Tecnico acquisito"] },
      { id: "S2Q2", weight: 25, threshold: 50, flag: "Flag_AIACT_Deployer", text: "Per ogni sistema AI in uso clinico, è stata verificata la conformità AI Act del fornitore?", sublabel: "Il deployer è corresponsabile se usa un sistema non conforme dopo agosto 2026", normativa: "Art. 26 AI Act — Obblighi deployer", labels: ["Non abbiamo verificato la conformità di nessun fornitore", "Richieste inviate, nessuna documentazione ricevuta", "Documentazione parziale da alcuni fornitori", "Documentazione ricevuta dalla maggior parte", "Dossier Tecnico e dichiarazione di conformità per ogni sistema"] },
      { id: "S2Q3", weight: 20, threshold: 50, flag: "Flag_AIACT_Literacy", text: "Il personale clinico ha ricevuto formazione specifica sull'uso, i limiti e i rischi dei sistemi AI?", sublabel: "AI Act Art. 4 introduce l'obbligo di AI literacy per tutto il personale", normativa: "Art. 4 AI Act — Art. 26 par. 6", labels: ["Nessuna formazione AI erogata", "Formazione informale dal fornitore all'installazione", "Formazione base erogata, non documentata", "Formazione documentata, aggiornamento pianificato", "Piano formativo strutturato, documentato, con verifica periodica"] },
      { id: "S2Q4", weight: 15, threshold: 50, flag: "Flag_GDPR_DPIA", text: "La struttura ha effettuato una DPIA per i sistemi AI che trattano dati sanitari?", sublabel: "Obbligatoria per trattamenti sistematici di dati sanitari", normativa: "Art. 35 GDPR — EDPB WP248", labels: ["Nessuna DPIA effettuata", "DPIA solo per il gestionale principale", "DPIA in corso per i sistemi principali", "DPIA completate per la maggior parte", "DPIA complete per tutti i sistemi, revisione annuale"] },
      { id: "S2Q5", weight: 10, threshold: 50, flag: "Flag_MDR_Software", text: "I software clinici sono stati verificati per una eventuale classificazione come dispositivo medico (MDR)?", sublabel: "Software che supporta diagnosi o terapia può essere Classe IIa o superiore", normativa: "Art. 2 MDR 2017/745 — MDCG 2019-11", labels: ["Non abbiamo mai verificato la classificazione MDR", "Il fornitore ha dichiarato non-MD, senza documentazione", "Verifica per alcuni software, documentazione parziale", "Classificazione MDR verificata per i software principali", "Classificazione documentata per tutti i software clinici"] },
    ],
  },
  {
    id: "S3", label_it: "Shadow IT e Governo dei Dati", label_en: "Shadow IT & Data Governance",
    weight_pct: 20, framework: "D.Lgs. 231",
    questions: [
      { id: "S3Q1", weight: 30, threshold: 50, flag: "Flag_D231_BYOD", text: "Il personale utilizza dispositivi personali (BYOD) per accedere a dati clinici o comunicare informazioni sanitarie?", sublabel: "Smartphone personali per foto ospiti, tablet privati per gestionale, email personali per referti", normativa: "Art. 24-bis D.Lgs. 231/2001 — L. 132/2025 — Art. 32 GDPR", labels: ["Uso sistematico non regolamentato", "Uso frequente tollerato informalmente", "Policy BYOD esistente ma non applicata", "Policy attiva, formazione erogata, controlli occasionali", "BYOD vietato o con MDM, policy firmata da ogni dipendente"] },
      { id: "S3Q2", weight: 35, threshold: 50, flag: "Flag_D231_ShadowAI", text: "Il personale utilizza strumenti AI generativa non autorizzati per redigere documentazione clinica?", sublabel: "ChatGPT, Claude consumer, Gemini per note cliniche, diari infermieristici, relazioni", normativa: "Art. 24-bis D.Lgs. 231/2001 — L. 132/2025 — Art. 9+32 GDPR", labels: ["Uso diffuso e non regolamentato", "Uso noto alla direzione, non affrontato formalmente", "Divieto verbale, nessuna policy né controllo", "AI Use Policy adottata, formazione in corso", "AI Use Policy firmata da tutti, strumenti approvati, audit periodici"] },
      { id: "S3Q3", weight: 20, threshold: 50, flag: "Flag_GDPR_Messaging", text: "La struttura utilizza app di messaggistica consumer per comunicazioni cliniche?", sublabel: "WhatsApp, Telegram, SMS per dati sanitari, foto ospiti, aggiornamenti clinici", normativa: "Art. 32 GDPR — Provvedimento Garante 2024", labels: ["WhatsApp usato sistematicamente per comunicazioni cliniche", "Uso frequente tollerato, nessuna alternativa aziendale", "Strumenti aziendali disponibili ma non sempre usati", "Policy adottata, strumenti sicuri forniti", "Solo strumenti aziendali cifrati approvati"] },
      { id: "S3Q4", weight: 15, threshold: 50, flag: "Flag_NIS2_Logging", text: "Esiste un sistema di logging e controllo accessi ai sistemi clinici?", sublabel: "Audit trail accessi gestionale, log autenticazioni, alert su accessi anomali", normativa: "Art. 5 par. 2 GDPR — Art. 21 D.Lgs. 138/2024", labels: ["Nessun logging — non sappiamo chi accede ai dati", "Log automatici non monitorati", "Log presenti, revisione manuale occasionale", "Log attivi, revisione periodica, alert configurati", "Audit trail completo, SIEM attivo, report mensili"] },
    ],
  },
  {
    id: "S4", label_it: "Gestione Incidenti e Notifiche", label_en: "Incident Management & Reporting",
    weight_pct: 15, framework: "NIS2",
    questions: [
      { id: "S4Q1", weight: 40, threshold: 50, flag: "Flag_NIS2_IRP", text: "La struttura ha una procedura documentata per la gestione di incidenti informatici e violazioni di dati?", sublabel: "Risposta a ransomware, data breach, accessi non autorizzati — con ruoli ed escalation", normativa: "Art. 23 D.Lgs. 138/2024 — notifica NIS2 entro 24h — Art. 33 GDPR entro 72h", labels: ["Nessuna procedura — non sappiamo come reagire", "Solo contatti del fornitore IT", "Procedura informale, ruoli non chiari, nessuna simulazione", "Procedura documentata, almeno una simulazione effettuata", "IRP completo, team definito, simulazioni annuali, registrazione ACN"] },
      { id: "S4Q2", weight: 35, threshold: 50, flag: "Flag_GDPR_Breach", text: "Il personale sa riconoscere una violazione di dati e a chi segnalarla entro i tempi di legge?", sublabel: "GDPR impone notifica al Garante entro 72h — il ritardo è sanzionato anche se lieve", normativa: "Art. 33-34 GDPR — EDPB 01/2021", labels: ["Il personale non conosce la procedura", "Solo IT/DPO sa cosa fare", "Formazione base erogata, procedura non testata", "Procedura nota al personale rilevante, test simulato", "Integrata nella formazione annuale, test periodici"] },
      { id: "S4Q3", weight: 25, threshold: 50, flag: "Flag_NIS2_Registration", text: "La struttura ha completato la registrazione alla piattaforma ACN come soggetto NIS2?", sublabel: "Soggetti con >50 dipendenti o >€10M fatturato — scadenza 31/01/2025 — già sanzionabile", normativa: "Art. 7 D.Lgs. 138/2024 — scadenza 31/01/2025", labels: ["Non sappiamo se siamo soggetti NIS2, non registrati", "Sappiamo di dover verificare, nessuna azione", "Verifica in corso, registrazione non completata", "Registrazione completata, obblighi in implementazione", "Registrati ACN, referente NIS2 designato, obblighi implementati"] },
    ],
  },
  {
    id: "S5", label_it: "Formazione e Modello Organizzativo", label_en: "Training & Organizational Model",
    weight_pct: 10, framework: "D.Lgs. 231",
    questions: [
      { id: "S5Q1", weight: 40, threshold: 50, flag: "Flag_D231_Formazione", text: "Il personale ha ricevuto formazione specifica su cybersicurezza e protezione dei dati negli ultimi 12 mesi?", sublabel: "Phishing, password sicure, GDPR base — obbligatoria per esimente D.Lgs. 231", normativa: "Art. 6 D.Lgs. 231/2001 — Art. 4 AI Act — Art. 39 GDPR", labels: ["Nessuna formazione specifica", "Formazione generica all'assunzione, nulla di recente", "Formazione annuale erogata solo a parte del personale", "Formazione annuale completa, attestati raccolti", "Piano formativo per ruolo, test apprendimento, aggiornamento garantito"] },
      { id: "S5Q2", weight: 30, threshold: 25, flag: "Flag_GDPR_DPO", text: "La struttura ha designato formalmente un DPO con funzioni operative?", sublabel: "Obbligatorio per tutte le strutture sanitarie — non può essere il responsabile qualità né IT", normativa: "Art. 37-39 GDPR", labels: ["Nessun DPO designato", "DPO nominato senza attività operative", "DPO operativo con conflitti di interesse", "DPO operativo, indipendente, piano annuale", "DPO operativo, indipendente, accesso diretto al vertice, comunicato al Garante"] },
      { id: "S5Q3", weight: 30, threshold: 50, flag: "Flag_NIS2_CdA", text: "Il Consiglio di Amministrazione ha formalmente approvato le politiche di cybersicurezza?", sublabel: "NIS2 Art. 24 impone approvazione CdA — mancata approvazione è fattore aggravante", normativa: "Art. 24 D.Lgs. 138/2024 — Art. 6 D.Lgs. 231/2001", labels: ["Il CdA non ha mai discusso cybersicurezza", "Aggiornamenti informali al CdA, nessuna delibera", "Una delibera generica senza piano specifico", "Delibera CdA con piano approvato, aggiornamento periodico", "Delibera CdA con piano dettagliato, budget dedicato, report trimestrale"] },
    ],
  },
  {
    id: "S6", label_it: "Compliance Regionale e Accreditamento", label_en: "Regional Compliance & Accreditation",
    weight_pct: 10, framework: "DM 77/2022",
    questions: [
      { id: "S6Q1", weight: 35, threshold: 50, flag: "Flag_FSE_Interop", text: "La struttura ha verificato i requisiti di interoperabilità con il FSE 2.0 nella propria regione?", sublabel: "DM 77/2022 impone integrazione FSE per strutture convenzionate SSN/SSR", normativa: "Art. 4 DM 77/2022 — DPCM 07/09/2023", labels: ["Non abbiamo verificato i requisiti FSE", "Sappiamo degli obblighi FSE, nessuna azione", "Verifica in corso, nessuna integrazione", "Integrazione FSE avviata, in fase di test", "Integrazione FSE completata e certificata"] },
      { id: "S6Q2", weight: 35, threshold: 50, flag: "Flag_Gelli_RC", text: "La struttura è coperta da polizza RC Sanitaria conforme al DM 232/2023?", sublabel: "Obbligo per tutte le strutture sociosanitarie — la gestione digitale incide sul rischio assicurativo", normativa: "Art. 10 L. 24/2017 (Legge Gelli) — DM 232/2023", labels: ["Nessuna polizza RC sanitaria specifica", "Polizza presente ma non aggiornata al DM 232/2023", "Polizza in aggiornamento, verifica con broker", "Polizza aggiornata, massimali verificati", "Polizza DM 232/2023 conforme, revisione annuale, copertura cyber"] },
      { id: "S6Q3", weight: 30, threshold: 50, flag: "Flag_Accreditamento_Tech", text: "I requisiti tecnologici del decreto di accreditamento regionale sono stati verificati?", sublabel: "Ogni regione ha requisiti tecnici specifici — aggiornamenti normativi modificano i requisiti", normativa: "DGR regionali specifiche per tipo struttura", labels: ["Non conosciamo i requisiti tecnologici del nostro accreditamento", "Conosciamo i requisiti, non abbiamo verificato la conformità", "Verifica parziale, alcune non conformità identificate", "Verifica completa, piano di adeguamento in corso", "Conformità verificata e documentata, piano di mantenimento"] },
    ],
  },
];

const BANDS = [
  { min: 75, label: "RISCHIO CRITICO",   color: "#DC2626", border: "#7F1D1D", bg: "#DC262610" },
  { min: 50, label: "RISCHIO ALTO",      color: "#EA580C", border: "#7C2D12", bg: "#EA580C10" },
  { min: 25, label: "RISCHIO MEDIO",     color: "#CA8A04", border: "#713F12", bg: "#CA8A0410" },
  { min: 0,  label: "RISCHIO CONTENUTO", color: "#16A34A", border: "#14532D", bg: "#16A34A10" },
];

import LEGAL_DICT from "@/config/legal_dictionary.json";
import { calcSanzioneCalibrata } from "@/lib/sanctions";

type FlagEntry = {
  control_code: string;
  label: string;
  short_label: string;
  section: string;
  severity: number;
  remediation: {
    action: string;
    deadline: string;
    responsible: string;
    priority: string;
  };
  risk_score_weight: number;
};

function buildRemediationFromFlags(
  answers: Record<string, number[]>,
  sections: typeof SECTIONS,
): Array<{
  flag_key: string;
  section: string;
  label: string;
  action: string;
  responsible: string;
  deadline: string;
  priority: string;
  severity: number;
  requires: string[];
  order: number;
}> {
  const dict = LEGAL_DICT as { flags: Record<string, FlagEntry> };
  const seen = new Set<string>();
  const items: ReturnType<typeof buildRemediationFromFlags> = [];

  for (const section of sections) {
    const sectionAnswers = answers[section.id] ?? new Array(section.questions.length).fill(50);
    for (let qi = 0; qi < section.questions.length; qi++) {
      const q = section.questions[qi] as any;
      const val = sectionAnswers[qi] ?? 50;
      if (val <= q.threshold && q.flag && !seen.has(q.flag)) {
        const flagData = dict.flags[q.flag];
        if (!flagData) continue;
        seen.add(q.flag);
        items.push({
          flag_key:    q.flag,
          section:     section.id,
          label:       flagData.label,
          action:      flagData.remediation.action,
          responsible: flagData.remediation.responsible,
          deadline:    flagData.remediation.deadline,
          priority:    flagData.remediation.priority,
          severity:    flagData.severity,
          requires:    (flagData as any).requires ?? [],
          order:       (flagData as any).execution_order ?? 99,
        });
      }
    }
  }

  // Ordina per execution_order — rispetta le dipendenze logiche
  // poi per priority come tiebreaker
  const priorityOrder: Record<string, number> = { CRITICA: 0, ALTA: 1, MEDIA: 2 };
  return items.sort((a, b) =>
    (a.order ?? 99) - (b.order ?? 99) ||
    (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9)
  );
}

function getBand(score: number) {
  return BANDS.find(b => score >= b.min) ?? BANDS[BANDS.length - 1];
}

/** Formatta un importo in Euro (K / M abbreviati) */
function fmtEuro(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M €`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)} K €`;
  return `${n.toLocaleString("it-IT")} €`;
}

function calcSectionScore(answers: number[], questions: typeof SECTIONS[0]["questions"]): number {
  let weighted = 0, totalW = 0;
  questions.forEach((q, i) => { weighted += (answers[i] ?? 50) * q.weight; totalW += q.weight; });
  return totalW > 0 ? weighted / totalW : 50;
}

function getSectionRisk(sectionScore: number): number {
  return Math.round((1 - sectionScore / 100) * 100);
}

function calcTotalScore(allAnswers: Record<string, number[]>): number {
  let total = 0;
  SECTIONS.forEach(s => {
    const ans = allAnswers[s.id] ?? s.questions.map(() => 50);
    const sScore = calcSectionScore(ans, s.questions);
    total += (1 - sScore / 100) * s.weight_pct;
  });
  return Math.round(Math.min(100, total));
}

// ─── COMPONENTI UI

function ClavisTitle({ it, en, size = "lg" }: { it: string; en: string; size?: "sm" | "lg" | "xl" }) {
  const cls = size === "xl" ? "text-3xl font-bold tracking-tight"
    : size === "lg" ? "text-2xl font-bold tracking-tight"
    : "text-lg font-semibold tracking-tight";
  return (
    <div>
      <p className={`${cls} text-white uppercase leading-tight`}>{it}</p>
      <p className="text-sm text-zinc-600 tracking-widest mt-0.5">({en})</p>
    </div>
  );
}

function SectionProgressBar({ sections, currentIdx, answers }: {
  sections: typeof SECTIONS; currentIdx: number; answers: Record<string, number[]>;
}) {
  return (
    <div className="flex gap-1 w-full">
      {sections.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        const filled = answers[s.id]?.some(v => v !== 50);
        return (
          <div key={s.id} className="flex-1 space-y-1">
            <div className={`h-1 rounded-full transition-all duration-300 ${active ? "bg-white" : done && filled ? "bg-zinc-400" : "bg-zinc-800"}`} />
            <p className={`text-center text-xs uppercase tracking-wider hidden sm:block ${active ? "text-white" : "text-zinc-700"}`}>{s.id}</p>
          </div>
        );
      })}
    </div>
  );
}

function SliderQuestion({ question, value, onChange, index, total }: {
  question: typeof SECTIONS[0]["questions"][0]; value: number; onChange: (v: number) => void; index: number; total: number;
}) {
  const risk = getSectionRisk(value);
  const band = getBand(risk);
  const labelIndex = Math.min(Math.round(value / 25), 4);
  return (
    <div className="space-y-5 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-mono font-black text-white leading-none">{String(index + 1).padStart(2, "0")}</span>
          <span className="text-lg font-mono text-zinc-600 leading-none">/ {String(total).padStart(2, "0")}</span>
        </div>
        <span className="text-sm text-zinc-600 uppercase tracking-widest text-right leading-relaxed">{question.normativa}</span>
      </div>
      <div className="space-y-2">
        <p className="text-xl font-semibold text-white leading-snug">{question.text}</p>
        <p className="text-base text-zinc-500 leading-relaxed">{question.sublabel}</p>
      </div>
      <div className="space-y-3">
        <input type="range" min={0} max={100} step={25} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full h-2 appearance-none bg-zinc-800 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
          style={{ background: `linear-gradient(to right, #ffffff ${value}%, #27272a ${value}%)` }} />
        <div className="flex justify-between text-xs text-zinc-700 px-0.5 select-none">
          {["0%", "25%", "50%", "75%", "100%"].map(l => <span key={l}>{l}</span>)}
        </div>
        <div className="border border-zinc-800 bg-zinc-950 px-4 py-3 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: band.color }} />
          <p className="text-base text-zinc-300 leading-snug">{question.labels[labelIndex]}</p>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-600">Rischio su questo punto</span>
          <span className="font-mono font-bold" style={{ color: band.color }}>{risk}% — {band.label}</span>
        </div>
      </div>
    </div>
  );
}

// Mini radar per result
function MiniRadar({ sectionRisks }: { sectionRisks: number[] }) {
  const cx = 180, cy = 180, r = 120, n = 6;
  const labels = SECTIONS.map(s => s.label_it.split(" ").slice(0, 2).join(" "));
  function point(i: number, val: number) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return { x: cx + (val / 100) * r * Math.cos(angle), y: cy + (val / 100) * r * Math.sin(angle) };
  }
  const poly = sectionRisks.map((v, i) => { const p = point(i, v); return `${p.x},${p.y}`; }).join(" ");
  return (
    <svg viewBox="0 0 360 360" className="w-full max-w-sm mx-auto">
      {[25, 50, 75, 100].map(l => (
        <polygon key={l} points={Array.from({ length: n }, (_, i) => { const p = point(i, l); return `${p.x},${p.y}`; }).join(" ")} fill="none" stroke="#27272a" strokeWidth="1" />
      ))}
      {Array.from({ length: n }, (_, i) => { const p = point(i, 100); return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#3f3f46" strokeWidth="1" />; })}
      <polygon points={poly} fill="#DC262618" stroke="#DC2626" strokeWidth="1.5" strokeLinejoin="round" />
      {sectionRisks.map((v, i) => { const p = point(i, v); const b = getBand(v); return <circle key={i} cx={p.x} cy={p.y} r="5" fill={b.color} stroke="#080c14" strokeWidth="1.5" />; })}
      {labels.map((label, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        const dist = r + 30;
        const x = cx + dist * Math.cos(angle);
        const y = cy + dist * Math.sin(angle);
        const dx = Math.cos(angle);
        const anchor = dx > 0.3 ? "start" : dx < -0.3 ? "end" : "middle";
        return <text key={i} x={x} y={y} textAnchor={anchor} fontSize="9" fontFamily="monospace" fill="#71717a">{label}</text>;
      })}
    </svg>
  );
}

// ─── MAIN
export default function TriageAutenticatoPage() {
  const router = useRouter();
  const supabase = createClient();
  const { entityVersion } = useActiveEntity();

  const [userId, setUserId] = useState<string | null>(null);
  const [entity, setEntity] = useState<Entity | null>(null);
  const [previousSession, setPreviousSession] = useState<PreviousSession | null>(null);
  const [mode, setMode] = useState<TriageMode>("nuovo");
  const [step, setStep] = useState<Step>("scelta");
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [finalNote, setFinalNote] = useState("");
  const [currentSection, setCurrentSection] = useState(0);
  const [currentQ, setCurrentQ] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [prefillActive, setPrefillActive] = useState(false);
  const [hasPrefill, setHasPrefill] = useState(false);
  const [companyRiskData, setCompanyRiskData] = useState<CompanyRiskData | null>(null);
  const [profilo, setProfilo] = useState({
    gestione_it:  "",
    modello_231:  "",
    n_ospiti:     "",
    n_dipendenti: "",
  });

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    setUserId(user.id);

    const storedEntityId = localStorage.getItem("clavis_active_entity_id");

    // Ultima sessione (filtrata per entity attiva se disponibile)
    const sessionsQuery = storedEntityId
      ? supabase.from("triage_sessions")
          .select("entity_id, risk_score, completed_at, answers, flags_triggered, id")
          .eq("user_id", user.id).eq("entity_id", storedEntityId)
          .order("completed_at", { ascending: false }).limit(1)
      : supabase.from("triage_sessions")
          .select("entity_id, risk_score, completed_at, answers, flags_triggered, id")
          .eq("user_id", user.id)
          .order("completed_at", { ascending: false }).limit(1);

    const { data: sessions } = await sessionsQuery;

    if (sessions?.[0]) {
      if (!storedEntityId) localStorage.setItem("clavis_active_entity_id", sessions[0].entity_id);
      setPreviousSession(sessions[0] as PreviousSession);
      const { data: ent } = await supabase.from("entities").select("*").eq("id", sessions[0].entity_id).single();
      if (ent) {
        setEntity(ent as Entity);
        const profiloCompleto = !!(ent.gestione_it && ent.modello_231 && ent.n_ospiti && ent.n_dipendenti);
        if (!profiloCompleto) {
          setStep("profilo");
        } else {
          setStep("scelta"); // ha sessione precedente → mostra scelta nuovo/aggiorna
        }
        // Carica dati di rischio della società collegata (per calibrare le sanzioni)
        if (ent.company_id) {
          const { data: compData } = await supabase
            .from("companies")
            .select("fatturato_fascia, n_dipendenti_fascia, storico_violazioni")
            .eq("id", ent.company_id)
            .maybeSingle();
          if (compData) setCompanyRiskData(compData as CompanyRiskData);
        }
      }
    } else {
      // Nessuna sessione precedente — primo triage. Carica entity direttamente.
      const firstEntityQuery = storedEntityId
        ? supabase.from("entities").select("*").eq("id", storedEntityId).limit(1)
        : supabase.from("entities").select("*").eq("created_by", user.id).limit(1);
      const { data: entRows } = await firstEntityQuery;
      const ent = entRows?.[0] ?? null;
      if (ent) {
        setEntity(ent as Entity);
        if (!storedEntityId) localStorage.setItem("clavis_active_entity_id", ent.id);
        const profiloCompleto = !!(ent.gestione_it && ent.modello_231 && ent.n_ospiti && ent.n_dipendenti);
        if (!profiloCompleto) {
          setStep("profilo");
        } else {
          // Primo triage: nessuna sessione precedente → vai direttamente al triage
          setMode("nuovo");
          setStep("triage");
          setCurrentSection(0);
          setCurrentQ(0);
        }
        if (ent.company_id) {
          const { data: compData } = await supabase
            .from("companies")
            .select("fatturato_fascia, n_dipendenti_fascia, storico_violazioni")
            .eq("id", ent.company_id)
            .maybeSingle();
          if (compData) setCompanyRiskData(compData as CompanyRiskData);
        }
      }
    }
    setLoading(false);
  }, [supabase, router]);

  useEffect(() => { loadData(); }, [loadData, entityVersion]);

  // Rileva prefill da sessionStorage (per mostrare la terza card in "scelta")
  useEffect(() => {
    const raw = sessionStorage.getItem("clavis_triage_prefill");
    setHasPrefill(!!raw);
  }, []);

  // Pre-popola il form profilo con i valori già presenti su entity (per campi parzialmente compilati)
  useEffect(() => {
    if (entity) {
      setProfilo({
        gestione_it:  entity.gestione_it  ?? "",
        modello_231:  entity.modello_231  ?? "",
        n_ospiti:     entity.n_ospiti     ?? "",
        n_dipendenti: entity.n_dipendenti ?? "",
      });
    }
  }, [entity]);

  // Precompila risposte dal triage precedente se modalità aggiorna
  useEffect(() => {
    if (mode === "aggiorna" && previousSession) {
      const precompiled: Record<string, number[]> = {};
      Object.entries(previousSession.answers).forEach(([sid, data]) => {
        if (data.values) precompiled[sid] = data.values;
      });
      setAnswers(prev => ({ ...prev, ...precompiled }));
    } else if (mode === "nuovo") {
      setAnswers({});
    }
  }, [mode, previousSession]);

  const section = SECTIONS[currentSection];
  const getSectionAnswers = (sid: string, qCount: number) => answers[sid] ?? new Array(qCount).fill(50);

  function setAnswer(sid: string, qIdx: number, val: number, qCount: number) {
    const current = getSectionAnswers(sid, qCount);
    const updated = [...current];
    updated[qIdx] = val;
    setAnswers(prev => ({ ...prev, [sid]: updated }));
  }

  const totalScore = calcTotalScore(answers);
  const totalBand = getBand(totalScore);
  const sectionRisks = SECTIONS.map(s => {
    const ans = getSectionAnswers(s.id, s.questions.length);
    return getSectionRisk(calcSectionScore(ans, s.questions));
  });

  // Delta vs sessione precedente
  const delta = previousSession ? previousSession.risk_score - totalScore : null;

  // ─── Stima sanzionatoria calibrata sui dati reali (pura, nessun fetch)
  const sanzioneCalibrata = React.useMemo(() => {
    if (!entity || !companyRiskData) return null;
    const risksMap: Record<string, number> = {};
    SECTIONS.forEach(s => {
      const ans = answers[s.id] ?? new Array(s.questions.length).fill(50);
      risksMap[s.id] = getSectionRisk(calcSectionScore(ans, s.questions));
    });
    return calcSanzioneCalibrata({
      fatturato_fascia:    companyRiskData.fatturato_fascia    ?? "sotto_1M",
      n_dipendenti_fascia: companyRiskData.n_dipendenti_fascia ?? "sotto_20",
      convenzione_ssn:     entity.convenzione_ssn  ?? false,
      tipo_convenzione:    entity.tipo_convenzione ?? "privato",
      storico_violazioni:  companyRiskData.storico_violazioni  ?? false,
      entity_type:         entity.entity_type,
      sectionRisks:        risksMap,
    });
  }, [entity, companyRiskData, answers]);

  const isLastSection = currentSection === SECTIONS.length - 1;
  const isLastQuestion = currentQ === section.questions.length - 1;

  async function handleAutoCompila() {
    const raw = sessionStorage.getItem("clavis_triage_prefill");
    if (!raw) return;

    try {
      const hints = JSON.parse(raw);

      // Inizializza tutte le sezioni con valore neutro 50
      const autoAnswers: Record<string, number[]> = {};
      SECTIONS.forEach(s => {
        autoAnswers[s.id] = new Array(s.questions.length).fill(50);
      });

      // Applica hints → answers
      if (hints.ha_backup !== undefined)
        autoAnswers["S1"][3] = hints.ha_backup ? 75 : 25;

      if (hints.ha_procedure_data_breach !== undefined) {
        autoAnswers["S4"][0] = hints.ha_procedure_data_breach ? 75 : 25;
        if (autoAnswers["S4"].length > 1)
          autoAnswers["S4"][1] = hints.ha_procedure_data_breach ? 75 : 25;
      }

      if (hints.ha_formazione_personale !== undefined) {
        autoAnswers["S5"][0] = hints.ha_formazione_personale ? 75 : 25;
        if (autoAnswers["S2"].length > 2)
          autoAnswers["S2"][2] = hints.ha_formazione_personale ? 75 : 25;
      }

      if (hints.ha_accesso_elettronico && hints.ha_credenziali_accesso) {
        if (autoAnswers["S3"].length > 3)
          autoAnswers["S3"][3] = 75;
      } else if (hints.ha_accesso_elettronico === false) {
        if (autoAnswers["S3"].length > 3)
          autoAnswers["S3"][3] = 25;
      }

      if (hints.dati_extra_ue === true)
        autoAnswers["S1"][2] = 25;

      if (hints.ha_cifratura !== undefined)
        if (autoAnswers["S3"].length > 1)
          autoAnswers["S3"][1] = hints.ha_cifratura ? 75 : 25;

      if (hints.ha_logging !== undefined)
        if (autoAnswers["S3"].length > 3)
          autoAnswers["S3"][3] = hints.ha_logging ? 75 : 25;

      setPrefillActive(true);
      setHasPrefill(false);
      sessionStorage.removeItem("clavis_triage_prefill");

      // Salva direttamente e vai al risultato — nessun passaggio per il wizard
      await handleSaveSession(autoAnswers);
    } catch { /* ignora JSON malformato */ }
  }

  async function handleSaveSession(customAnswers?: Record<string, number[]>) {
    console.log("handleSaveSession called", { step, finalNote, userId, entity: entity?.id ?? null });
    if (!userId || !entity) return;
    setSaving(true);

    // Usa customAnswers se fornito (modalità auto), altrimenti lo stato corrente
    const effectiveAnswers = customAnswers ?? answers;

    // Calcola scores dagli answers effettivi
    const effectiveSectionRisks = SECTIONS.map(s => {
      const ans = effectiveAnswers[s.id] ?? new Array(s.questions.length).fill(50);
      return getSectionRisk(calcSectionScore(ans, s.questions));
    });
    const effectiveTotalScore = calcTotalScore(effectiveAnswers);
    const effectiveDelta = previousSession
      ? previousSession.risk_score - effectiveTotalScore
      : null;

    const answersPayload = SECTIONS.reduce((acc, s) => {
      const idx = SECTIONS.indexOf(s);
      acc[s.id] = {
        label: s.label_it,
        values: effectiveAnswers[s.id] ?? new Array(s.questions.length).fill(50),
        section_risk: effectiveSectionRisks[idx],
      };
      return acc;
    }, {} as Record<string, unknown>);

    const flagsTriggered = SECTIONS.map((s, i) => ({
      section: s.id,
      label: s.label_it,
      risk: effectiveSectionRisks[i],
    })).filter(f => f.risk >= 50);

    // Salva triage_session
    const { data: sessionData, error: sessionErr } = await supabase
      .from("triage_sessions")
      .insert({
        entity_id: entity.id,
        user_id: userId,
        anonymous_session_id: null,
        answers: answersPayload,
        flags_triggered: flagsTriggered,
        risk_score: effectiveTotalScore,
        previous_session_id: previousSession?.id ?? null,
        score_delta: effectiveDelta,
        status: "generated",
        completed_at: new Date().toISOString(),
        context_note: finalNote || null,
      })
      .select("id")
      .single();

    if (sessionErr || !sessionData) { setSaving(false); return; }
    setSavedSessionId(sessionData.id);

    // Genera piano remediation dal legal_dictionary — solo flag realmente triggerati
    const triggeredFlags = buildRemediationFromFlags(effectiveAnswers, SECTIONS);
    const dedupedItems = triggeredFlags.map(f => ({
      session_id:     sessionData.id,
      entity_id:      entity.id,
      control_code:   f.flag_key,
      flag_key:       f.flag_key,
      planned_action: f.action,
      responsible:    f.responsible,
      due_date:       null,
      deadline_label: f.deadline,
      status:         "open",
      priority:       f.priority,
      severity:       f.severity,
    }));

    if (dedupedItems.length > 0) {
      await supabase
        .from("remediation_plans")
        .upsert(dedupedItems, { onConflict: "entity_id,flag_key" });
    }

    // Se chiamata con customAnswers, sincronizza lo stato
    // così la result page legge i valori corretti
    if (customAnswers) setAnswers(customAnswers);

    setSaving(false);
    setStep("result");
  }

  // ─── LOADING
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#080c14" }}>
      <p className="text-zinc-600 text-base tracking-widest uppercase">Caricamento...</p>
    </div>
  );

  // ─── SFONDO
  const bgStyle = {
    backgroundColor: "#080c14",
    backgroundImage: "radial-gradient(circle, rgba(148,163,184,0.06) 1px, transparent 1px)",
    backgroundSize: "28px 28px",
  };

  // ─── STEP: PROFILO (mostrato solo se gestione_it/modello_231/n_ospiti/n_dipendenti mancanti)
  if (step === "profilo") {
    const SELECT_CLS = "w-full bg-zinc-950 border border-zinc-800 px-4 py-3 text-white focus:border-zinc-500 outline-none text-base appearance-none";
    const profiloCompleto = !!(profilo.gestione_it && profilo.modello_231 && profilo.n_ospiti && profilo.n_dipendenti);

    const handleSaveProfilo = async () => {
      if (!entity) return;
      setSaving(true);
      await supabase
        .from("entities")
        .update({
          gestione_it:  profilo.gestione_it,
          modello_231:  profilo.modello_231,
          n_ospiti:     profilo.n_ospiti,
          n_dipendenti: profilo.n_dipendenti,
        })
        .eq("id", entity.id);
      setSaving(false);
      if (!previousSession) {
        // Primo triage: nessuna sessione precedente → triage diretto
        setMode("nuovo");
        setStep("triage");
        setCurrentSection(0);
        setCurrentQ(0);
      } else {
        setStep("scelta");
      }
    };

    return (
      <div className="min-h-screen text-white flex flex-col items-center justify-center px-4 py-10" style={bgStyle}>
        <div className="max-w-2xl w-full mx-auto space-y-8">

          {/* Header */}
          <div className="space-y-2">
            <p className="text-sm text-zinc-500 tracking-[0.25em] uppercase">CLAVIS — Triage Pro</p>
            <ClavisTitle it="Profilo della Struttura" en="Facility Profile — Step Obbligatorio" size="xl" />
            <p className="text-base text-zinc-500 leading-relaxed pt-1">
              Prima di avviare il triage, completa il profilo operativo di{" "}
              <span className="text-white font-medium">{entity?.name}</span>
              {entity && <span className="text-zinc-600"> ({entity.entity_type}, {entity.region})</span>}.
              Questi dati calibrano i pesi normativi del calcolo.
            </p>
          </div>

          {/* 4 campi mancanti */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-zinc-500 uppercase tracking-widest mb-1">
                Numero ospiti / pazienti in carico *
              </label>
              <select
                value={profilo.n_ospiti}
                onChange={e => setProfilo(p => ({ ...p, n_ospiti: e.target.value }))}
                className={SELECT_CLS}
              >
                <option value="">— Seleziona —</option>
                {["Meno di 30", "30–80", "81–150", "Oltre 150"].map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-zinc-500 uppercase tracking-widest mb-1">
                Numero dipendenti (incl. part-time) *
              </label>
              <select
                value={profilo.n_dipendenti}
                onChange={e => setProfilo(p => ({ ...p, n_dipendenti: e.target.value }))}
                className={SELECT_CLS}
              >
                <option value="">— Seleziona —</option>
                {["Meno di 20", "20–49", "50–249", "250 o più"].map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-zinc-500 uppercase tracking-widest mb-1">
                Gestione infrastruttura IT *
              </label>
              <select
                value={profilo.gestione_it}
                onChange={e => setProfilo(p => ({ ...p, gestione_it: e.target.value }))}
                className={SELECT_CLS}
              >
                <option value="">— Seleziona —</option>
                {["Completamente interna", "Completamente esternalizzata", "Mista (interna + fornitori)", "Non strutturata / non so"].map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-zinc-500 uppercase tracking-widest mb-1">
                Modello Organizzativo 231 *
              </label>
              <select
                value={profilo.modello_231}
                onChange={e => setProfilo(p => ({ ...p, modello_231: e.target.value }))}
                className={SELECT_CLS}
              >
                <option value="">— Seleziona —</option>
                {["Sì, adottato e aggiornato", "Sì, ma non aggiornato (>3 anni)", "In corso di adozione", "No"].map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Navigazione */}
          <div className="flex gap-3">
            <button
              onClick={() => router.push("/dashboard")}
              className="border border-zinc-800 px-4 py-3 text-zinc-500 hover:text-white text-base transition-colors"
            >
              ← Dashboard
            </button>
            <button
              disabled={!profiloCompleto || saving}
              onClick={handleSaveProfilo}
              className="flex-grow border py-3 font-bold tracking-widest uppercase text-base transition-colors disabled:border-zinc-800 disabled:text-zinc-700 disabled:cursor-not-allowed border-white hover:bg-white hover:text-black"
            >
              {saving ? "Salvataggio..." : "Salva e continua →"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── STEP: SCELTA
  if (step === "scelta") return (
    <div className="min-h-screen text-white flex flex-col items-center justify-center px-4 py-16" style={bgStyle}>
      <div className="max-w-3xl w-full mx-auto space-y-10">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm text-zinc-500 tracking-[0.25em] uppercase">CLAVIS — Triage Pro</p>
            <ClavisTitle it="Analisi del Rischio Normativo" en="Regulatory Risk Assessment — Pro" size="xl" />
          </div>
          <button onClick={() => router.push("/dashboard")}
            className="text-zinc-600 hover:text-zinc-400 text-base transition-colors flex-shrink-0">
            ← Dashboard
          </button>
        </div>

        {/* Struttura attiva */}
        {entity && (
          <div className="border border-zinc-700 p-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-zinc-500 uppercase tracking-widest mb-1">Struttura selezionata</p>
              <p className="text-white font-bold text-xl">{entity.name}</p>
              <p className="text-zinc-400 text-base">{entity.entity_type} — {entity.region}</p>
            </div>
            {previousSession && (
              <div className="text-right flex-shrink-0">
                <p className="text-sm text-zinc-500 mb-1">Ultimo triage</p>
                <p className="text-3xl font-mono font-black" style={{ color: getBand(previousSession.risk_score).color }}>
                  {previousSession.risk_score}
                </p>
                <p className="text-xs text-zinc-600 mt-0.5">
                  {new Date(previousSession.completed_at).toLocaleDateString("it-IT")}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Scelta modalità */}
        <div className="space-y-4">
          <p className="text-base text-zinc-400">Come vuoi procedere?</p>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => { setMode("nuovo"); setStep("triage"); setCurrentSection(0); setCurrentQ(0); }}
              className="border-2 border-white p-6 text-left space-y-3 hover:bg-white hover:text-black transition-colors group">
              <p className="text-2xl">🆕</p>
              <p className="font-bold text-xl group-hover:text-black">Nuovo Triage</p>
              <p className="text-base text-zinc-400 group-hover:text-zinc-700 leading-snug">
                Compila tutte le domande da zero. Ideale per una nuova struttura o dopo interventi significativi.
              </p>
            </button>

            {previousSession ? (
              <button
                onClick={() => { setMode("aggiorna"); setStep("triage"); setCurrentSection(0); setCurrentQ(0); }}
                className="border border-zinc-600 p-6 text-left space-y-3 hover:border-zinc-400 transition-colors">
                <p className="text-2xl">🔄</p>
                <p className="font-bold text-xl text-zinc-200">Aggiorna Triage</p>
                <p className="text-base text-zinc-500 leading-snug">
                  Parti dalle risposte precedenti e modifica solo ciò che è cambiato.
                  Verrà calcolato il delta rispetto al triage del{" "}
                  {new Date(previousSession.completed_at).toLocaleDateString("it-IT")}.
                </p>
              </button>
            ) : (
              <div className="border border-zinc-800 p-6 text-left space-y-3 opacity-40 cursor-not-allowed">
                <p className="text-2xl">🔄</p>
                <p className="font-bold text-xl text-zinc-500">Aggiorna Triage</p>
                <p className="text-base text-zinc-600">Nessun triage precedente disponibile.</p>
              </div>
            )}
          </div>

          {/* Terza opzione: compilazione automatica da Registro Trattamenti */}
          {hasPrefill && (
            <div
              style={{
                border: "2px solid var(--shield-soft, #3a6df0)",
                borderRadius: "12px",
                padding: "24px",
                cursor: "pointer",
                background: "rgba(58,109,240,0.08)",
                marginTop: "16px",
              }}
              onClick={() => handleAutoCompila()}
            >
              <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--shield-soft, #3a6df0)", marginBottom: "8px", letterSpacing: ".1em" }}>
                ✨ COMPILAZIONE AUTOMATICA
              </div>
              <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--bone, #EEF1F8)", marginBottom: "8px" }}>
                Compila dal Registro Trattamenti
              </div>
              <div style={{ fontSize: "13px", color: "var(--bone-dim, #9AA3BD)", lineHeight: "1.5" }}>
                CLAVIS ha già analizzato il tuo registro.
                Le risposte vengono compilate automaticamente
                dai dati estratti. Rivedi e conferma.
              </div>
            </div>
          )}
        </div>

        {/* Badge Pro */}
        <div className="border border-zinc-800 px-5 py-3 flex items-center gap-4">
          <span className="text-zinc-400 text-base">✦</span>
          <p className="text-sm text-zinc-500 leading-relaxed">
            <span className="text-zinc-300 font-semibold">Triage Pro</span> — include domande aperte per ogni sezione,
            delta score vs triage precedente, e generazione automatica del piano di remediation in dashboard.
          </p>
        </div>
      </div>
    </div>
  );

  // ─── STEP: TRIAGE
  if (step === "triage") {
    const q = section.questions[currentQ];
    const sectionAnswers = getSectionAnswers(section.id, section.questions.length);
    const currentVal = sectionAnswers[currentQ] ?? 50;
    const allSectionAnswered = sectionAnswers.every(v => v !== undefined);
    const globalQuestionNum = SECTIONS.slice(0, currentSection).reduce((acc, s) => acc + s.questions.length, 0) + currentQ + 1;
    const globalTotal = SECTIONS.reduce((acc, s) => acc + s.questions.length, 0);

    return (
      <div className="min-h-screen text-white flex flex-col items-center justify-center px-4 py-10" style={bgStyle}>
        <div className="max-w-3xl w-full mx-auto space-y-6">

          {/* Banner prefill da Registro Trattamenti */}
          {prefillActive && (
            <div style={{
              background: "rgba(58,109,240,0.1)",
              border: "1px solid rgba(58,109,240,0.4)",
              borderRadius: "8px",
              padding: "10px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "13px",
              color: "#EEF1F8",
            }}>
              <span>
                ✨ Risposte pre-compilate dal Registro Trattamenti. Verifica ogni sezione e aggiusta dove necessario.
              </span>
              <button onClick={() => setPrefillActive(false)}
                style={{ background:"none", border:"none", color:"#9AA3BD", cursor:"pointer", fontSize:"16px", flexShrink:0, marginLeft:"12px" }}>
                ✕
              </button>
            </div>
          )}

          {/* Header sezione */}
          <div className="space-y-3">
            <SectionProgressBar sections={SECTIONS} currentIdx={currentSection} answers={answers} />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-zinc-600 uppercase tracking-widest">{section.framework}</p>
                <ClavisTitle it={section.label_it} en={section.label_en} size="lg" />
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm text-zinc-600 uppercase tracking-widest">Domanda</p>
                <p className="font-mono text-white">
                  <span className="text-2xl font-black">{globalQuestionNum}</span>
                  <span className="text-zinc-600 text-base"> / {globalTotal}</span>
                </p>
              </div>
            </div>
            {mode === "aggiorna" && (
              <div className="flex items-center gap-2 text-sm text-zinc-600 border border-zinc-800 px-3 py-1.5 w-fit">
                <span>🔄</span>
                <span>Modalità aggiornamento — risposte precompilate dal triage precedente</span>
              </div>
            )}
          </div>

          {/* Domanda slider */}
          <div className="border border-zinc-800 p-6">
            <SliderQuestion
              question={q}
              value={currentVal}
              onChange={v => setAnswer(section.id, currentQ, v, section.questions.length)}
              index={currentQ}
              total={section.questions.length}
            />
          </div>

          {/* Navigazione */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                if (currentQ > 0) { setCurrentQ(q => q - 1); return; }
                if (currentSection > 0) { setCurrentSection(s => s - 1); setCurrentQ(SECTIONS[currentSection - 1].questions.length - 1); return; }
                setStep("scelta");
              }}
              className="border border-zinc-800 px-4 py-3 text-zinc-500 hover:text-white text-base transition-colors">
              ← Prec.
            </button>

            {!isLastQuestion && (
              <button onClick={() => setCurrentQ(q => q + 1)}
                className="flex-grow border border-zinc-700 py-3 text-zinc-300 hover:text-white hover:border-zinc-500 text-base transition-colors">
                Domanda successiva →
              </button>
            )}

            {isLastQuestion && !isLastSection && (
              <button onClick={() => { setCurrentSection(s => s + 1); setCurrentQ(0); }}
                className="flex-grow border border-white py-3 font-bold tracking-widest uppercase text-base hover:bg-white hover:text-black transition-colors">
                Sezione successiva →
              </button>
            )}

            {isLastQuestion && isLastSection && (
              <button onClick={() => setStep("finalNote")}
                className="flex-grow border border-blue-900 py-3 text-blue-400 hover:bg-blue-950/30 text-base transition-colors font-semibold">
                ✦ Contesto e Report →
              </button>
            )}
          </div>

          {/* Mini avanzamento sezioni */}
          <div className="border border-zinc-900 p-4">
            <p className="text-sm text-zinc-600 uppercase tracking-widest mb-3">Avanzamento</p>
            <div className="grid grid-cols-6 gap-2">
              {SECTIONS.map((s, i) => {
                const ans = getSectionAnswers(s.id, s.questions.length);
                const risk = getSectionRisk(calcSectionScore(ans, s.questions));
                const band = getBand(risk);
                const active = i === currentSection;
                return (
                  <button key={s.id}
                    onClick={() => { setCurrentSection(i); setCurrentQ(0); }}
                    className={`p-2 border text-center transition-colors ${active ? "border-white" : "border-zinc-800 hover:border-zinc-600"}`}>
                    <p className="text-xs text-zinc-600 font-mono">{s.id}</p>
                    <p className="text-sm font-mono font-bold mt-1" style={{ color: band.color }}>
                      {answers[s.id] ? `${risk}%` : "—"}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── STEP: FINAL NOTE
  if (step === "finalNote") return (
    <div className="min-h-screen text-white flex flex-col items-center justify-center px-4 py-10" style={bgStyle}>
      <div className="max-w-3xl w-full mx-auto space-y-6">

        {/* Header */}
        <div className="space-y-3">
          <SectionProgressBar sections={SECTIONS} currentIdx={SECTIONS.length} answers={answers} />
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-zinc-600 uppercase tracking-widest">Ultima fase</p>
              <ClavisTitle it="Contesto Operativo" en="Operational Context — Pro" size="lg" />
            </div>
          </div>
        </div>

        {/* Nota Pro unica */}
        <div className="border border-zinc-700 p-6 space-y-4"
          style={{ borderLeftColor: "#3b82f6", borderLeftWidth: "3px" }}>
          <div className="flex items-center gap-2">
            <span className="text-blue-400 text-sm font-mono font-bold uppercase tracking-widest">✦ Nota Pro</span>
          </div>
          <p className="text-xl font-semibold text-white leading-snug">
            Hai osservazioni, criticità specifiche o contesto operativo da aggiungere al report?
          </p>
          <p className="text-base text-zinc-500 leading-relaxed">
            Questa nota accompagna il briefing e aiuta a contestualizzare il piano di remediation per il tuo team.
          </p>
          <textarea
            value={finalNote}
            onChange={e => setFinalNote(e.target.value)}
            placeholder="Es: il fornitore del gestionale è in fase di aggiornamento NIS2. Il DPO esterno ha già avviato la DPIA per i sistemi AI. La registrazione ACN è in corso dal mese scorso..."
            rows={6}
            className="w-full bg-zinc-950 border border-zinc-800 px-4 py-3 text-white placeholder-zinc-700 focus:border-zinc-600 outline-none text-base resize-none leading-relaxed"
          />
          <p className="text-sm text-zinc-600">Campo facoltativo — non influisce sul calcolo del rischio.</p>
        </div>

        {/* Navigazione */}
        <div className="flex gap-3">
          <button
            onClick={() => { setCurrentSection(SECTIONS.length - 1); setCurrentQ(SECTIONS[SECTIONS.length - 1].questions.length - 1); setStep("triage"); }}
            className="border border-zinc-800 px-4 py-3 text-zinc-500 hover:text-white text-base transition-colors">
            ← Prec.
          </button>
          <button onClick={() => handleSaveSession()} disabled={saving}
            className="flex-grow border border-white py-3 font-bold tracking-widest uppercase text-base hover:bg-white hover:text-black transition-colors disabled:opacity-50">
            {saving ? "Elaborazione..." : "Genera Report Operativo →"}
          </button>
        </div>
      </div>
    </div>
  );

  // ─── STEP: RESULT OPERATIVO

  return (
    <div className="min-h-screen text-white" style={bgStyle}>
      <div className="max-w-5xl mx-auto px-6 py-12 space-y-10">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-zinc-500 tracking-[0.25em] uppercase mb-1">
              CLAVIS — Report Operativo Pro — {entity?.name} — {new Date().toLocaleDateString("it-IT")}
            </p>
            <ClavisTitle it="Briefing di Compliance Normativa" en="Regulatory Compliance Briefing" size="xl" />
          </div>
          <button onClick={() => router.push("/dashboard")}
            className="border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors flex-shrink-0">
            → Dashboard
          </button>
        </div>

        {/* Score + Delta + Radar */}
        <div className="grid grid-cols-5 gap-4">
          {/* Score */}
          <div className="col-span-2 border-2 p-6 flex flex-col justify-between"
            style={{ borderColor: totalBand.border, backgroundColor: totalBand.bg }}>
            <div>
              <p className="text-sm text-zinc-500 font-mono uppercase tracking-widest">Score di Rischio Composito</p>
              <p className="text-9xl font-mono font-black leading-none mt-2" style={{ color: totalBand.color }}>
                {totalScore}
              </p>
              <p className="text-sm text-zinc-500 font-mono mt-1">/100 punti di rischio</p>
              <p className="text-2xl font-bold tracking-widest uppercase mt-3" style={{ color: totalBand.color }}>
                {totalBand.label}
              </p>
            </div>
            {/* Delta */}
            {delta !== null && (
              <div className={`mt-4 border px-4 py-3 ${delta > 0 ? "border-green-900 bg-green-950/20" : delta < 0 ? "border-red-900 bg-red-950/20" : "border-zinc-800"}`}>
                <p className="text-sm text-zinc-500 uppercase tracking-widest">Variazione vs triage precedente</p>
                <p className={`text-3xl font-mono font-black mt-1 ${delta > 0 ? "text-green-400" : delta < 0 ? "text-red-400" : "text-zinc-500"}`}>
                  {delta > 0 ? `↓ -${delta}` : delta < 0 ? `↑ +${Math.abs(delta)}` : "= 0"}
                  <span className="text-base font-normal ml-1">punti</span>
                </p>
                <p className={`text-sm mt-1 ${delta > 0 ? "text-green-600" : delta < 0 ? "text-red-600" : "text-zinc-600"}`}>
                  {delta > 0 ? "Rischio ridotto — ottimo lavoro." : delta < 0 ? "Rischio aumentato — intervento necessario." : "Nessuna variazione."}
                </p>
              </div>
            )}
          </div>

          {/* Radar */}
          <div className="col-span-3 border border-zinc-800 p-5">
            <p className="text-sm text-zinc-500 uppercase tracking-widest mb-2">Mappa del Rischio per Area</p>
            <MiniRadar sectionRisks={sectionRisks} />
          </div>
        </div>

        {/* Analisi per sezione — 3 colonne */}
        <div className="space-y-3">
          <ClavisTitle it="Analisi Dettagliata per Area" en="Detailed Section Analysis" size="lg" />
          <div className="grid grid-cols-3 gap-3">
            {SECTIONS.map((s, i) => {
              const risk = sectionRisks[i];
              const band = getBand(risk);
              return (
                <div key={s.id} className="border border-zinc-800 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-base font-semibold text-white leading-snug">{s.label_it}</p>
                      <p className="text-xs text-zinc-600">peso {s.weight_pct}%</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-2xl font-mono font-black" style={{ color: band.color }}>{risk}%</p>
                      <p className="text-xs font-bold uppercase" style={{ color: band.color }}>{band.label.replace("RISCHIO ", "")}</p>
                    </div>
                  </div>
                  <div className="w-full h-1 bg-zinc-900 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${risk}%`, backgroundColor: band.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {(() => {
          const remItems = buildRemediationFromFlags(answers, SECTIONS);
          const critical = remItems.filter(r => r.priority === "CRITICA");
          const high     = remItems.filter(r => r.priority === "ALTA");
          const medium   = remItems.filter(r => r.priority === "MEDIA");

          const priorityStyle = (p: string) => {
            if (p === "CRITICA") return { border: "border-red-900/40 bg-red-950/10", badge: "border-red-900 text-red-400" };
            if (p === "ALTA")    return { border: "border-orange-900/30 bg-orange-950/10", badge: "border-orange-900 text-orange-400" };
            return                       { border: "border-zinc-800", badge: "border-zinc-700 text-zinc-500" };
          };

          const RemCard = ({ r }: { r: typeof remItems[0] }) => {
            const s = priorityStyle(r.priority);
            return (
              <div className={`border p-4 grid grid-cols-12 gap-3 items-start ${s.border}`}>
                <div className="col-span-8">
                  <p className="text-xs text-zinc-600 font-mono uppercase tracking-wider mb-1">{r.section} — {r.label}</p>
                  <p className="text-base text-white leading-snug">{r.action}</p>
                  <p className="text-sm text-zinc-500 mt-1">→ {r.responsible}</p>
                </div>
                <div className="col-span-2 text-center">
                  <p className="text-xs text-zinc-600 uppercase tracking-wider">Entro</p>
                  <p className="text-sm font-mono text-zinc-300 mt-1 leading-snug">{r.deadline}</p>
                </div>
                <div className="col-span-2 text-right">
                  <span className={`text-xs font-bold uppercase tracking-widest px-2 py-1 border ${s.badge}`}>
                    {r.priority}
                  </span>
                </div>
              </div>
            );
          };

          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <ClavisTitle it="Piano di Remediation Generato" en="Auto-Generated Remediation Plan" size="lg" />
                <span className="text-sm text-zinc-500 border border-zinc-800 px-3 py-1">
                  {remItems.length} azioni · Salvato in Dashboard →
                </span>
              </div>

              {remItems.length === 0 ? (
                <div className="border border-green-900 bg-green-950/10 p-6 text-center">
                  <p className="text-green-400 font-bold text-lg">Nessuna area critica rilevata.</p>
                  <p className="text-zinc-500 text-base mt-2">Mantieni il presidio attuale e monitora le scadenze normative.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {critical.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="text-red-400 text-sm font-bold uppercase tracking-widest">⚠ Azione Immediata — CRITICA</span>
                        <div className="flex-1 h-px bg-red-900/40" />
                      </div>
                      {critical.map(r => <RemCard key={r.flag_key} r={r} />)}
                    </div>
                  )}
                  {high.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="text-orange-400 text-sm font-bold uppercase tracking-widest">Priorità Alta</span>
                        <div className="flex-1 h-px bg-orange-900/40" />
                      </div>
                      {high.map(r => <RemCard key={r.flag_key} r={r} />)}
                    </div>
                  )}
                  {medium.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="text-zinc-500 text-sm font-bold uppercase tracking-widest">Priorità Media</span>
                        <div className="flex-1 h-px bg-zinc-800" />
                      </div>
                      {medium.map(r => <RemCard key={r.flag_key} r={r} />)}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Esposizione sanzionatoria */}
        <div className="space-y-4">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <ClavisTitle it="Esposizione Sanzionatoria" en="Regulatory Exposure" size="lg" />
            {sanzioneCalibrata && (
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-zinc-600 uppercase tracking-widest">Totale stima calibrata</p>
                <p className="font-mono font-black text-white text-xl leading-tight">
                  {fmtEuro(sanzioneCalibrata.totale_stima_min)} — {fmtEuro(sanzioneCalibrata.totale_stima_max)}
                </p>
                <p className="text-xs text-zinc-600 mt-0.5">scenario favorevole — scenario sfavorevole</p>
              </div>
            )}
          </div>

          <div className="border border-zinc-700 overflow-hidden">
            {/* Header tabella */}
            <div className="grid grid-cols-12 bg-zinc-900 border-b border-zinc-700 text-xs text-zinc-500 uppercase tracking-wider">
              <div className="col-span-3 px-4 py-3">Norma</div>
              <div className="col-span-4 px-4 py-3">
                {sanzioneCalibrata ? "Stima calibrata (min — max)" : "Sanzione massima edittale"}
              </div>
              <div className="col-span-3 px-4 py-3">Base giuridica</div>
              <div className="col-span-2 px-4 py-3 text-right">Scadenza</div>
            </div>

            {/* Righe */}
            {((): Array<{
              norma: string; sub: string; active: boolean;
              massimo: string; base: string; urgenza: string;
              calibMin?: number; calibMax?: number;
            }> => {
              const sc = sanzioneCalibrata;
              return [
                {
                  norma: "NIS2", sub: "D.Lgs. 138/2024",
                  active: sectionRisks[0] >= 50 || sectionRisks[3] >= 50 || (sc?.nis2.applicabile ?? false),
                  massimo: "fino a 10.000.000 € o 2% fatturato globale",
                  base: "Art. 32 D.Lgs. 138/2024", urgenza: "Ott. 2026",
                  calibMin: sc?.nis2.stima_min, calibMax: sc?.nis2.stima_max,
                },
                {
                  norma: "AI Act", sub: "Reg. UE 2024/1689",
                  active: sectionRisks[1] >= 25 || (sc?.aiact.applicabile ?? false),
                  massimo: "fino a 35.000.000 € o 7% fatturato globale",
                  base: "Art. 99 AI Act", urgenza: "Ago. 2026 ⚠",
                  calibMin: sc?.aiact.stima_min, calibMax: sc?.aiact.stima_max,
                },
                {
                  norma: "GDPR", sub: "Reg. UE 2016/679",
                  active: sectionRisks[2] >= 50 || sectionRisks[1] >= 50,
                  massimo: "fino a 20.000.000 € o 4% fatturato globale",
                  base: "Art. 83 GDPR", urgenza: "Immediata",
                  calibMin: sc?.gdpr.stima_min, calibMax: sc?.gdpr.stima_max,
                },
                {
                  norma: "D.Lgs. 231", sub: "L. 132/2025",
                  active: sectionRisks[2] >= 50 || sectionRisks[4] >= 50 || (sc?.d231.applicabile ?? false),
                  massimo: "fino a 1.549.370 € + penale individuale",
                  base: "Art. 24-bis D.Lgs. 231", urgenza: "Immediata",
                  calibMin: sc?.d231.stima_min, calibMax: sc?.d231.stima_max,
                },
              ];
            })().filter(r => r.active).map((r, i) => (
              <div key={r.norma}
                className={`grid grid-cols-12 border-b border-zinc-800 items-center ${i % 2 === 0 ? "" : "bg-zinc-950/40"}`}>
                <div className="col-span-3 px-4 py-4 border-r border-zinc-800"
                  style={{ borderLeftColor: "#DC2626", borderLeftWidth: "3px" }}>
                  <p className="font-bold text-white text-base">{r.norma}</p>
                  <p className="text-xs text-zinc-600">{r.sub}</p>
                </div>
                <div className="col-span-4 px-4 py-4 border-r border-zinc-800">
                  {(r.calibMin !== undefined && r.calibMax !== undefined && r.calibMax > 0) ? (
                    <>
                      <p className="font-mono font-black text-white text-base leading-tight">
                        {fmtEuro(r.calibMin)} — {fmtEuro(r.calibMax)}
                      </p>
                      <p className="text-xs text-zinc-600 mt-0.5 font-mono">max edittale: {r.massimo}</p>
                    </>
                  ) : (r.calibMax === 0 && r.calibMin !== undefined) ? (
                    <>
                      <p className="font-mono font-bold text-zinc-500 text-base">Non applicabile</p>
                      <p className="text-xs text-zinc-700 mt-0.5 font-mono">max edittale: {r.massimo}</p>
                    </>
                  ) : (
                    <p className="font-mono font-bold text-white text-base">{r.massimo}</p>
                  )}
                </div>
                <div className="col-span-3 px-4 py-4 border-r border-zinc-800">
                  <p className="text-sm text-zinc-500 font-mono">{r.base}</p>
                </div>
                <div className="col-span-2 px-4 py-4 text-right">
                  <p className={`text-sm font-bold ${r.urgenza.includes("Imm") ? "text-red-400" : "text-orange-400"}`}>
                    {r.urgenza}
                  </p>
                </div>
              </div>
            ))}

            {/* Riga Note metodologiche */}
            {sanzioneCalibrata && sanzioneCalibrata.note.length > 0 && (
              <div className="grid grid-cols-12 border-t border-zinc-800 bg-zinc-950/60">
                <div className="col-span-3 px-4 py-3 border-r border-zinc-800"
                  style={{ borderLeftColor: "#3A6DF0", borderLeftWidth: "3px" }}>
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Note metodologiche</p>
                </div>
                <div className="col-span-9 px-4 py-3">
                  <ul className="space-y-1">
                    {sanzioneCalibrata.note.map((n, idx) => (
                      <li key={idx} className="text-xs text-zinc-500 leading-snug flex gap-2">
                        <span className="text-zinc-700 flex-shrink-0">→</span>
                        <span>{n}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Avviso dati non disponibili */}
            {!sanzioneCalibrata && (
              <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-950/60">
                <p className="text-xs text-zinc-600 italic">
                  💡 Completa il <strong className="text-zinc-500">Profilo Rischio Societario</strong> in
                  {" "}<em>Adempimenti Struttura</em> per visualizzare la stima calibrata sul tuo fatturato e dimensione.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Nota metodologica */}
        <div className="border border-zinc-800 px-5 py-4 text-sm text-zinc-600 leading-relaxed space-y-2">
          <p className="font-mono text-zinc-500 font-semibold text-xs uppercase tracking-widest">Nota Metodologica e Valore Documentale</p>
          <p>
            Questa analisi applica i criteri normativi vigenti al 16/05/2026 alle informazioni fornite dalla struttura.
            Il report costituisce documentazione formale della proattività dell&apos;ente ai sensi dell&apos;
            <span className="text-zinc-400">art. 5 par. 2 GDPR</span> (accountability) e dell&apos;
            <span className="text-zinc-400">art. 6 D.Lgs. 231/2001</span> (Modello Organizzativo).
            La proattività documentata è fattore mitigante riconosciuto dalle autorità di vigilanza.
            Le sanzioni indicate sono i massimi edittali — l&apos;entità effettiva è determinata dall&apos;autorità competente.
          </p>
          <p className="text-zinc-800 font-mono text-xs">RISERVATO — USO INTERNO — NON DISTRIBUIRE</p>
        </div>

        {/* CTA dashboard */}
        <div className="flex gap-4">
          <button onClick={() => router.push("/dashboard")}
            className="flex-1 border border-white py-4 font-black tracking-widest uppercase text-base hover:bg-white hover:text-black transition-colors">
            → Vai alla Dashboard
          </button>
          <button onClick={() => window.print()}
            className="border border-zinc-700 px-6 py-4 text-zinc-400 hover:text-white text-base transition-colors">
            Stampa
          </button>
        </div>

      </div>
    </div>
  );
}
