// lib/unconditionedFlags.ts
// Flag "incondizionati": si applicano sempre, senza bisogno di una domanda di
// triage dedicata (vedi SECTIONS in app/triage/autenticato/page.tsx) né di una
// condizione di soggettività. Il livello di ciascuno (company o entity) si
// legge da dict.flags[flag_key].livello — stesso pattern già usato in
// app/nis2/page.tsx (company_id: livello === "company" ? companyId : null) —
// invece di mantenere due costanti/funzioni sincronizzate a mano.
//
// Nel dizionario ci sono più flag con "livello":"company", ma 4 (Flag_NIS2_Logging,
// Flag_NIS2_Registration, Flag_NIS2_CdA, Flag_NIS2_Categorizzazione) hanno
// anche "applicabilita":"ALL" e SONO condizionati — hanno un proprio seed
// condizionato alla soggettività NIS2 in app/nis2/page.tsx
// (fn_verifica_soggettivita_nis2). Quella combinazione di campi da sola non
// basta a distinguerli da un flag realmente incondizionato: se in futuro si
// aggiunge un nuovo flag "livello":"company"/"entity" che si applica sempre
// (come questi), va aggiunto qui esplicitamente — non dedurlo da
// "applicabilita" per non rischiare di riseminare per errore i 4 flag NIS2
// già gestiti altrove.
export const UNCONDITIONED_FLAGS = [
  "Flag_Ecoreati_MOG231",
  "Flag_GDPR_ROPA",
  "Flag_AIACT_LiteracyBase",
] as const;

import { createClient } from "@/lib/supabase/client";

type Supabase = ReturnType<typeof createClient>;

interface FlagDictLike {
  control_code?: string;
  livello?: string;
  remediation?: { action?: string };
}

interface LegalDictLike {
  flags: Record<string, FlagDictLike>;
}

/**
 * Inserisce in remediation_plans le righe mancanti per i flag incondizionati,
 * per l'entity attiva (e la sua società, per quelli con "livello":"company").
 * Idempotente: legge prima le righe già esistenti (seminate qui o altrove) e
 * inserisce solo quelle mancanti — va richiamata ad ogni caricamento di
 * /documenti e /remediation, non richiede una migration separata.
 */
export async function ensureUnconditionedCompanyFlagsSeeded(
  supabase: Supabase,
  entityId: string,
  companyId: string | null,
  dict: LegalDictLike,
): Promise<void> {
  if (!entityId) return;

  const livelloOf = (flagKey: string): "company" | "entity" =>
    dict.flags[flagKey]?.livello === "company" ? "company" : "entity";

  // Un flag "company" senza companyId non è seminabile: niente società a cui
  // agganciarlo. Un flag "entity" invece non dipende mai da companyId.
  const applicable = UNCONDITIONED_FLAGS.filter(f => livelloOf(f) === "entity" || !!companyId);
  if (applicable.length === 0) return;

  const filter = companyId
    ? `entity_id.eq.${entityId},company_id.eq.${companyId}`
    : `entity_id.eq.${entityId}`;
  const { data: existing } = await supabase
    .from("remediation_plans")
    .select("flag_key")
    .in("flag_key", applicable)
    .or(filter);
  const existingKeys = new Set((existing ?? []).map((r: { flag_key: string | null }) => r.flag_key));
  const missing = applicable.filter(f => !existingKeys.has(f));
  if (missing.length === 0) return;

  await supabase.from("remediation_plans").insert(
    missing.map(flag_key => ({
      entity_id: entityId,
      company_id: livelloOf(flag_key) === "company" ? companyId : null,
      flag_key,
      status: "open",
      session_id: null,
      control_code: dict.flags[flag_key]?.control_code ?? null,
      planned_action: dict.flags[flag_key]?.remediation?.action ?? null,
    }))
  );
}
