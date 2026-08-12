-- Backfill: crea la riga remediation_plans mancante per Flag_NIS2_Categorizzazione nelle
-- company già marcate soggette NIS2 (esito_calcolato = 'soggetto_essenziale' in
-- v_nis2_last_assessment) PRIMA che il flag esistesse nel dizionario. Il seed regolare
-- (app/nis2/page.tsx, rivaluta()) scatta solo al trigger di (ri)valutazione soggettività:
-- chi l'aveva già completata non lo riceve mai senza una nuova rivalutazione.
--
-- Idempotente: il NOT EXISTS esclude le company che hanno già la riga (seminata da rivaluta()
-- o da un run precedente di questa stessa migration) — rieseguibile senza duplicare righe.
--
-- entity_id: remediation_plans non ha vincoli di riga sul livello "company" del flag (il
-- gating in lib/hooks/useRemediationRows.ts fa match su company_id OR entity_id, quindi
-- qualunque entity della company è equivalente ai fini della visibilità). Si riusa
-- l'entity_id già seminato per Flag_NIS2_Registration nella stessa company, per coerenza con
-- le righe sorelle; se quella non esiste ancora, si ripiega su una entity qualsiasi della
-- company.
--
-- Valori (control_code, planned_action) copiati da config/legal_dictionary.json —
-- flags.Flag_NIS2_Categorizzazione — stessa forma dell'INSERT già usato in rivaluta() per
-- Flag_NIS2_Registration/Logging/CdA.

INSERT INTO public.remediation_plans (entity_id, company_id, flag_key, status, session_id, control_code, planned_action)
SELECT
  entity_pick.entity_id,
  v.company_id,
  'Flag_NIS2_Categorizzazione',
  'open',
  NULL,
  'NIS2_CAT_01',
  'Durante la finestra 1 maggio - 30 giugno, accedere al portale ACN e aggiornare la categorizzazione di attività e servizi. CLAVIS non compila questo passaggio: traccia solo la finestra e ricorda la scadenza.'
FROM public.v_nis2_last_assessment v
CROSS JOIN LATERAL (
  SELECT COALESCE(
    (SELECT rp.entity_id FROM public.remediation_plans rp
      WHERE rp.company_id = v.company_id AND rp.flag_key = 'Flag_NIS2_Registration'
      LIMIT 1),
    (SELECT e.id FROM public.entities e WHERE e.company_id = v.company_id LIMIT 1)
  ) AS entity_id
) entity_pick
WHERE v.esito_calcolato = 'soggetto_essenziale'
  AND entity_pick.entity_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.remediation_plans rp2
    WHERE rp2.company_id = v.company_id AND rp2.flag_key = 'Flag_NIS2_Categorizzazione'
  );
