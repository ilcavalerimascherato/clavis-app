"use client";

/**
 * CLAVIS — /remediation
 * Piano completo adempimenti con stati, log, posponi, filtri.
 * Fonte: remediation_plans + compliance_activity_log + entity_compliance_items + legal_dictionary
 * Calcolo riga (scadenza/stato/requires): lib/hooks/useRemediationRows.ts — condiviso con /scadenze.
 *
 * STRADE DI CHIUSURA:
 *  BLU   → Carica documento → AI verifica → entity_compliance_items stato=VERIFICATO
 *  AMBRA → Autocertifica (utente dichiara) → entity_compliance_items stato=DICHIARATO
 *  VERDE → Genera documento direttamente con GenerateDocModal
 */

import React, { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { ActionModal, RemediationPlan, formatDate, getLabel } from "@/components/ActionModal";
import { useRemediationRows, getSection, type RemediationDocumentRow, type PlanStatus } from "@/lib/hooks/useRemediationRows";
import { isSatisfiedStatus } from "@/lib/requiresLabels";
import { useAnchorEntity } from "@/lib/hooks/useAnchorEntity";

import { T } from "@/lib/clavis-tokens";
import { useFeatureGate } from "@/lib/tier";
import type { UserTier } from "@/lib/tier";

// ─── STATI
const STATUS_CONFIG: Record<PlanStatus, { label: string; color: string; bg: string; dot: string }> = {
  aperto:           { label: "Aperto",          color: T.slate400, bg: "rgba(154,163,189,.12)", dot: T.slate400 },
  in_corso:         { label: "In corso",         color: T.high,     bg: T.highBg,               dot: T.high },
  in_scadenza:      { label: "In scadenza",      color: T.warn,     bg: T.warnBg,               dot: T.warn },
  completato:       { label: "Completato",       color: T.low,      bg: T.lowBg,                dot: T.low },
  scaduto:          { label: "Scaduto",          color: T.critical, bg: T.critBg,               dot: T.critical },
  non_applicabile:  { label: "Non applicabile",  color: T.bronze,   bg: "rgba(217,178,90,.12)", dot: T.bronze },
  finestra_persa:   { label: "Finestra persa",   color: T.violet,   bg: T.violetBg,             dot: T.violet },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  CRITICA: { label: "Critica",  color: T.critical },
  ALTA:    { label: "Alta",     color: T.warn },
  MEDIA:   { label: "Media",    color: T.high },
};
const PRIORITY_FALLBACK = { label: "Bassa", color: T.slate400 };

// ─── STATUS BADGE
// `detail` sovrascrive l'etichetta statica di STATUS_CONFIG quando serve un
// testo dinamico (es. "finestra_persa": l'anno del ciclo perso cambia riga
// per riga, non è un'unica label fissa nel Record).
function StatusBadge({ status, detail }: { status: PlanStatus; detail?: string }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.dot }} />
      {detail ?? cfg.label}
    </span>
  );
}

/** Testo dinamico per il badge "finestra_persa" — null per tutti gli altri stati. */
function finestraPersaDetail(status: PlanStatus, recurringCycleYear: number | null): string | undefined {
  if (status !== "finestra_persa" || recurringCycleYear === null) return undefined;
  return `Finestra ${recurringCycleYear} persa — prossima finestra 1 mag-30 giu ${recurringCycleYear + 1}`;
}

// ─── PRIORITY BADGE
function PriorityBadge({ priority }: { priority: string | null }) {
  const cfg = (priority ? PRIORITY_CONFIG[priority] : undefined) ?? PRIORITY_FALLBACK;
  return (
    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

// Stesso linguaggio visivo del badge di gating già in /documenti e /scadenze.
function CapofilaGateBadge({ anchorName }: { anchorName: string }) {
  return (
    <span
      title={`Documento gestito dalla struttura capofila (${anchorName})`}
      style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "4px",
               backgroundColor: "rgba(94,134,245,.12)", color: "var(--shield)", whiteSpace: "nowrap" }}>
      🔒 Gestito da {anchorName}
    </span>
  );
}

/**
 * Tab di apertura del modal per una riga-documento: prima guarda il documento specifico
 * (già soddisfatto → log, indipendentemente dallo stato del flag padre — un documento
 * risolto dentro un flag ancora aperto non deve riaprire il wizard di completamento),
 * poi ricade sullo stesso criterio di sempre a livello di flag (scaduto → posponi,
 * completato/non applicabile → log, altrimenti info).
 */
function defaultTab(row: RemediationDocumentRow): "info" | "posponi" | "log" {
  if (isSatisfiedStatus(row.docStato)) return "log";
  if (row.status === "completato" || row.status === "non_applicabile") return "log";
  if (row.status === "scaduto") return "posponi";
  return "info";
}

interface DocGroup { plan: RemediationPlan; flagKey: string; docs: RemediationDocumentRow[]; }

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════

type FilterStatus = "tutti" | PlanStatus;
type FilterPriority = "tutti" | "CRITICA" | "ALTA" | "MEDIA";

function RemediationPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");

  const {
    loading, profile, entityId, companyId, userId,
    entityFullData, companyData, rows, documentRows, refresh,
  } = useRemediationRows();
  const { anchorEntity } = useAnchorEntity();

  const [selectedPlan, setSelectedPlan] = useState<RemediationPlan | null>(null);
  const [selectedDocKey, setSelectedDocKey] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<"info" | "posponi" | "log">("info");

  const [filterStatus, setFilterStatus] = useState<FilterStatus>("tutti");
  const [filterPriority, setFilterPriority] = useState<FilterPriority>("tutti");
  const [search, setSearch] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);

  const highlightRowRef = useRef<HTMLTableRowElement | null>(null);

  // ─── TIER GATE
  const canRemediate = useFeatureGate("remediation_active", (profile?.tier ?? "free") as UserTier);

  // ─── RIGHE FILTRATE — grana DOCUMENTO (documentRows eredita ordine e arricchimento
  // da rows, vedi useRemediationRows.ts). showCompleted/filterStatus restano sullo
  // status del FLAG padre (row.status): un flag multi-documento non ancora chiuso non
  // deve spezzarsi a metà nella lista solo perché un suo documento è già a posto —
  // il gruppo resta intero finché il flag non è completato/non applicabile.
  const filtered = useMemo(() => {
    return documentRows.filter(({ plan, status, doc }) => {
      if (!showCompleted && (status === "completato" || status === "non_applicabile")) return false;
      if (filterStatus !== "tutti" && status !== filterStatus) return false;
      if (filterPriority !== "tutti" && plan.priority !== filterPriority) return false;
      if (search) {
        const q = search.toLowerCase();
        const lbl = getLabel(plan).toLowerCase();
        const sec = getSection(plan).toLowerCase();
        const docLbl = doc.label.toLowerCase();
        if (!lbl.includes(q) && !sec.includes(q) && !docLbl.includes(q)) return false;
      }
      return true;
    });
  }, [documentRows, filterStatus, filterPriority, search, showCompleted]);

  // ─── GRUPPI PER FLAG — filtered è già ordinato con le righe dello stesso flag
  // consecutive (proprietà di documentRows, vedi ricognizione); qui si accorpano solo
  // in blocchi contigui, nessun riordino.
  const groups = useMemo<DocGroup[]>(() => {
    const out: DocGroup[] = [];
    for (const row of filtered) {
      const last = out[out.length - 1];
      if (last && last.flagKey === row.flagKey) last.docs.push(row);
      else out.push({ plan: row.plan, flagKey: row.flagKey, docs: [row] });
    }
    return out;
  }, [filtered]);

  // ─── STATS — grana DOCUMENTO: un flag con N documenti pesa N volte nei contatori
  // e nella percentuale; i 6 flag senza documents[] (resolution_type "multi_step")
  // non producono righe in documentRows e quindi non compaiono più nei contatori.
  const stats = useMemo(() => {
    const all = documentRows.map(r => r.status);
    return {
      totale:      documentRows.length,
      aperte:      all.filter(s => s === "aperto").length,
      in_corso:    all.filter(s => s === "in_corso").length,
      in_scadenza: all.filter(s => s === "in_scadenza").length,
      scadute:     all.filter(s => s === "scaduto").length,
      completate:  all.filter(s => s === "completato").length,
    };
  }, [documentRows]);

  // ─── ARRIVO DA /scadenze CON UNA RIGA IN EVIDENZA
  useEffect(() => {
    if (highlightId && highlightRowRef.current) {
      highlightRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightId, filtered]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--ink)" }}>
      <p className="font-mono text-sm uppercase tracking-widest" style={{ color: T.slate400 }}>Caricamento...</p>
    </div>
  );

  return (
    <AppShell
      profile={profile}
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
            <option value="tutti" style={{ backgroundColor: "var(--ink2)", color: T.slate800 }}>Tutti gli stati</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <option key={k} value={k} style={{ backgroundColor: "var(--ink2)", color: T.slate800 }}>{v.label}</option>
            ))}
          </select>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value as FilterPriority)}
            className="px-3 py-1.5 text-xs outline-none"
            style={{
              backgroundColor: "rgba(238,241,248,.06)", colorScheme: "dark",
              border: `1px solid ${T.slate200}`, borderRadius: "4px", color: T.slate800,
            }}>
            <option value="tutti" style={{ backgroundColor: "var(--ink2)", color: T.slate800 }}>Tutte le priorità</option>
            {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
              <option key={k} value={k} style={{ backgroundColor: "var(--ink2)", color: T.slate800 }}>{v.label}</option>
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
                {rows.length === 0 ? "Nessun piano di remediation" : "Nessuna azione con questi filtri"}
              </p>
              <p className="text-xs" style={{ color: T.slate400 }}>
                {rows.length === 0 ? "Completa il triage per generare il piano" : "Prova a cambiare i filtri"}
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
                {(() => {
                  let refAssigned = false;
                  let flatIndex = 0;
                  return groups.map((group, gi) => {
                    const isMultiDoc = group.docs.length > 1;
                    const completedInGroup = group.docs.filter(d => isSatisfiedStatus(d.docStato)).length;
                    return (
                      <React.Fragment key={`${group.flagKey}-${gi}`}>
                        {isMultiDoc && (
                          <tr>
                            <td colSpan={7} className="px-4 py-2"
                              style={{ backgroundColor: T.slate100, borderBottom: `1px solid ${T.slate200}`, borderTop: gi === 0 ? undefined : `1px solid ${T.slate200}` }}>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-mono px-1.5 py-0.5 rounded"
                                  style={{ backgroundColor: "rgba(217,178,90,.1)", color: T.bronze, fontSize: "13px", whiteSpace: "nowrap" }}>
                                  {getSection(group.plan)}
                                </span>
                                <span className="text-sm font-bold" style={{ color: T.slate800 }}>{getLabel(group.plan)}</span>
                                <PriorityBadge priority={group.plan.priority} />
                                <span className="text-xs font-mono" style={{ color: T.slate400 }}>
                                  {completedInGroup}/{group.docs.length} documenti completi
                                </span>
                              </div>
                            </td>
                          </tr>
                        )}
                        {group.docs.map((row) => {
                          const { plan, doc, docStato, deadlineISO, days, status, requiresLabels, sequenceLabel, gated, recurringCycleYear } = row;
                          const isFlagCompleted = status === "completato" || status === "non_applicabile";
                          const isDocSatisfied = isSatisfiedStatus(docStato);
                          const isHighlighted = highlightId === plan.id;
                          const rowIndex = flatIndex++;
                          const baseBg = isHighlighted ? T.highBg : rowIndex % 2 === 0 ? "transparent" : "rgba(238,241,248,.02)";
                          let assignRef: React.Ref<HTMLTableRowElement> | undefined = undefined;
                          if (isHighlighted && !refAssigned) { assignRef = highlightRowRef; refAssigned = true; }

                          function openRow() {
                            if (!canRemediate) { router.push("/upgrade"); return; }
                            if (gated) return;
                            setSelectedPlan(plan);
                            setSelectedDocKey(doc.key);
                            setSelectedTab(defaultTab(row));
                          }

                          return (
                            <tr key={`${plan.id}-${doc.key}`}
                              ref={assignRef}
                              className={`transition-colors ${gated ? "" : "cursor-pointer"}`}
                              style={{
                                backgroundColor: baseBg,
                                outline: isHighlighted ? `1px solid ${T.high}` : undefined,
                                outlineOffset: isHighlighted ? "-1px" : undefined,
                              }}
                              onMouseEnter={e => { if (!isHighlighted) e.currentTarget.style.backgroundColor = T.highBg; }}
                              onMouseLeave={e => { if (!isHighlighted) e.currentTarget.style.backgroundColor = baseBg; }}
                              onClick={openRow}>

                              <td className="px-4 py-3" style={{ borderBottom: `1px solid rgba(238,241,248,.06)`, paddingLeft: isMultiDoc ? "28px" : undefined }}>
                                <p className="text-sm font-semibold leading-snug"
                                  style={{ color: isDocSatisfied ? T.slate400 : T.slate800, textDecoration: isDocSatisfied ? "line-through" : "none", whiteSpace: "normal" }}>
                                  {isMultiDoc && <span style={{ color: T.slate400 }}>↳ </span>}
                                  {doc.label}
                                  {!doc.obbligatorio && <span className="text-xs" style={{ color: T.slate400, fontSize: "11px" }}> (opzionale)</span>}
                                </p>
                                {sequenceLabel && (
                                  <span title={`Completa prima questo documento della sequenza: ${sequenceLabel}`}
                                    className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-xs"
                                    style={{ backgroundColor: T.highBg, color: T.high, fontSize: "11px" }}>
                                    🔗 Prima: {sequenceLabel}
                                  </span>
                                )}
                                {requiresLabels.length > 0 && (
                                  <span title={`Completa prima: ${requiresLabels.join(", ")}`}
                                    className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-xs"
                                    style={{ backgroundColor: "rgba(217,164,65,.12)", color: T.bronze, fontSize: "11px" }}>
                                    ⏳ Richiede prima: {requiresLabels.join(", ")}
                                  </span>
                                )}
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
                                    color: days === null ? T.slate400 : days < 0 ? T.critical : days <= 30 ? T.warn : T.low,
                                  }}>
                                    {formatDate(deadlineISO)}
                                  </span>
                                  {days !== null && !isFlagCompleted && (
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
                                <StatusBadge status={status} detail={finestraPersaDetail(status, recurringCycleYear)} />
                              </td>
                              <td className="px-4 py-3" style={{ borderBottom: `1px solid rgba(238,241,248,.06)` }}
                                onClick={e => { e.stopPropagation(); openRow(); }}>
                                {!canRemediate
                                  ? <span className="text-xs font-bold" style={{ color: "#2563eb" }}>🔒 Pro</span>
                                  : gated
                                    ? <CapofilaGateBadge anchorName={anchorEntity?.nome ?? "capofila"} />
                                    : status === "finestra_persa"
                                      ? <span className="text-xs font-semibold whitespace-nowrap" style={{ color: T.violet }}>Prepara ora →</span>
                                      : <span className="text-xs font-mono" style={{ color: T.high }}>→</span>
                                }
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  });
                })()}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* MODAL AZIONE */}
      {selectedPlan && entityId && userId && (
        <ActionModal
          plan={selectedPlan}
          docKey={selectedDocKey ?? undefined}
          entityId={entityId}
          companyId={companyId}
          userId={userId}
          entityFullData={entityFullData}
          companyData={companyData}
          initialTab={selectedTab}
          onClose={() => { setSelectedPlan(null); setSelectedDocKey(null); }}
          onUpdate={() => refresh(true)}
        />
      )}
      </>
    </AppShell>
  );
}

export default function RemediationPage() {
  return (
    <Suspense fallback={null}>
      <RemediationPageInner />
    </Suspense>
  );
}
