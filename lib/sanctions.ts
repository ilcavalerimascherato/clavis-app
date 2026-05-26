/**
 * lib/sanctions.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Funzione PURA di stima sanzionatoria calibrata sui dati reali dell'ente.
 * Zero dipendenze esterne (no Supabase, no fetch, no DOM).
 *
 * Logica:
 *  1. Soggettività NIS2: essenziale se dip ≥ 50 O fatturato ≥ 10M O SSN
 *  2. Stima = min(massimo_edittale, fatturato_medio × percentuale_norma)
 *  3. Fattore riduzione × 0.3 se rischio sezione rilevante < 50
 *  4. Fattore aggravante × 1.5 se storico violazioni
 *  5. Aggravante GDPR × 1.3 per categorie ultra-sensibili (REMS, SerD, ecc.)
 *  6. Min stima = 10% del max (scenario favorevole documentato)
 */

// ─── Tipi pubblici ────────────────────────────────────────────────────────────

export interface CalcSanzioneCalibrataParams {
  fatturato_fascia: string       // 'sotto_1M'|'1M_5M'|'5M_20M'|'20M_50M'|'oltre_50M'
  n_dipendenti_fascia: string    // 'sotto_20'|'20_49'|'50_249'|'250_piu'
  convenzione_ssn: boolean
  tipo_convenzione: string       // 'SSN'|'SSR'|'mista'|'privato'
  storico_violazioni: boolean
  entity_type: string            // per derivare categorie ultra-sensibili
  sectionRisks: Record<string, number>  // es. { S1: 72, S2: 45, S3: 30, ... }
}

export interface CalcSanzioneCalibrataResult {
  nis2: {
    applicabile: boolean
    soggettivita: "essenziale" | "importante" | "non_soggetto"
    stima_min: number
    stima_max: number
  }
  gdpr: {
    aggravante_categorie_speciali: boolean
    stima_min: number
    stima_max: number
  }
  d231: {
    applicabile: boolean
    stima_min: number
    stima_max: number
  }
  aiact: {
    applicabile: boolean
    stima_min: number
    stima_max: number
  }
  totale_stima_min: number
  totale_stima_max: number
  note: string[]
}

// ─── Tabelle di lookup ────────────────────────────────────────────────────────

/** Fatturato mediano della fascia (usato per calcolo %-norma) */
const FAT_MEDIO: Record<string, number> = {
  sotto_1M:  500_000,
  "1M_5M":   3_000_000,
  "5M_20M":  12_500_000,
  "20M_50M": 35_000_000,
  oltre_50M: 75_000_000,
}

/**
 * Categorie ultra-sensibili per GDPR (dati sanitari di categorie vulnerabili).
 * Se l'entity_type contiene uno di questi keyword → aggravante ×1.3
 */
const ULTRA_SENSITIVE_KW = [
  "rems",
  "serd",
  "psich",
  "minori",
  "dipendenze",
  "neuropsich",
  "tossic",
  "adolesc",
]

// ─── Helper di classificazione ────────────────────────────────────────────────

function fatGte(fascia: string, threshold: "1M" | "10M" | "50M"): boolean {
  const rank: Record<string, number> = { sotto_1M: 0, "1M_5M": 1, "5M_20M": 2, "20M_50M": 3, oltre_50M: 4 }
  const minRank: Record<string, number> = { "1M": 1, "10M": 2, "50M": 4 }
  return (rank[fascia] ?? 0) >= (minRank[threshold] ?? 99)
}

function dipGte(fascia: string, threshold: "20" | "50" | "250"): boolean {
  const rank: Record<string, number> = { sotto_20: 0, "20_49": 1, "50_249": 2, "250_piu": 3 }
  const minRank: Record<string, number> = { "20": 1, "50": 2, "250": 3 }
  return (rank[fascia] ?? 0) >= (minRank[threshold] ?? 99)
}

function isUltraSensitive(entityType: string): boolean {
  const lower = entityType.toLowerCase()
  return ULTRA_SENSITIVE_KW.some(kw => lower.includes(kw))
}

/** Rischio composito di un insieme di sezioni: se anche solo una ≥ 50 → non riduciamo */
function maxSectionRisk(risks: Record<string, number>, sections: string[]): number {
  return Math.max(0, ...sections.map(s => risks[s] ?? 50))
}

// ─── Funzione principale ──────────────────────────────────────────────────────

export function calcSanzioneCalibrata(
  params: CalcSanzioneCalibrataParams,
): CalcSanzioneCalibrataResult {
  const {
    fatturato_fascia,
    n_dipendenti_fascia,
    convenzione_ssn,
    tipo_convenzione,
    storico_violazioni,
    entity_type,
    sectionRisks,
  } = params

  const note: string[] = []
  const fatMedio = FAT_MEDIO[fatturato_fascia] ?? 500_000

  // ── 1. Soggettività NIS2 ─────────────────────────────────────────────────────
  let soggettivita: "essenziale" | "importante" | "non_soggetto" = "non_soggetto"

  const isEssenziale =
    dipGte(n_dipendenti_fascia, "50") ||
    fatGte(fatturato_fascia, "10M") ||
    convenzione_ssn

  const isImportante = !isEssenziale && (
    dipGte(n_dipendenti_fascia, "20") ||
    fatGte(fatturato_fascia, "1M")
  )

  if (isEssenziale) {
    soggettivita = "essenziale"
    if (convenzione_ssn)
      note.push(`Soggetto NIS2 essenziale per convenzione ${tipo_convenzione || "SSN"} — classificazione automatica indipendente dalle dimensioni.`)
    else if (dipGte(n_dipendenti_fascia, "50"))
      note.push("Soggetto NIS2 essenziale per numero di dipendenti ≥ 50.")
    else
      note.push("Soggetto NIS2 essenziale per fatturato ≥ 10 M €.")
  } else if (isImportante) {
    soggettivita = "importante"
    note.push("Soggetto NIS2 importante (< 50 dipendenti e < 10 M €, ma ≥ 20 dip. o ≥ 1 M €).")
  } else {
    note.push("Struttura sotto le soglie minime NIS2 — non soggetta direttamente; monitorare l'impatto su fornitori critici.")
  }

  // ── 2. Aggravanti e riduzioni generali ──────────────────────────────────────
  const fattoreViolazioni = storico_violazioni ? 1.5 : 1.0
  if (storico_violazioni)
    note.push("Aggravante: storico violazioni precedenti documentate — stima aumentata del 50%.")

  // ── 3. NIS2 ──────────────────────────────────────────────────────────────────
  const nis2Applicabile = soggettivita !== "non_soggetto"
  let nis2Max = 0

  if (nis2Applicabile) {
    const massimale = soggettivita === "essenziale" ? 10_000_000 : 7_000_000
    const pct       = soggettivita === "essenziale" ? 0.02       : 0.014
    const rawNis2   = Math.min(massimale, fatMedio * pct)

    // Sezioni rilevanti: catena di fornitura (S1) e gestione incidenti (S4)
    const nis2Risk = maxSectionRisk(sectionRisks, ["S1", "S4"])
    const fattoreRid = nis2Risk < 50 ? 0.3 : 1.0
    if (fattoreRid < 1)
      note.push("NIS2: Riduzione 70% — rischio Supply Chain e Incident Management sotto la soglia critica (misure in corso).")

    nis2Max = rawNis2 * fattoreRid * fattoreViolazioni
  }

  // ── 4. GDPR ───────────────────────────────────────────────────────────────────
  // GDPR si applica sempre alle strutture sanitarie
  const aggravanteCatSpeciali = isUltraSensitive(entity_type)
  if (aggravanteCatSpeciali)
    note.push("GDPR: Aggravante categorie ultra-sensibili (REMS / SerD / psichiatria / minori) — stima aumentata del 30%.")

  const massimaleGdpr = 20_000_000
  const rawGdpr       = Math.min(massimaleGdpr, fatMedio * 0.04)

  // Sezioni rilevanti: AI/dispositivi medici (S2) e shadow IT/governance dati (S3)
  const gdprRisk     = maxSectionRisk(sectionRisks, ["S2", "S3"])
  const fattoreGdpr  = gdprRisk < 50 ? 0.3 : 1.0
  if (fattoreGdpr < 1)
    note.push("GDPR: Riduzione 70% — rischio AI/Dati e Shadow IT sotto la soglia critica.")

  const gdprMax = rawGdpr * fattoreGdpr * fattoreViolazioni * (aggravanteCatSpeciali ? 1.3 : 1.0)

  // ── 5. D.Lgs. 231 ─────────────────────────────────────────────────────────────
  // Applicabile se struttura media/grande o convenzionata SSN
  const d231Applicabile = dipGte(n_dipendenti_fascia, "20") || convenzione_ssn
  let d231Max = 0

  if (d231Applicabile) {
    // Percentuale massimale proporzionale alla dimensione (flat rule, non % fatturato)
    const pct231 =
      n_dipendenti_fascia === "250_piu"  ? 1.00 :
      n_dipendenti_fascia === "50_249"   ? 0.60 :
      n_dipendenti_fascia === "20_49"    ? 0.30 :
      0.15  // sotto_20 ma SSN → quota minima

    const raw231 = 1_549_370 * pct231

    // Sezioni rilevanti: shadow IT/231 (S3) e formazione/modello org. (S5)
    const d231Risk  = maxSectionRisk(sectionRisks, ["S3", "S5"])
    const fattore231 = d231Risk < 50 ? 0.3 : 1.0
    if (fattore231 < 1)
      note.push("D.Lgs. 231: Riduzione 70% — Governance dati e Formazione sotto la soglia critica.")

    d231Max = raw231 * fattore231 * fattoreViolazioni
  }

  // ── 6. AI Act ─────────────────────────────────────────────────────────────────
  // Applicabile se l'ente usa sistemi AI clinici (S2 risk ≥ 25 indica presenza AI)
  const s2Risk = sectionRisks["S2"] ?? 0
  const aiactApplicabile = s2Risk >= 25

  let aiactMax = 0

  if (aiactApplicabile) {
    const rawAiact   = Math.min(35_000_000, fatMedio * 0.07)
    const fattoreAiact = s2Risk < 50 ? 0.3 : 1.0
    if (fattoreAiact < 1)
      note.push("AI Act: Riduzione 70% — conformità sistemi AI sotto la soglia critica (maturità in sviluppo).")
    else
      note.push("AI Act: Esposizione rilevata per sistemi AI in uso clinico — conformità da verificare entro agosto 2026.")

    aiactMax = rawAiact * fattoreAiact * fattoreViolazioni
  }

  // ── 7. Totali ──────────────────────────────────────────────────────────────────
  const totMax = nis2Max + gdprMax + d231Max + aiactMax
  const totMin = totMax * 0.10  // scenario favorevole documentato (10% del massimo stimato)

  return {
    nis2: {
      applicabile:   nis2Applicabile,
      soggettivita,
      stima_min: Math.round(nis2Max * 0.10),
      stima_max: Math.round(nis2Max),
    },
    gdpr: {
      aggravante_categorie_speciali: aggravanteCatSpeciali,
      stima_min: Math.round(gdprMax * 0.10),
      stima_max: Math.round(gdprMax),
    },
    d231: {
      applicabile: d231Applicabile,
      stima_min: Math.round(d231Max * 0.10),
      stima_max: Math.round(d231Max),
    },
    aiact: {
      applicabile: aiactApplicabile,
      stima_min: Math.round(aiactMax * 0.10),
      stima_max: Math.round(aiactMax),
    },
    totale_stima_min: Math.round(totMin),
    totale_stima_max: Math.round(totMax),
    note,
  }
}
