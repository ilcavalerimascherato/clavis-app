"use client";

/**
 * CLAVIS — /remediation
 * Piano completo adempimenti con stati, log, posponi, filtri.
 * Fonte: remediation_plans + compliance_activity_log + entity_compliance_items + legal_dictionary
 *
 * STRADE DI CHIUSURA:
 *  BLU   → Carica documento → AI verifica → entity_compliance_items stato=VERIFICATO
 *  AMBRA → Autocertifica (utente dichiara) → entity_compliance_items stato=DICHIARATO
 *  VERDE → Genera documento direttamente con GenerateDocModal
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useActiveEntity } from "@/contexts/EntityContext";
import { EntitySelector } from "@/components/EntitySelector";
import LEGAL_DICT from "@/config/legal_dictionary.json";
import { getShortcutConfig, getShortcutLabel, getShortcutType, getShortcutColor } from "@/lib/shortcutMap";
import { GenerateDocModal } from "@/components/GenerateDocModal";
import { EmailBuilderModal } from "@/components/EmailBuilderModal";
import type { EntityData, CompanyData } from "@/lib/documentTemplates";

// ─── DESIGN TOKENS
const T = {
  navy:     "#0A0E1A",
  ink2:     "#0F1424",
  slate100: "#141B30",
  slate200: "rgba(238,241,248,.16)",
  slate400: "#9AA3BD",
  slate800: "#EEF1F8",
  bronze:   "#D9B25A",
  high:     "#5E86F5",
  highBg:   "rgba(94,134,245,.12)",
  low:      "#3ECF8E",
  lowBg:    "rgba(62,207,142,.10)",
  warn:     "#F59E0B",
  warnBg:   "rgba(245,158,11,.12)",
  critical: "#E8634A",
  critBg:   "rgba(232,99,74,.12)",
  blue:     "#3A6DF0",
  blueBg:   "rgba(58,109,240,.12)",
};

// ─── STATI
type PlanStatus = "aperto" | "in_corso" | "in_scadenza" | "completato" | "scaduto" | "non_applicabile";

const STATUS_CONFIG: Record<PlanStatus, { label: string; color: string; bg: string; dot: string }> = {
  aperto:           { label: "Aperto",          color: T.slate400, bg: "rgba(154,163,189,.12)", dot: T.slate400 },
  in_corso:         { label: "In corso",         color: T.high,     bg: T.highBg,               dot: T.high },
  in_scadenza:      { label: "In scadenza",      color: T.warn,     bg: T.warnBg,               dot: T.warn },
  completato:       { label: "Completato",       color: T.low,      bg: T.lowBg,                dot: T.low },
  scaduto:          { label: "Scaduto",          color: T.critical, bg: T.critBg,               dot: T.critical },
  non_applicabile:  { label: "Non applicabile",  color: T.bronze,   bg: "rgba(217,178,90,.12)", dot: T.bronze },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  critical: { label: "Critica",  color: T.critical },
  high:     { label: "Alta",     color: T.warn },
  medium:   { label: "Media",    color: T.high },
  low:      { label: "Bassa",    color: T.slate400 },
};

// ─── TIPI
interface RemediationPlan {
  id: string;
  entity_id: string;
  flag_key: string | null;
  control_code: string | null;
  planned_action: string | null;
  responsible: string | null;
  due_date: string | null;
  deadline_date: string | null;
  deadline_label: string | null;
  priority: string | null;
  severity: number | null;
  status: string;
  completion_note: string | null;
  completed_at: string | null;
  started_at: string | null;
  postponed_until: string | null;
  postpone_note: string | null;
  created_at: string;
}

interface ActivityLog {
  id: string;
  flag_key: string;
  action_type: string;
  action_note: string | null;
  performed_at: string;
  new_deadline: string | null;
}

// ─── HELPERS
function getLabel(plan: RemediationPlan): string {
  if (plan.flag_key) {
    const entry = (LEGAL_DICT as any).flags?.[plan.flag_key];
    if (entry?.title_director) return entry.title_director;
    if (entry?.label) return entry.label;
  }
  return plan.planned_action ?? plan.flag_key ?? "Azione senza titolo";
}

function getSection(plan: RemediationPlan): string {
  if (plan.flag_key) {
    const entry = (LEGAL_DICT as any).flags?.[plan.flag_key];
    if (entry?.short_label) return entry.short_label;
  }
  return plan.control_code ?? "—";
}

function computeStatus(plan: RemediationPlan): PlanStatus {
  const raw = plan.status?.toLowerCase() ?? "aperto";
  if (raw === "completato" || raw === "done" || raw === "verified") return "completato";
  if (raw === "non_applicabile") return "non_applicabile";

  const dateRef = computeDeadline(plan);
  if (dateRef) {
    const deadline = new Date(dateRef);
    const today = new Date();
    const diffDays = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return "scaduto";
    if (diffDays <= 30) return "in_scadenza";
  }

  if (raw === "in_corso" || raw === "in_progress") return "in_corso";
  return "aperto";
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

function daysLeft(d: string | null): number | null {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
}

function computeDeadline(plan: RemediationPlan): string | null {
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

  if (lower.includes("immediato")) {
    const d = new Date(plan.created_at);
    d.setDate(d.getDate() + 7);
    return d.toISOString().split("T")[0];
  }

  if (lower.includes("scaduta")) {
    return plan.created_at.split("T")[0];
  }

  const dmyMatch = lower.match(/^(\d{1,2})\s+([a-zàèéìòùÀÈÉÌÒÙ]+)\s+(\d{4})/);
  if (dmyMatch && monthMap[dmyMatch[2]]) {
    return `${dmyMatch[3]}-${monthMap[dmyMatch[2]]}-${dmyMatch[1].padStart(2, "0")}`;
  }

  const parts = lower.split(" ");
  if (parts.length >= 2 && monthMap[parts[0]] && parts[1].match(/^\d{4}$/)) {
    return `${parts[1]}-${monthMap[parts[0]]}-01`;
  }

  const numMatch = label.match(/(\d+)/);
  if (numMatch) {
    const days = parseInt(numMatch[1]);
    const d = new Date(plan.created_at);
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
  }

  return null;
}

// ─── Ricava il modalKey per GenerateDocModal dal dictionary
function getGenerateModalKey(flagKey: string): string | undefined {
  const flag = (LEGAL_DICT as any).flags?.[flagKey];
  const steps = flag?.action_steps ?? [];
  // Cerca prima option_no.modal_key (acquire_or_generate), poi step.modal_key (generate)
  for (const s of steps) {
    if (s.option_no?.modal_key) return s.option_no.modal_key;
    if (s.modal_key) return s.modal_key;
  }
  return undefined;
}

// ─── FLAG KEY → compliance_type ENUM
function flagKeyToComplianceType(flagKey: string): string {
  const map: Record<string, string> = {
    "nis2_irp":             "IRP_INCIDENT_RESPONSE",
    "nis2_bcp":             "BCP_BUSINESS_CONTINUITY",
    "gdpr_dpia":            "DPIA",
    "gdpr_dpo":             "NOMINA_DPO",
    "gdpr_registro":        "REGISTRO_TRATTAMENTI",
    "gdpr_dpa_fornitori":   "DPA_FORNITORI",
    "gdpr_informativa":     "INFORMATIVA_PRIVACY",
    "gdpr_informativa_paz": "INFORMATIVA_PRIVACY_PAZIENTI",
    "nis2_acn":             "REGISTRAZIONE_ACN",
    "nis2_delibera_cda":    "DELIBERA_CDA",
    "nis2_formazione":      "PIANO_FORMATIVO",
    "aiact_officer":        "NOMINA_AI_OFFICER",
    "aiact_fria":           "FRIA",
    "dm232_polizza":        "POLIZZA_RC_DM232",
    "d231_modello":         "MODELLO_231",
    "d231_codice_etico":    "CODICE_ETICO_231",
  };
  return map[flagKey] ?? "ALTRO";
}

// ─── STATUS BADGE
function StatusBadge({ status }: { status: PlanStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.dot }} />
      {cfg.label}
    </span>
  );
}

// ─── PRIORITY BADGE
function PriorityBadge({ priority }: { priority: string | null }) {
  const cfg = PRIORITY_CONFIG[priority ?? "low"] ?? PRIORITY_CONFIG.low;
  return (
    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

// ─── MODAL AZIONE
interface ActionModalProps {
  plan: RemediationPlan;
  onClose: () => void;
  onUpdate: () => void;
  onOpenGenerate: (flagKey: string) => void;
  entityId: string;
  companyId: string | null;
  userId: string;
  entityFullData: EntityData | null;
  companyData: CompanyData | null;
  initialTab?: "info" | "posponi" | "log";
}

function ActionModal({ plan, onClose, onUpdate, onOpenGenerate, entityId, companyId, userId, entityFullData, companyData, initialTab }: ActionModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const status = computeStatus(plan);
  const label = getLabel(plan);

  const [tab, setTab] = useState<"info" | "posponi" | "log">(initialTab ?? "info");
  const [postponeDate, setPostponeDate] = useState("");
  const [postponeNote, setPostponeNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // ── Stato strada AMBRA
  const [showAutocertConfirm, setShowAutocertConfirm] = useState(false);
  const [autocertDocName, setAutocertDocName] = useState("");

  // ── Stato strada EMAIL
  const [showEmail, setShowEmail] = useState(false);

  // ── Stato strada BLU
  type BluPhase = "idle" | "uploading" | "analyzing" | "success" | "error";
  const [showBluZone, setShowBluZone] = useState(false);
  const [bluPhase, setBluPhase] = useState<BluPhase>("idle");
  const [bluFile, setBluFile] = useState<File | null>(null);
  const [bluDragging, setBluDragging] = useState(false);
  const [bluError, setBluError] = useState<string | null>(null);
  const [bluResult, setBluResult] = useState<{ passed: boolean; note: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tab !== "log" || !plan.flag_key) return;
    setLoadingLogs(true);
    supabase.from("compliance_activity_log")
      .select("*")
      .eq("entity_id", entityId)
      .eq("flag_key", plan.flag_key)
      .order("performed_at", { ascending: false })
      .then(({ data }) => { setLogs((data as ActivityLog[]) ?? []); setLoadingLogs(false); });
  }, [tab, plan.flag_key, entityId, supabase]);

  async function logAction(action_type: string, action_note?: string, new_deadline?: string) {
    if (!plan.flag_key) return;
    await supabase.from("compliance_activity_log").insert({
      entity_id: entityId,
      flag_key: plan.flag_key,
      action_type,
      action_note: action_note ?? null,
      performed_by: userId,
      new_deadline: new_deadline ?? null,
    });
  }

  async function markPlanCompleted() {
    await supabase.from("remediation_plans").update({
      status: "completato",
      completed_at: new Date().toISOString(),
      completed_by: userId,
    }).eq("id", plan.id);
  }

  // ── STRADA AMBRA: autocertifica
  async function handleAutocertifica() {
    if (!autocertDocName.trim()) return;
    setSaving(true);
    try {
      await supabase.from("entity_compliance_items").insert({
        entity_id: entityId,
        company_id: companyId,
        tipo: flagKeyToComplianceType(plan.flag_key ?? ""),
        stato: "DICHIARATO",
        documento_nome: autocertDocName.trim(),
        flag_key: plan.flag_key,
        note: "Autocertificato dall'utente tramite CLAVIS",
        dichiarato_da: userId,
        dichiarato_at: new Date().toISOString(),
        created_by: userId,
      });
      await markPlanCompleted();
      await logAction("autocertificato", `Autocertificato — documento: ${autocertDocName.trim()}`);
      onUpdate();
      onClose();
    } finally { setSaving(false); }
  }

  // ── STRADA BLU: carica documento + analisi AI
  function handleFileDrop(file: File) {
    setBluFile(file);
    setBluError(null);
    setBluResult(null);
    setBluPhase("idle");
  }

  async function handleBluUploadAndAnalyze() {
    if (!bluFile || !plan.flag_key) return;
    setSaving(true);
    setBluPhase("uploading");
    setBluError(null);
    try {
      // 1. Upload su Storage
      const ext = bluFile.name.split(".").pop();
      const path = `${entityId}/${plan.flag_key}_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("compliance-docs")
        .upload(path, bluFile, { upsert: false });
      if (uploadError) throw new Error("Errore upload: " + uploadError.message);

      const { data: urlData } = supabase.storage.from("compliance-docs").getPublicUrl(path);
      const documentUrl = urlData?.publicUrl ?? null;

      // 2. Analisi AI
      setBluPhase("analyzing");
      const dictEntry = (LEGAL_DICT as any).flags?.[plan.flag_key];
      const aiCheckKey =
        dictEntry?.action_steps?.find((s: any) => s.ai_check)?.ai_check
        ?? dictEntry?.action_steps?.[0]?.option_yes?.ai_check
        ?? "verifica_conformita_generica";
      const documentHint = dictEntry?.document_hint ?? "documento di conformità normativa";

      let fileContent = "";
      if (bluFile.type === "text/plain") {
        fileContent = await bluFile.text();
      }

      const aiPrompt = `Sei un esperto di compliance normativa per strutture sociosanitarie italiane.
Devi verificare se il documento caricato soddisfa il requisito: "${label}".
Tipo di verifica: ${aiCheckKey}.
Il documento deve essere: ${documentHint}.
${fileContent ? `\nContenuto documento (estratto):\n${fileContent.slice(0, 3000)}` : `\nFile caricato: ${bluFile.name} (${bluFile.type}, ${Math.round(bluFile.size / 1024)}KB)`}

Rispondi SOLO con JSON valido, nessun testo aggiuntivo, nessun backtick:
{"passed": true o false, "note": "spiegazione sintetica max 2 righe di cosa hai verificato e se il documento è conforme o cosa manca"}`;

      const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: aiPrompt }],
        }),
      });
      const aiData = await aiRes.json();
      const rawText = aiData.content?.find((b: any) => b.type === "text")?.text ?? "{}";
      let aiResult: { passed: boolean; note: string } = { passed: false, note: "Analisi non disponibile" };
      try {
        const clean = rawText.replace(/```json|```/g, "").trim();
        aiResult = JSON.parse(clean);
      } catch {
        aiResult = { passed: false, note: rawText.slice(0, 200) };
      }
      setBluResult(aiResult);

      // 3. Salva in entity_compliance_items
      await supabase.from("entity_compliance_items").insert({
        entity_id: entityId,
        company_id: companyId,
        tipo: flagKeyToComplianceType(plan.flag_key),
        stato: aiResult.passed ? "VERIFICATO" : "NON_CONFORME",
        documento_path: path,
        documento_nome: bluFile.name,
        analisi_ok: aiResult.passed,
        analisi_note: aiResult.note,
        flag_key: plan.flag_key,
        created_by: userId,
      });

      // 4. Se conforme → chiudi piano
      if (aiResult.passed) {
        await markPlanCompleted();
        await logAction("documento_verificato", `Documento "${bluFile.name}" verificato da CLAVIS — ${aiResult.note}`);
        setBluPhase("success");
      } else {
        await logAction("documento_non_conforme", `Documento "${bluFile.name}" non conforme — ${aiResult.note}`);
        setBluPhase("error");
      }
    } catch (err: any) {
      setBluError(err.message ?? "Errore imprevisto");
      setBluPhase("idle");
    } finally { setSaving(false); }
  }

  async function handlePostpone() {
    if (!postponeDate || !postponeNote.trim()) return;
    setSaving(true);
    try {
      await supabase.from("remediation_plans").update({
        postponed_until: postponeDate,
        postpone_note: postponeNote,
        status: "in_corso",
      }).eq("id", plan.id);
      await logAction("postponed", postponeNote, postponeDate);
      onUpdate();
      onClose();
    } finally { setSaving(false); }
  }


  const dictEntry = plan.flag_key ? (LEGAL_DICT as any).flags?.[plan.flag_key] : null;
  const deadlineRef = computeDeadline(plan);
  const days = daysLeft(deadlineRef);
  const isClosedStatus = status === "completato" || status === "non_applicabile";
  const isBusy = bluPhase === "uploading" || bluPhase === "analyzing" || saving;

  const tabs = [
    { id: "info",    label: "Dettaglio" },
    { id: "posponi", label: "Posponi" },
    { id: "log",     label: "Storico" },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.72)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex flex-col w-full mx-4"
        style={{
          backgroundColor: T.ink2, border: `1px solid ${T.slate200}`,
          borderRadius: "6px", maxWidth: "560px", maxHeight: "88vh", overflow: "hidden",
        }}>

        {/* Header */}
        <div className="px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: T.slate200, backgroundColor: T.slate100 }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <StatusBadge status={status} />
                {plan.priority && <PriorityBadge priority={plan.priority} />}
                {days !== null && days >= 0 && days <= 30 && (
                  <span className="text-xs font-mono" style={{ color: T.warn }}>
                    {days === 0 ? "Scade oggi" : `${days}gg alla scadenza`}
                  </span>
                )}
                {days !== null && days < 0 && (
                  <span className="text-xs font-mono" style={{ color: T.critical }}>
                    Scaduta da {Math.abs(days)}gg
                  </span>
                )}
              </div>
              <p className="text-sm font-bold leading-snug" style={{ color: T.slate800 }}>{label}</p>
              {dictEntry?.short_label && (
                <p className="text-xs mt-0.5 font-mono" style={{ color: T.bronze }}>{dictEntry.short_label}</p>
              )}
            </div>
            <button onClick={onClose} style={{ color: T.slate400, fontSize: "18px", flexShrink: 0 }}>✕</button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-3">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-colors rounded"
                style={{
                  backgroundColor: tab === t.id ? T.highBg : "transparent",
                  color: tab === t.id ? T.high : T.slate400,
                  border: tab === t.id ? `1px solid rgba(94,134,245,.3)` : "1px solid transparent",
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* ── TAB INFO */}
          {tab === "info" && (
            <div className="space-y-4">
              {dictEntry?.desc_director && (
                <div className="px-3 py-3 rounded text-sm leading-relaxed"
                  style={{ backgroundColor: "rgba(238,241,248,.04)", border: `1px solid ${T.slate200}`, color: T.slate400 }}>
                  {dictEntry.desc_director}
                </div>
              )}
              {dictEntry?.shortcut_director && (
                <div className="px-3 py-2 rounded text-xs"
                  style={{ backgroundColor: T.highBg, border: `1px solid rgba(94,134,245,.2)`, color: "#7BA7D4" }}>
                  → {dictEntry.shortcut_director}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {[
                  { k: "Responsabile", v: plan.responsible },
                  { k: "Scadenza", v: formatDate(deadlineRef) },
                  { k: "Avviata il", v: formatDate(plan.started_at) },
                  { k: "Completata il", v: formatDate(plan.completed_at) },
                  { k: "Posticipata al", v: plan.postponed_until ? formatDate(plan.postponed_until) : null },
                ].filter(r => r.v && r.v !== "—").map(({ k, v }) => (
                  <div key={k} className="px-3 py-2 rounded"
                    style={{ backgroundColor: "rgba(238,241,248,.04)", border: `1px solid ${T.slate200}` }}>
                    <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: T.slate400, fontSize: "9px" }}>{k}</p>
                    <p className="text-xs font-semibold" style={{ color: T.slate800 }}>{v}</p>
                  </div>
                ))}
              </div>

              {plan.postpone_note && (
                <div className="px-3 py-2 rounded text-xs"
                  style={{ backgroundColor: T.warnBg, border: `1px solid rgba(245,158,11,.2)`, color: T.warn }}>
                  Nota posticipo: {plan.postpone_note}
                </div>
              )}

              {dictEntry?.remediation && (
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wider font-bold" style={{ color: T.slate400, fontSize: "9px" }}>Azione raccomandata</p>
                  <p className="text-xs leading-relaxed" style={{ color: T.slate800 }}>{dictEntry.remediation.action}</p>
                </div>
              )}

              {/* ── CTA STRADE */}
              {!isClosedStatus && (
                <div className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: T.slate200 }}>

                  {/* ── STRADA BLU: Carica documento */}
                  {bluPhase === "success" ? (
                    <div className="px-4 py-5 rounded flex flex-col items-center gap-3 text-center"
                      style={{ backgroundColor: "rgba(62,207,142,.07)", border: `1px solid rgba(62,207,142,.3)` }}>
                      <span style={{ fontSize: "32px" }}>✓</span>
                      <div>
                        <p className="text-sm font-bold" style={{ color: T.low }}>Documento acquisito e conforme</p>
                        <p className="text-xs mt-1 leading-relaxed" style={{ color: T.slate400 }}>{bluResult?.note}</p>
                      </div>
                      <button onClick={() => { onUpdate(); onClose(); }}
                        className="px-6 py-2 text-xs font-bold uppercase tracking-widest rounded"
                        style={{ backgroundColor: T.lowBg, color: T.low, border: `1px solid rgba(62,207,142,.35)` }}>
                        Chiudi
                      </button>
                    </div>
                  ) : bluPhase === "error" ? (
                    <div className="px-4 py-3 rounded flex flex-col gap-2"
                      style={{ backgroundColor: T.critBg, border: `1px solid rgba(232,99,74,.3)` }}>
                      <p className="text-xs font-bold" style={{ color: T.critical }}>Documento non conforme</p>
                      <p className="text-xs leading-relaxed" style={{ color: T.slate400 }}>{bluResult?.note}</p>
                      <button onClick={() => { setBluPhase("idle"); setBluFile(null); setBluResult(null); setShowBluZone(false); }}
                        className="text-xs self-start underline" style={{ color: T.slate400 }}>
                        ← Riprova
                      </button>
                    </div>
                  ) : !showBluZone ? (
                    <button
                      onClick={() => setShowBluZone(true)}
                      disabled={isBusy}
                      className="w-full py-2 text-xs font-bold uppercase tracking-widest transition-all"
                      style={{
                        backgroundColor: T.blueBg, color: T.blue,
                        borderRadius: "4px", border: `1px solid rgba(58,109,240,.4)`,
                      }}>
                      ⬆ Carica {getShortcutLabel(plan.flag_key ?? "")}
                    </button>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold" style={{ color: T.blue }}>
                          ⬆ Carica {getShortcutLabel(plan.flag_key ?? "")}
                        </span>
                        <button onClick={() => { setShowBluZone(false); setBluFile(null); setBluError(null); }}
                          className="text-xs" style={{ color: T.slate400 }}>✕</button>
                      </div>
                      <div
                        onDragOver={e => { e.preventDefault(); setBluDragging(true); }}
                        onDragLeave={() => setBluDragging(false)}
                        onDrop={e => { e.preventDefault(); setBluDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFileDrop(f); }}
                        onClick={() => !isBusy && fileInputRef.current?.click()}
                        className="w-full rounded cursor-pointer transition-all flex flex-col items-center justify-center gap-2 py-5"
                        style={{
                          border: `2px dashed ${bluDragging ? T.blue : bluFile ? "rgba(58,109,240,.5)" : T.slate200}`,
                          backgroundColor: bluDragging ? T.blueBg : bluFile ? "rgba(58,109,240,.06)" : "rgba(238,241,248,.03)",
                          cursor: isBusy ? "not-allowed" : "pointer",
                        }}>
                        <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.txt" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleFileDrop(f); }} />
                        {bluFile ? (
                          <>
                            <span style={{ fontSize: "20px" }}>📄</span>
                            <p className="text-xs font-semibold" style={{ color: T.blue }}>{bluFile.name}</p>
                            <p className="text-xs" style={{ color: T.slate400 }}>{Math.round(bluFile.size / 1024)} KB{!isBusy && " — clicca per cambiare"}</p>
                          </>
                        ) : (
                          <>
                            <span style={{ fontSize: "20px", color: T.slate400 }}>⬆</span>
                            <p className="text-xs font-semibold" style={{ color: T.slate400 }}>Trascina il documento qui</p>
                            <p className="text-xs" style={{ color: T.slate400, opacity: 0.6 }}>o clicca per selezionare · PDF, DOC, DOCX, TXT</p>
                          </>
                        )}
                      </div>
                      {bluError && <p className="text-xs px-1" style={{ color: T.critical }}>{bluError}</p>}
                      <button onClick={handleBluUploadAndAnalyze} disabled={!bluFile || isBusy}
                        className="w-full py-2 text-xs font-bold uppercase tracking-widest transition-all"
                        style={{
                          backgroundColor: bluFile && !isBusy ? T.blueBg : "rgba(58,109,240,.05)",
                          color: bluFile && !isBusy ? T.blue : "rgba(58,109,240,.3)",
                          borderRadius: "4px",
                          border: `1px solid ${bluFile && !isBusy ? "rgba(58,109,240,.4)" : "transparent"}`,
                          cursor: bluFile && !isBusy ? "pointer" : "not-allowed",
                        }}>
                        {bluPhase === "uploading" ? "⬆ Caricamento..." : bluPhase === "analyzing" ? "⬡ Analisi CLAVIS..." : "⬆ Carica e verifica"}
                      </button>
                    </div>
                  )}

                  {/* ── STRADA AMBRA: Autocertifica */}
                  {bluPhase !== "success" && (
                    !showAutocertConfirm ? (
                      <button
                        onClick={() => setShowAutocertConfirm(true)}
                        disabled={isBusy}
                        className="w-full py-2 text-xs font-bold uppercase tracking-widest transition-all"
                        style={{
                          backgroundColor: T.warnBg,
                          color: T.warn,
                          borderRadius: "4px",
                          border: `1px solid rgba(245,158,11,.3)`,
                          opacity: isBusy ? 0.4 : 1,
                          cursor: isBusy ? "not-allowed" : "pointer",
                        }}>
                        ✎ Autocertifica
                      </button>
                    ) : (
                      <div className="rounded p-3 flex flex-col gap-3"
                        style={{ backgroundColor: "rgba(245,158,11,.06)", border: `1px solid rgba(245,158,11,.25)` }}>
                        <p className="text-xs leading-relaxed" style={{ color: T.warn }}>
                          ⚠ Stai autocertificando <strong>"{getShortcutLabel(plan.flag_key ?? "").replace(/^(Genera|Avvia|Carica|Email|Classifica|Gestisci|Verifica)\s+/i, "")}"</strong> sotto la tua responsabilità.
                          CLAVIS non verificherà il documento — sei tu a dichiararne la conformità.
                        </p>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-semibold uppercase tracking-wider"
                            style={{ color: T.slate400, fontSize: "9px" }}>
                            Nome / riferimento documento *
                          </label>
                          <input
                            value={autocertDocName}
                            onChange={e => setAutocertDocName(e.target.value)}
                            placeholder="Es: IRP_v2_2025.pdf — Piano Incident Response rev. marzo 2025"
                            className="w-full px-3 py-2 text-xs outline-none"
                            style={{
                              backgroundColor: "rgba(238,241,248,.06)",
                              border: `1px solid ${T.slate200}`,
                              borderRadius: "4px",
                              color: T.slate800,
                              fontFamily: "inherit",
                            }}
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setShowAutocertConfirm(false); setAutocertDocName(""); }}
                            className="flex-1 py-2 text-xs font-semibold uppercase tracking-widest rounded"
                            style={{ backgroundColor: "rgba(238,241,248,.06)", color: T.slate400, border: `1px solid ${T.slate200}` }}>
                            Annulla
                          </button>
                          <button
                            onClick={handleAutocertifica}
                            disabled={!autocertDocName.trim() || saving}
                            className="flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded transition-all"
                            style={{
                              backgroundColor: autocertDocName.trim() ? T.warnBg : "rgba(245,158,11,.04)",
                              color: autocertDocName.trim() ? T.warn : "rgba(245,158,11,.3)",
                              border: `1px solid ${autocertDocName.trim() ? "rgba(245,158,11,.4)" : "transparent"}`,
                              cursor: autocertDocName.trim() && !saving ? "pointer" : "not-allowed",
                            }}>
                            {saving ? "Salvataggio..." : "Confermo →"}
                          </button>
                        </div>
                      </div>
                    )
                  )}

                  {/* ── STRADA VERDE: routing per tipo */}
                  {plan.flag_key && bluPhase !== "success" && (() => {
                    const flagKey   = plan.flag_key!;
                    const cfg       = getShortcutConfig(flagKey);
                    const btnLabel  = cfg.label;
                    const btnColor  = cfg.color;

                    // upload → già gestito dalla drop zone blu, non mostrare verde
                    if (cfg.type === "upload") return null;

                    // checklist non-AI → in arrivo
                    if (cfg.type === "checklist" && flagKey !== "Flag_AIACT_HR_01") return (
                      <div className="w-full py-2 px-3 text-xs text-center rounded"
                        style={{ backgroundColor: "rgba(238,241,248,.04)", color: T.slate400, border: `1px solid ${T.slate200}` }}>
                        ⬡ {btnLabel} — funzionalità in arrivo
                      </div>
                    );

                    // AI checklist → fornitori con filtro
                    if (flagKey === "Flag_AIACT_HR_01") return (
                      <button
                        onClick={() => { onClose(); router.push("/fornitori?filter=ai"); }}
                        disabled={isBusy}
                        className="w-full py-2 text-xs font-bold uppercase tracking-widest transition-all"
                        style={{
                          backgroundColor: "rgba(62,207,142,.15)", color: T.low,
                          borderRadius: "4px", border: "1px solid rgba(62,207,142,.35)",
                          opacity: isBusy ? 0.4 : 1,
                        }}>
                        ⬡ {btnLabel}
                      </button>
                    );

                    // email → apre EmailBuilderModal inline
                    if (cfg.type === "email") return (
                      <>
                        <button
                          onClick={() => setShowEmail(true)}
                          disabled={isBusy}
                          className="w-full py-2 text-xs font-bold uppercase tracking-widest transition-all"
                          style={{
                            backgroundColor: "rgba(62,207,142,.15)", color: T.low,
                            borderRadius: "4px", border: "1px solid rgba(62,207,142,.35)",
                            opacity: isBusy ? 0.4 : 1,
                          }}>
                          ⬡ {btnLabel}
                        </button>
                        {showEmail && entityFullData && (
                          <EmailBuilderModal
                            flagsAperti={[{ flag_key: flagKey }]}
                            entityId={entityId}
                            entity={entityFullData}
                            company={companyData ?? { name: "" }}
                            onClose={() => setShowEmail(false)}
                          />
                        )}
                      </>
                    );

                    // generate → apre GenerateDocModal (via parent)
                    return (
                      <button
                        onClick={() => { onClose(); onOpenGenerate(flagKey); }}
                        disabled={isBusy}
                        className="w-full py-2 text-xs font-bold uppercase tracking-widest transition-all"
                        style={{
                          backgroundColor: btnColor === "green" ? "rgba(62,207,142,.15)" : T.blueBg,
                          color: btnColor === "green" ? T.low : T.blue,
                          borderRadius: "4px",
                          border: `1px solid ${btnColor === "green" ? "rgba(62,207,142,.35)" : "rgba(58,109,240,.35)"}`,
                          opacity: isBusy ? 0.4 : 1,
                        }}>
                        ⬡ {btnLabel}
                      </button>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* ── TAB POSPONI */}
          {tab === "posponi" && (
            <div className="space-y-4">
              <div className="px-3 py-3 rounded text-xs leading-relaxed"
                style={{ backgroundColor: T.warnBg, border: `1px solid rgba(245,158,11,.2)`, color: T.warn }}>
                ⚠ Posticipare non elimina l'obbligo. Per dimostrare accountability devi indicare
                cosa hai già fatto o perché la proroga è giustificata.
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.slate400 }}>
                  Nuova scadenza *
                </label>
                <input type="date" value={postponeDate} onChange={e => setPostponeDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  className="w-full px-3 py-2 text-sm outline-none"
                  style={{
                    backgroundColor: "rgba(238,241,248,.06)", colorScheme: "dark",
                    border: `1px solid ${T.slate200}`, borderRadius: "4px",
                    color: T.slate800, fontFamily: "inherit",
                  }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: T.slate400 }}>
                  Motivazione e azioni già intraprese *
                </label>
                <textarea
                  value={postponeNote} onChange={e => setPostponeNote(e.target.value)}
                  placeholder="Es: In attesa di risposta del consulente legale per la nomina DPO. Contatto avviato il..."
                  rows={4}
                  className="w-full px-3 py-2 text-sm outline-none resize-none"
                  style={{
                    backgroundColor: "rgba(238,241,248,.06)", border: `1px solid ${T.slate200}`,
                    borderRadius: "4px", color: T.slate800, fontFamily: "inherit",
                  }}
                />
              </div>
              <button onClick={handlePostpone}
                disabled={saving || !postponeDate || !postponeNote.trim()}
                className="w-full py-2.5 text-xs font-bold uppercase tracking-widest transition-all"
                style={{
                  backgroundColor: (postponeDate && postponeNote.trim()) ? T.warnBg : "rgba(245,158,11,.08)",
                  color: (postponeDate && postponeNote.trim()) ? T.warn : "rgba(245,158,11,.3)",
                  borderRadius: "4px",
                  border: `1px solid ${(postponeDate && postponeNote.trim()) ? "rgba(245,158,11,.4)" : "transparent"}`,
                  opacity: saving ? 0.6 : 1,
                  cursor: (postponeDate && postponeNote.trim()) ? "pointer" : "not-allowed",
                }}>
                {saving ? "Salvataggio..." : "Posponi scadenza →"}
              </button>
            </div>
          )}

          {/* ── TAB LOG */}
          {tab === "log" && (
            <div className="space-y-2">
              {loadingLogs && (
                <p className="text-xs text-center py-4" style={{ color: T.slate400 }}>Caricamento...</p>
              )}
              {!loadingLogs && logs.length === 0 && (
                <p className="text-xs text-center py-4 italic" style={{ color: T.slate400 }}>
                  Nessuna attività registrata per questa azione.
                </p>
              )}
              {logs.map(log => (
                <div key={log.id} className="px-3 py-2.5 rounded border"
                  style={{ backgroundColor: "rgba(238,241,248,.03)", borderColor: T.slate200 }}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: T.highBg, color: T.high, fontSize: "9px" }}>
                      {log.action_type}
                    </span>
                    <span className="text-xs" style={{ color: T.slate400, fontSize: "10px" }}>
                      {new Date(log.performed_at).toLocaleString("it-IT")}
                    </span>
                  </div>
                  {log.action_note && (
                    <p className="text-xs leading-relaxed" style={{ color: T.slate800 }}>{log.action_note}</p>
                  )}
                  {log.new_deadline && (
                    <p className="text-xs mt-1" style={{ color: T.warn }}>
                      → Nuova scadenza: {formatDate(log.new_deadline)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════

type FilterStatus = "tutti" | PlanStatus;
type FilterPriority = "tutti" | "critical" | "high" | "medium" | "low";

export default function RemediationPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { entityVersion } = useActiveEntity();

  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<RemediationPlan[]>([]);
  const [entityId, setEntityId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<RemediationPlan | null>(null);
  const [selectedTab, setSelectedTab] = useState<"info" | "posponi" | "log">("info");
  const [generateDocFlag, setGenerateDocFlag] = useState<{ flagKey: string; modalKey?: string } | null>(null);
  const [entityFullData, setEntityFullData] = useState<EntityData | null>(null);
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);

  const [filterStatus, setFilterStatus] = useState<FilterStatus>("tutti");
  const [filterPriority, setFilterPriority] = useState<FilterPriority>("tutti");
  const [search, setSearch] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);

  // ─── LOAD
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUserId(user.id);

      const storedEntityId = localStorage.getItem("clavis_active_entity_id");
      const entityQuery = storedEntityId
        ? supabase.from("entities").select("id").eq("id", storedEntityId).single()
        : supabase.from("entities").select("id").eq("created_by", user.id).limit(1).single();
      const { data: entityData } = await entityQuery;
      if (!entityData) { router.push("/onboarding"); return; }
      setEntityId(entityData.id);

      const { data: plansData } = await supabase
        .from("remediation_plans")
        .select("*")
        .eq("entity_id", entityData.id)
        .order("severity", { ascending: false });
      setPlans((plansData as RemediationPlan[]) ?? []);

      // Carica entity + company
      const { data: entityRow } = await supabase
        .from("entities")
        .select("name, entity_type, region, total_beds, company_id, nome_dpo, email_dpo, dpo_qualifica, dpo_telefono, responsabile_it, email_responsabile_it, referente_breach, website_url")
        .eq("id", entityData.id)
        .single();
      if (entityRow) {
        setCompanyId(entityRow.company_id ?? null);
        setEntityFullData({
          entity_name:           entityRow.name          ?? "",
          entity_type:           entityRow.entity_type   ?? "",
          region:                entityRow.region        ?? "",
          total_beds:            entityRow.total_beds    ?? null,
          nome_dpo:              entityRow.nome_dpo              ?? null,
          email_dpo:             entityRow.email_dpo             ?? null,
          dpo_qualifica:         entityRow.dpo_qualifica         ?? null,
          dpo_telefono:          entityRow.dpo_telefono          ?? null,
          responsabile_it:       entityRow.responsabile_it       ?? null,
          email_responsabile_it: entityRow.email_responsabile_it ?? null,
          referente_breach:      entityRow.referente_breach      ?? null,
          website_url:           entityRow.website_url           ?? null,
        });
        if (entityRow.company_id) {
          const { data: compRow } = await supabase
            .from("companies")
            .select("name, vat_number, legal_address, codice_fiscale, pec, legale_rappresentante, fatturato_fascia, n_dipendenti_fascia, modello_231")
            .eq("id", entityRow.company_id)
            .single();
          if (compRow) setCompanyData({
            name:                  compRow.name                  ?? "",
            vat_number:            compRow.vat_number            ?? null,
            legal_address:         compRow.legal_address         ?? null,
            codice_fiscale:        compRow.codice_fiscale        ?? null,
            pec:                   compRow.pec                   ?? null,
            legale_rappresentante: compRow.legale_rappresentante ?? null,
            fatturato_fascia:      compRow.fatturato_fascia      ?? null,
            n_dipendenti_fascia:   compRow.n_dipendenti_fascia   ?? null,
            modello_231:           compRow.modello_231           ?? null,
          });
        }
      }
    } finally {
      setLoading(false);
    }
  }, [supabase, router]);

  useEffect(() => { loadData(); }, [loadData, entityVersion]);

  // ─── PIANI FILTRATI
  const filtered = useMemo(() => {
    return plans.filter(plan => {
      const status = computeStatus(plan);
      if (!showCompleted && (status === "completato" || status === "non_applicabile")) return false;
      if (filterStatus !== "tutti" && status !== filterStatus) return false;
      if (filterPriority !== "tutti" && plan.priority !== filterPriority) return false;
      if (search) {
        const lbl = getLabel(plan).toLowerCase();
        const sec = getSection(plan).toLowerCase();
        if (!lbl.includes(search.toLowerCase()) && !sec.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [plans, filterStatus, filterPriority, search, showCompleted]);

  // ─── STATS
  const stats = useMemo(() => {
    const all = plans.map(p => computeStatus(p));
    return {
      totale:      plans.length,
      aperte:      all.filter(s => s === "aperto").length,
      in_corso:    all.filter(s => s === "in_corso").length,
      in_scadenza: all.filter(s => s === "in_scadenza").length,
      scadute:     all.filter(s => s === "scaduto").length,
      completate:  all.filter(s => s === "completato").length,
    };
  }, [plans]);

  const navItems = [
    { icon: "◈", label: "Panoramica", route: "/dashboard" },
    { icon: "⬡", label: "Remediation", route: "/remediation", active: true },
    { icon: "◷", label: "Scadenze", route: "/scadenze" },
    { icon: "⬒", label: "Struttura", route: "/struttura" },
    { icon: "⬡", label: "Fornitori", route: "/fornitori" },
    { icon: "🏢", label: "Anagrafica", route: "/anagrafica" },
  ];

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--ink)" }}>
      <p className="font-mono text-sm uppercase tracking-widest" style={{ color: T.slate400 }}>Caricamento...</p>
    </div>
  );

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "var(--ink, #0A0E1A)" }}>

      {/* ── SIDEBAR */}
      <aside className="flex-shrink-0 flex flex-col border-r"
        style={{ width: "200px", borderColor: T.slate200, backgroundColor: T.ink2 }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: T.slate200 }}>
          <p className="text-sm font-bold uppercase tracking-widest" style={{ color: T.slate800 }}>CLAVIS</p>
          <p style={{ color: T.slate400, fontSize: "9px" }}>Governance Normativa</p>
        </div>
        <nav className="flex-1 py-3">
          {navItems.map(item => (
            <button key={item.route} onClick={() => router.push(item.route)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
              style={{
                backgroundColor: item.active ? T.highBg : "transparent",
                borderLeft: item.active ? `2px solid ${T.high}` : "2px solid transparent",
                color: (item as any).active ? T.slate800 : T.slate400,
              }}>
              <span style={{ fontSize: "14px" }}>{item.icon}</span>
              <span className="text-xs font-semibold uppercase tracking-wider">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="px-3 py-3 border-t" style={{ borderColor: T.slate200 }}>
          <EntitySelector />
        </div>
      </aside>

      {/* ── MAIN */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Topbar */}
        <header className="flex-shrink-0 border-b flex items-center justify-between px-6 py-3"
          style={{ borderColor: T.slate200, backgroundColor: T.ink2, height: "52px" }}>
          <div>
            <span className="text-sm font-bold uppercase tracking-wider" style={{ color: T.slate800 }}>
              Piano di Remediation
            </span>
            <span className="text-xs ml-2" style={{ color: T.slate400 }}>(Compliance Action Plan)</span>
          </div>
          <div className="flex items-center gap-3">
            <EntitySelector />
            <button onClick={() => window.print()}
              className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-opacity hover:opacity-70"
              style={{ border: `1px solid ${T.slate200}`, color: T.slate400, borderRadius: "4px" }}>
              Stampa log →
            </button>
          </div>
        </header>

        {/* Stats bar */}
        <div className="flex-shrink-0 border-b px-6 py-3 flex items-center gap-4 flex-wrap"
          style={{ borderColor: T.slate200, backgroundColor: T.slate100 }}>
          {[
            { label: "Totale",      value: stats.totale,      color: T.slate400 },
            { label: "Aperte",      value: stats.aperte,      color: T.slate400 },
            { label: "In corso",    value: stats.in_corso,    color: T.high },
            { label: "In scadenza", value: stats.in_scadenza, color: T.warn },
            { label: "Scadute",     value: stats.scadute,     color: T.critical },
            { label: "Completate",  value: stats.completate,  color: T.low },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-1.5">
              <span className="text-lg font-bold font-mono" style={{ color: s.color }}>{s.value}</span>
              <span className="text-xs uppercase tracking-wider" style={{ color: T.slate400, fontSize: "9px" }}>{s.label}</span>
            </div>
          ))}
          <div className="flex-1 flex items-center gap-2 ml-4">
            <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: T.slate200 }}>
              <div className="h-full rounded-full transition-all"
                style={{
                  width: `${stats.totale ? Math.round(stats.completate / stats.totale * 100) : 0}%`,
                  backgroundColor: T.low,
                }} />
            </div>
            <span className="text-xs font-mono" style={{ color: T.low, fontSize: "10px" }}>
              {stats.totale ? Math.round(stats.completate / stats.totale * 100) : 0}% completato
            </span>
          </div>
        </div>

        {/* Filtri */}
        <div className="flex-shrink-0 border-b px-6 py-2.5 flex items-center gap-3 flex-wrap"
          style={{ borderColor: T.slate200 }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cerca azione..."
            className="px-3 py-1.5 text-xs outline-none"
            style={{
              backgroundColor: "rgba(238,241,248,.06)", border: `1px solid ${T.slate200}`,
              borderRadius: "4px", color: T.slate800, width: "200px",
            }}
          />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as FilterStatus)}
            className="px-3 py-1.5 text-xs outline-none"
            style={{
              backgroundColor: "rgba(238,241,248,.06)", colorScheme: "dark",
              border: `1px solid ${T.slate200}`, borderRadius: "4px", color: T.slate800,
            }}>
            <option value="tutti">Tutti gli stati</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value as FilterPriority)}
            className="px-3 py-1.5 text-xs outline-none"
            style={{
              backgroundColor: "rgba(238,241,248,.06)", colorScheme: "dark",
              border: `1px solid ${T.slate200}`, borderRadius: "4px", color: T.slate800,
            }}>
            <option value="tutti">Tutte le priorità</option>
            {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 cursor-pointer ml-auto">
            <span className="text-xs" style={{ color: T.slate400 }}>Mostra completate</span>
            <button onClick={() => setShowCompleted(v => !v)}
              style={{
                width: "36px", height: "20px", borderRadius: "10px",
                backgroundColor: showCompleted ? T.low : T.slate200,
                position: "relative", transition: "background-color 0.2s",
              }}>
              <div style={{
                position: "absolute", top: "2px",
                left: showCompleted ? "18px" : "2px",
                width: "16px", height: "16px", borderRadius: "50%",
                backgroundColor: "white", transition: "left 0.2s",
              }} />
            </button>
          </label>
        </div>

        {/* Tabella */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <span className="text-3xl">✓</span>
              <p className="text-sm font-semibold" style={{ color: T.slate800 }}>
                {plans.length === 0 ? "Nessun piano di remediation" : "Nessuna azione con questi filtri"}
              </p>
              <p className="text-xs" style={{ color: T.slate400 }}>
                {plans.length === 0 ? "Completa il triage per generare il piano" : "Prova a cambiare i filtri"}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0" style={{ backgroundColor: T.slate100 }}>
                <tr>
                  {["Azione", "Area", "Responsabile", "Scadenza", "Priorità", "Stato", ""].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left"
                      style={{ color: T.slate400, fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: `1px solid ${T.slate200}` }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((plan, i) => {
                  const status = computeStatus(plan);
                  const deadlineRef = computeDeadline(plan);
                  const days = daysLeft(deadlineRef);
                  const isCompleted = status === "completato" || status === "non_applicabile";
                  function defaultTab(s: ReturnType<typeof computeStatus>): "info" | "posponi" | "log" {
                    if (s === "scaduto") return "posponi";
                    if (s === "completato" || s === "non_applicabile") return "log";
                    return "info";
                  }
                  return (
                    <tr key={plan.id}
                      className="transition-colors cursor-pointer"
                      style={{ backgroundColor: i % 2 === 0 ? "transparent" : "rgba(238,241,248,.02)" }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = T.highBg)}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = i % 2 === 0 ? "transparent" : "rgba(238,241,248,.02)")}
                      onClick={() => { setSelectedPlan(plan); setSelectedTab(defaultTab(status)); }}>

                      <td className="px-4 py-3" style={{ borderBottom: `1px solid rgba(238,241,248,.06)` }}>
                        <p className="text-sm font-semibold leading-snug"
                          style={{ color: isCompleted ? T.slate400 : T.slate800, textDecoration: isCompleted ? "line-through" : "none", whiteSpace: "normal" }}>
                          {getLabel(plan)}
                        </p>
                      </td>
                      <td className="px-4 py-3" style={{ borderBottom: `1px solid rgba(238,241,248,.06)` }}>
                        <span className="text-xs font-mono px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: "rgba(217,178,90,.1)", color: T.bronze, fontSize: "11px", whiteSpace: "nowrap" }}>
                          {getSection(plan)}
                        </span>
                      </td>
                      <td className="px-4 py-3" style={{ borderBottom: `1px solid rgba(238,241,248,.06)` }}>
                        <span className="text-sm" style={{ color: T.slate400 }}>{plan.responsible ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3" style={{ borderBottom: `1px solid rgba(238,241,248,.06)` }}>
                        <div>
                          <span className="text-xs font-mono" style={{
                            color: days !== null && days < 0 ? T.critical : days !== null && days <= 30 ? T.warn : T.slate400,
                          }}>
                            {formatDate(deadlineRef)}
                          </span>
                          {days !== null && !isCompleted && (
                            <p className="text-xs" style={{ color: days < 0 ? T.critical : T.slate400, fontSize: "9px" }}>
                              {days < 0 ? `${Math.abs(days)}gg fa` : days === 0 ? "oggi" : `${days}gg`}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3" style={{ borderBottom: `1px solid rgba(238,241,248,.06)` }}>
                        <PriorityBadge priority={plan.priority} />
                      </td>
                      <td className="px-4 py-3" style={{ borderBottom: `1px solid rgba(238,241,248,.06)` }}>
                        <StatusBadge status={status} />
                      </td>
                      <td className="px-4 py-3" style={{ borderBottom: `1px solid rgba(238,241,248,.06)` }}
                        onClick={e => { e.stopPropagation(); setSelectedPlan(plan); setSelectedTab(defaultTab(status)); }}>
                        <span className="text-xs font-mono" style={{ color: T.high }}>→</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* MODAL AZIONE */}
      {selectedPlan && entityId && userId && (
        <ActionModal
          plan={selectedPlan}
          entityId={entityId}
          companyId={companyId}
          userId={userId}
          entityFullData={entityFullData}
          companyData={companyData}
          initialTab={selectedTab}
          onClose={() => setSelectedPlan(null)}
          onUpdate={loadData}
          onOpenGenerate={(flagKey) => {
            setSelectedPlan(null);
            const modalKey = getGenerateModalKey(flagKey);
            setGenerateDocFlag({ flagKey, modalKey });
          }}
        />
      )}

      {/* GENERATE DOC MODAL */}
      {generateDocFlag && entityFullData && (
        <GenerateDocModal
          flagKey={generateDocFlag.flagKey}
          modalKey={generateDocFlag.modalKey}
          entity={entityFullData}
          company={companyData ?? { name: "" }}
          onClose={() => { setGenerateDocFlag(null); loadData(); }}
        />
      )}
    </div>
  );
}
