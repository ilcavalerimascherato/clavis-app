"use client";

/**
 * CLAVIS — /scadenze
 * Vista derivata delle scadenze di portfolio (entity attiva + società, anche
 * i flag company-level se la struttura non è capofila — vedi gating sotto).
 * Nessuna logica propria di calcolo riga: consuma lib/hooks/useRemediationRows.ts,
 * la stessa fonte usata da /remediation (stesso criterio temporale, stesso
 * badge requires, stesso ordinamento). Il click porta a /remediation sulla
 * riga giusta — nessun modal proprio, per non triplicare il gap noto di
 * ActionModal (ricalcolo con logica legacy, in attesa del suo turno).
 *
 * Non confondere con ScadenzeBox in app/nis2/page.tsx: quello è un
 * cronoprogramma NIS2 hardcoded, già vivo, non toccato da questa pagina.
 */

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { getLabel, formatDate } from "@/components/ActionModal";
import { useRemediationRows, getSection, type RemediationRow, type PlanStatus } from "@/lib/hooks/useRemediationRows";
import { useAnchorEntity } from "@/lib/hooks/useAnchorEntity";
import { T } from "@/lib/clavis-tokens";

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

function PriorityBadge({ priority }: { priority: string | null }) {
  const cfg = PRIORITY_CONFIG[priority ?? "low"] ?? PRIORITY_CONFIG.low;
  return (
    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

// Stesso linguaggio visivo del badge di gating in /documenti (CapofilaGateBadge).
function CapofilaGateBadge({ anchorName }: { anchorName: string }) {
  return (
    <span
      title={`Gestito dalla struttura capofila (${anchorName})`}
      style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "4px",
               backgroundColor: "rgba(94,134,245,.12)", color: "var(--shield)", whiteSpace: "nowrap" }}>
      🔒 Gestito da {anchorName}
    </span>
  );
}

export default function ScadenzePage() {
  const router = useRouter();
  const { loading, profile, rows } = useRemediationRows();
  const { anchorEntity, isAnchor, loading: anchorLoading } = useAnchorEntity();

  // C) Solo righe con scadenza risolta (oggi: tipo "fissa") — i flag senza
  // scadenza restano fuori da questa pagina, per costruzione, non un bug.
  // Le già completate/non applicabili non servono in una vista di scadenze.
  const dueRows = useMemo(
    () => rows.filter(r => r.deadlineISO !== null && r.status !== "completato" && r.status !== "non_applicabile"),
    [rows]
  );

  const scadute = dueRows.filter(r => r.status === "scaduto").length;
  const inScadenza = dueRows.filter(r => r.status === "in_scadenza").length;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--ink)" }}>
      <p className="font-mono text-sm uppercase tracking-widest" style={{ color: T.slate400 }}>Caricamento...</p>
    </div>
  );

  return (
    <AppShell profile={profile} activeRoute="/scadenze">
      <main id="main-content" className="clavis-workspace flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex-shrink-0 border-b px-6 py-3 flex items-center gap-4 flex-wrap"
          style={{ borderColor: T.slate200, backgroundColor: T.slate100 }}>
          <div>
            <p className="text-sm font-bold" style={{ color: T.slate800 }}>Scadenze</p>
            <p className="text-xs" style={{ color: T.slate400 }}>Struttura attiva e società — vista derivata da /remediation</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-lg font-bold font-mono" style={{ color: T.critical }}>{scadute}</span>
            <span className="text-xs uppercase tracking-wider" style={{ color: T.slate400, fontSize: "12px" }}>Scadute</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-lg font-bold font-mono" style={{ color: T.warn }}>{inScadenza}</span>
            <span className="text-xs uppercase tracking-wider" style={{ color: T.slate400, fontSize: "12px" }}>In scadenza (30gg)</span>
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {dueRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <span className="text-3xl">✓</span>
              <p className="text-sm font-semibold" style={{ color: T.slate800 }}>Nessuna scadenza attiva</p>
              <p className="text-xs" style={{ color: T.slate400 }}>Le azioni senza una scadenza normativa nota non compaiono qui</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0" style={{ backgroundColor: T.slate100 }}>
                <tr>
                  {["Azione", "Area", "Scadenza", "Priorità", "Stato", ""].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left"
                      style={{ color: T.slate400, fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: `1px solid ${T.slate200}` }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dueRows.map((row: RemediationRow, i) => {
                  const { plan, deadlineISO, days, status, requiresLabels, livello } = row;
                  const gated = livello === "company" && !anchorLoading && !isAnchor;
                  const gatedTooltip = gated
                    ? `Documento gestito dalla struttura capofila (${anchorEntity?.nome ?? "capofila"})`
                    : undefined;
                  return (
                    <tr key={plan.id}
                      title={gatedTooltip}
                      className="transition-colors"
                      style={{
                        backgroundColor: i % 2 === 0 ? "transparent" : "rgba(238,241,248,.02)",
                        opacity: gated ? 0.55 : 1,
                        cursor: gated ? "default" : "pointer",
                      }}
                      onMouseEnter={e => { if (!gated) e.currentTarget.style.backgroundColor = T.highBg; }}
                      onMouseLeave={e => { if (!gated) e.currentTarget.style.backgroundColor = i % 2 === 0 ? "transparent" : "rgba(238,241,248,.02)"; }}
                      onClick={() => { if (!gated) router.push(`/remediation?highlight=${plan.id}`); }}>

                      <td className="px-4 py-3" style={{ borderBottom: `1px solid rgba(238,241,248,.06)` }}>
                        <p className="text-sm font-semibold leading-snug" style={{ color: T.slate800, whiteSpace: "normal" }}>
                          {getLabel(plan)}
                        </p>
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
                        <div>
                          <span className="text-xs font-mono" style={{
                            color: days === null ? T.slate400 : days < 0 ? T.critical : days <= 30 ? T.warn : T.low,
                          }}>
                            {formatDate(deadlineISO)}
                          </span>
                          {days !== null && (
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
                      <td className="px-4 py-3" style={{ borderBottom: `1px solid rgba(238,241,248,.06)` }}>
                        {gated
                          ? <CapofilaGateBadge anchorName={anchorEntity?.nome ?? "capofila"} />
                          : <span className="text-xs font-mono" style={{ color: T.high }}>→</span>
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
    </AppShell>
  );
}
