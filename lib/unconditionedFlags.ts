// lib/unconditionedFlags.ts
// Flag "incondizionati" a livello company: si applicano a OGNI società senza
// bisogno di una domanda di triage dedicata (vedi SECTIONS in
// app/triage/autenticato/page.tsx) né di una condizione di soggettività.
//
// Elenco esplicito, NON derivato automaticamente dal dizionario: nel
// dizionario ci sono 4 flag con "livello":"company", ma 3 (Flag_NIS2_Logging,
// Flag_NIS2_Registration, Flag_NIS2_CdA) hanno anche "applicabilita":"ALL" e
// SONO condizionati — hanno un proprio seed condizionato alla soggettività
// NIS2 in app/nis2/page.tsx (fn_verifica_soggettivita_nis2). Quella
// combinazione di campi da sola non basta a distinguerli da un flag
// realmente incondizionato: se in futuro si aggiunge un nuovo flag
// "livello":"company" che si applica sempre (come questo), va aggiunto qui
// esplicitamente — non dedurlo da "applicabilita" per non rischiare di
// riseminare per errore i 3 flag NIS2 già gestiti altrove.
export const UNCONDITIONED_COMPANY_FLAGS = ["Flag_Ecoreati_MOG231"] as const;

import { createClient } from "@/lib/supabase/client";

type Supabase = ReturnType<typeof createClient>;

interface FlagDictLike {
  control_code?: string;
  remediation?: { action?: string };
}

interface LegalDictLike {
  flags: Record<string, FlagDictLike>;
}

/**
 * Inserisce in remediation_plans le righe mancanti per i flag incondizionati
 * a livello company, per la società dell'entity attiva. Idempotente: legge
 * prima le righe già esistenti (seminate qui o altrove) e inserisce solo
 * quelle mancanti — va richiamata ad ogni caricamento di /documenti e
 * /remediation, non richiede una migration separata.
 */
export async function ensureUnconditionedCompanyFlagsSeeded(
  supabase: Supabase,
  entityId: string,
  companyId: string | null,
  dict: LegalDictLike,
): Promise<void> {
  if (!companyId) return;

  const { data: existing } = await supabase
    .from("remediation_plans")
    .select("flag_key")
    .eq("company_id", companyId)
    .in("flag_key", UNCONDITIONED_COMPANY_FLAGS);
  const existingKeys = new Set((existing ?? []).map((r: { flag_key: string | null }) => r.flag_key));
  const missing = UNCONDITIONED_COMPANY_FLAGS.filter(f => !existingKeys.has(f));
  if (missing.length === 0) return;

  await supabase.from("remediation_plans").insert(
    missing.map(flag_key => ({
      entity_id: entityId,
      company_id: companyId,
      flag_key,
      status: "open",
      session_id: null,
      control_code: dict.flags[flag_key]?.control_code ?? null,
      planned_action: dict.flags[flag_key]?.remediation?.action ?? null,
    }))
  );
}
