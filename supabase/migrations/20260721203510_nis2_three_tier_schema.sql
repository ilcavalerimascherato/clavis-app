-- Schema NIS2 a 3 livelli (entity / company / gruppo)
-- Tutte le modifiche sono additive/nullable — nessun rischio di perdita dati.
-- Applicare manualmente (dashboard Supabase SQL editor o `supabase db push`).

-- companies: entity di riferimento per le valutazioni/adempimenti a livello società
ALTER TABLE public.companies
  ADD COLUMN anchor_entity_id uuid NULL REFERENCES public.entities(id) ON DELETE SET NULL;

-- companies: raggruppamento societario per l'avviso di aggregazione dimensionale NIS2
ALTER TABLE public.companies
  ADD COLUMN gruppo_id uuid NULL;

-- remediation_plans: livello company per i flag NIS2 non ripetibili per singola entity
ALTER TABLE public.remediation_plans
  ADD COLUMN company_id uuid NULL REFERENCES public.companies(id) ON DELETE SET NULL;

-- nis2_assessments: dichiarazione utente "dati dimensionali aggregati a livello di gruppo"
ALTER TABLE public.nis2_assessments
  ADD COLUMN dati_aggregati_gruppo boolean NOT NULL DEFAULT false;

-- v_nis2_last_assessment usa un elenco esplicito di colonne (non SELECT *): va rifatta per esporre la nuova colonna
CREATE OR REPLACE VIEW public.v_nis2_last_assessment AS
 SELECT DISTINCT ON (company_id) id,
    company_id,
    esito AS esito_calcolato,
    motivazioni,
    COALESCE(override_esito, esito) AS esito_effettivo,
    override_tipo,
    override_esito,
    override_motivazione,
    override_by,
    override_at,
    parere_legale_file_url,
    parere_legale_professionista,
    parere_legale_data,
    ai_analysis,
    snapshot_dipendenti,
    snapshot_fatturato,
    snapshot_is_pa,
    dati_aggregati_gruppo,
    created_at,
    created_by
   FROM public.nis2_assessments
  ORDER BY company_id, created_at DESC;

CREATE INDEX IF NOT EXISTS idx_companies_gruppo_id
  ON public.companies (gruppo_id) WHERE gruppo_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_remediation_plans_company_id
  ON public.remediation_plans (company_id) WHERE company_id IS NOT NULL;
