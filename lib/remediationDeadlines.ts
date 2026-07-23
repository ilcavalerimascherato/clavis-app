// lib/remediationDeadlines.ts
// Criterio temporale per le remediation — legge il campo "scadenza" del flag
// nel dizionario legale (config/legal_dictionary.json) invece di dedurre la
// data da testo libero (deadline_label). Fonte SSOT per /documenti e
// /remediation quando un flag ha una scadenza normativa nota.

export type ScadenzaDef =
  | { tipo: "fissa"; data: string }
  // Dichiarati per lo schema TS ma non ancora popolati da nessun flag reale
  // nel dizionario — implementarli oggi significherebbe scrivere logica non
  // verificabile contro dati veri. Restano no-op finché non serve davvero.
  | { tipo: "relativa"; giorni: number; da: "triage" | "creazione" }
  | { tipo: "periodica"; ogni_mesi: number; da: "triage" | "creazione" };

export interface FlagDictEntry {
  scadenza?: ScadenzaDef;
  [key: string]: unknown;
}

export interface RemediationRowLike {
  created_at?: string | null;
}

/**
 * Calcola la scadenza normativa di un flag dal dizionario legale.
 * Ritorna null se il flag non ha una "scadenza" definita, o se il tipo
 * non è ancora implementato (solo "fissa" è attivo oggi).
 */
export function computeDeadline(
  flag: FlagDictEntry | null | undefined,
  _entity: unknown,
  _company: unknown,
  _remediationRow: RemediationRowLike | null | undefined,
): Date | null {
  const scadenza = flag?.scadenza;
  if (!scadenza) return null;

  if (scadenza.tipo === "fissa") {
    const d = new Date(scadenza.data);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}
