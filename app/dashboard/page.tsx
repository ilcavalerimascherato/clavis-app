"use client";

/**
 * CLAVIS — Dashboard v2.0
 * Palette: Institutional Shield (--ink dark / --bone light / --shield blue)
 * Semaforo: --warn / --gold / --emerald (dark palette)
 * Layout: sidebar collassabile | centro densità alta | destra alerts
 * Regola: tutto above the fold, nessuno scroll per trovare info critiche
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { calcScoreCompliance } from "@/app/struttura/page";
import { EntitySelector } from "@/components/EntitySelector";
import { useActiveEntity } from "@/contexts/EntityContext";
import { GenerateDocModal } from "@/components/GenerateDocModal";
import { EmailBuilderModal } from "@/components/EmailBuilderModal";
import LEGAL_DICT from "@/config/legal_dictionary.json";
import { getShortcutConfig, getShortcutLabel, getShortcutType, getShortcutColor } from "@/lib/shortcutMap";
import { StepFlowModal } from "@/components/StepFlowModal";
import { ActionModal } from "@/components/ActionModal";

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

// ─── DESIGN TOKENS — dark palette
const T = {
  navy:      "#0A0E1A",
  navyLight: "#0F1424",
  slate50:   "#0F1424",
  slate100:  "#141B30",
  slate200:  "rgba(238,241,248,.16)",
  slate400:  "#9AA3BD",
  slate600:  "#9AA3BD",
  slate800:  "#EEF1F8",
  bronze:    "#D9B25A",
  bronzeBg:  "rgba(217,178,90,.12)",
  gold:      "#D9B25A",
  critical:  "#E8634A",
  critBg:    "rgba(232,99,74,.12)",
  high:      "#5E86F5",
  highBg:    "rgba(94,134,245,.12)",
  medium:    "#D9B25A",
  medBg:     "rgba(217,178,90,.12)",
  low:       "#3ECF8E",
  lowBg:     "rgba(62,207,142,.10)",
};

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

function getBandTokens(score: number) {
  if (score >= 75) return { color: T.critical, textColor: T.critical, bg: T.critBg, label: "CRITICO",   border: T.critical };
  if (score >= 50) return { color: T.high,     textColor: T.gold,     bg: T.highBg, label: "ALTO",      border: T.high     };
  if (score >= 25) return { color: T.medium,   textColor: T.medium,   bg: T.medBg,  label: "MEDIO",     border: T.medium   };
  return               { color: T.low,      textColor: T.low,      bg: T.lowBg,  label: "CONTENUTO", border: T.low      };
}

function getBarColor(risk: number): string {
  if (risk >= 70) return T.critical;
  if (risk >= 50) return T.gold;
  if (risk >= 30) return T.medium;
  return T.low;
}

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
  const dmyMatch = lower.match(/^(\d{1,2})\s+([a-zàèéìòùÀÈÉÌÒÙ]+)\s+(\d{4})/);
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

// ─── NAV ITEM sidebar
function NavItem({ icon, label, active, onClick, badge, collapsed }: {
  icon: string; label: string; active?: boolean; onClick: () => void;
  badge?: number; collapsed?: boolean;
}) {
  return (
    <button onClick={onClick}
      title={collapsed ? label : undefined}
      className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all text-sm"
      style={{
        backgroundColor: active ? "rgba(58,109,240,.12)" : undefined,
        color: active ? "var(--bone)" : "var(--bone-dim)",
        borderLeft: active ? "3px solid var(--shield-soft)" : "3px solid transparent",
        fontWeight: active ? 600 : 400,
      }}>
      <span className="text-base w-4 text-center flex-shrink-0">{icon}</span>
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {!collapsed && badge !== undefined && badge > 0 && (
        <span className="text-xs font-mono px-1.5 py-0.5 rounded text-white"
          style={{ backgroundColor: T.critical, fontSize: "10px" }}>
          {badge}
        </span>
      )}
    </button>
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
        <span className="text-xs font-mono" style={{ color: T.slate400, fontSize: "10px" }}>{framework}</span>
        <span className="text-xs font-bold uppercase" style={{ color: b.color, fontSize: "10px" }}>{b.label}</span>
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pendingTriageSession, setPendingTriageSession] = useState<string | null>(null);
  const [triageImporting, setTriageImporting] = useState(false);
  const [showTriageChoice, setShowTriageChoice] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
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
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const saved = localStorage.getItem("clavis_pending_triage_session");
      if (saved) {
        setPendingTriageSession(saved);
        return;
      }

      const storedEntityId = localStorage.getItem("clavis_active_entity_id");

      const entityCheckQuery = storedEntityId
        ? supabase.from("entities").select("id").eq("id", storedEntityId).limit(1)
        : supabase.from("entities").select("id").eq("created_by", user.id).limit(1);
      const { data: entityCheck } = await entityCheckQuery;
      if (!entityCheck || entityCheck.length === 0) { router.push("/onboarding"); return; }

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

        // Broker check — categoria è in suppliers (join su fornitore_id → supplier_registry.id)
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
  }, [supabase, router]); // supabase è stabile (useMemo), router è stabile (Next.js)

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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleSignout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function handleImportTriage() {
    if (!pendingTriageSession) return;
    setTriageImporting(true);
    const sessionToImport = pendingTriageSession;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: rpcResult, error: rpcError } = await supabase.rpc("fn_migrate_anonymous_session", {
        p_anonymous_id: sessionToImport,
        p_user_id: user.id,
      });

      console.log("RPC result:", JSON.stringify(rpcResult));
      console.log("RPC error:", JSON.stringify(rpcError));

      localStorage.removeItem("clavis_pending_triage_session");
      setPendingTriageSession(null);
      setShowTriageChoice(false);
      await loadData();
    } finally {
      setTriageImporting(false);
    }
  }

  function handleStartFresh() {
    localStorage.removeItem("clavis_pending_triage_session");
    setPendingTriageSession(null);
    setShowTriageChoice(true);
  }

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

  // AI Act: conformità valutata su FRIA + punteggio S2 (non su NOMINA_AI_OFFICER)
  const friaItem   = complianceItems.find(ci => ci.tipo === "FRIA");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s2q1Score  = (((triageData?.answers as any)?.S2 as number[] | undefined)?.[0] ?? 0) as number;
  const aiActConforme =
    s2q1Score >= 75 ||
    friaItem?.stato === "VERIFICATO" ||
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
            <span className="text-2xl">📋</span>
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

    return (
      <div className="flex-1 flex flex-col gap-4 overflow-hidden">

        {/* RIGA 1 — Score + 6 sezioni + Radar */}
        <div className="flex gap-4" style={{ minHeight: 0 }}>

          {/* Score compatto */}
          <div className="flex-shrink-0 w-44 p-4 flex flex-col justify-between"
            style={{ backgroundColor: "var(--ink2)", border: "1px solid var(--line2)", borderRadius: "4px", borderLeftWidth: "4px", borderLeftColor: band.color, borderLeftStyle: "solid" }}>
            <div>
              <p className="text-xs font-mono uppercase tracking-widest" style={{ color: T.slate600 }}>
                Score Composito
              </p>
              <p className="text-6xl font-mono font-black leading-none mt-1" style={{ color: band.textColor }}>
                {riskScoreCombinato ?? triageData.risk_score}
              </p>
              <p className="text-xs font-mono mt-0.5" style={{ color: T.slate400 }}>/100 punti</p>
              <p className="text-sm font-black uppercase tracking-wider mt-2" style={{ color: band.textColor }}>
                RISCHIO {band.label}
              </p>
              <div style={{ fontSize: "11px", color: "var(--bone-dim)", marginTop: "4px", display: "flex", gap: "12px", flexWrap: "nowrap" }}>
                <span>Triage: {triageData?.risk_score ?? "—"}</span>
                <span style={{ marginLeft: "8px" }}>Documentale: {scoreDocumentale ?? "—"}</span>
              </div>
            </div>
            <div className="space-y-1.5 mt-3">
              {triageData.score_delta !== null && triageData.score_delta !== 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-mono font-bold"
                    style={{ color: triageData.score_delta > 0 ? T.low : T.critical }}>
                    {triageData.score_delta > 0 ? `↓ -${triageData.score_delta}` : `↑ +${Math.abs(triageData.score_delta)}`}
                  </span>
                  <span className="text-xs" style={{ color: T.slate400 }}>vs precedente</span>
                </div>
              )}
              <p className="text-xs font-mono" style={{ color: T.slate400 }}>
                {new Date(triageData.completed_at).toLocaleDateString("it-IT")}
              </p>
              <button onClick={() => router.push("/triage/autenticato")}
                className="text-xs font-semibold underline mt-1 transition-colors"
                style={{ color: T.bronze }}>
                Aggiorna →
              </button>
            </div>
          </div>

          {/* 6 sezioni in griglia 2x3 */}
          <div className="flex-1 grid grid-cols-3 grid-rows-2 gap-2">
            {SECTIONS_META.map((s, i) => (
              <RiskPill key={s.id} risk={sectionRisks[i]} label={s.label} framework={s.framework} />
            ))}
          </div>

          {/* Radar compatto */}
          <div className="flex-shrink-0 w-44 p-2 flex flex-col"
            style={{ backgroundColor: "var(--ink2)", border: "1px solid var(--line2)", borderRadius: "4px" }}>
            <p className="text-xs uppercase tracking-widest mb-1 px-1"
              style={{ color: "var(--bone-dim)", fontFamily: "monospace", fontSize: "9px" }}>
              Mappa Rischio
            </p>
            <div className="flex-1">
              <CompactRadar answers={triageData.answers} />
            </div>
          </div>
        </div>

        {/* ── PROSSIMO PASSO */}
        {(() => {
          const completedCount = remediationAll.filter(r => r.status === "completed").length;
          const totalCount = remediationAll.length;
          const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
          const progressBarColor = progressPct > 50 ? T.low : progressPct > 25 ? T.medium : T.critical;
          const mainAction = sortedRemediation[0] ?? null;
          const nextActions = sortedRemediation.slice(1, 4);

          if (totalCount === 0) return (
            <div className="border px-5 py-3 flex items-center justify-between gap-4 flex-shrink-0"
              style={{ borderColor: T.high, backgroundColor: T.highBg, borderRadius: "4px", borderLeftWidth: "3px", borderLeftStyle: "solid" }}>
              <div>
                <p className="text-sm font-bold uppercase tracking-wider" style={{ color: T.slate800 }}>Il tuo Prossimo Passo</p>
                <p className="text-xs mt-1" style={{ color: T.slate400 }}>Completa il triage per generare il tuo piano di remediation.</p>
              </div>
              <button onClick={() => router.push("/triage/autenticato")}
                className="text-xs px-4 py-2 font-bold tracking-widest uppercase flex-shrink-0"
                style={{ backgroundColor: "var(--shield)", color: "var(--bone)", borderRadius: "4px" }}>
                Avvia Triage →
              </button>
            </div>
          );

          if (!mainAction) return (
            <div className="border px-5 py-3 flex-shrink-0"
              style={{ borderColor: T.low, backgroundColor: T.lowBg, borderRadius: "4px", borderLeftWidth: "3px", borderLeftStyle: "solid" }}>
              <p className="text-sm font-bold" style={{ color: T.low }}>
                Nessuna azione aperta. Mantieni il presidio e monitora le scadenze.
              </p>
            </div>
          );

          return (
            <div className="border flex-shrink-0"
              style={{ borderColor: T.slate200, backgroundColor: "var(--ink2)", borderRadius: "4px" }}>

              {/* Header + progress bar */}
              <div className="px-4 py-2.5 border-b flex items-center justify-between gap-4"
                style={{ borderColor: T.slate200, backgroundColor: T.slate100 }}>
                <div>
                  <p className="text-sm font-bold uppercase tracking-wider" style={{ color: T.slate800 }}>
                    Il tuo Prossimo Passo
                  </p>
                  <p className="text-xs" style={{ color: T.slate400 }}>(Next Action)</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <p className="text-xs font-mono" style={{ color: T.slate400 }}>
                    {completedCount}/{totalCount} completate
                  </p>
                  <div className="w-20 h-1.5 rounded-full" style={{ backgroundColor: T.slate200 }}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${progressPct}%`, backgroundColor: progressBarColor }} />
                  </div>
                </div>
              </div>

              {/* Card azione principale */}
              <div className="px-4 py-3 border-b"
                style={{ borderColor: T.slate200, borderLeftWidth: "3px", borderLeftColor: priorityColor(mainAction.priority), borderLeftStyle: "solid" }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1.5 min-w-0">
                    {(() => {
                      const dc = getDirectorContent(mainAction.flag_key);
                      return (
                        <>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0"
                              style={{ backgroundColor: priorityColor(mainAction.priority) + "22", color: priorityColor(mainAction.priority), fontSize: "10px" }}>
                              {mainAction.priority ?? "ALTA"}
                            </span>
                            <p className="text-sm font-semibold truncate" style={{ color: T.slate800 }}>
                              {dc.title}
                            </p>
                          </div>
                          {dc.desc && (
                            <p className="text-xs leading-snug" style={{ color: T.slate400 }}>
                              {dc.desc}
                            </p>
                          )}
                          {dc.shortcut && (
                            <p className="text-xs leading-relaxed"
                              style={{ color: "var(--shield-soft, #7BA7D4)" }}>
                              → {dc.shortcut}
                            </p>
                          )}
                          <div className="flex items-center gap-3 text-xs flex-wrap" style={{ color: T.slate400 }}>
                            {mainAction.responsible && <span>→ {mainAction.responsible}</span>}
                            {mainAction.deadline_label && (
                              <span className="font-mono">Entro: {mainAction.deadline_label}</span>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    {/* Banner dipendenze flag (requires) non soddisfatte */}
                    {(() => {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const dict = LEGAL_DICT as any;
                      const requires: string[] = dict.flags?.[mainAction.flag_key]?.requires ?? [];
                      const unmetDeps = requires.filter((req: string) =>
                        !remediationAll.some(r => r.flag_key === req && r.status === "completed")
                      );
                      if (unmetDeps.length === 0) return null;
                      const depLabels = unmetDeps.map((req: string) =>
                        dict.flags?.[req]?.title_director ?? req
                      ).join(", ");
                      return (
                        <div className="p-3 text-sm" style={{
                          background: "rgba(217,178,90,0.08)",
                          border: "1px solid rgba(217,178,90,0.3)",
                          color: "var(--gold)",
                          borderRadius: "4px",
                        }}>
                          ⚠ Prima completa: <strong>{depLabels}</strong>
                        </div>
                      );
                    })()}

                    {/* Bottone scorciatoia / Banner prerequisiti dati */}
                    {(() => {
                      const checkResult = checkRequiresData(
                        mainAction.flag_key,
                        entityFullData,
                        companyData,
                        remediationAll,
                        supplierCount,
                        hasSupplierBroker,
                      );

                      if (!checkResult.ready) {
                        // Raggruppa per href per mostrare un bottone per destinazione
                        const byHref = checkResult.missing.reduce<Record<string, string[]>>((acc, m) => {
                          if (!acc[m.href]) acc[m.href] = [];
                          acc[m.href].push(m.label);
                          return acc;
                        }, {});
                        const hrefLabel: Record<string, string> = {
                          "/fornitori":   "Registro Fornitori",
                          "/anagrafica":  "Anagrafica Struttura",
                          "/remediation": "Piano Remediation",
                        };
                        return (
                          <div className="space-y-2 max-w-xs">
                            <div className="p-3" style={{
                              background: "rgba(217,178,90,0.10)",
                              border: "1px solid rgba(217,178,90,0.35)",
                              borderRadius: "4px",
                            }}>
                              <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--gold)" }}>
                                ⚠ Prima completa:
                              </p>
                              <ul className="space-y-0.5">
                                {checkResult.missing.map(m => (
                                  <li key={m.key} className="text-xs" style={{ color: "var(--gold)", opacity: 0.85 }}>
                                    · {m.label}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div className="flex flex-col gap-1">
                              {Object.entries(byHref).map(([href, labels]) => (
                                <button key={href}
                                  onClick={() => router.push(href)}
                                  className="px-3 py-2 text-xs font-bold uppercase tracking-widest text-left whitespace-nowrap"
                                  style={{ border: "1px solid rgba(217,178,90,0.5)", color: "var(--gold)", borderRadius: "4px" }}
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

                      if (cfg.type === "generate") {
                        return (
                          <div className="flex flex-col gap-1.5">
                            <button
                              onClick={() => {
                                setGenerateModalFlag(mainAction.flag_key);
                                setGenerateModalKey(cfg.modal_key ?? null);
                              }}
                              className="px-4 py-2 text-sm font-bold uppercase tracking-widest transition-colors whitespace-nowrap"
                              style={{ backgroundColor: "var(--emerald, #3ECF8E)", color: "#0A1A12", borderRadius: "4px" }}>
                              → {cfg.label}
                            </button>
                            <button
                              onClick={() => setActionModalPlan(mainAction)}
                              className="px-4 py-2 text-sm font-bold uppercase tracking-widest transition-colors whitespace-nowrap"
                              style={{ border: "1px solid var(--shield, #3A6DF0)", color: "var(--shield-soft, #7BA7D4)", borderRadius: "4px" }}>
                              → Acquisisci documento esistente
                            </button>
                          </div>
                        );
                      }

                      return (
                        <button
                          onClick={() => {
                            if (cfg.type === "email") {
                              setEmailModalOpen(true);
                            } else if (cfg.type === "fornitori") {
                              router.push(cfg.url ?? "/fornitori");
                            } else if (cfg.type === "checklist") {
                              // funzionalità in arrivo — non fare nulla per ora
                            } else if (cfg.type === "external") {
                              window.open(cfg.url, "_blank");
                            } else {
                              setActionModalPlan(mainAction);
                            }
                          }}
                          className="px-4 py-2 text-sm font-bold uppercase tracking-widest transition-colors whitespace-nowrap"
                          style={{
                            backgroundColor: btnColor === "green" ? "var(--emerald, #3ECF8E)" : "var(--shield, #3A6DF0)",
                            color: btnColor === "green" ? "#0A1A12" : "var(--bone, #EEF1F8)",
                            borderRadius: "4px",
                          }}>
                          → {label}
                        </button>
                      );
                    })()}

                    {/* Autocertifica — sempre presente, con badge warning */}
                    <button
                      onClick={() => handleAutocertifica(mainAction.flag_key)}
                      className="px-3 py-2 text-xs uppercase tracking-widest transition-colors whitespace-nowrap"
                      style={{ border: "1px solid rgba(217,178,90,0.4)", color: "var(--gold)" }}>
                      ✎ Autocertifica
                    </button>
                  </div>
                </div>
              </div>

              {/* Questa settimana — prossime 3 azioni */}
              {nextActions.length > 0 && (
                <div className="px-4 py-2.5 border-b" style={{ borderColor: T.slate200 }}>
                  <p className="text-xs font-bold uppercase tracking-widest mb-2"
                    style={{ color: T.slate600, fontSize: "10px" }}>Questa settimana</p>
                  <div className="space-y-1.5">
                    {nextActions.map(item => {
                      const dc = getDirectorContent(item.flag_key);
                      return (
                        <div key={item.id}>
                          <button
                            onClick={() => setExpandedRow(expandedRow === item.id ? null : item.id)}
                            className="w-full flex items-center gap-2 text-left transition-opacity hover:opacity-75">
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                              style={{ backgroundColor: priorityColor(item.priority) + "22", color: priorityColor(item.priority), fontSize: "9px" }}>
                              {item.priority ?? "ALTA"}
                            </span>
                            <p className="text-xs flex-1 truncate" style={{ color: T.slate800 }}>
                              {dc.title}
                            </p>
                            {item.responsible && (
                              <p className="text-xs flex-shrink-0 max-w-[5rem] truncate" style={{ color: T.slate400 }}>
                                → {item.responsible.split("+")[0].trim()}
                              </p>
                            )}
                            {item.deadline_label && (
                              <p className="text-xs flex-shrink-0 font-mono" style={{ color: T.slate400 }}>
                                · {item.deadline_label}
                              </p>
                            )}
                          </button>
                          {expandedRow === item.id && (
                            <div className="mt-1 ml-12 px-3 py-2 space-y-2"
                              style={{ borderLeft: `2px solid ${priorityColor(item.priority)}`, backgroundColor: T.slate100 }}>
                              {dc.desc && (
                                <p className="text-xs leading-snug" style={{ color: T.slate400 }}>
                                  {dc.desc}
                                </p>
                              )}
                              {dc.shortcut && (
                                <p className="text-xs leading-relaxed"
                                  style={{ color: "var(--shield-soft, #7BA7D4)" }}>
                                  → {dc.shortcut}
                                </p>
                              )}
                              <div className="flex items-center gap-2 pt-1 flex-wrap">
                                {/* Scorciatoia contestuale */}
                                {(() => {
                                  const label    = getShortcutLabel(item.flag_key);
                                  const btnColor = getShortcutColor(item.flag_key);
                                  const cfg      = getShortcutConfig(item.flag_key);
                                  if (cfg.type === "generate") {
                                    return (
                                      <>
                                        <button
                                          onClick={() => {
                                            setGenerateModalFlag(item.flag_key);
                                            setGenerateModalKey(cfg.modal_key ?? null);
                                          }}
                                          className="text-xs px-3 py-1 font-bold uppercase tracking-widest transition-colors"
                                          style={{ backgroundColor: "var(--emerald, #3ECF8E)", color: "#0A1A12", borderRadius: "4px" }}>
                                          → {cfg.label}
                                        </button>
                                        <button
                                          onClick={() => setActionModalPlan(item)}
                                          className="text-xs px-3 py-1 font-bold uppercase tracking-widest transition-colors"
                                          style={{ border: "1px solid var(--shield, #3A6DF0)", color: "var(--shield-soft, #7BA7D4)", borderRadius: "4px" }}>
                                          → Acquisisci
                                        </button>
                                      </>
                                    );
                                  }
                                  return (
                                    <button
                                      onClick={() => {
                                        if (cfg.type === "email") {
                                          setEmailModalOpen(true);
                                        } else if (cfg.type === "fornitori") {
                                          router.push(cfg.url ?? "/fornitori");
                                        } else if (cfg.type === "external") {
                                          window.open(cfg.url, "_blank");
                                        } else {
                                          setActionModalPlan(item);
                                        }
                                      }}
                                      className="text-xs px-3 py-1 font-bold uppercase tracking-widest transition-colors"
                                      style={{
                                        backgroundColor: btnColor === "green" ? "var(--emerald, #3ECF8E)" : "var(--shield, #3A6DF0)",
                                        color: btnColor === "green" ? "#0A1A12" : "var(--bone, #EEF1F8)",
                                        borderRadius: "4px",
                                      }}>
                                      → {label}
                                    </button>
                                  );
                                })()}
                                {/* Autocertifica */}
                                <button
                                  onClick={() => handleAutocertifica(item.flag_key)}
                                  className="text-xs px-3 py-1 uppercase tracking-widest transition-colors"
                                  style={{ border: "1px solid rgba(217,178,90,0.4)", color: "var(--gold)" }}>
                                  ⚠ Autocertifica
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="px-4 py-2 flex justify-end">
                <button onClick={() => setActiveNav("remediation")}
                  className="text-xs font-semibold" style={{ color: T.bronze }}>
                  Vedi piano completo →
                </button>
              </div>
            </div>
          );
        })()}

        {/* RIGA 2 — Piano remediation above the fold */}
        <div className="flex-1 border overflow-hidden flex flex-col"
          style={{ borderColor: T.slate200, backgroundColor: "var(--ink2)", borderRadius: "4px" }}>
          <div className="px-4 py-2.5 border-b flex items-center justify-between"
            style={{ borderColor: T.slate200, backgroundColor: T.slate100 }}>
            <div className="flex items-center gap-3">
              <p className="text-sm font-bold uppercase tracking-wider" style={{ color: T.slate800 }}>
                Piano di Remediation
              </p>
              <span className="text-xs font-mono"
                style={{ color: T.slate400 }}>(Remediation Plan)</span>
              {plansOpen.length > 0 && (
                <span className="text-xs font-bold px-2 py-0.5 rounded"
                  style={{ backgroundColor: plansCritical.length > 0 ? T.critBg : T.highBg,
                    color: plansCritical.length > 0 ? T.critical : T.high, fontSize: "10px" }}>
                  {plansOpen.length} aperte
                  {plansCritical.length > 0 && ` · ${plansCritical.length} urgenti`}
                </span>
              )}
            </div>
            <button onClick={() => setActiveNav("remediation")}
              className="text-xs font-semibold"
              style={{ color: T.bronze }}>
              Vedi tutto →
            </button>
          </div>

          {plansOpen.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm" style={{ color: T.slate400 }}>
                Nessuna azione aperta. Ottimo presidio.
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: T.slate100, borderBottom: `1px solid ${T.slate200}` }}>
                    {["Area", "Azione", "Responsabile", "Scadenza", "Stato"].map(h => (
                      <th key={h} className="px-4 py-2 text-left font-semibold"
                        style={{ color: T.slate600, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plansOpen.slice(0, 8).map((plan, i) => {
                    const days = plan.due_date ? daysTo(plan.due_date) : null;
                    const isLate = days !== null && days < 0;
                    const isUrgent = days !== null && days >= 0 && days <= 14;
                    return (
                      <tr key={plan.id}
                        style={{ borderBottom: `1px solid ${T.slate200}`, backgroundColor: i % 2 === 0 ? "var(--ink2)" : T.slate100 }}>
                        <td className="px-4 py-2.5">
                          <span className="text-xs font-mono px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: T.slate100, color: T.slate600, fontSize: "10px" }}>
                            {plan.control_code}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="truncate" style={{ color: T.slate800 }}>{plan.planned_action}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="text-xs truncate max-w-32" style={{ color: T.slate600 }}>
                            {plan.responsible ?? "—"}
                          </p>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded"
                            style={{
                              backgroundColor: isLate ? T.critBg : isUrgent ? T.highBg : T.slate100,
                              color: isLate ? T.critical : isUrgent ? T.high : T.slate600,
                            }}>
                            {isLate ? "SCADUTA" : days !== null ? `${days}gg` : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs font-semibold" style={{ color: T.slate600 }}>
                            {STATO_REMEDIATION[plan.status] ?? plan.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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
                    {["Area", "Azione", "Responsabile", "Scadenza", "Priorità", "Stato"].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-semibold"
                        style={{ color: T.slate600, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
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
                           (ci.stato === "VERIFICATO" || ci.stato === "DICHIARATO")
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
                            style={{ backgroundColor: T.slate100, color: T.slate600, fontSize: "10px" }}>
                            {plan.control_code}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="leading-snug" style={{ color: T.slate800 }}>{plan.planned_action}</p>
                          {isResolved && (
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded mt-1 inline-block"
                              style={{ backgroundColor: T.lowBg, color: T.low, fontSize: "10px" }}>
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
                            style={{ backgroundColor: T.highBg, color: T.high, fontSize: "10px" }}>
                            ALTA
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            disabled={isResolved}
                            className="text-xs border px-2 py-1 rounded"
                            style={{ borderColor: T.slate200, color: T.slate600, backgroundColor: "var(--ink2)", fontSize: "11px", opacity: isResolved ? 0.5 : 1, cursor: isResolved ? "not-allowed" : "default" }}
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
                    style={{ color: T.slate600, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
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
                  isCompleted  = compStatus === "VERIFICATO" || isDichiarato;
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
                  <p className="text-xs uppercase tracking-wider mb-1" style={{ color: T.slate400, fontSize: "10px" }}>{k}</p>
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
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "var(--ink)", fontFamily: "DM Sans, system-ui" }}>

      {/* ── TOPBAR */}
      <header className="clavis-topbar flex-shrink-0 flex flex-row items-center justify-between px-4" style={{ height: "48px", minHeight: "48px" }}>

        {/* Sinistra — Brand */}
        <div className="flex items-center gap-4">
          <p className="font-black tracking-[0.12em] text-lg" style={{ color: "var(--bone)" }}>CLAVIS</p>
          <div className="h-4 w-px" style={{ backgroundColor: "var(--line2)" }} />
          <EntitySelector tier={profile?.tier} />
        </div>

        {/* Destra — azioni */}
        <div className="flex items-center gap-3">
          {triageData && band && (
            <div className="flex items-center gap-2 px-3 py-1 rounded"
              style={{ backgroundColor: band.bg, borderRadius: "4px" }}>
              <span className="text-xs font-mono font-black" style={{ color: band.color }}>
                {(riskScoreCombinato ?? triageData.risk_score)}/100
              </span>
              <span className="text-xs font-bold uppercase" style={{ color: band.color }}>
                {band.label}
              </span>
            </div>
          )}
          <button onClick={() => router.push("/triage/autenticato")}
            className="text-xs px-3 py-1.5 font-bold tracking-widest uppercase transition-colors"
            style={{ border: "1px solid var(--line2)", color: "var(--bone-dim)", borderRadius: "4px" }}>
            + Nuovo Triage
          </button>
          <div className="h-4 w-px" style={{ backgroundColor: "var(--line2)" }} />
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <p className="text-xs" style={{ color: "var(--bone-dim)" }}>
                {profile?.full_name || profile?.email?.split("@")[0]}
              </p>
              <span className="text-xs px-1.5 py-0.5 font-mono font-bold uppercase rounded"
                style={{ backgroundColor: T.bronzeBg, color: T.bronze, fontSize: "10px" }}>
                {profile?.tier}
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="#9AA3BD" strokeWidth="2">
                <path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
              </svg>
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 top-8 w-44 rounded-lg overflow-hidden z-50"
                style={{
                  background: "var(--ink2)",
                  border: "1px solid var(--line2)",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.4)"
                }}>
                <button
                  onClick={() => { setDropdownOpen(false); router.push("/profilo"); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-white/5"
                  style={{ color: "var(--bone)" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  Profilo
                </button>
                <div style={{ height: "1px", background: "var(--line2)" }}/>
                <button
                  onClick={() => { setDropdownOpen(false); handleSignout(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-white/5"
                  style={{ color: "#F87171" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
                  </svg>
                  Esci
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── MODAL AUTOCERTIFICA */}
      {autocertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="w-full max-w-md p-6 space-y-4" style={{ background: "var(--ink2)", border: "1px solid var(--line2)", borderRadius: "8px" }}>
            <p className="font-bold uppercase tracking-wider text-sm" style={{ color: T.slate800 }}>Autocertificazione</p>
            <p className="text-sm leading-relaxed" style={{ color: T.slate600 }}>
              Dichiaro sotto mia responsabilità che{" "}
              <strong style={{ color: T.slate800 }}>{autocertModal.item.label ?? autocertModal.item.flag_key}</strong>{" "}
              è stato adempiuto alla data odierna ({new Date().toLocaleDateString("it-IT")}).
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
          onOpenGenerate={(flagKey) => {
            setActionModalPlan(null);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const flag = (LEGAL_DICT as any).flags?.[flagKey];
            const steps = flag?.action_steps ?? [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const modalKey = steps.find((s: any) => s.option_no?.modal_key)?.option_no?.modal_key
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ?? steps.find((s: any) => s.modal_key)?.modal_key
              ?? null;
            setGenerateModalFlag(flagKey);
            setGenerateModalKey(modalKey);
          }}
        />
      )}

      {/* ── BANNER ANOMALIE SCADENZA */}
      {plansAnomalie.length > 0 && (
        <div className="px-6 py-3 border-b flex items-center gap-3 flex-shrink-0"
          style={{ backgroundColor: "rgba(232,99,74,.08)", borderColor: "rgba(232,99,74,.3)" }}>
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

      {/* ── BODY */}
      <div className="flex flex-1 overflow-hidden">

        {/* SIDEBAR */}
        <aside className="clavis-sidebar flex-shrink-0 flex flex-col border-r transition-all duration-200"
          style={{ width: sidebarCollapsed ? "48px" : "188px", borderColor: T.slate200, position: "relative", overflow: "hidden" }}>

          {/* Stars layer */}
          <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
            <svg width="100%" height="55%" viewBox="0 0 200 300" preserveAspectRatio="xMidYMid slice">
              <circle cx="15"  cy="18"  r="1.2" fill="white" opacity="0.30"/>
              <circle cx="85"  cy="8"   r="0.8" fill="white" opacity="0.20"/>
              <circle cx="140" cy="25"  r="1.5" fill="white" opacity="0.35"/>
              <circle cx="58"  cy="42"  r="1.0" fill="white" opacity="0.25"/>
              <circle cx="172" cy="12"  r="0.9" fill="white" opacity="0.15"/>
              <circle cx="28"  cy="68"  r="1.8" fill="white" opacity="0.40"/>
              <circle cx="118" cy="55"  r="1.2" fill="white" opacity="0.20"/>
              <circle cx="75"  cy="80"  r="0.8" fill="white" opacity="0.30"/>
              <circle cx="155" cy="72"  r="1.4" fill="white" opacity="0.25"/>
              <circle cx="10"  cy="110" r="1.0" fill="white" opacity="0.20"/>
              <circle cx="100" cy="105" r="0.9" fill="white" opacity="0.15"/>
              <circle cx="44"  cy="130" r="1.3" fill="white" opacity="0.30"/>
              <circle cx="180" cy="118" r="1.6" fill="white" opacity="0.35"/>
              <circle cx="128" cy="140" r="0.8" fill="white" opacity="0.20"/>
              <circle cx="68"  cy="148" r="1.1" fill="white" opacity="0.25"/>
            </svg>
            <div className="shooting-star" style={{ top: "12%", animationDuration: "8s",  animationDelay: "2s" }} />
            <div className="shooting-star" style={{ top: "30%", animationDuration: "11s", animationDelay: "6s" }} />
          </div>

          <div className="flex-1 py-2 space-y-0.5" style={{ position: "relative", zIndex: 1 }}>
            <NavItem icon="📊" label="Panoramica"          active={activeNav === "overview"}    onClick={() => setActiveNav("overview")}    collapsed={sidebarCollapsed} />
            <NavItem icon="📋" label="Remediation"         active={false}                       onClick={() => router.push("/remediation")} collapsed={sidebarCollapsed} badge={plansOpen.length} />
            <NavItem icon="⏰" label="Scadenze"            active={activeNav === "scadenze"}    onClick={() => setActiveNav("scadenze")}    collapsed={sidebarCollapsed} badge={scadenzeAlert.filter(s => s.scaduta).length} />
            <NavItem icon="🏥" label="Struttura"           active={false}                       onClick={() => router.push("/struttura")}   collapsed={sidebarCollapsed} />
            <NavItem icon="🏢" label="Fornitori"          active={false}                       onClick={() => router.push("/fornitori")}   collapsed={sidebarCollapsed} />
            <NavItem icon="🏢" label="Anagrafica"          active={false}                       onClick={() => router.push("/anagrafica")}  collapsed={sidebarCollapsed} />
          </div>

          <div className="border-t py-2" style={{ borderColor: "var(--line)", position: "relative", zIndex: 1 }}>
            <button onClick={() => setSidebarCollapsed(v => !v)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors"
              style={{ color: T.slate400 }}>
              <span>{sidebarCollapsed ? "▶" : "◀"}</span>
              {!sidebarCollapsed && <span>Comprimi</span>}
            </button>
          </div>
        </aside>

        {/* CENTRO */}
        <main className="clavis-workspace flex-1 flex flex-col overflow-hidden p-4">
          {pendingTriageSession && !showTriageChoice && (
            <div className="mb-4 border-l-4 p-4 flex items-start justify-between gap-4 flex-shrink-0"
              style={{ borderColor: T.bronze, backgroundColor: T.bronzeBg, borderRadius: "4px", borderLeftColor: T.bronze }}>
              <div className="space-y-1 flex-1">
                <p className="font-bold text-sm" style={{ color: T.slate800 }}>
                  Abbiamo trovato un test di rischio completato.
                </p>
                <p className="text-sm" style={{ color: T.slate600 }}>
                  Vuoi importare i risultati nel tuo profilo?
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={handleImportTriage}
                  disabled={triageImporting}
                  className="text-xs px-4 py-2 font-bold tracking-widest uppercase transition-colors"
                  style={{ backgroundColor: "var(--shield)", color: "var(--bone)", borderRadius: "4px" }}>
                  {triageImporting ? "Importazione..." : "Importa i risultati"}
                </button>
                <button
                  onClick={handleStartFresh}
                  className="text-xs px-4 py-2 font-semibold transition-colors"
                  style={{ border: `1px solid ${T.slate200}`, color: T.slate600, borderRadius: "4px" }}>
                  Inizia da zero
                </button>
              </div>
            </div>
          )}
          {showTriageChoice && (
            <div className="mb-4 border p-4 flex items-center justify-between gap-4 flex-shrink-0"
              style={{ borderColor: T.slate200, backgroundColor: "var(--ink2)", borderRadius: "4px" }}>
              <p className="text-sm font-semibold" style={{ color: T.slate800 }}>Come vuoi procedere?</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setShowTriageChoice(false); router.push("/triage/autenticato"); }}
                  className="text-xs px-4 py-2 font-bold tracking-widest uppercase transition-colors"
                  style={{ backgroundColor: "var(--shield)", color: "var(--bone)", borderRadius: "4px" }}>
                  Triage autenticato
                </button>
                <button
                  onClick={() => { setShowTriageChoice(false); router.push("/onboarding"); }}
                  className="text-xs px-4 py-2 font-semibold transition-colors"
                  style={{ border: `1px solid ${T.slate200}`, color: T.slate600, borderRadius: "4px" }}>
                  Vai all&apos;onboarding
                </button>
              </div>
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

        {/* COLONNA DESTRA — alert rapidi */}
        <aside className="flex-shrink-0 border-l flex flex-col overflow-hidden"
          style={{ width: "200px", backgroundColor: "var(--ink2)", borderColor: T.slate200, position: "relative" }}>

          {/* Stars layer */}
          <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
            <svg width="100%" height="55%" viewBox="0 0 200 300" preserveAspectRatio="xMidYMid slice">
              <circle cx="20"  cy="22"  r="1.0" fill="white" opacity="0.25"/>
              <circle cx="90"  cy="10"  r="1.4" fill="white" opacity="0.35"/>
              <circle cx="165" cy="30"  r="0.8" fill="white" opacity="0.20"/>
              <circle cx="48"  cy="50"  r="1.6" fill="white" opacity="0.40"/>
              <circle cx="130" cy="18"  r="0.9" fill="white" opacity="0.15"/>
              <circle cx="78"  cy="75"  r="1.2" fill="white" opacity="0.30"/>
              <circle cx="185" cy="58"  r="1.0" fill="white" opacity="0.20"/>
              <circle cx="35"  cy="95"  r="0.8" fill="white" opacity="0.25"/>
              <circle cx="110" cy="85"  r="1.5" fill="white" opacity="0.35"/>
              <circle cx="155" cy="100" r="1.1" fill="white" opacity="0.20"/>
              <circle cx="62"  cy="120" r="0.9" fill="white" opacity="0.15"/>
              <circle cx="142" cy="135" r="1.3" fill="white" opacity="0.30"/>
              <circle cx="18"  cy="145" r="1.8" fill="white" opacity="0.40"/>
              <circle cx="95"  cy="125" r="0.8" fill="white" opacity="0.25"/>
              <circle cx="175" cy="148" r="1.2" fill="white" opacity="0.20"/>
            </svg>
            <div className="shooting-star" style={{ top: "8%",  animationDuration: "9s",  animationDelay: "0s" }} />
            <div className="shooting-star" style={{ top: "22%", animationDuration: "13s", animationDelay: "4s" }} />
          </div>

          <div className="px-3 py-2.5 border-b flex-shrink-0"
            style={{ borderColor: T.slate200, backgroundColor: T.slate100, position: "relative", zIndex: 1 }}>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: T.slate600 }}>Alert</p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ position: "relative", zIndex: 1 }}>

            {/* Azioni urgenti */}
            {plansCritical.length > 0 && (
              <div className="border p-3 space-y-1"
                style={{ borderColor: T.critical, backgroundColor: T.critBg, borderRadius: "4px", borderLeftWidth: "3px" }}>
                <div className="flex items-center gap-2">
                  <span className="clavis-pulse flex-shrink-0" />
                  <p className="text-xs font-bold uppercase" style={{ color: T.critical, fontSize: "10px" }}>
                    {plansCritical.length} Azioni Urgenti
                  </p>
                </div>
                {plansCritical.slice(0, 2).map(p => (
                  <p key={p.id} className="text-xs leading-snug" style={{ color: T.slate600 }}>
                    → {p.planned_action.slice(0, 50)}...
                  </p>
                ))}
              </div>
            )}

            {/* Scadenze critiche */}
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: T.slate600, fontSize: "10px" }}>
                Scadenze
              </p>
              {scadenze.filter(s => s.scaduta || daysTo(s.date) <= 120).map(s => {
                const days = daysTo(s.date);
                const scaduta = s.scaduta || days < 0;
                const isAiAct = s.norma === "AI Act";
                let isCompleted = false;
                if (isAiAct) {
                  isCompleted = aiActConforme;
                } else {
                  const tipo = getScadenzaTipo(s);
                  const compStatus = tipo ? complianceItems.find(ci => ci.tipo === tipo)?.stato : null;
                  isCompleted = compStatus === "VERIFICATO" || compStatus === "DICHIARATO";
                }
                return (
                  <div key={s.norma + s.desc} className="border p-2 space-y-0.5"
                    style={{
                      borderColor: isCompleted ? T.low : scaduta ? T.critical : T.high,
                      backgroundColor: isCompleted ? T.lowBg : scaduta ? T.critBg : T.highBg,
                      borderRadius: "4px",
                    }}>
                    <div className="flex items-center justify-between">
                      <p className="font-mono font-bold text-xs" style={{ color: T.bronze }}>{s.norma}</p>
                      <span className="text-xs font-bold"
                        style={{ color: isCompleted ? T.low : scaduta ? T.critical : T.high, fontSize: "10px" }}>
                        {isCompleted ? (isAiAct ? "✓ In gestione" : "✓") : scaduta ? "SCADUTA" : `${days}gg`}
                      </span>
                    </div>
                    <p className="text-xs leading-snug" style={{ color: T.slate600, fontSize: "10px" }}>{s.desc}</p>
                  </div>
                );
              })}
            </div>

            {/* Tier */}
            <div className="border p-3 space-y-2"
              style={{ borderColor: T.slate200, borderRadius: "4px" }}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase" style={{ color: T.slate600, fontSize: "10px" }}>Piano</p>
                <span className="text-xs font-mono font-black px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: T.bronzeBg, color: T.bronze, fontSize: "10px" }}>
                  {profile?.tier?.toUpperCase()}
                </span>
              </div>
              {(profile?.tier === "free" || profile?.tier === "silver") && (
                <button className="w-full text-xs py-1.5 font-bold tracking-widest uppercase"
                  style={{ backgroundColor: "var(--shield)", color: "var(--bone)", borderRadius: "4px", fontSize: "10px" }}>
                  Upgrade →
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>

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

    </div>
  );
}
