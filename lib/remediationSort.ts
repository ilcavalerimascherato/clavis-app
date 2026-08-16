// lib/remediationSort.ts
// Ordinamento condiviso delle righe remediation — SSOT per /remediation (via
// useRemediationRows.ts, da cui eredita anche /scadenze, "stesso ordinamento" per design)
// e, in prospettiva, per la dashboard. Sostituisce le 3 logiche indipendenti precedenti:
// query .order(severity) scavalcata da un .sort(days) in useRemediationRows, nessun
// riordino in /remediation/page.tsx, sortRemediation(execution_order) separato in dashboard.
//
// Formula (decisa, non implementata qui per la prima volta — vedi PR):
//  1. priority: CRITICA prima di ALTA prima di MEDIA — asse primario, globale
//  Dentro lo stesso gruppo priority (mai tra gruppi diversi):
//  2. risk_score_weight decrescente
//  3. severity decrescente — spareggio
//  4. scadenza AFFIDABILE prima di una assente/discorsiva; tra due affidabili, la più vicina prima
//  5. dipendenza non soddisfatta (requiresLabels non vuoto): scivola in fondo al gruppo
//     priority — il badge 🔒 resta visibile, questo è un riordino, non un filtro

import LEGAL_DICT from "@/config/legal_dictionary.json";
import type { RemediationPlan } from "@/components/ActionModal";
import type { FlagDictEntry } from "@/lib/remediationDeadlines";

const PRIORITY_RANK: Record<string, number> = { CRITICA: 0, ALTA: 1, MEDIA: 2 };

function priorityRank(priority: string | null): number {
  return priority != null && priority in PRIORITY_RANK ? PRIORITY_RANK[priority] : 3;
}

function riskScoreWeight(flagKey: string | null): number {
  if (!flagKey) return 0;
  const flag = (LEGAL_DICT as { flags?: Record<string, { risk_score_weight?: number }> }).flags?.[flagKey];
  return flag?.risk_score_weight ?? 0;
}

function getDictFlag(flagKey: string | null): FlagDictEntry | undefined {
  if (!flagKey) return undefined;
  return (LEGAL_DICT as { flags?: Record<string, FlagDictEntry> }).flags?.[flagKey];
}

/**
 * Una scadenza è "affidabile" quando viene da una fonte strutturata (postponed_until,
 * deadline_date/due_date espliciti in colonna, o "scadenza" nel dizionario legale) oppure
 * da un deadline_label testuale chiaramente parsabile (Immediato/Scaduta/"N giorni"/data
 * completa "2 dicembre 2027"/mese+anno "Ottobre 2026"). Frasi discorsive tipo "Alla
 * prossima scadenza polizza" o "Verifica scadenza regionale specifica" restano NON
 * affidabili: non dicono QUANDO.
 *
 * Deliberatamente non riusa computeDeadline/computeDeadlineDash (euristica già nota
 * fragile, duplicata in ActionModal.tsx e dashboard/page.tsx): il loro fallback numMatch
 * (primo numero trovato nel testo) leggerebbe "2025-2026 secondo roadmap..." come "2025
 * giorni", marcandolo falsamente affidabile. Qui serve solo un booleano onesto, non una data.
 */
export function isDeadlineAffidabile(
  plan: Pick<RemediationPlan, "postponed_until" | "deadline_date" | "due_date" | "deadline_label">,
  dictFlag?: FlagDictEntry | null,
): boolean {
  if (plan.postponed_until || plan.deadline_date || plan.due_date) return true;
  if (dictFlag?.scadenza) return true;
  const label = plan.deadline_label;
  if (!label) return false;
  const lower = label.toLowerCase().trim();
  if (lower.startsWith("immediato")) return true;
  if (lower.startsWith("scaduta")) return true;
  if (/^\d+\s+giorni\b/.test(lower)) return true;
  if (/^\d{1,2}\s+[a-zàèéìòù]+\s+\d{4}/.test(lower)) return true;
  if (/^[a-zàèéìòù]+\s+\d{4}$/.test(lower)) return true;
  return false;
}

export interface SortableRemediationRow {
  plan: Pick<RemediationPlan, "flag_key" | "priority" | "severity" | "postponed_until" | "deadline_date" | "due_date" | "deadline_label">;
  deadlineISO: string | null;
  days: number | null;
  requiresLabels: string[];
}

function deadlineTier(row: SortableRemediationRow): 0 | 1 {
  return row.deadlineISO !== null && isDeadlineAffidabile(row.plan, getDictFlag(row.plan.flag_key)) ? 0 : 1;
}

/**
 * Ordina le righe remediation secondo la formula condivisa (vedi sopra). Pura — non muta
 * l'array di input — e stabile (Array.prototype.sort è stable da ES2019): a parità di
 * chiavi mantiene l'ordine relativo di ingresso.
 */
export function sortRemediationRows<T extends SortableRemediationRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const prA = priorityRank(a.plan.priority);
    const prB = priorityRank(b.plan.priority);
    if (prA !== prB) return prA - prB;

    const depA = a.requiresLabels.length > 0 ? 1 : 0;
    const depB = b.requiresLabels.length > 0 ? 1 : 0;
    if (depA !== depB) return depA - depB;

    const rswA = riskScoreWeight(a.plan.flag_key);
    const rswB = riskScoreWeight(b.plan.flag_key);
    if (rswA !== rswB) return rswB - rswA;

    const sevA = a.plan.severity ?? 0;
    const sevB = b.plan.severity ?? 0;
    if (sevA !== sevB) return sevB - sevA;

    const tierA = deadlineTier(a);
    const tierB = deadlineTier(b);
    if (tierA !== tierB) return tierA - tierB;
    if (tierA === 0) return (a.days ?? 0) - (b.days ?? 0);

    return 0;
  });
}
