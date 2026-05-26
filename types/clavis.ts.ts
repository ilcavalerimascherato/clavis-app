// types/clavis.ts
// Tipi principali CLAVIS — derivati dallo schema DB v2.0
// Aggiornare quando si modifica lo schema

// ─── Tier utente ─────────────────────────────────────────────────────────────

export type UserTier =
  | 'super_admin'
  | 'user_master'
  | 'premium'
  | 'gold'
  | 'silver'
  | 'free'

export const TIER_LABELS: Record<UserTier, string> = {
  super_admin: 'Super Admin',
  user_master: 'User Master',
  premium: 'Premium',
  gold: 'Gold',
  silver: 'Silver',
  free: 'Free',
}

export const TIER_ORDER: UserTier[] = [
  'super_admin',
  'user_master',
  'premium',
  'gold',
  'silver',
  'free',
]

// ─── Tipologie struttura ─────────────────────────────────────────────────────

export type EntityType =
  | 'RSA'
  | 'CDI'
  | 'RSD'
  | 'CSS'
  | 'ADI'
  | 'HOSPICE'
  | 'ALTRO'

export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  RSA: 'Residenza Sanitaria Assistenziale (RSA)',
  CDI: 'Centro Diurno Integrato (CDI)',
  RSD: 'Residenza Sanitaria Disabili (RSD)',
  CSS: 'Comunità Socio Sanitaria (CSS)',
  ADI: 'Assistenza Domiciliare Integrata (ADI)',
  HOSPICE: 'Hospice / Cure Palliative',
  ALTRO: 'Altro',
}

// ─── Tipologie UDO ───────────────────────────────────────────────────────────

export type UdoType =
  | 'RSA'
  | 'CDI'
  | 'RSD'
  | 'CSS'
  | 'NUCLEO_ALZHEIMER'
  | 'NUCLEO_DEMENZE'
  | 'HOSPICE'
  | 'RIABILITAZIONE'
  | 'ALTRO'

export const UDO_TYPE_LABELS: Record<UdoType, string> = {
  RSA: 'RSA Base',
  CDI: 'Centro Diurno Integrato',
  RSD: 'Residenza Disabili',
  CSS: 'Comunità Socio Sanitaria',
  NUCLEO_ALZHEIMER: 'Nucleo Alzheimer',
  NUCLEO_DEMENZE: 'Nucleo Demenze',
  HOSPICE: 'Hospice',
  RIABILITAZIONE: 'Riabilitazione',
  ALTRO: 'Altro',
}

// ─── Profilo utente ───────────────────────────────────────────────────────────

export interface Profilo {
  id: string
  full_name: string | null
  email: string | null
  tier: UserTier
  is_active: boolean
  onboarded_at: string | null
  last_login_at: string | null
  created_at: string
}

// ─── Società ─────────────────────────────────────────────────────────────────

export interface Societa {
  id: string
  name: string
  vat_number: string
  legal_address: string | null
  region: string | null
  country: string
  created_by: string
  created_at: string
}

// ─── Struttura ───────────────────────────────────────────────────────────────

export interface Struttura {
  id: string
  company_id: string
  name: string
  entity_type: EntityType
  vat_number: string | null
  address: string | null
  region: string | null
  total_beds: number | null
  accreditation_code: string | null
  created_at: string
}

// ─── UDO ─────────────────────────────────────────────────────────────────────

export interface UnitaOfferta {
  id: string
  entity_id: string
  name: string
  udo_type: UdoType
  beds: number | null
  accreditation_code: string | null
  is_active: boolean
}

// ─── Triage ──────────────────────────────────────────────────────────────────

export type RisposteWizard = {
  Q1: boolean | null
  Q2: boolean | null
  Q3: boolean | null
}

export type FlagKey =
  | 'Flag_NIS2_SC_01'
  | 'Flag_AIACT_HR_01'
  | 'Flag_D231_CYBER_01'
  | 'Flag_GDPR_Art32'

export interface FlagAttivato {
  flag_code: FlagKey
  control_code: string
  label: string
  triggered_by: 'Q1' | 'Q2' | 'Q3'
  severity: number
  articles: Record<string, string>
  max_penalty: string
  remediation: {
    action: string
    deadline: string
    responsible: string
    priority: string
  }
  risk_score_weight: number
}

export interface PayloadTriage {
  session_id: string
  entity_id: string
  entity_name: string
  generated_at: string
  answers: RisposteWizard
  flags_triggered: FlagAttivato[]
  risk_score: number
  risk_band: {
    label: string
    color: string
    action: string
  }
  legal_dictionary_version: string
  legal_footer?: {
    legal_validity_note: string
    disclaimer: string
    classification: string
  }
}

export type StatoReport = 'draft' | 'generated' | 'acknowledged' | 'delivered'

export type RuoloAcknowledgment =
  | 'CdA'
  | 'Direttore Generale'
  | 'Direttore Sanitario'
  | 'Responsabile Legale'
  | 'Responsabile Qualità'
  | 'DPO'

// ─── Dashboard ───────────────────────────────────────────────────────────────

export type TrendTriage =
  | 'prima_rilevazione'
  | 'miglioramento'
  | 'stabile'
  | 'peggioramento'

export interface RowDashboard {
  entity_id: string
  entity_name: string
  entity_type: EntityType
  region: string | null
  company_id: string
  company_name: string
  last_session_id: string | null
  risk_score: number | null
  score_delta: number | null
  flags_triggered: string[]
  status: StatoReport | null
  acknowledged_at: string | null
  acknowledged_role: RuoloAcknowledgment | null
  last_triage_at: string | null
  trend: TrendTriage
  days_since_triage: number | null
}

// ─── Lock presenza ────────────────────────────────────────────────────────────

export type TipoRisorsa =
  | 'triage_session'
  | 'entity'
  | 'company'
  | 'asset'
  | 'remediation_plan'

export interface RisultatoLock {
  acquired: boolean
  renewed?: boolean
  locked_by_name?: string
  locked_at?: string
  expires_at?: string
}
