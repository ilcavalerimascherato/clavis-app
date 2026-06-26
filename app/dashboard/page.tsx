"use client";

/**
 * CLAVIS — Dashboard v2.0
 * Palette: Institutional Shield (--ink dark / --bone light / --shield blue)
 * Semaforo: --warn / --gold / --emerald (dark palette)
 * Layout: sidebar collassabile | centro densitÃ  alta | destra alerts
 * Regola: tutto above the fold, nessuno scroll per trovare info critiche
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { calcScoreCompliance } from "@/app/documenti/page";
import { useActiveEntity } from "@/contexts/EntityContext";
import { GenerateDocModal } from "@/components/GenerateDocModal";
import { EmailBuilderModal } from "@/components/EmailBuilderModal";
import LEGAL_DICT from "@/config/legal_dictionary.json";
import { getShortcutConfig, getShortcutLabel, getShortcutType, getShortcutColor } from "@/lib/shortcutMap";
import { StepFlowModal } from "@/components/StepFlowModal";
import { ActionModal } from "@/components/ActionModal";
import AppShell from "@/components/layout/AppShell";
import { T, getBandTokens, getBarColor } from "@/lib/clavis-tokens";

// ─── TIPI
interface Profile { id: string; full_name: string; email: string; tier: string; }
interface EntityFullData {
  responsabile_it:  string | null;
  referente_breach: string | null;
  convenzione_ssn:  boolean;
  region:           string | null;
  website_url:      string | null;
}
interface CompanyDataFull {
  name:                  string;
  vat_number:            string | null;
  legal_address:         string | null;
  legale_rappresentante: string | null;
  pec:                   string | null;
  codice_fiscale:        string | null;
  modello_231:           string | null;
  n_dipendenti_fascia:   string | null;
  fatturato_fascia:      string | null;
}
interface TriageDashboard {
  session_id: string;
  entity_id: string;
  user_id: string;
  risk_score: number;
  score_delta: number | null;
  flags_triggered: Array<{ section: string; label: string; risk: number }>;
  answers: Record<string, { label: string; values: number[]; section_risk: number }>;
  completed_at: string;
  entity_name: string;
  entity_type: string;
  region: string;
  total_beds: number | null;
}
interface RemediationPlan {
  id: string; flag_key: string; planned_action: string;
  responsible: string | null; due_date: string | null; status: string; control_code: string;
  label?: string; priority?: string; severity?: number; deadline_label?: string; completion_note?: string;
  created_at?: string;
}

// T and getBandTokens imported from @/lib/clavis-tokens

// ─── SEZIONI
const SECTIONS_META = [
  { id: "S1", label: "Supply Chain",     framework: "NIS2",      weight: 20 },
  { id: "S2", label: "AI & Dispositivi", framework: "AI Act",    weight: 25 },
  { id: "S3", label: "Shadow IT",        framework: "D.Lgs.231", weight: 20 },
  { id: "S4", label: "Incidenti",        framework: "NIS2",      weight: 15 },
  { id: "S5", label: "Governance",       framework: "D.Lgs.231", weight: 10 },
  { id: "S6", label: "Compliance Reg.",  framework: "DM 77",     weight: 10 },
];

// ─── SCADENZE (fallback se /api/legal-dictionary non risponde)
interface Scadenza { norma: string; desc: string; date: string; scaduta: boolean; }
const SCADENZE_FALLBACK: Scadenza[] = [
  { norma: "NIS2",    desc: "Registrazione ACN",         date: "2025-01-31", scaduta: true  },
  { norma: "AI Act",  desc: "FRIA + Dossier Tecnico",    date: "2026-08-02", scaduta: false },
  { norma: "NIS2",    desc: "Misure sicurezza Art. 21",  date: "2026-10-17", scaduta: false },
  { norma: "GDPR",    desc: "Nomina DPO",                date: "2018-05-25", scaduta: true  },
  { norma: "DM 232",  desc: "Polizza RC Sanitaria",      date: "2024-01-01", scaduta: true  },
];

// ─── MAPPA SCADENZA → TIPO COMPLIANCE
function getScadenzaTipo(s: Scadenza): string | null {
  if (s.norma === "NIS2"   && s.desc.includes("ACN"))  return "REGISTRAZIONE_ACN";
  if (s.norma === "GDPR"   && s.desc.includes("DPO"))  return "NOMINA_DPO";
  // AI Act → gestito separatamente tramite FRIA + S2 score (non NOMINA_AI_OFFICER)
  if (s.norma === "DM 232")                             return "POLIZZA_RC_DM232";
  return null;
}

// ─── MAPPA CONTROL CODE REMEDIATION → TIPO COMPLIANCE
const REMEDIATION_TO_COMPLIANCE: Record<string, string> = {
  "S4": "IRP_INCIDENT_RESPONSE",
  "S5": "PIANO_FORMATIVO",
  "S1": "REGISTRO_FORNITORI",
  "S3": "REGISTRO_TRATTAMENTI",
};

const STATO_REMEDIATION: Record<string, string> = {
  open:        "Aperto",
  in_progress: "In corso",
  completed:   "Completato",
};


function daysTo(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

// ─── COMPUTE DEADLINE (specchio di app/remediation/page.tsx)
function computeDeadlineDash(plan: { postponed_until?: string | null; deadline_date?: string | null; due_date?: string | null; created_at: string; deadline_label?: string | null }): string | null {
  if (plan.postponed_until) return plan.postponed_until;
  if (plan.deadline_date)   return plan.deadline_date;
  if (plan.due_date)        return plan.due_date;
  const label = plan.deadline_label;
  if (!label) return null;
  const lower = label.toLowerCase();
  const monthMap: Record<string, string> = {
    "gennaio":"01","febbraio":"02","marzo":"03","aprile":"04",
    "maggio":"05","giugno":"06","luglio":"07","agosto":"08",
    "settembre":"09","ottobre":"10","novembre":"11","dicembre":"12",
  };
  if (lower.includes("immediato")) { const d = new Date(plan.created_at); d.setDate(d.getDate() + 7);  return d.toISOString().split("T")[0]; }
  if (lower.includes("scaduta"))   { return plan.created_at.split("T")[0]; }
  const dmyMatch = lower.match(/^(\d{1,2})\s+([a-zÃ Ã¨Ã©Ã¬Ã²Ã¹Ã€ÃˆÃ‰ÃŒÃ’Ã™]+)\s+(\d{4})/);
  if (dmyMatch && monthMap[dmyMatch[2]]) return `${dmyMatch[3]}-${monthMap[dmyMatch[2]]}-${dmyMatch[1].padStart(2, "0")}`;
  const parts = lower.split(" ");
  if (parts.length >= 2 && monthMap[parts[0]] && parts[1].match(/^\d{4}$/)) return `${parts[1]}-${monthMap[parts[0]]}-01`;
  const numMatch = label.match(/(\d+)/);
  if (numMatch) { const days = parseInt(numMatch[1]); const d = new Date(plan.created_at); d.setDate(d.getDate() + days); return d.toISOString().split("T")[0]; }
  return null;
}

function getSectionRisk(answers: Record<string, { section_risk: number }>, sid: string) {
  return answers?.[sid]?.section_risk ?? 50;
}

// ─── MINI RADAR compatto
function CompactRadar({ answers }: { answers: Record<string, { section_risk: number }> }) {
  const cx = 80, cy = 80, r = 58, n = 6;
  const risks = SECTIONS_META.map(s => getSectionRisk(answers, s.id));

  function pt(i: number, val: number) {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return { x: cx + (val / 100) * r * Math.cos(a), y: cy + (val / 100) * r * Math.sin(a) };
  }

  const poly = risks.map((v, i) => { const p = pt(i, v); return `${p.x},${p.y}`; }).join(" ");

  return (
    <svg viewBox="0 0 160 160" className="w-full h-full">
      {[25, 50, 75, 100].map(l => (
        <polygon key={l}
          points={Array.from({ length: n }, (_, i) => { const p = pt(i, l); return `${p.x},${p.y}`; }).join(" ")}
          fill="none" stroke={T.slate200} strokeWidth="0.8" />
      ))}
      {Array.from({ length: n }, (_, i) => {
        const p = pt(i, 100);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={T.slate200} strokeWidth="0.8" />;
      })}
      <polygon points={poly} fill={`${T.high}25`} stroke={T.high} strokeWidth="1.5" strokeLinejoin="round" />
      {risks.map((v, i) => {
        const p = pt(i, v);
        const b = getBandTokens(v);
        return <circle key={i} cx={p.x} cy={p.y} r="3.5" fill={b.color} />;
      })}
      {SECTIONS_META.map((s, i) => {
        const a = (Math.PI * 2 * i) / n - Math.PI / 2;
        const d = r + 16;
        const x = cx + d * Math.cos(a);
        const y = cy + d * Math.sin(a);
        const dx = Math.cos(a);
        return (
          <text key={i} x={x} y={y}
            textAnchor={dx > 0.3 ? "start" : dx < -0.3 ? "end" : "middle"}
            fontSize="7" fontFamily="DM Sans, system-ui" fill={T.slate400}>
            {s.label.split(" ")[0]}
          </text>
        );
      })}
    </svg>
  );
}

// ─── PILL rischio sezione
function RiskPill({ risk, label, framework }: { risk: number; label: string; framework: string }) {
  const b = getBandTokens(risk);
  return (
    <div className="border p-3 flex flex-col gap-1.5"
      style={{ borderColor: "var(--line2)", backgroundColor: "var(--ink2)", borderRadius: "4px" }}>
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-semibold truncate" style={{ color: T.slate800 }}>{label}</span>
        <span className="text-lg font-mono font-black flex-shrink-0" style={{ color: b.color }}>{risk}%</span>
      </div>
      <div className="w-full h-1 rounded-full" style={{ backgroundColor: T.slate100 }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${risk}%`, backgroundColor: getBarColor(risk) }} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono" style={{ color: T.slate400, fontSize: "12px" }}>{framework}</span>
        <span className="text-xs font-bold uppercase" style={{ color: b.color, fontSize: "12px" }}>{b.label}</span>
      </div>
    </div>
  );
}

// ─── PROSSIMO PASSO — logica pura
const PRIORITY_ORDER: Record<string, number> = { CRITICA: 0, ALTA: 1, MEDIA: 2 };

function sortRemediation(items: RemediationPlan[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dict = LEGAL_DICT as any;
  return [...items].sort((a, b) => {
    const orderA = dict.flags?.[a.flag_key]?.execution_order ?? 99;
    const orderB = dict.flags?.[b.flag_key]?.execution_order ?? 99;
    return orderA - orderB;
  });
}

function priorityColor(p?: string): string {
  if (p === "CRITICA") return T.critical;
  if (p === "ALTA")    return T.high;
  if (p === "MEDIA")   return T.medium;
  return T.slate400;
}

function getFlagFramework(flagKey: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flag = (LEGAL_DICT as any).flags?.[flagKey];
  if (flag?.framework) return flag.framework;
  if (flagKey.startsWith("Flag_GDPR_"))  return "GDPR";
  if (flagKey.startsWith("Flag_NIS2_"))  return "NIS2";
  if (flagKey.startsWith("Flag_AIACT_")) return "AI Act";
  if (flagKey.startsWith("Flag_D231_"))  return "D.231";
  if (flagKey.startsWith("Flag_MDR_"))   return "MDR";
  if (flagKey.startsWith("Flag_FSE_"))   return "DM 77";
  return flagKey.replace(/^Flag_/, "").replace(/_/g, " ");
}

function getDirectorContent(flagKey: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flag = (LEGAL_DICT as any).flags?.[flagKey];
  return {
    title:    (flag?.title_director    ?? flag?.label ?? flagKey) as string,
    desc:     (flag?.desc_director     ?? flag?.remediation?.action ?? "") as string,
    shortcut: (flag?.shortcut_director ?? "") as string,
  };
}


// ─── REQUIRES DATA
const REQUIRES_DATA_META: Record<string, { label: string; href: string }> = {
  supplier_registry_complete:    { label: "Registro fornitori (almeno 1 fornitore censito)", href: "/fornitori"   },
  Flag_GDPR_DPO:                 { label: "Nomina DPO completata",                           href: "/remediation" },
  Flag_AIACT_HR_01:              { label: "Formazione AI Act (HR-01) completata",             href: "/remediation" },
  entity_responsabile_it:        { label: "Responsabile IT",                                  href: "/anagrafica"  },
  entity_referente_breach:       { label: "Referente Breach",                                 href: "/anagrafica"  },
  entity_convenzione_ssn:        { label: "Convenzione SSN attiva",                           href: "/anagrafica"  },
  entity_region:                 { label: "Regione",                                          href: "/anagrafica"  },
  entity_website_url:            { label: "Sito web struttura",                               href: "/anagrafica"  },
  company_legale_rappresentante: { label: "Legale rappresentante",                            href: "/anagrafica"  },
  company_dipendenti_fascia:     { label: "Fascia dipendenti azienda",                        href: "/anagrafica"  },
  company_fatturato_fascia:      { label: "Fascia fatturato azienda",                         href: "/anagrafica"  },
  supplier_registry_broker:      { label: "Fornitore di consulenza professionale nel registro", href: "/fornitori" },
};

function checkRequiresData(
  flagKey: string,
  entityData: EntityFullData | null,
  companyData: CompanyDataFull | null,
  plans: { flag_key: string; status: string }[],
  supplierCount: number,
  hasSupplierBroker: boolean,
): { ready: boolean; missing: { key: string; label: string; href: string }[] } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requiresData: string[] = (LEGAL_DICT as any).flags?.[flagKey]?.requires_data ?? [];
  const missing: { key: string; label: string; href: string }[] = [];

  for (const req of requiresData) {
    const meta  = REQUIRES_DATA_META[req];
    const href  = meta?.href  ?? "/anagrafica";
    const label = meta?.label ?? req;
    let satisfied = true;

    switch (req) {
      case "supplier_registry_complete":
        satisfied = supplierCount > 0; break;
      case "Flag_GDPR_DPO":
        satisfied = plans.some(p => p.flag_key === "Flag_GDPR_DPO"    && p.status === "completato"); break;
      case "Flag_AIACT_HR_01":
        satisfied = plans.some(p => p.flag_key === "Flag_AIACT_HR_01" && p.status === "completato"); break;
      case "entity_responsabile_it":
        satisfied = !!entityData?.responsabile_it; break;
      case "entity_referente_breach":
        satisfied = !!entityData?.referente_breach; break;
      case "entity_convenzione_ssn":
        satisfied = !!entityData?.convenzione_ssn; break;
      case "entity_region":
        satisfied = !!entityData?.region; break;
      case "entity_website_url":
        satisfied = !!entityData?.website_url; break;
      case "company_legale_rappresentante":
        satisfied = !!companyData?.legale_rappresentante; break;
      case "company_dipendenti_fascia":
        satisfied = !!companyData?.n_dipendenti_fascia; break;
      case "company_fatturato_fascia":
        satisfied = !!companyData?.fatturato_fascia; break;
      case "supplier_registry_broker":
        satisfied = hasSupplierBroker; break;
      default:
        satisfied = true;
    }

    if (!satisfied) missing.push({ key: req, label, href });
  }

  return { ready: missing.length === 0, missing };
}

// ─── MAIN
export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { entityVersion } = useActiveEntity();

  const [activeNav, setActiveNav] = useState<"overview" | "remediation" | "scadenze" | "struttura">("overview");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [triageData, setTriageData] = useState<TriageDashboard | null>(null);
  const [plans, setPlans] = useState<RemediationPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const [showAddPlan, setShowAddPlan] = useState(false);
  const [newPlanForm, setNewPlanForm] = useState({ planned_action: "", responsible: "", due_date: "", control_code: "" });
  const [scadenze, setScadenze] = useState<Scadenza[]>([]);
  const [complianceItems, setComplianceItems] = useState<{ tipo: string; stato: string }[]>([]);
  const [riskScoreCombinato, setRiskScoreCombinato] = useState<number | null>(null);
  const [scoreDocumentale, setScoreDocumentale] = useState<number | null>(null);
  const [remediationOpen, setRemediationOpen] = useState<RemediationPlan[]>([]);
  const [remediationAll, setRemediationAll] = useState<{ id: string; flag_key: string; status: string }[]>([]);
  const [plansAnomalie, setPlansAnomalie] = useState<RemediationPlan[]>([]);
  const [autocertModal, setAutocertModal] = useState<{ item: RemediationPlan } | null>(null);
  const [autocertNote, setAutocertNote] = useState("");
  const [autocertLoading, setAutocertLoading] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [entityId, setEntityId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [generateModalFlag, setGenerateModalFlag] = useState<string | null>(null);
  const [generateModalKey,  setGenerateModalKey]  = useState<string | null>(null);
  const [emailModalOpen,    setEmailModalOpen]    = useState(false);
  const [stepFlowFlag,      setStepFlowFlag]      = useState<string | null>(null);
  const [companyData,       setCompanyData]       = useState<CompanyDataFull | null>(null);
  const [entityFullData,    setEntityFullData]    = useState<EntityFullData | null>(null);
  const [supplierCount,     setSupplierCount]     = useState(0);
  const [hasSupplierBroker, setHasSupplierBroker] = useState(false);
  const [entityNominativi, setEntityNominativi] = useState<{
    nome_dpo:              string | null;
    email_dpo:             string | null;
    dpo_qualifica:         string | null;
    dpo_telefono:          string | null;
    responsabile_it:       string | null;
    email_responsabile_it: string | null;
  } | null>(null);

  const [actionModalPlan, setActionModalPlan] = useState<RemediationPlan | null>(null);
  const [showAreaDetail, setShowAreaDetail] = useState(false);
  const [hasNis2Assessment, setHasNis2Assessment] = useState(false);
  const [hasAiClassification, setHasAiClassification] = useState(false);
  const [progressoDocumenti, setProgressoDocumenti] = useState<{ completati: number; totali: number }>({ completati: 0, totali: 0 });

  const sortedRemediation = React.useMemo(() => sortRemediation(remediationOpen), [remediationOpen]);

  const loadData = useCallback(async () => {
    setLoading(true);
    // Reset stati prima di caricare nuovi dati (cambio entity)
    setTriageData(null);
    setPlans([]);
    setComplianceItems([]);
    setScadenze([]);
    setRiskScoreCombinato(null);
    setScoreDocumentale(null);
    setRemediationOpen([]);
    setRemediationAll([]);
    setPlansAnomalie([]);
    setEntityFullData(null);
    setSupplierCount(0);
    setHasSupplierBroker(false);
    setHasNis2Assessment(false);
    setHasAiClassification(false);
    setProgressoDocumenti({ completati: 0, totali: 0 });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const storedEntityId = localStorage.getItem("clavis_active_entity_id");

      const entityCheckQuery = storedEntityId
        ? supabase.from("entities").select("id").eq("id", storedEntityId).limit(1)
        : supabase.from("entities").select("id").eq("created_by", user.id).limit(1);
      const { data: entityCheck } = await entityCheckQuery;
      if (!entityCheck || entityCheck.length === 0) {
        localStorage.removeItem("clavis_active_entity_id");
        setNeedsOnboarding(true);
        return;
      }

      // entityId disponibile subito — serve a handleImportTriage anche senza triage generato
      const resolvedEntityId = storedEntityId ?? entityCheck[0].id;
      setEntityId(resolvedEntityId);
      if (!storedEntityId) localStorage.setItem("clavis_active_entity_id", resolvedEntityId);

      const triageQuery = storedEntityId
        ? supabase.from("v_triage_dashboard").select("*")
            .eq("user_id", user.id).eq("entity_id", storedEntityId)
            .eq("status", "generated").order("completed_at", { ascending: false }).limit(1)
        : supabase.from("v_triage_dashboard").select("*")
            .eq("user_id", user.id)
            .eq("status", "generated").order("completed_at", { ascending: false }).limit(1);

      const [profRes, triageRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        triageQuery.single(),
      ]);

      if (profRes.data) setProfile(profRes.data);

      if (triageRes.data) {
        setTriageData(triageRes.data);
        if (triageRes.data.id) {
          const { data: planData } = await supabase
            .from("remediation_plans").select("*")
            .eq("session_id", triageRes.data.id)
            .order("due_date", { ascending: true });
          if (planData) setPlans(planData);
        }

        // Carica adempimenti compliance (entity + company)
        const eid = triageRes.data.entity_id;
        setEntityId(eid);
        if (!storedEntityId) localStorage.setItem("clavis_active_entity_id", eid);
        const { data: entityRow } = await supabase
          .from("entities").select("company_id").eq("id", eid).single();
        const cid = entityRow?.company_id as string | null;
        setCompanyId(cid);

        const { data: entityCompliance } = await supabase
          .from("entity_compliance_items")
          .select("tipo, stato")
          .eq("entity_id", eid);

        if (cid) {
          const { data: comp } = await supabase
            .from("companies")
            .select("name, vat_number, legal_address, legale_rappresentante, pec, codice_fiscale, modello_231, n_dipendenti_fascia, fatturato_fascia")
            .eq("id", cid)
            .single();
          console.log("[loadData] companies fetch — cid:", cid, "comp:", comp);
          if (comp) setCompanyData({
            name:                  comp.name                  ?? "",
            vat_number:            comp.vat_number            ?? null,
            legal_address:         comp.legal_address         ?? null,
            legale_rappresentante: comp.legale_rappresentante ?? null,
            pec:                   comp.pec                   ?? null,
            codice_fiscale:        comp.codice_fiscale        ?? null,
            modello_231:           comp.modello_231           ?? null,
            n_dipendenti_fascia:   comp.n_dipendenti_fascia   ?? null,
            fatturato_fascia:      comp.fatturato_fascia      ?? null,
          });
        }

        // Carica anagrafica entity per alimentare i modal (DPO, Resp. IT) e checkRequiresData
        const { data: entityAnagrafica } = await supabase
          .from("entities")
          .select("nome_dpo, email_dpo, dpo_qualifica, dpo_telefono, responsabile_it, email_responsabile_it, referente_breach, convenzione_ssn, website_url, region")
          .eq("id", eid)
          .single();
        if (entityAnagrafica) {
          setEntityNominativi({
            nome_dpo:              entityAnagrafica.nome_dpo              ?? null,
            email_dpo:             entityAnagrafica.email_dpo             ?? null,
            dpo_qualifica:         entityAnagrafica.dpo_qualifica         ?? null,
            dpo_telefono:          entityAnagrafica.dpo_telefono          ?? null,
            responsabile_it:       entityAnagrafica.responsabile_it       ?? null,
            email_responsabile_it: entityAnagrafica.email_responsabile_it ?? null,
          });
          setEntityFullData({
            responsabile_it:  entityAnagrafica.responsabile_it  ?? null,
            referente_breach: entityAnagrafica.referente_breach ?? null,
            convenzione_ssn:  !!entityAnagrafica.convenzione_ssn,
            region:           entityAnagrafica.region           ?? null,
            website_url:      entityAnagrafica.website_url      ?? null,
          });
        }

        const { data: companyCompliance } = cid
          ? await supabase.from("company_compliance_items").select("tipo, stato").eq("company_id", cid)
          : { data: [] as { tipo: string; stato: string }[] };

        // Supplier registry — count per checkRequiresData (supplier_registry_complete)
        const { data: regRows } = cid
          ? await supabase.from("supplier_registry").select("id").eq("company_id", cid)
          : { data: [] as { id: string }[] };
        const regList = (regRows ?? []) as { id: string }[];
        setSupplierCount(regList.length);

        // Broker check — categoria Ã¨ in suppliers (join su fornitore_id → supplier_registry.id)
        let hasBroker = false;
        if (cid && regList.length > 0) {
          const regIds = regList.map(r => r.id);
          const { data: brokerRows } = await supabase
            .from("suppliers")
            .select("id")
            .in("fornitore_id", regIds)
            .eq("categoria", "SERVIZI_ESTERNI")
            .limit(1);
          hasBroker = ((brokerRows ?? []) as { id: string }[]).length > 0;
        }
        setHasSupplierBroker(hasBroker);

        const entityArr  = (entityCompliance  ?? []) as { tipo: string; stato: string }[];
        const companyArr = (companyCompliance ?? []) as { tipo: string; stato: string }[];

        setComplianceItems([...entityArr, ...companyArr]);

        // Documenti completati via compliance_events
        const { data: eventiCompliance } = await supabase
          .from("compliance_events")
          .select("documento_key")
          .eq("entity_id", eid);
        const documentiCompletati = new Set(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (eventiCompliance ?? []).map((e: any) => (e.documento_key as string)?.toLowerCase()).filter(Boolean)
        ).size;
        const documentiTotali = entityArr.length + companyArr.length;
        setProgressoDocumenti({ completati: documentiCompletati, totali: documentiTotali });

        const { data: remOpen } = await supabase
          .from("remediation_plans")
          .select("*")
          .eq("entity_id", eid)
          .in("status", ["open", "non_conforme", "declared"])
          .order("created_at", { ascending: true });

        const { data: remAll } = await supabase
          .from("remediation_plans")
          .select("id, flag_key, status")
          .eq("entity_id", eid);

        const remOpenTyped = (remOpen ?? []) as RemediationPlan[];
        const dedupedOpen = remOpenTyped.reduce((acc, item) => {
          const existing = acc.find(r => r.flag_key === item.flag_key);
          if (!existing) {
            acc.push(item);
          } else if ((item.created_at ?? "") > (existing.created_at ?? "")) {
            acc[acc.indexOf(existing)] = item;
          }
          return acc;
        }, [] as RemediationPlan[]);
        setRemediationOpen(dedupedOpen);
        setRemediationAll((remAll ?? []) as { id: string; flag_key: string; status: string }[]);

        // ── Anomalie scadenza (> 200 giorni)
        const anomalie = (remOpen ?? []).filter((p: any) => {
          const deadline = computeDeadlineDash(p);
          if (!deadline) return false;
          const days = Math.ceil(
            (new Date(deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
          );
          return days > 200;
        });
        setPlansAnomalie(anomalie as RemediationPlan[]);

        // ── Score documentale + combinato (70% operativo / 30% documentale)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const scoreDoc = calcScoreCompliance(entityArr as any, companyArr as any);
        const scoreOp  = triageRes.data.risk_score ?? 50;
        const scoreComb = Math.round(scoreOp * 0.70 + scoreDoc * 0.30);
        setScoreDocumentale(scoreDoc);
        setRiskScoreCombinato(scoreComb);

        // ── Moduli avanzati NIS2 + AI Act (fail-safe — tabelle opzionali)
        const [nis2Res, aiRes] = await Promise.all([
          supabase.from("nis2_assessments").select("id").eq("entity_id", eid).limit(1),
          supabase.from("supplier_systems").select("id").eq("entity_id", eid).not("ai_classification", "is", null).limit(1),
        ]);
        setHasNis2Assessment(!nis2Res.error && (nis2Res.data ?? []).length > 0);
        setHasAiClassification(!aiRes.error && (aiRes.data ?? []).length > 0);
      }

      try {
        const legalRes = await fetch("/api/legal-dictionary");
        const legalData = await legalRes.json();
        const scadenzeFromDict: Scadenza[] = [];
        for (const framework of Object.values(legalData.frameworks || {})) {
          const f = framework as any;
          if (f.deadlines) {
            for (const d of f.deadlines) {
              scadenzeFromDict.push({
                norma: f.code || f.name,
                desc: d.description,
                date: d.date,
                scaduta: new Date(d.date) < new Date(),
              });
            }
          }
        }
        setScadenze(scadenzeFromDict.length > 0 ? scadenzeFromDict : SCADENZE_FALLBACK);
      } catch {
        setScadenze(SCADENZE_FALLBACK);
      }
    } finally {
      setLoading(false);
    }
  }, [supabase, router]); // supabase Ã¨ stabile (useMemo), router Ã¨ stabile (Next.js)

  const loadRemediationData = useCallback(async () => {
    if (!entityId) return;
    const { data: open } = await supabase
      .from("remediation_plans")
      .select("*")
      .eq("entity_id", entityId)
      .in("status", ["open", "non_conforme", "declared"]);
    const { data: all } = await supabase
      .from("remediation_plans")
      .select("id, flag_key, status")
      .eq("entity_id", entityId);
    const openTyped = (open ?? []) as RemediationPlan[];
    const deduped = openTyped.reduce((acc, item) => {
      const existing = acc.find(r => r.flag_key === item.flag_key);
      if (!existing) {
        acc.push(item);
      } else if ((item.created_at ?? "") > (existing.created_at ?? "")) {
        acc[acc.indexOf(existing)] = item;
      }
      return acc;
    }, [] as RemediationPlan[]);
    setRemediationOpen(deduped);
    setRemediationAll((all ?? []) as { id: string; flag_key: string; status: string }[]);
  }, [entityId]); // supabase omesso: stabile per costruzione (useMemo [])

  useEffect(() => { loadData(); }, [loadData, entityVersion]);

  function handleAutocertifica(flagKey: string) {
    const plan = remediationOpen.find(r => r.flag_key === flagKey);
    if (plan) { setAutocertModal({ item: plan }); setAutocertNote(""); }
  }

  const handleStepFlowGenerate = (modalKey: string, fk: string) => {
    console.log("[onGenerate] prima:", { stepFlowFlag, generateModalFlag });
    setGenerateModalFlag(fk);
    setGenerateModalKey(modalKey ?? null);
    setStepFlowFlag(null);
    console.log("[onGenerate] dopo setState — nota: i valori qui sono ancora quelli vecchi per closure");
  };

  // ─── LOADING
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--ink)" }}>
      <div className="text-center space-y-2">
        <p className="font-mono text-sm uppercase tracking-widest" style={{ color: T.slate400 }}>CLAVIS</p>
        <p className="text-sm" style={{ color: T.slate400 }}>Caricamento...</p>
      </div>
    </div>
  );

  // ─── DATI DERIVATI
  const sectionRisks = SECTIONS_META.map(s => getSectionRisk(triageData?.answers ?? {}, s.id));
  const displayScore = riskScoreCombinato ?? triageData?.risk_score ?? 0;
  const band = triageData ? getBandTokens(displayScore) : null;

  // AI Act: conformitÃ  valutata su FRIA + punteggio S2 (non su NOMINA_AI_OFFICER)
  const friaItem   = complianceItems.find(ci => ci.tipo === "FRIA");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s2q1Score  = (((triageData?.answers as any)?.S2 as number[] | undefined)?.[0] ?? 0) as number;
  const aiActConforme =
    s2q1Score >= 75 ||
    friaItem?.stato === "CONFORME" ||
    friaItem?.stato === "DICHIARATO";
  const plansOpen = plans.filter(p => p.status !== "completed");
  const plansCritical = plansOpen.filter(p => {
    if (!p.due_date) return false;
    return daysTo(p.due_date) <= 14;
  });
  const scadenzeAlert = scadenze.filter(s => s.scaduta || daysTo(s.date) <= 90);

  // ─── CONTENUTO CENTRALE
  function renderOverview() {
    if (!triageData || !band) return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
            style={{ backgroundColor: T.slate100 }}>
            <span className="text-2xl">ðŸ“‹</span>
          </div>
          <p className="font-semibold text-lg" style={{ color: T.slate800 }}>Nessun triage completato</p>
          <p className="text-sm leading-relaxed" style={{ color: T.slate600 }}>
            Avvia il triage per ottenere il Profilo di Rischio Composito della struttura.
          </p>
          <button onClick={() => router.push("/triage/pubblico")}
            className="px-6 py-3 text-sm font-bold tracking-widest uppercase transition-colors"
            style={{ backgroundColor: "var(--shield)", color: "var(--bone)", borderRadius: "4px" }}>
            Avvia Triage →
          </button>
        </div>
      </div>
    );

    // ── Valori derivati per il nuovo layout
    const completedCount = remediationAll.filter(r => r.status === "completed").length;
    const totalCount     = remediationAll.length;
    const fillPct        = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
    const mainAction     = sortedRemediation[0] ?? null;
    const nextActions    = sortedRemediation.slice(1, 4);

    // Percentuali per framework — derivate dai sectionRisks (S1..S6)
    const gdprPct  = sectionRisks[5]; // S6 Compliance Reg.
    const nis2Pct  = Math.round((sectionRisks[0] + sectionRisks[3]) / 2); // S1 + S4
    const aiActPct = sectionRisks[1]; // S2 AI & Dispositivi
    const d231Pct  = Math.round((sectionRisks[2] + sectionRisks[4]) / 2); // S3 + S5

    function gColors(pct: number) {
      if (pct < 40) return { stroke:"#E24B4A", track:"#F7C1C1", bbg:"#FCEBEB", btxt:"#A32D2D", bdr:"#E24B4A", lbl:"ALTO" };
      if (pct < 70) return { stroke:"#BA7517", track:"#FAC775", bbg:"#FAEEDA", btxt:"#854F0B", bdr:"#BA7517", lbl:"MEDIO" };
      return      { stroke:"#639922", track:"#C0DD97", bbg:"#EAF3DE", btxt:"#3B6D11", bdr:"#639922", lbl:"BASSO" };
    }
    function npt(pct: number) {
      const a = Math.PI - (pct / 100) * Math.PI;
      return { x: 36 + Math.cos(a) * 22, y: 40 - Math.sin(a) * 22 };
    }

    return (
      <div className="flex-1 flex flex-col overflow-y-auto" style={{ gap:"12px", padding:"12px 16px" }}>
        <style>{`
          .blink-dot{width:6px;height:6px;border-radius:50%;background:#E24B4A;animation:blinkAnim 1.5s infinite;}
          @keyframes blinkAnim{0%,100%{opacity:1}50%{opacity:0.2}}
        `}</style>

        {/* BLOCCO 1 — Header */}
        <div className="flex items-center justify-between flex-shrink-0">
          <span style={{ fontSize:"13px", color:T.slate400, textTransform:"uppercase", letterSpacing:"0.06em" }}>
            {triageData.entity_name}
          </span>
          <span style={{ fontSize:"12px", color:T.slate400 }}>
            Aggiornato: {new Date(triageData.completed_at).toLocaleDateString("it-IT")}
          </span>
        </div>

        {/* BLOCCO 2 — 4 Gauge Framework */}
        <div className="grid grid-cols-4 flex-shrink-0" style={{ gap:"12px" }}>
          {([
            { label:"GDPR",   pct:gdprPct,  sub:"Compliance Reg." },
            { label:"NIS2",   pct:nis2Pct,  sub:"Supply Chain Â· Incidenti" },
            { label:"AI Act", pct:aiActPct, sub:"AI & Dispositivi" },
            { label:"D.231",  pct:d231Pct,  sub:"Shadow IT Â· Governance" },
          ] as const).map(({ label, pct, sub }) => {
            const c  = gColors(pct);
            const np = npt(pct);
            const dashOffset = 88 - (pct / 100 * 88);
            return (
              <div key={label} style={{
                background:"var(--ink2)", border:"0.5px solid var(--line2)", borderRadius:"8px",
                borderBottom:`3px solid ${c.bdr}`, padding:"1rem",
                display:"flex", flexDirection:"column", alignItems:"center", gap:"6px",
                minHeight:"180px",
              }}>
                <span style={{ fontSize:"13px", textTransform:"uppercase", letterSpacing:"0.08em", color:T.slate400 }}>
                  {label}
                </span>
                <svg viewBox="0 0 72 44" width="100" height="62">
                  <path d="M8,40 A28,28 0 0,1 64,40"
                    fill="none" stroke={c.track} strokeWidth="6" strokeLinecap="round" />
                  <path d="M8,40 A28,28 0 0,1 64,40"
                    fill="none" stroke={c.stroke} strokeWidth="6" strokeLinecap="round"
                    strokeDasharray="88" strokeDashoffset={dashOffset} />
                  <line x1="36" y1="40" x2={np.x.toFixed(1)} y2={np.y.toFixed(1)}
                    stroke={c.stroke} strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="36" cy="40" r="3" fill={c.stroke} />
                </svg>
                <span style={{ fontSize:"24px", fontWeight:500, color:c.stroke }}>{pct}%</span>
                <span style={{ fontSize:"13px", borderRadius:"999px", padding:"2px 8px",
                  backgroundColor:c.bbg, color:c.btxt, fontWeight:600 }}>
                  {c.lbl}
                </span>
                <span style={{ fontSize:"11px", color:T.slate400 }}>{sub}</span>
              </div>
            );
          })}
        </div>

        {/* BLOCCO 3 — Prossima azione + Questa settimana */}
        <div className="grid grid-cols-2 flex-shrink-0" style={{ gap:"12px" }}>

          {/* Card sinistra — Prossima azione */}
          <div style={{
            background:"var(--ink2)", border:"0.5px solid var(--line2)",
            borderRadius:"0 8px 8px 0", borderLeft:"3px solid #E24B4A", padding:"1rem",
          }}>
            <div className="flex items-center gap-2" style={{ marginBottom:"12px" }}>
              <span className="blink-dot" />
              <span style={{ fontSize:"13px", textTransform:"uppercase", letterSpacing:"0.06em", color:"#A32D2D" }}>
                Prossima azione
              </span>
            </div>

            {totalCount === 0 ? (
              <div>
                <p style={{ fontSize:"14px", color:T.slate800, fontWeight:500 }}>
                  Completa il triage per generare il piano di remediation.
                </p>
                <button onClick={() => router.push("/triage/autenticato")}
                  className="mt-3 px-4 py-2 text-xs font-bold uppercase tracking-widest"
                  style={{ backgroundColor:"var(--shield)", color:"var(--bone)", borderRadius:"4px" }}>
                  Avvia Triage →
                </button>
              </div>
            ) : !mainAction ? (
              <p style={{ fontSize:"14px", color:T.low, fontWeight:500 }}>
                Nessuna azione aperta. Mantieni il presidio e monitora le scadenze.
              </p>
            ) : (() => {
              const dc = getDirectorContent(mainAction.flag_key);
              return (
                <div>
                  <p style={{ fontSize:"18px", fontWeight:500, color:T.slate800, marginBottom:"6px" }}>{dc.title}</p>
                  {dc.desc && (
                    <p style={{ fontSize:"14px", color:T.slate400, lineHeight:1.5, marginBottom:"8px" }}>{dc.desc}</p>
                  )}
                  {dc.shortcut && (
                    <p style={{ fontSize:"13px", color:"var(--shield-soft,#7BA7D4)", marginBottom:"8px" }}>→ {dc.shortcut}</p>
                  )}
                  <div className="flex gap-2 text-xs flex-wrap" style={{ marginBottom:"10px", color:T.slate400 }}>
                    {mainAction.responsible && <span>→ {mainAction.responsible}</span>}
                    {mainAction.deadline_label && <span className="font-mono">Entro: {mainAction.deadline_label}</span>}
                  </div>
                  {/* Dipendenze */}
                  {(() => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const dict = LEGAL_DICT as any;
                    const requires: string[] = dict.flags?.[mainAction.flag_key]?.requires ?? [];
                    const unmet = requires.filter((req: string) =>
                      !remediationAll.some(r => r.flag_key === req && r.status === "completed")
                    );
                    if (unmet.length === 0) return null;
                    return (
                      <div className="p-3 text-xs mb-2" style={{
                        background:"rgba(217,178,90,0.08)", border:"1px solid rgba(217,178,90,0.3)",
                        color:"var(--gold)", borderRadius:"4px",
                      }}>
                        ⚠ Prima completa: <strong>{unmet.map((req: string) =>
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          (LEGAL_DICT as any).flags?.[req]?.title_director ?? req
                        ).join(", ")}</strong>
                      </div>
                    );
                  })()}
                  {/* CTA */}
                  {(() => {
                    const checkResult = checkRequiresData(
                      mainAction.flag_key, entityFullData, companyData,
                      remediationAll, supplierCount, hasSupplierBroker,
                    );
                    if (!checkResult.ready) {
                      const byHref = checkResult.missing.reduce<Record<string, string[]>>((acc, m) => {
                        if (!acc[m.href]) acc[m.href] = [];
                        acc[m.href].push(m.label);
                        return acc;
                      }, {});
                      const hrefLabel: Record<string, string> = {
                        "/fornitori":"Registro Fornitori",
                        "/anagrafica":"Anagrafica Struttura",
                        "/remediation":"Piano Remediation",
                      };
                      return (
                        <div className="space-y-2">
                          <div className="p-3 text-xs" style={{
                            background:"rgba(217,178,90,0.10)", border:"1px solid rgba(217,178,90,0.35)", borderRadius:"4px",
                          }}>
                            <p className="font-semibold mb-1" style={{ color:"var(--gold)" }}>⚠ Prima completa:</p>
                            <ul>{checkResult.missing.map(m => (
                              <li key={m.key} style={{ color:"var(--gold)", opacity:0.85 }}>Â· {m.label}</li>
                            ))}</ul>
                          </div>
                          <div className="flex flex-col gap-1">
                            {Object.entries(byHref).map(([href, labels]) => (
                              <button key={href} onClick={() => router.push(href)}
                                className="px-3 py-2 text-xs font-bold uppercase tracking-widest text-left"
                                style={{ border:"1px solid rgba(217,178,90,0.5)", color:"var(--gold)", borderRadius:"4px" }}
                                title={labels.join(", ")}>
                                → Completa in {hrefLabel[href] ?? href}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    const label    = getShortcutLabel(mainAction.flag_key);
                    const btnColor = getShortcutColor(mainAction.flag_key);
                    const cfg      = getShortcutConfig(mainAction.flag_key);
                    return (
                      <div className="flex flex-col gap-1.5">
                        {cfg.type === "generate" ? (
                          <>
                            <button
                              onClick={() => { setGenerateModalFlag(mainAction.flag_key); setGenerateModalKey(cfg.modal_key ?? null); }}
                              className="px-4 py-2 text-sm font-bold uppercase tracking-widest"
                              style={{ backgroundColor:"var(--emerald,#3ECF8E)", color:"#0A1A12", borderRadius:"4px" }}>
                              → {cfg.label}
                            </button>
                            <button onClick={() => setActionModalPlan(mainAction)}
                              className="px-4 py-2 text-sm font-bold uppercase tracking-widest"
                              style={{ border:"1px solid var(--shield,#3A6DF0)", color:"var(--shield-soft,#7BA7D4)", borderRadius:"4px" }}>
                              → Acquisisci documento esistente
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              if (cfg.type === "email") { setEmailModalOpen(true); }
                              else if (cfg.type === "fornitori") { router.push(cfg.url ?? "/fornitori"); }
                              else if (cfg.type === "checklist") { /* in arrivo */ }
                              else if (cfg.type === "external") { window.open(cfg.url, "_blank"); }
                              else { setActionModalPlan(mainAction); }
                            }}
                            className="px-4 py-2 text-sm font-bold uppercase tracking-widest"
                            style={{
                              backgroundColor:btnColor === "green" ? "var(--emerald,#3ECF8E)" : "var(--shield,#3A6DF0)",
                              color:btnColor === "green" ? "#0A1A12" : "var(--bone,#EEF1F8)",
                              borderRadius:"4px",
                            }}>
                            → {label}
                          </button>
                        )}
                        <button onClick={() => handleAutocertifica(mainAction.flag_key)}
                          className="px-3 py-2 text-xs uppercase tracking-widest"
                          style={{ border:"1px solid rgba(217,178,90,0.4)", color:"var(--gold)" }}>
                          ✎ Autocertifica
                        </button>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
          </div>

          {/* Card destra — Questa settimana */}
          <div style={{
            background:"var(--ink2)", border:"0.5px solid var(--line2)",
            borderRadius:"8px", padding:"1rem",
          }}>
            <div className="flex items-center gap-2" style={{ marginBottom:"12px" }}>
              <i className="ti ti-calendar-week" aria-hidden="true" style={{ fontSize: 13 }}></i>
              <span style={{ fontSize:"13px", textTransform:"uppercase", letterSpacing:"0.06em", color:T.slate400 }}>
                Questa settimana
              </span>
            </div>
            {nextActions.length === 0 ? (
              <p style={{ fontSize:"13px", color:T.slate400 }}>Nessuna azione in programma.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {nextActions.map(item => {
                  const dc = getDirectorContent(item.flag_key);
                  return (
                    <div key={item.id} style={{
                      padding:"10px", background:"var(--ink)", borderRadius:"4px",
                      display:"flex", alignItems:"center", gap:"8px",
                    }}>
                      <span style={{ width:"8px", height:"8px", borderRadius:"50%", flexShrink:0,
                        backgroundColor:priorityColor(item.priority) }} />
                      <span className="flex-1" style={{ fontSize:"15px", color:T.slate800 }}>{dc.title}</span>
                      {item.deadline_label && (
                        <span style={{ fontSize:"13px", color:T.slate400, flexShrink:0 }}>{item.deadline_label}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* BLOCCO 4 — Verso la superficie + accordion */}
        <div className="flex-shrink-0" style={{ display:"flex", flexDirection:"column", gap:"8px" }}>

          {/* Accordion dettaglio tecnico */}
          <div>
            <button onClick={() => setShowAreaDetail(!showAreaDetail)}
              style={{ fontSize:"14px", color:T.slate400, background:"none", border:"none", padding:0, cursor:"pointer", fontWeight:600 }}>
              {showAreaDetail ? "Nascondi dettaglio tecnico ←" : "Dettaglio tecnico per area →"}
            </button>
            {showAreaDetail && (
              <div className="mt-2 border" style={{ borderColor:T.slate200, backgroundColor:"var(--ink2)", borderRadius:"4px" }}>
                <div className="px-4 py-3 flex items-center gap-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-mono font-black" style={{ color:band.textColor }}>
                      {riskScoreCombinato ?? triageData.risk_score}
                    </span>
                    <span className="text-xs font-mono" style={{ color:T.slate400 }}>/100</span>
                  </div>
                  <span className="text-sm font-black uppercase tracking-wider" style={{ color:band.textColor }}>
                    RISCHIO {band.label}
                  </span>
                  <div className="flex gap-4 ml-auto text-xs" style={{ color:T.slate400 }}>
                    <span>Triage: <strong style={{ color:T.slate800 }}>{triageData.risk_score}</strong></span>
                    <span>Documentale: <strong style={{ color:T.slate800 }}>{scoreDocumentale ?? "—"}</strong></span>
                  </div>
                </div>
                <div style={{ borderTop:`1px solid ${T.slate200}` }} />
                <div className="grid grid-cols-3 gap-2 p-3">
                  {SECTIONS_META.map((s, i) => (
                    <RiskPill key={s.id} risk={sectionRisks[i]} label={s.label} framework={s.framework} />
                  ))}
                </div>
                <div style={{ borderTop:`1px solid ${T.slate200}` }} />
                <div className="px-4 py-3 flex flex-col gap-2.5">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-semibold w-12 flex-shrink-0" style={{ color:T.slate400 }}>NIS2</span>
                    <span className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor:hasNis2Assessment ? T.low : T.slate400, opacity:hasNis2Assessment ? 1 : 0.4 }} />
                    {hasNis2Assessment ? (
                      <span className="text-xs" style={{ color:T.low }}>Assessment completato</span>
                    ) : (
                      <span className="text-xs flex items-center gap-2" style={{ color:T.slate400 }}>
                        Da completare
                        <button onClick={() => router.push("/nis2")}
                          style={{ color:T.bronze, background:"none", border:"none", padding:0, cursor:"pointer", fontSize:"inherit", fontWeight:600, textDecoration:"underline" }}>
                          → Vai al modulo
                        </button>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-semibold w-12 flex-shrink-0" style={{ color:T.slate400 }}>AI Act</span>
                    <span className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor:hasAiClassification ? T.low : T.slate400, opacity:hasAiClassification ? 1 : 0.4 }} />
                    {hasAiClassification ? (
                      <span className="text-xs" style={{ color:T.low }}>Sistemi classificati</span>
                    ) : (
                      <span className="text-xs flex items-center gap-2" style={{ color:T.slate400 }}>
                        Da completare
                        <button onClick={() => router.push("/sistemi")}
                          style={{ color:T.bronze, background:"none", border:"none", padding:0, cursor:"pointer", fontSize:"inherit", fontWeight:600, textDecoration:"underline" }}>
                          → Vai ai sistemi
                        </button>
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ borderTop:`1px solid ${T.slate200}`, padding:"10px 16px" }}>
                  <button
                    onClick={() => router.push("/triage/pubblico")}
                    style={{ fontSize:"13px", color:T.slate400, background:"none", border:"none", padding:0, cursor:"pointer" }}>
                    Aggiorna analisi normativa →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    );
  }

  function renderRemediation() {
    return (
      <div className="flex-1 flex flex-col gap-4 overflow-hidden">

        {/* ── MODAL NUOVA AZIONE */}
        {showAddPlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.6)" }}>
            <div className="w-full max-w-md p-6 space-y-4"
              style={{ background: "var(--ink2)", border: "1px solid var(--line2)", borderRadius: "8px" }}>
              <p className="font-bold uppercase tracking-wider text-sm" style={{ color: T.slate800 }}>
                Nuova Azione Remediation
              </p>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wider" style={{ color: T.slate400 }}>Norma / Codice Controllo *</label>
                <input type="text" value={newPlanForm.control_code}
                  onChange={e => setNewPlanForm(p => ({ ...p, control_code: e.target.value }))}
                  className="w-full px-3 py-2 text-sm outline-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--line2)", borderRadius: "4px", color: T.slate800 }} />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wider" style={{ color: T.slate400 }}>Azione *</label>
                <textarea value={newPlanForm.planned_action}
                  onChange={e => setNewPlanForm(p => ({ ...p, planned_action: e.target.value }))}
                  rows={3} className="w-full px-3 py-2 text-sm resize-none outline-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--line2)", borderRadius: "4px", color: T.slate800 }} />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wider" style={{ color: T.slate400 }}>Responsabile</label>
                <input type="text" value={newPlanForm.responsible}
                  onChange={e => setNewPlanForm(p => ({ ...p, responsible: e.target.value }))}
                  className="w-full px-3 py-2 text-sm outline-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--line2)", borderRadius: "4px", color: T.slate800 }} />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wider" style={{ color: T.slate400 }}>Scadenza</label>
                <input type="date" value={newPlanForm.due_date}
                  onChange={e => setNewPlanForm(p => ({ ...p, due_date: e.target.value }))}
                  className="w-full px-3 py-2 text-sm outline-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--line2)", borderRadius: "4px", color: T.slate800 }} />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => { setShowAddPlan(false); setNewPlanForm({ planned_action: "", responsible: "", due_date: "", control_code: "" }); }}
                  className="text-sm px-4 py-2" style={{ color: T.slate400 }}>
                  Annulla
                </button>
                <button
                  onClick={async () => {
                    if (!triageData || !newPlanForm.control_code || !newPlanForm.planned_action) return;
                    const { error } = await supabase.from("remediation_plans").insert({
                      session_id: triageData.session_id,
                      entity_id: triageData.entity_id,
                      control_code: newPlanForm.control_code,
                      flag_key: newPlanForm.control_code,
                      planned_action: newPlanForm.planned_action,
                      responsible: newPlanForm.responsible || null,
                      due_date: newPlanForm.due_date || null,
                      status: "open",
                    });
                    if (!error) {
                      const { data: planData } = await supabase
                        .from("remediation_plans").select("*")
                        .eq("session_id", triageData.session_id)
                        .order("due_date", { ascending: true });
                      if (planData) setPlans(planData);
                      setShowAddPlan(false);
                      setNewPlanForm({ planned_action: "", responsible: "", due_date: "", control_code: "" });
                    }
                  }}
                  className="text-sm px-5 py-2 font-bold uppercase tracking-widest"
                  style={{ backgroundColor: "var(--shield)", color: "var(--bone)", borderRadius: "4px" }}>
                  Salva
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="border flex flex-col flex-1 overflow-hidden"
          style={{ borderColor: T.slate200, backgroundColor: "var(--ink2)", borderRadius: "4px" }}>
          <div className="px-4 py-3 border-b flex items-center justify-between"
            style={{ borderColor: T.slate200, backgroundColor: T.slate100 }}>
            <div>
              <p className="text-sm font-bold uppercase tracking-wider" style={{ color: T.slate800 }}>Piano di Remediation</p>
              <p className="text-xs" style={{ color: T.slate400 }}>(Remediation Plan) — {plansOpen.length} azioni aperte</p>
            </div>
            <button
              onClick={() => setShowAddPlan(true)}
              className="text-xs px-3 py-1.5 font-bold tracking-widest uppercase transition-colors"
              style={{ backgroundColor: "var(--shield)", color: "var(--bone)", borderRadius: "4px" }}>
              + Aggiungi
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {plans.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm" style={{ color: T.slate400 }}>Nessun piano di remediation. Avvia un triage.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: T.slate100, borderBottom: `1px solid ${T.slate200}`, position: "sticky", top: 0 }}>
                    {["Area", "Azione", "Responsabile", "Scadenza", "PrioritÃ ", "Stato"].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-semibold"
                        style={{ color: T.slate600, fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan, i) => {
                    const days = plan.due_date ? daysTo(plan.due_date) : null;
                    const isLate = days !== null && days < 0;
                    const isUrgent = days !== null && days >= 0 && days <= 14;
                    const isDone = plan.status === "completed";
                    const tipoCompliance = REMEDIATION_TO_COMPLIANCE[plan.control_code];
                    const isResolved = !!(tipoCompliance && complianceItems.find(
                      ci => ci.tipo === tipoCompliance &&
                           (ci.stato === "CONFORME" || ci.stato === "DICHIARATO")
                    ));
                    return (
                      <tr key={plan.id}
                        style={{
                          borderBottom: `1px solid ${T.slate200}`,
                          backgroundColor: isResolved
                            ? "rgba(62,207,142,0.05)"
                            : isDone ? T.slate100 : i % 2 === 0 ? "var(--ink2)" : T.slate100,
                          opacity: isDone ? 0.6 : 1,
                        }}>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: T.slate100, color: T.slate600, fontSize: "12px" }}>
                            {getFlagFramework(plan.flag_key)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="leading-snug" style={{ color: T.slate800 }}>{getDirectorContent(plan.flag_key).title}</p>
                          {isResolved && (
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded mt-1 inline-block"
                              style={{ backgroundColor: T.lowBg, color: T.low, fontSize: "12px" }}>
                              ✓ Adempimento completato in Struttura
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs" style={{ color: T.slate600 }}>{plan.responsible ?? "—"}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded"
                            style={{ backgroundColor: isDone ? T.lowBg : isLate ? T.critBg : isUrgent ? T.highBg : T.slate100, color: isDone ? T.low : isLate ? T.critical : isUrgent ? T.high : T.slate600 }}>
                            {isDone ? "✓" : isLate ? "SCADUTA" : days !== null ? `${days}gg` : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-bold uppercase px-2 py-0.5 rounded"
                            style={{ backgroundColor: T.highBg, color: T.high, fontSize: "12px" }}>
                            ALTA
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            disabled={isResolved}
                            className="text-xs border px-2 py-1 rounded"
                            style={{ borderColor: T.slate200, color: T.slate600, backgroundColor: "var(--ink2)", fontSize: "13px", opacity: isResolved ? 0.5 : 1, cursor: isResolved ? "not-allowed" : "default" }}
                            value={plan.status}
                            onChange={async (e) => {
                              const newStatus = e.target.value;
                              await supabase
                                .from("remediation_plans")
                                .update({
                                  status: newStatus,
                                  ...(newStatus === "completed" && {
                                    completed_at: new Date().toISOString(),
                                    completed_by: profile?.email,
                                  }),
                                })
                                .eq("id", plan.id);
                              setPlans(prev => prev.map(p =>
                                p.id === plan.id ? { ...p, status: newStatus } : p
                              ));
                            }}>
                            <option value="open">Aperto</option>
                            <option value="in_progress">In corso</option>
                            <option value="completed">Completato</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Upgrade tier */}
        {profile?.tier === "free" || profile?.tier === "silver" ? (
          <div className="border px-5 py-4 flex items-center justify-between gap-4"
            style={{ borderColor: T.bronze, backgroundColor: T.bronzeBg, borderRadius: "4px" }}>
            <div>
              <p className="text-sm font-bold" style={{ color: T.slate800 }}>
                Sblocca Remediation Avanzata
              </p>
              <p className="text-xs mt-0.5" style={{ color: T.slate600 }}>
                Upload evidenze documentali, alert email scadenze, report avanzamento per CdA.
              </p>
            </div>
            <button className="text-xs px-4 py-2 font-bold tracking-widest uppercase flex-shrink-0"
              style={{ backgroundColor: T.bronze, color: T.navy, borderRadius: "4px" }}>
              Upgrade →
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  function renderScadenze() {
    return (
      <div className="flex-1 border overflow-hidden flex flex-col"
        style={{ borderColor: T.slate200, backgroundColor: "var(--ink2)", borderRadius: "4px" }}>
        <div className="px-4 py-3 border-b"
          style={{ borderColor: T.slate200, backgroundColor: T.slate100 }}>
          <p className="text-sm font-bold uppercase tracking-wider" style={{ color: T.slate800 }}>Scadenze Normative</p>
          <p className="text-xs" style={{ color: T.slate400 }}>(Regulatory Deadlines)</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: T.slate100, borderBottom: `1px solid ${T.slate200}` }}>
                {["Norma", "Adempimento", "Scadenza", "Stato"].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left font-semibold"
                    style={{ color: T.slate600, fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scadenze.map((s, i) => {
                const days    = daysTo(s.date);
                const scaduta = s.scaduta || days < 0;
                const urgente = !scaduta && days <= 90;

                // AI Act: logica separata basata su FRIA
                const isAiAct = s.norma === "AI Act";
                let isCompleted  = false;
                let isDichiarato = false;
                if (isAiAct) {
                  isCompleted = aiActConforme;
                } else {
                  const tipo      = getScadenzaTipo(s);
                  const compStatus = tipo ? complianceItems.find(ci => ci.tipo === tipo)?.stato : null;
                  isDichiarato = compStatus === "DICHIARATO";
                  isCompleted  = compStatus === "CONFORME" || isDichiarato;
                }

                return (
                  <tr key={s.norma + s.desc}
                    style={{ borderBottom: `1px solid ${T.slate200}`, backgroundColor: i % 2 === 0 ? "var(--ink2)" : T.slate100 }}>
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-sm" style={{ color: T.bronze }}>{s.norma}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p style={{ color: T.slate800 }}>{s.desc}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs" style={{ color: T.slate600 }}>
                        {new Date(s.date).toLocaleDateString("it-IT")}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {isCompleted ? (
                        <span className="text-xs font-bold px-2 py-1 rounded"
                          style={{
                            backgroundColor: isAiAct ? T.lowBg : isDichiarato ? T.medBg : T.lowBg,
                            color:           isAiAct ? T.low  : isDichiarato ? T.medium : T.low,
                          }}>
                          {isAiAct ? "✓ In gestione" : isDichiarato ? "DICHIARATO" : "✓ Completato"}
                        </span>
                      ) : (
                        <span className="text-xs font-bold px-2 py-1 rounded"
                          style={{ backgroundColor: scaduta ? T.critBg : urgente ? T.highBg : T.lowBg, color: scaduta ? T.critical : urgente ? T.high : T.low }}>
                          {scaduta ? "SCADUTA" : urgente ? `${days}gg` : "OK"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderStruttura() {
    return (
      <div className="flex-1 flex flex-col gap-4">
        <div className="border p-6"
          style={{ borderColor: T.slate200, backgroundColor: "var(--ink2)", borderRadius: "4px" }}>
          <p className="text-sm font-bold uppercase tracking-wider mb-4" style={{ color: T.slate800 }}>
            Dati della Struttura
          </p>
          {triageData ? (
            <div className="grid grid-cols-4 gap-4">
              {[
                ["Struttura", triageData.entity_name],
                ["Tipologia", triageData.entity_type],
                ["Regione", triageData.region],
                ["Posti letto", triageData.total_beds?.toString() ?? "—"],
              ].map(([k, v]) => (
                <div key={k} className="border p-3"
                  style={{ borderColor: T.slate200, backgroundColor: T.slate100, borderRadius: "4px" }}>
                  <p className="text-xs uppercase tracking-wider mb-1" style={{ color: T.slate400, fontSize: "12px" }}>{k}</p>
                  <p className="font-semibold" style={{ color: T.slate800 }}>{v}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm" style={{ color: T.slate400 }}>Nessuna struttura configurata.</p>
          )}
          <button
            onClick={() => router.push("/profilo")}
            className="text-xs mt-4"
            style={{ color: T.bronze }}>
            Modifica dati struttura →
          </button>
        </div>
      </div>
    );
  }

  // ─── RENDER
  return (
    <AppShell
      profile={profile}
      activeRoute="/dashboard"
      score={band ? { value: displayScore, label: band.label, color: band.color, bg: band.bg } : null}
      openActionsCount={plansOpen.length}
      alertsSlot={
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "1.5rem 1rem", gap: 0 }}>

          {/* Label top */}
          <div style={{ fontSize: 11, color: T.slate400, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
            Verso la superficie
          </div>

          {/* SVG Periscopio */}
          <svg width="120" viewBox="0 0 120 340" style={{ overflow: "visible" }}>

            <defs>
              <clipPath id="tube-clip">
                <rect x="35" y="20" width="50" height="280" rx="25"/>
              </clipPath>
            </defs>

            {/* Tubo */}
            <rect x="35" y="20" width="50" height="280" rx="25"
              fill="var(--ink2)"
              stroke="var(--line2)" strokeWidth="0.5"/>

            {/* Fill acqua */}
            <rect
              x="35"
              y={300 - Math.round((progressoDocumenti.completati / Math.max(progressoDocumenti.totali, 1)) * 260)}
              width="50"
              height={Math.round((progressoDocumenti.completati / Math.max(progressoDocumenti.totali, 1)) * 260)}
              clipPath="url(#tube-clip)"
              fill="#1D9E75"/>

            {/* Onda superficie acqua */}
            <g clipPath="url(#tube-clip)">
              <rect
                x="35"
                y={298 - Math.round((progressoDocumenti.completati / Math.max(progressoDocumenti.totali, 1)) * 260)}
                width="50" height="8" fill="#0F6E56" opacity="0.6"/>
            </g>

            {/* Tacche scala */}
            {([75, 50, 25] as const).map((val) => {
              const y = 20 + ((100 - val) / 100) * 280;
              return (
                <g key={val}>
                  <line x1="40" y1={y} x2="48" y2={y}
                    stroke="var(--line2)" strokeWidth="0.5"/>
                  <text x="33" y={y + 3} textAnchor="end" fontSize="9"
                    fill={T.slate400} fontFamily="DM Sans, system-ui">
                    {val}%
                  </text>
                </g>
              );
            })}

            {/* Label SUPERFICIE e FONDO */}
            <text x="60" y="16" textAnchor="middle" fontSize="9"
              fill={T.slate400} fontFamily="DM Sans, system-ui">SUPERFICIE</text>
            <text x="60" y="320" textAnchor="middle" fontSize="9"
              fill={T.slate400} fontFamily="DM Sans, system-ui">FONDO</text>

            {/* Testa periscopio — si muove con il livello */}
            <g transform={`translate(60, ${300 - Math.round((progressoDocumenti.completati / Math.max(progressoDocumenti.totali, 1)) * 260)})`}>
              <rect x="-18" y="-8" width="36" height="16" rx="8"
                fill="#0F6E56" stroke="#085041" strokeWidth="0.5"/>
              <circle cx="-6" cy="0" r="5" fill="#085041"/>
              <circle cx="6"  cy="0" r="5" fill="#085041"/>
              <circle cx="-6" cy="0" r="3" fill="#1D9E75"/>
              <circle cx="6"  cy="0" r="3" fill="#1D9E75"/>
            </g>

            {/* Tubo superiore */}
            <rect x="52" y="8" width="16" height="16" rx="3"
              fill="var(--ink2)" stroke="var(--line2)" strokeWidth="0.5"/>
            <rect x="48" y="3" width="24" height="8" rx="3"
              fill="var(--ink2)" stroke="var(--line2)" strokeWidth="0.5"/>

          </svg>

          {/* Contatore */}
          <div style={{ fontSize: 28, fontWeight: 500, color: "var(--bone)", textAlign: "center", marginTop: 8 }}>
            {progressoDocumenti.completati}
          </div>
          <div style={{ fontSize: 12, color: T.slate400, textAlign: "center", marginTop: 4 }}>
            / {progressoDocumenti.totali} documenti completati
          </div>

          {/* Divider */}
          <div style={{ width: 80, height: "0.5px", background: "var(--line2)", margin: "14px 0" }}/>

          {/* Percentuale */}
          <div style={{ fontSize: 22, fontWeight: 500, color: "#1D9E75", textAlign: "center" }}>
            {Math.round((progressoDocumenti.completati / Math.max(progressoDocumenti.totali, 1)) * 100)}%
          </div>
          <div style={{ fontSize: 12, color: T.slate400, textAlign: "center", marginTop: 4, lineHeight: 1.5 }}>
            verso la conformità
          </div>

          {/* Link storia */}
          <div
            style={{ fontSize: 12, color: "#0F6E56", cursor: "pointer", marginTop: 14, display: "flex", alignItems: "center", gap: 4 }}
            onClick={() => router.push("/storia")}
          >
            Vedi storia completa →
          </div>

        </div>
      }
    >

      {/* ── MODAL AUTOCERTIFICA */}
      {autocertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="w-full max-w-md p-6 space-y-4" style={{ background: "var(--ink2)", border: "1px solid var(--line2)", borderRadius: "8px" }}>
            <p className="font-bold uppercase tracking-wider text-sm" style={{ color: T.slate800 }}>Autocertificazione</p>
            <p className="text-sm leading-relaxed" style={{ color: T.slate600 }}>
              Dichiaro sotto mia responsabilitÃ  che{" "}
              <strong style={{ color: T.slate800 }}>{autocertModal.item.label ?? autocertModal.item.flag_key}</strong>{" "}
              Ã¨ stato adempiuto alla data odierna ({new Date().toLocaleDateString("it-IT")}).
            </p>
            <div className="space-y-1">
              <label className="text-xs uppercase tracking-wider" style={{ color: T.slate400 }}>Note facoltative</label>
              <textarea
                value={autocertNote}
                onChange={e => setAutocertNote(e.target.value)}
                rows={3}
                placeholder="Es: DPA firmato, archiviato in cartella condivisa..."
                className="w-full px-3 py-2 text-sm resize-none outline-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--line2)", borderRadius: "4px", color: T.slate800 }}
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => { setAutocertModal(null); setAutocertNote(""); }}
                className="text-sm px-4 py-2"
                style={{ color: T.slate400 }}
              >
                Annulla
              </button>
              <button
                disabled={autocertLoading}
                onClick={async () => {
                  if (!triageData || !autocertModal) return;
                  const currentModal = autocertModal;
                  setAutocertLoading(true);
                  try {
                    await supabase.rpc("fn_sync_remediation_on_compliance", {
                      p_entity_id: triageData.entity_id,
                      p_flag_key: currentModal.item.flag_key,
                      p_new_status: "DICHIARATO",
                    });
                    setRemediationOpen(prev => prev.filter(r => r.id !== currentModal.item.id));
                    setAutocertModal(null);
                    setAutocertNote("");
                  } finally {
                    setAutocertLoading(false);
                  }
                }}
                className="text-sm px-5 py-2 font-bold uppercase tracking-widest"
                style={{ backgroundColor: "var(--shield)", color: "var(--bone)", borderRadius: "4px", opacity: autocertLoading ? 0.6 : 1 }}
              >
                {autocertLoading ? "Salvataggio..." : "Confermo →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ACTION MODAL */}
      {actionModalPlan && entityId && profile?.id && (
        <ActionModal
          plan={actionModalPlan as any}
          entityId={entityId}
          companyId={companyId}
          userId={profile.id}
          entityFullData={triageData && entityNominativi ? {
            entity_name:           triageData.entity_name,
            entity_type:           triageData.entity_type,
            region:                triageData.region,
            total_beds:            triageData.total_beds,
            nome_dpo:              entityNominativi.nome_dpo,
            email_dpo:             entityNominativi.email_dpo,
            dpo_qualifica:         entityNominativi.dpo_qualifica,
            dpo_telefono:          entityNominativi.dpo_telefono,
            responsabile_it:       entityNominativi.responsabile_it,
            email_responsabile_it: entityNominativi.email_responsabile_it,
            referente_breach:      entityFullData?.referente_breach ?? null,
            website_url:           entityFullData?.website_url ?? null,
          } as any : null}
          companyData={companyData as any}
          onClose={() => setActionModalPlan(null)}
          onUpdate={loadData}
        />
      )}

      {/* CENTRO */}
      <main id="main-content" className="clavis-workspace flex-1 flex flex-col overflow-hidden p-4">
          {needsOnboarding && (
            <div className="mb-4 p-4 flex items-center justify-between gap-4 flex-shrink-0"
              style={{ backgroundColor: "rgba(217,178,90,.12)", border: "1px solid rgba(217,178,90,.3)", borderRadius: "4px" }}>
              <div>
                <p className="text-sm font-bold leading-relaxed" style={{ color: "#D9B25A" }}>
                  Completa la configurazione
                </p>
                <p className="text-xs leading-relaxed" style={{ color: "#9AA3BD" }}>
                  Per utilizzare CLAVIS Ã¨ necessario indicare i dati della tua societÃ  e struttura.
                </p>
              </div>
              <a
                href="/onboarding"
                className="text-xs font-bold px-4 py-2 flex-shrink-0"
                style={{ backgroundColor: "#D9B25A", color: "#080c14", borderRadius: "4px" }}
              >
                Configura ora →
              </a>
            </div>
          )}
          {plansAnomalie.length > 0 && (
            <div className="mb-3 px-4 py-2.5 border flex items-center gap-3 flex-shrink-0"
              style={{ backgroundColor: "rgba(232,99,74,.08)", borderColor: "rgba(232,99,74,.3)", borderRadius: "4px" }}>
              <span style={{ color: T.critical }}>⚠</span>
              <p className="text-xs flex-1" style={{ color: T.critical }}>
                <strong>{plansAnomalie.length} azioni</strong> hanno scadenza superiore a 200 giorni —
                verificare che le date siano corrette.
              </p>
              <button onClick={() => router.push("/remediation")}
                className="text-xs font-bold uppercase tracking-wider px-3 py-1"
                style={{ border: "1px solid rgba(232,99,74,.4)", color: T.critical, borderRadius: "4px" }}>
                Verifica →
              </button>
            </div>
          )}
          {/* Breadcrumb / tab header */}
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <div>
              <p className="font-bold text-base uppercase tracking-wider" style={{ color: T.slate800 }}>
                {activeNav === "overview" ? "Panoramica" :
                  activeNav === "remediation" ? "Piano di Remediation" :
                  activeNav === "scadenze" ? "Scadenze Normative" : "Struttura"}
              </p>
              <p className="text-xs" style={{ color: T.slate400 }}>
                {activeNav === "overview" ? "(Overview)" :
                  activeNav === "remediation" ? "(Remediation Plan)" :
                  activeNav === "scadenze" ? "(Regulatory Deadlines)" : "(Facility Data)"}
              </p>
            </div>
            <p className="text-xs font-mono" style={{ color: T.slate400 }}>
              Aggiornato: {triageData ? new Date(triageData.completed_at).toLocaleDateString("it-IT") : "—"}
            </p>
          </div>

          {/* Contenuto tab */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {activeNav === "overview"    && renderOverview()}
            {activeNav === "remediation" && renderRemediation()}
            {activeNav === "scadenze"    && renderScadenze()}
            {activeNav === "struttura"   && renderStruttura()}
          </div>
        </main>

      {/* ── MODAL GENERA DOCUMENTO */}
      {generateModalFlag && triageData && companyData && (
        <>
          {console.log("[JSX] GenerateDocModal montato con flag:", generateModalFlag, "key:", generateModalKey) as unknown as null}
          <GenerateDocModal
          flagKey={generateModalFlag}
          modalKey={generateModalKey ?? undefined}
          entity={{
            entity_name:           triageData.entity_name,
            entity_type:           triageData.entity_type,
            region:                triageData.region,
            total_beds:            triageData.total_beds,
            legale_rappresentante: companyData.legale_rappresentante         ?? null,
            nome_dpo:              entityNominativi?.nome_dpo              ?? null,
            email_dpo:             entityNominativi?.email_dpo             ?? null,
            dpo_qualifica:         entityNominativi?.dpo_qualifica         ?? null,
            dpo_telefono:          entityNominativi?.dpo_telefono          ?? null,
            responsabile_it:       entityNominativi?.responsabile_it       ?? null,
          }}
          company={companyData}
          onClose={() => {
            console.log("[dashboard] GenerateDocModal onClose — flag:", generateModalFlag, "key:", generateModalKey);
            setGenerateModalFlag(null);
            setGenerateModalKey(null);
          }}
        />
        </>
      )}

      {/* ── MODAL EMAIL FORNITORI */}
      {emailModalOpen && triageData && companyData && entityId && (
        <EmailBuilderModal
          flagsAperti={remediationOpen.map(r => ({ flag_key: r.flag_key }))}
          entityId={entityId}
          entity={{
            entity_name:           triageData.entity_name,
            entity_type:           triageData.entity_type,
            region:                triageData.region,
            total_beds:            triageData.total_beds,
            legale_rappresentante: companyData.legale_rappresentante         ?? null,
            nome_dpo:              entityNominativi?.nome_dpo              ?? null,
            email_dpo:             entityNominativi?.email_dpo             ?? null,
            dpo_qualifica:         entityNominativi?.dpo_qualifica         ?? null,
            dpo_telefono:          entityNominativi?.dpo_telefono          ?? null,
            responsabile_it:       entityNominativi?.responsabile_it       ?? null,
          }}
          company={companyData}
          onClose={() => setEmailModalOpen(false)}
        />
      )}

    </AppShell>
  );
}
