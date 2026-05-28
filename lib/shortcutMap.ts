/**
 * CLAVIS — SHORTCUT_MAP v3.0
 * Mappa flag → azione primaria (primo step del flusso guidato).
 * Usata da dashboard/page.tsx e remediation/page.tsx per il bottone contestuale.
 *
 * La logica completa multi-step vive in legal_dictionary.json → action_steps[].
 * Questo file espone solo lo step 1 per il bottone rapido nel box "Prossimo Passo".
 *
 * COLORI:
 * - green (var(--emerald, #3ECF8E)) → azione generativa (produce un documento o avvia un flusso)
 * - blue  (var(--shield, #3A6DF0))  → azione di upload o navigazione
 */

export type ShortcutType = "generate" | "email" | "upload" | "fornitori" | "external" | "checklist";

export interface ShortcutConfig {
  type: ShortcutType;
  label: string;
  color: "green" | "blue";
  modal_key?: string;
  url?: string;
}

export const SHORTCUT_MAP: Record<string, ShortcutConfig> = {

  // ─── GDPR CORE
  Flag_GDPR_DPO: {
    type: "generate", color: "green",
    label: "Hai già la nomina DPO?",
    modal_key: "acquire_or_generate_nomina_dpo",
  },
  Flag_GDPR_Art28: {
    type: "email", color: "green",
    label: "Email DPA ai fornitori",
    modal_key: "dpa",
  },
  Flag_GDPR_DataResidency: {
    type: "email", color: "green",
    label: "Email data residency",
    modal_key: "data_residency",
  },
  Flag_GDPR_DPIA: {
    type: "generate", color: "green",
    label: "Avvia procedura DPIA",
    modal_key: "dpia_guidata",
  },
  Flag_GDPR_Breach: {
    type: "generate", color: "green",
    label: "Genera procedura breach",
    modal_key: "procedura_breach",
  },
  Flag_GDPR_Messaging: {
    type: "generate", color: "green",
    label: "Genera policy messaggistica",
    modal_key: "policy_messaggistica",
  },

  // ─── NIS2
  Flag_NIS2_SC_01: {
    type: "fornitori", color: "green",
    label: "Avvia censimento fornitori",
    url: "/fornitori?action=censimento",
  },
  Flag_NIS2_BCP: {
    type: "generate", color: "green",
    label: "Genera modello BCP",
    modal_key: "bcp",
  },
  Flag_NIS2_IRP: {
    type: "generate", color: "green",
    label: "Genera modello IRP",
    modal_key: "irp",
  },
  Flag_NIS2_CdA: {
    type: "generate", color: "green",
    label: "Genera bozza delibera CdA",
    modal_key: "pacchetto_cda",
  },
  Flag_NIS2_Logging: {
    type: "email", color: "green",
    label: "Email fornitore IT — attiva logging",
    modal_key: "conformita",
  },
  Flag_NIS2_Registration: {
    type: "generate", color: "green",
    label: "Verifica applicabilità NIS2",
    modal_key: "scheda_registrazione_acn",
  },

  // ─── AI ACT
  Flag_AIACT_HR_01: {
    type: "checklist", color: "green",
    label: "Classifica sistemi AI",
    modal_key: "checklist_ai_rischio",
  },
  Flag_AIACT_Deployer: {
    type: "email", color: "green",
    label: "Email conformità AI ai fornitori",
    modal_key: "conformita",
  },
  Flag_AIACT_Literacy: {
    type: "generate", color: "green",
    label: "Genera piano formativo AI",
    modal_key: "piano_formativo_ai",
  },

  // ─── MDR
  Flag_MDR_Software: {
    type: "email", color: "green",
    label: "Email classificazione MDR",
    modal_key: "mdr",
  },

  // ─── FSE
  Flag_FSE_Interop: {
    type: "email", color: "green",
    label: "Email fornitore gestionale — FSE 2.0",
    modal_key: "fse",
  },

  // ─── GELLI / ACCREDITAMENTO
  Flag_Gelli_RC: {
    type: "upload", color: "blue",
    label: "Carica polizza RC sanitaria",
  },
  Flag_Accreditamento_Tech: {
    type: "upload", color: "blue",
    label: "Carica checklist accreditamento",
  },

  // ─── D.LGS. 231
  Flag_D231_BYOD: {
    type: "generate", color: "green",
    label: "Genera policy BYOD",
    modal_key: "policy_byod",
  },
  Flag_D231_ShadowAI: {
    type: "generate", color: "green",
    label: "Genera circolare AI",
    modal_key: "circolare_shadow_ai",
  },
  Flag_D231_Formazione: {
    type: "generate", color: "green",
    label: "Genera piano formativo",
    modal_key: "piano_formativo_231",
  },

  // ─── CRPD / ACCESSIBILITÀ
  Flag_CRPD_Digital: {
    type: "checklist", color: "green",
    label: "Avvia checklist accessibilità WCAG",
    modal_key: "checklist_wcag",
  },

  // ─── PSICHIATRIA
  Flag_Psich_Consenso: {
    type: "generate", color: "green",
    label: "Genera procedura consenso",
    modal_key: "procedura_consenso_psich",
  },
  Flag_Psich_TSO_Digital: {
    type: "generate", color: "green",
    label: "Gestisci documentazione TSO",
    modal_key: "autocert_tso_cartaceo",
  },

  // ─── W7 (placeholder — UI mostra "In sviluppo")
  Flag_REMS_Penale: {
    type: "generate", color: "green",
    label: "Genera briefing consulente",
    modal_key: "briefing_rems_penale",
  },
  Flag_Dip_Anonimato: {
    type: "email", color: "green",
    label: "Email fornitore — verifica anonimato",
    modal_key: "conformita",
  },
  Flag_Minori_Dati: {
    type: "generate", color: "green",
    label: "Genera protocollo consensi minori",
    modal_key: "protocollo_consensi_minori",
  },
  Flag_Minori_Autorita: {
    type: "generate", color: "green",
    label: "Genera procedura autorità minorili",
    modal_key: "procedura_autorita_minori",
  },
};

// ─── HELPER FUNCTIONS

export function getShortcutConfig(flagKey: string): ShortcutConfig {
  return SHORTCUT_MAP[flagKey] ?? {
    type: "upload",
    color: "blue",
    label: "Carica documento",
  };
}

export function getShortcutType(flagKey: string): ShortcutType {
  return getShortcutConfig(flagKey).type;
}

export function getShortcutLabel(flagKey: string): string {
  return getShortcutConfig(flagKey).label;
}

export function getShortcutColor(flagKey: string): "green" | "blue" {
  return getShortcutConfig(flagKey).color;
}
