// lib/remediationDeadlines.ts
// Criterio temporale per le remediation — legge il campo "scadenza" del flag
// nel dizionario legale (config/legal_dictionary.json) invece di dedurre la
// data da testo libero (deadline_label). Fonte SSOT per /documenti e
// /remediation quando un flag ha una scadenza normativa nota.

export type ScadenzaDef =
  | { tipo: "fissa"; data: string }
  // Finestra che si riapre ogni anno alle stesse date (formato "MM-DD"),
  // es. Flag_NIS2_Categorizzazione: 1 maggio - 30 giugno. Vedi
  // computeRecurringWindow()/isSatisfiedForRecurringCycle() più sotto.
  | { tipo: "ricorrente_annuale"; finestra_apertura: string; finestra_chiusura: string }
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

  if (scadenza.tipo === "ricorrente_annuale") {
    return computeRecurringWindow(scadenza).closesAt;
  }

  return null;
}

export interface RecurringWindow {
  /** Anno a cui appartiene la finestra rilevante (aperta oggi, o l'ultima chiusa). */
  cycleYear: number;
  opensAt: Date;
  closesAt: Date;
  /** true se "oggi" cade dentro [opensAt, closesAt]. */
  isOpen: boolean;
}

/**
 * Risolve la finestra ricorrente rilevante per "oggi" (o per la data passata
 * in `now`, utile nei test): se oggi è dentro o dopo l'apertura di
 * quest'anno, il ciclo è quest'anno (finestra aperta o già chiusa); se siamo
 * prima dell'apertura di quest'anno (gen-apr), il ciclo rilevante è ancora
 * quello dell'anno scorso, chiuso il 30/6 scorso e non riaperto fino al 1/5
 * prossimo. Un solo calcolo copre così tutto l'arco "fuori finestra"
 * (1 luglio - 30 aprile), che attraversa il cambio di anno solare.
 */
export function computeRecurringWindow(
  scadenza: { finestra_apertura: string; finestra_chiusura: string },
  now: Date = new Date(),
): RecurringWindow {
  const [openMM, openDD] = scadenza.finestra_apertura.split("-").map(Number);
  const [closeMM, closeDD] = scadenza.finestra_chiusura.split("-").map(Number);
  const year = now.getFullYear();
  const opensThisYear = new Date(year, openMM - 1, openDD, 0, 0, 0, 0);
  const cycleYear = now < opensThisYear ? year - 1 : year;
  const opensAt = new Date(cycleYear, openMM - 1, openDD, 0, 0, 0, 0);
  const closesAt = new Date(cycleYear, closeMM - 1, closeDD, 23, 59, 59, 999);
  return { cycleYear, opensAt, closesAt, isOpen: now >= opensAt && now <= closesAt };
}

/**
 * Un flag "ricorrente_annuale" conta come soddisfatto per il ciclo in corso
 * solo se completato a partire dall'apertura di QUESTA finestra (non basta
 * essere stato completato/dichiarato in un ciclo precedente) — è questo che
 * fa "tornare in corso" il flag il 1° maggio anche se lo stato grezzo del
 * piano è rimasto "completato" dall'anno prima.
 */
export function isSatisfiedForRecurringCycle(
  completedAt: string | null | undefined,
  window: Pick<RecurringWindow, "opensAt">,
): boolean {
  if (!completedAt) return false;
  const d = new Date(completedAt);
  return !isNaN(d.getTime()) && d >= window.opensAt;
}
