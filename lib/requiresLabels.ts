// lib/requiresLabels.ts
// Estratto da app/documenti/page.tsx — badge "Richiede prima: ..." condiviso
// con /remediation. Un flag è "completo" quando tutti i suoi documenti nel
// catalogo sono CONFORME/DICHIARATO; un documento/riga con un "requires" su
// un flag non ancora completo mostra il badge, senza bloccare il click.

export interface CatalogDocForCompletion {
  key: string;
  flag_key: string;
  livello: "company" | "entity";
  obbligatorio: boolean;
}

export interface ComplianceItemForCompletion {
  stato: string;
}

// Unico elenco degli stati "soddisfatti" — usato ovunque nel codice sia
// necessario decidere se un documento conta come compliant (badge requires,
// bussola, contatori /documenti, dashboard). MAI "GENERATO": un documento
// generato da CLAVIS richiede ancora firma/ricarica o verifica AI prima di
// essere conforme. Corrispondenza con l'etichetta UI (STATO_CONFIG in
// app/documenti/page.tsx): CONFORME → "conforme", DICHIARATO → "autocertificato".
export const SATISFIED_STATUSES: readonly string[] = ["CONFORME", "DICHIARATO"];

export function isSatisfiedStatus(stato: string | null | undefined): boolean {
  return stato != null && SATISFIED_STATUSES.includes(stato);
}

/**
 * Flag "completo" = tutti i suoi documenti OBBLIGATORI nel catalogo sono in uno
 * stato SATISFIED_STATUSES, cercati nella tabella corretta secondo il "livello"
 * di ciascun documento. I documenti non obbligatori del flag non contano: non
 * devono bloccare un prerequisito altrui (es. i due allegati opzionali di un
 * piano di risposta incidenti non devono impedire ad altri flag di considerarlo
 * risolto).
 */
export function computeFlagCompletionMap(
  catalog: CatalogDocForCompletion[],
  companyItemMap: Record<string, ComplianceItemForCompletion | undefined>,
  entityItemMap: Record<string, ComplianceItemForCompletion | undefined>,
): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const doc of catalog) {
    if (!doc.obbligatorio) continue;
    const item = doc.livello === "company" ? companyItemMap[doc.key] : entityItemMap[doc.key];
    const isDone = isSatisfiedStatus(item?.stato);
    map[doc.flag_key] = (map[doc.flag_key] ?? true) && isDone;
  }
  return map;
}

export interface DocRequires {
  requires?: string[];
  requires_labels?: string[];
}

export interface CatalogDocForSequence extends CatalogDocForCompletion {
  label: string;
}

/**
 * I documenti obbligatori di uno stesso flag formano una catena, nell'ordine
 * in cui compaiono in "documents[]" nel dizionario (es. Flag_GDPR_DPO: nomina
 * → lettera al Garante → registro attività) — non serve un campo esplicito,
 * l'ordine del catalogo (che rispetta l'ordine del JSON) è la sequenza.
 * Ritorna l'etichetta del primo documento precedente non ancora soddisfatto,
 * o null se il documento è sbloccato (nessun prerequisito nella catena, o
 * tutti i precedenti già CONFORME/DICHIARATO).
 */
export function getSequenceBlockLabel(
  doc: CatalogDocForSequence,
  catalog: CatalogDocForSequence[],
  companyItemMap: Record<string, ComplianceItemForCompletion | undefined>,
  entityItemMap: Record<string, ComplianceItemForCompletion | undefined>,
): string | null {
  if (!doc.obbligatorio) return null;
  const chain = catalog.filter(d => d.flag_key === doc.flag_key && d.obbligatorio);
  const idx = chain.findIndex(d => d.key === doc.key);
  if (idx <= 0) return null;
  for (let i = 0; i < idx; i++) {
    const prev = chain[i];
    const item = prev.livello === "company" ? companyItemMap[prev.key] : entityItemMap[prev.key];
    if (!isSatisfiedStatus(item?.stato)) return prev.label;
  }
  return null;
}

/**
 * Un documento "company"-level è bloccato (mostrato ma non azionabile) per le
 * entity non-àncora del gruppo — solo l'entity àncora può agire sui documenti
 * a livello company. Estratto da app/documenti/page.tsx (isGatedByAnchor
 * inline), condiviso con /remediation per lo stesso segnale di gating.
 */
export function isGatedByAnchor(livello: "company" | "entity", isAnchor: boolean): boolean {
  return livello === "company" && !isAnchor;
}

/**
 * Etichette dei flag prerequisiti (def.requires) non ancora completi,
 * secondo flagCompletionMap. Non blocca nulla: solo per il badge informativo.
 */
export function getUnmetRequiresLabels(
  def: DocRequires,
  flagCompletionMap: Record<string, boolean>,
): string[] {
  if (!def.requires || def.requires.length === 0) return [];
  return def.requires
    .map((reqKey, idx) => ({ reqKey, label: def.requires_labels?.[idx] ?? reqKey }))
    .filter(({ reqKey }) => flagCompletionMap[reqKey] === false)
    .map(({ label }) => label);
}
