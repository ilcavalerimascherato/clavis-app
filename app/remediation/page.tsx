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

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useActiveEntity } from "@/contexts/EntityContext";
import AppShell from "@/components/layout/AppShell";
import LEGAL_DICT from "@/config/legal_dictionary.json";
import type { EntityData, CompanyData } from "@/lib/documentTemplates";
import { ActionModal, RemediationPlan, computeStatus, computeDeadline, formatDate, daysLeft, getLabel } from "@/components/ActionModal";

import { T } from "@/lib/clavis-tokens";
import { useFeatureGate } from "@/lib/tier";
import type { UserTier } from "@/lib/tier";

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

function getSection(plan: RemediationPlan): string {
  if (plan.flag_key) {
    const entry = (LEGAL_DICT as any).flags?.[plan.flag_key];
    if (entry?.short_label) return entry.short_label;
  }
  return plan.control_code ?? "—";
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
  const [entityFullData, setEntityFullData] = useState<EntityData | null>(null);
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);

  const [userTier, setUserTier] = useState<UserTier>("free");

  const [filterStatus, setFilterStatus] = useState<FilterStatus>("tutti");
  const [filterPriority, setFilterPriority] = useState<FilterPriority>("tutti");
  const [search, setSearch] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);

  // ─── LOAD
  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUserId(user.id);
      const { data: profRow } = await supabase.from("profiles").select("tier").eq("id", user.id).single();
      if (profRow?.tier) setUserTier(profRow.tier as UserTier);

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

  // ─── TIER GATE
  const canRemediate = useFeatureGate("remediation_active", userTier);

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

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--ink)" }}>
      <p className="font-mono text-sm uppercase tracking-widest" style={{ color: T.slate400 }}>Caricamento...</p>
    </div>
  );

  return (
    <AppShell
      profile={null}
      activeRoute="/remediation"
    >
      <>
      <main id="main-content" className="clavis-workspace flex-1 flex flex-col overflow-hidden">

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
              <span className="text-xs uppercase tracking-wider" style={{ color: T.slate400, fontSize: "12px" }}>{s.label}</span>
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
            <span className="text-xs font-mono" style={{ color: T.low, fontSize: "12px" }}>
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
                      style={{ color: T.slate400, fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: `1px solid ${T.slate200}` }}>
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
                      onClick={() => {
                        if (!canRemediate) { router.push("/upgrade"); return; }
                        setSelectedPlan(plan);
                        setSelectedTab(defaultTab(status));
                      }}>

                      <td className="px-4 py-3" style={{ borderBottom: `1px solid rgba(238,241,248,.06)` }}>
                        <p className="text-sm font-semibold leading-snug"
                          style={{ color: isCompleted ? T.slate400 : T.slate800, textDecoration: isCompleted ? "line-through" : "none", whiteSpace: "normal" }}>
                          {getLabel(plan)}
                        </p>
                      </td>
                      <td className="px-4 py-3" style={{ borderBottom: `1px solid rgba(238,241,248,.06)` }}>
                        <span className="text-xs font-mono px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: "rgba(217,178,90,.1)", color: T.bronze, fontSize: "13px", whiteSpace: "nowrap" }}>
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
                            <p className="text-xs" style={{ color: days < 0 ? T.critical : T.slate400, fontSize: "12px" }}>
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
                        onClick={e => {
                          e.stopPropagation();
                          if (!canRemediate) { router.push("/upgrade"); return; }
                          setSelectedPlan(plan);
                          setSelectedTab(defaultTab(status));
                        }}>
                        {canRemediate
                          ? <span className="text-xs font-mono" style={{ color: T.high }}>→</span>
                          : <span className="text-xs font-bold" style={{ color: "#2563eb" }}>🔒 Pro</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>

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
          onUpdate={() => loadData(true)}
        />
      )}
      </>
    </AppShell>
  );
}
