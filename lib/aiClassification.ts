/**
 * CLAVIS — lib/aiClassification.ts
 * Logica di classificazione AI Act per sistemi digitali.
 *
 * Questo file è la SSOT per:
 * - Definizione tipi questionario (3 livelli interlocutore)
 * - Scoring delle risposte → ai_classification_type
 * - Calcolo flag AI Act attivati
 * - Label e colori badge per la UI
 *
 * La funzione fn_classifica_sistema_ai() su Supabase replica
 * questa stessa logica lato DB per consistenza.
 */

// ─────────────────────────────────────────────────────────────
// TIPI BASE — allineati agli ENUM Supabase
// ─────────────────────────────────────────────────────────────

export type AiClassificationType =
  | "NON_VALUTATO"
  | "NON_AI"
  | "RULE_BASED"
  | "AI_BASSO_RISCHIO"
  | "AI_ALTO_RISCHIO";

export type QuestionarioRuoloType = "direttore" | "qualita" | "it";

/** Risposte grezze normalizzate dal questionario (indipendenti dal ruolo) */
export interface QuestionarioRisposte {
  output_automatico?: boolean;       // il sistema genera alert/output su singoli ospiti
  impatto_clinico?: boolean;         // l'output influenza decisioni cliniche/assistenziali
  apprendimento?: boolean;           // il sistema si aggiorna autonomamente (ML/modello)
  dichiarazione_fornitore?: boolean; // il fornitore dichiara esplicitamente AI/ML
  mdr_class?: "I" | "IIa" | "IIb" | "III" | "non_applicabile" | "non_verificato";
  log_retention?: "si" | "no" | "non_so";
}

// ─────────────────────────────────────────────────────────────
// QUESTIONARIO — domande per livello interlocutore
// ─────────────────────────────────────────────────────────────

export interface Domanda {
  id: string;
  testo: string;
  sottotesto?: string;
  tipo: "boolean" | "tristate";
  opzioni_tristate?: string[];       // solo per tipo tristate
  flag_trigger: keyof QuestionarioRisposte;
  valore_positivo?: string;          // per tristate: quale valore mappa a true
}

export const QUESTIONARIO: Record<QuestionarioRuoloType, Domanda[]> = {
  direttore: [
    {
      id: "D_Q1",
      testo: "Questo software vi avvisa automaticamente di qualcosa riguardo agli ospiti?",
      sottotesto: "Per esempio: una notifica di rischio caduta, un alert su un parametro vitale, un suggerimento sulla terapia.",
      tipo: "boolean",
      flag_trigger: "output_automatico",
    },
    {
      id: "D_Q2",
      testo: "Questi avvisi cambiano nel tempo anche senza che voi abbiate modificato nulla nelle impostazioni?",
      sottotesto: "Se il sistema sembra 'imparare' o migliorare da solo.",
      tipo: "boolean",
      flag_trigger: "apprendimento",
    },
    {
      id: "D_Q3",
      testo: "Il vostro fornitore vi ha mai parlato di intelligenza artificiale o machine learning riferito a questo software?",
      sottotesto: "Anche solo in una presentazione commerciale o in un documento.",
      tipo: "boolean",
      flag_trigger: "dichiarazione_fornitore",
    },
  ],

  qualita: [
    {
      id: "Q_Q1",
      testo: "Il sistema genera score, classificazioni o alert automatici su singoli ospiti?",
      sottotesto: "Punteggi di rischio caduta, score di fragilità, alert parametri vitali, classificazioni automatiche.",
      tipo: "boolean",
      flag_trigger: "output_automatico",
    },
    {
      id: "Q_Q2",
      testo: "Questi output influenzano decisioni cliniche o assistenziali sul singolo ospite?",
      sottotesto: "Cambio terapia, attivazione presidio, modifica piano assistenziale, segnalazione al medico.",
      tipo: "boolean",
      flag_trigger: "impatto_clinico",
    },
    {
      id: "Q_Q3",
      testo: "Il motore decisionale del sistema si aggiorna automaticamente, o il fornitore rilascia aggiornamenti al modello separatamente dal software?",
      sottotesto: "Diverso dagli aggiornamenti normali dell'applicativo — specificamente il componente che calcola i risultati.",
      tipo: "boolean",
      flag_trigger: "apprendimento",
    },
    {
      id: "Q_Q4",
      testo: "Il fornitore dichiara esplicitamente componenti AI o machine learning nella documentazione tecnica o commerciale?",
      tipo: "boolean",
      flag_trigger: "dichiarazione_fornitore",
    },
  ],

  it: [
    {
      id: "IT_Q1",
      testo: "Il sistema produce output che influenzano decisioni su singoli pazienti senza intervento umano obbligatorio?",
      sottotesto: "Alert, score, classificazioni automatiche che il personale clinico riceve e utilizza.",
      tipo: "boolean",
      flag_trigger: "output_automatico",
    },
    {
      id: "IT_Q2",
      testo: "L'output clinico è generato da un modello ML, rete neurale o algoritmo predittivo aggiornato dal fornitore?",
      sottotesto: "Distinto da regole fisse configurate manualmente in fase di setup.",
      tipo: "boolean",
      flag_trigger: "apprendimento",
    },
    {
      id: "IT_Q3",
      testo: "Il sistema ha impatto diretto su decisioni cliniche o assistenziali (terapia, monitoraggio, piano di cura)?",
      tipo: "boolean",
      flag_trigger: "impatto_clinico",
    },
    {
      id: "IT_Q4",
      testo: "Il software è marcato CE come dispositivo medico?",
      tipo: "tristate",
      opzioni_tristate: ["Sì — Classe IIa o superiore", "Sì — Classe I", "No", "Non verificato"],
      flag_trigger: "mdr_class",
      valore_positivo: "Sì — Classe IIa o superiore",
    },
    {
      id: "IT_Q5",
      testo: "Esistono log automatici delle operazioni/decisioni del sistema conservati per almeno 6 mesi?",
      tipo: "tristate",
      opzioni_tristate: ["Sì", "No", "Non so"],
      flag_trigger: "log_retention",
      valore_positivo: "Sì",
    },
  ],
};

// ─────────────────────────────────────────────────────────────
// SCORING — da risposte a classificazione
// ─────────────────────────────────────────────────────────────

export interface ClassificazioneResult {
  classificazione: AiClassificationType;
  flags_attivati: string[];
  motivazione: string;            // testo per UI — spiega il perché
  azione_richiesta: string | null; // CTA sintetica per il direttore
}

/** Flag AI Act attivati per classificazione AI_ALTO_RISCHIO */
const FLAGS_ALTO_RISCHIO = [
  "Flag_AIACT_HR_01",
  "Flag_AIACT_Deployer",
  "Flag_AIACT_Literacy",
  "Flag_AIACT_HumanOversight",
  "Flag_AIACT_LogRetention",
  "Flag_AIACT_IncidentPlan",
  "Flag_AIACT_Transparency",
] as const;

export function classificaSistema(
  risposte: QuestionarioRisposte
): ClassificazioneResult {
  const {
    output_automatico,
    impatto_clinico,
    apprendimento,
    dichiarazione_fornitore,
  } = risposte;

  // ALTO RISCHIO — output automatici con impatto clinico diretto
  if (output_automatico && impatto_clinico) {
    return {
      classificazione: "AI_ALTO_RISCHIO",
      flags_attivati: [...FLAGS_ALTO_RISCHIO],
      motivazione:
        "Il sistema genera output automatici che influenzano decisioni cliniche su singoli ospiti. " +
        "Rientra nella categoria AI ad alto rischio (Allegato III punto 5b AI Act). " +
        "Sono richiesti FRIA, supervisione umana documentata, log retention 6 mesi e informativa ospiti.",
      azione_richiesta:
        "Avviare immediatamente la procedura FRIA e designare un AI Officer.",
    };
  }

  // BASSO RISCHIO — output automatici ma senza impatto clinico diretto
  if (output_automatico && !impatto_clinico) {
    return {
      classificazione: "AI_BASSO_RISCHIO",
      flags_attivati: ["Flag_AIACT_Literacy"],
      motivazione:
        "Il sistema genera output automatici ma non influenza direttamente decisioni cliniche. " +
        "Obbligo di AI literacy per il personale che lo utilizza (Art. 4 AI Act).",
      azione_richiesta:
        "Verificare che il personale abbia ricevuto formazione sull'uso del sistema.",
    };
  }

  // RULE_BASED — segnali indiretti (fornitore dichiara AI o sistema che si aggiorna)
  if (apprendimento || dichiarazione_fornitore) {
    return {
      classificazione: "RULE_BASED",
      flags_attivati: ["Flag_AIACT_Deployer"],
      motivazione:
        "Il sistema presenta caratteristiche che potrebbero configurare l'uso di AI " +
        "(aggiornamenti automatici o dichiarazioni del fornitore). " +
        "È necessario richiedere chiarimenti formali al fornitore per escludere l'applicabilità AI Act.",
      azione_richiesta:
        "Richiedere al fornitore dichiarazione scritta sulla presenza o assenza di componenti AI.",
    };
  }

  // NON_AI — nessun segnale
  return {
    classificazione: "NON_AI",
    flags_attivati: [],
    motivazione:
      "Il sistema non presenta caratteristiche riconducibili a sistemi AI ai sensi dell'AI Act. " +
      "Nessun obbligo AI Act specifico applicabile.",
    azione_richiesta: null,
  };
}

// ─────────────────────────────────────────────────────────────
// UI HELPERS — badge, colori, label
// ─────────────────────────────────────────────────────────────

export interface ClassificazioneBadge {
  label: string;
  labelBreve: string;
  colore: string;      // Tailwind bg class
  testo: string;       // Tailwind text class
  bordo: string;       // Tailwind border class
  icona: string;       // emoji o simbolo
}

export const CLASSIFICAZIONE_BADGE: Record<AiClassificationType, ClassificazioneBadge> = {
  NON_VALUTATO: {
    label: "Non valutato",
    labelBreve: "Da valutare",
    colore: "bg-zinc-800",
    testo: "text-zinc-400",
    bordo: "border-zinc-700",
    icona: "○",
  },
  NON_AI: {
    label: "Nessun componente AI",
    labelBreve: "Non AI",
    colore: "bg-emerald-950",
    testo: "text-emerald-400",
    bordo: "border-emerald-800",
    icona: "✓",
  },
  RULE_BASED: {
    label: "Verifica fornitore richiesta",
    labelBreve: "Da chiarire",
    colore: "bg-amber-950",
    testo: "text-amber-400",
    bordo: "border-amber-700",
    icona: "?",
  },
  AI_BASSO_RISCHIO: {
    label: "AI — Basso rischio",
    labelBreve: "AI Basso",
    colore: "bg-blue-950",
    testo: "text-blue-400",
    bordo: "border-blue-700",
    icona: "◈",
  },
  AI_ALTO_RISCHIO: {
    label: "AI — Alto rischio",
    labelBreve: "AI Alto rischio",
    colore: "bg-red-950",
    testo: "text-red-400",
    bordo: "border-red-700",
    icona: "⚠",
  },
};

/** Sottocategorie supplier che per definizione non possono essere AI ad alto rischio */
export const SUBCATEGORIE_ESCLUSE_AI: string[] = [
  "SOFTWARE_PRESENZE",
  "SOFTWARE_CONTABILITA",
  "SOFTWARE_PASTI",
  "VPN",
  "CONNETTIVITA",
  "HOSTING_CLOUD",
  "BACKUP",
  "EMAIL_AZIENDALE",
  "FIREWALL_ANTIVIRUS",
  "CENTRALINO",
  "STUDIO_PAGHE",
  "SERVIZIO_MENSA",
  "SERVIZIO_LAVANDERIA",
];

/**
 * Pre-classifica un sistema come NON_AI senza questionario
 * se la sottocategoria è nella lista di esclusione.
 * Risparmia tempo all'utente per fornitori evidentemente non AI.
 */
export function preClassificaDaSottocategoria(
  sottocategoria: string
): AiClassificationType | null {
  if (SUBCATEGORIE_ESCLUSE_AI.includes(sottocategoria)) {
    return "NON_AI";
  }
  return null; // null = richiede questionario
}

/**
 * Il ruolo per le domande NON dipende dal tier (che è una dimensione
 * commerciale, non di competenza). Viene scelto esplicitamente dall'utente
 * all'apertura del modal di valutazione con una domanda iniziale:
 *
 *   "Chi risponde a questa valutazione?"
 *   → Sono il Direttore / Responsabile della struttura
 *   → Sono il Responsabile Qualità / DPO / Compliance
 *   → Sono il Responsabile IT / tecnico informatico
 *
 * Questa funzione mappa la selezione UI al tipo corretto.
 */
export function getRuoloDomande(
  selezioneUtente: "direttore" | "qualita" | "it"
): QuestionarioRuoloType {
  return selezioneUtente;
}

/** Label UI per la selezione ruolo all'apertura del modal */
export const RUOLO_SCELTA_LABEL: Record<QuestionarioRuoloType, { label: string; sublabel: string }> = {
  direttore: {
    label: "Direttore / Responsabile struttura",
    sublabel: "Rispondo alle domande come responsabile operativo della struttura",
  },
  qualita: {
    label: "Responsabile Qualità / DPO / Compliance",
    sublabel: "Conosco i processi clinici e i sistemi software in uso",
  },
  it: {
    label: "Responsabile IT / Tecnico informatico",
    sublabel: "Conosco l'architettura tecnica dei sistemi",
  },
};
