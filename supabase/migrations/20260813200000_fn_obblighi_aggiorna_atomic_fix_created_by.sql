-- fn_obblighi_aggiorna_atomic — fix NOT NULL created_by
--
-- Bug: "null value in column "created_by" violates not-null constraint" sullo
-- stesso INSERT già corretto per l'enum in 20260813193000. Verifica esaustiva
-- (non un altro fix puntuale) via information_schema.columns — colonne NOT NULL
-- senza default su entity_compliance_items/company_compliance_items:
--
--   entity_compliance_items:  entity_id, company_id, tipo, created_by
--   company_compliance_items: company_id, tipo, created_by
--
-- entity_id/company_id/tipo erano già coperte (p_scope_id/p_entity_company_id/
-- p_doc_key, sempre valorizzati). L'unica mancante era created_by: la funzione
-- lo scriveva solo per azione='genera' (unico writer legacy — GenerateDocModal —
-- che lo valorizza esplicitamente, con `created_by: userId`). ActionModal
-- (AMBRA/BLU) e DocumentoModal non lo scrivono mai perché operano solo su righe
-- già esistenti (upsert che in pratica risolve sempre in UPDATE, o UPDATE
-- diretto in DocumentoModal) — quella precondizione non vale per questa route,
-- che deve poter anche creare la riga da zero.
--
-- Fix: created_by = p_aggiornato_da (lo stesso utente di aggiornato_da,
-- auth.getUser() lato route — mai un valore inventato) su ENTRAMBE le INSERT,
-- per ogni azione. Rimosso dalla clausola ON CONFLICT DO UPDATE: created_by è
-- un campo di audit "chi ha creato la riga la prima volta" — un aggiornamento
-- successivo (qualunque azione, qualunque utente) non deve poterlo sovrascrivere.
--
-- Verificato di nuovo (come le due volte precedenti) che il fallimento appena
-- avuto non abbia lasciato righe in obblighi per lo stesso scope_id di test:
-- zero righe — l'atomicità ha retto anche questa volta.
--
-- Stesso corpo di 20260813193000, create or replace idempotente.

create or replace function fn_obblighi_aggiorna_atomic(
  p_flag_key             text,
  p_doc_key               text,
  p_scope_type             text,      -- 'entity' | 'company' | 'system'
  p_scope_id               uuid,
  p_stato                  text,      -- GENERATO | DICHIARATO | CONFORME | NON_CONFORME | MANCANTE | WAIVED
  p_touch_soddisfatto_il   boolean,   -- false per 'genera': soddisfatto_il resta invariato
  p_soddisfatto_il         timestamptz,
  p_ultima_azione          text,
  p_aggiornato_da          uuid,      -- sempre auth.getUser().id, mai dal body
  p_dual_write             boolean,   -- true solo per genera/autocertifica/carica/verifica_ai
  p_azione                 text,      -- azione grezza, per il branch analisi_ok
  p_soddisfa                boolean,  -- true quando lo stato finale è DICHIARATO/CONFORME
  p_esito                   boolean,  -- esito verifica AI, nullable
  p_entity_company_id       uuid,     -- company_id dell'entity (scope_type='entity'), nullable
  p_log_note                text
)
returns obblighi
language plpgsql
as $$
declare
  v_now      timestamptz := now();
  v_obbligo  obblighi;
begin
  -- ── obblighi — sempre upsert, mai update semplice. stato è text: nessun cast.
  insert into obblighi (flag_key, doc_key, scope_type, scope_id, stato, soddisfatto_il, ultima_azione, aggiornato_da)
  values (
    p_flag_key, p_doc_key, p_scope_type, p_scope_id, p_stato,
    case when p_touch_soddisfatto_il then p_soddisfatto_il else null end,
    p_ultima_azione, p_aggiornato_da
  )
  on conflict (flag_key, doc_key, scope_type, scope_id)
  do update set
    stato          = excluded.stato,
    soddisfatto_il = case when p_touch_soddisfatto_il then excluded.soddisfatto_il else obblighi.soddisfatto_il end,
    ultima_azione  = excluded.ultima_azione,
    aggiornato_da  = excluded.aggiornato_da
  returning * into v_obbligo;

  -- ── dual-write entity/company_compliance_items — solo per le azioni con un
  -- writer legacy noto (genera/autocertifica/carica/verifica_ai), mai per
  -- annulla/archivia/waive né per scope_type='system'.
  if p_scope_type = 'entity' and p_dual_write then
    insert into entity_compliance_items (entity_id, company_id, tipo, stato, updated_at, created_by, dichiarato_da, dichiarato_at, analisi_ok)
    values (
      p_scope_id, p_entity_company_id, p_doc_key, p_stato::compliance_status, v_now,
      p_aggiornato_da, -- NOT NULL, sempre l'utente autenticato — non solo per 'genera'
      case when p_soddisfa then p_aggiornato_da else null end,
      case when p_soddisfa then v_now else null end,
      case when p_azione in ('carica', 'verifica_ai') then p_esito else null end
    )
    on conflict (entity_id, tipo) do update set
      company_id    = excluded.company_id,
      stato         = excluded.stato,
      updated_at    = v_now,
      -- created_by NON in questa SET: è "chi ha creato la riga la prima volta",
      -- un aggiornamento successivo non deve poterlo risovrascrivere.
      dichiarato_da = coalesce(excluded.dichiarato_da, entity_compliance_items.dichiarato_da),
      dichiarato_at = coalesce(excluded.dichiarato_at, entity_compliance_items.dichiarato_at),
      analisi_ok    = coalesce(excluded.analisi_ok, entity_compliance_items.analisi_ok);

  elsif p_scope_type = 'company' and p_dual_write then
    insert into company_compliance_items (company_id, tipo, stato, updated_at, created_by, dichiarato_da, dichiarato_at, analisi_ok)
    values (
      p_scope_id, p_doc_key, p_stato::compliance_status, v_now,
      p_aggiornato_da, -- NOT NULL, sempre l'utente autenticato — non solo per 'genera'
      case when p_soddisfa then p_aggiornato_da else null end,
      case when p_soddisfa then v_now else null end,
      case when p_azione in ('carica', 'verifica_ai') then p_esito else null end
    )
    on conflict (company_id, tipo) do update set
      stato         = excluded.stato,
      updated_at    = v_now,
      -- created_by NON in questa SET: stesso motivo di sopra.
      dichiarato_da = coalesce(excluded.dichiarato_da, company_compliance_items.dichiarato_da),
      dichiarato_at = coalesce(excluded.dichiarato_at, company_compliance_items.dichiarato_at),
      analisi_ok    = coalesce(excluded.analisi_ok, company_compliance_items.analisi_ok);
  end if;

  -- ── remediation_plans → completato, quando lo stato finale è DICHIARATO/CONFORME.
  -- status è text: nessun cast.
  if p_scope_type = 'entity' and p_soddisfa then
    update remediation_plans
      set status = 'completed', completed_at = v_now, completed_by = p_aggiornato_da
      where flag_key = p_flag_key and entity_id = p_scope_id;
  elsif p_scope_type = 'company' and p_soddisfa then
    update remediation_plans
      set status = 'completed', completed_at = v_now, completed_by = p_aggiornato_da
      where flag_key = p_flag_key and company_id = p_scope_id;
  end if;

  -- ── log azione — base per Fase 4 (/storia)
  insert into compliance_activity_log (entity_id, company_id, user_id, performed_by, flag_key, tipo_item, livello, azione, action_type, action_note)
  values (
    case when p_scope_type = 'entity' then p_scope_id else null end,
    case when p_scope_type = 'company' then p_scope_id else p_entity_company_id end,
    p_aggiornato_da, p_aggiornato_da, p_flag_key, p_doc_key, p_scope_type, p_ultima_azione, p_ultima_azione, p_log_note
  );

  return v_obbligo;
end;
$$;

-- Solo la route server-side (service-role) può chiamarla: fa zero controlli
-- d'accesso di suo, si fida che il chiamante li abbia già fatti.
revoke all on function fn_obblighi_aggiorna_atomic(
  text, text, text, uuid, text, boolean, timestamptz, text, uuid, boolean, text, boolean, boolean, uuid, text
) from public, anon, authenticated;

grant execute on function fn_obblighi_aggiorna_atomic(
  text, text, text, uuid, text, boolean, timestamptz, text, uuid, boolean, text, boolean, boolean, uuid, text
) to service_role;
