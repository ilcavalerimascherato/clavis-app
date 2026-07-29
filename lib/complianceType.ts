// lib/complianceType.ts
// SSOT per la conversione flag_key (dizionario legale) → tipo compliance_items.
// Usato da ActionModal (AMBRA), DocumentoModal (BLU) e GenerateDocModal (VERDE)
// così che le 3 vie di completamento di uno stesso obbligo scrivano lo stesso
// "tipo" su company_compliance_items/entity_compliance_items.
export function flagKeyToComplianceType(flagKey: string): string {
  const map: Record<string, string> = {
    "Flag_GDPR_DPO":              "NOMINA_DPO",
    "Flag_GDPR_Art28":            "DPA_FORNITORI",
    "Flag_GDPR_DataResidency":    "ALTRO",
    "Flag_GDPR_DPIA":             "DPIA",
    "Flag_GDPR_Breach":           "ALTRO",
    "Flag_GDPR_Messaging":        "ALTRO",
    "Flag_NIS2_SC_01":            "REGISTRO_FORNITORI",
    "Flag_NIS2_BCP":              "BCP_BUSINESS_CONTINUITY",
    "Flag_NIS2_IRP":              "IRP_INCIDENT_RESPONSE",
    "Flag_NIS2_CdA":              "DELIBERA_CDA",
    "Flag_NIS2_Logging":          "ALTRO",
    "Flag_NIS2_Registration":     "REGISTRAZIONE_ACN",
    "Flag_NIS2_Categorizzazione": "CATEGORIZZAZIONE_ACN",
    "Flag_AIACT_HR_01":           "FRIA",
    "Flag_AIACT_Deployer":        "ALTRO",
    "Flag_AIACT_Literacy":        "PIANO_FORMATIVO",
    "Flag_AIACT_LiteracyBase":    "ALFABETIZZAZIONE_AI_BASE",
    "Flag_MDR_Software":          "ALTRO",
    "Flag_FSE_Interop":           "ALTRO",
    "Flag_D231_BYOD":             "CODICE_ETICO_231",
    "Flag_D231_ShadowAI":         "ALTRO",
    "Flag_D231_Formazione":       "PIANO_FORMATIVO",
    "Flag_Accreditamento_Tech":   "ALTRO",
    "Flag_Gelli_RC":              "POLIZZA_RC_DM232",
  };
  return map[flagKey] ?? "ALTRO";
}
