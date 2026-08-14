-- fn_obblighi_aggiorna_atomic — dual-write reale per archivia/annulla
--
-- Finora il commento in testa alla route (app/api/obblighi/aggiorna/route.ts)
-- dichiarava "nessun writer legacy tocca oggi compliance_items" per
-- annulla/archivia/waive — falso per i primi due: app/documenti/page.tsx ha
-- sempre avuto archiviaDocumento (snapshot in compliance_items_history + reset
-- a MANCANTE) e handleAnnullaDichiarazione (reset dichiarato_da/dichiarato_at),
-- semplicemente mai passati dalla route. Questa migration estende
-- fn_obblighi_aggiorna_atomic per riprodurli dentro la stessa transazione, così
-- da poterli collegare alla route in app/documenti/page.tsx senza lasciare
-- compliance_items/compliance_items_history scritti fuori dalla transazione.
--
-- archivia (scope entity o company):
--   1. legge la riga corrente di entity/company_compliance_items — se non
--      esiste, no-op completo (stesso comportamento di archiviaDocumento oggi:
--      `if (!current) return;`, nessun insert spurio);
--   2. se esiste, la snapshotta in compliance_items_history (stessi campi già
--      scritti oggi da archiviaDocumento);
--   3. resetta la riga a MANCANTE, azzerando documento_path/documento_nome/
--      analisi_ok/analisi_note/data_documento/data_scadenza/note.
--   entity_id in compliance_items_history è NULL per gli item company-level:
--   non esiste un'entity "proprietaria" della riga (archiviaDocumento oggi ci
--   scrive l'entity attiva in UI, un valore incidentale non derivato dalla
--   riga), e /storia non lo legge mai in questo caso — il filtro client-side
--   è `r.entity_id === eid || r.source_table === "company"`, quindi le righe
--   company-level passano sempre a prescindere da entity_id.
--
-- annulla (scope entity o company): reset mirato a stato/dichiarato_da/
--   dichiarato_at — fedele al comportamento ATTUALE di
--   handleAnnullaDichiarazione (che non tocca documento_path/nome/analisi_ok/
--   analisi_note/date/note, anche se presenti). Nessuno storico. No-op naturale
--   via WHERE se la riga non esiste.
--
-- Il log su compliance_activity_log per entrambe le azioni non richiede
-- modifiche: l'insert finale della funzione è già incondizionato (non filtrato
-- su p_dual_write) e usa già p_ultima_azione = "archiviato"/"annullato"
-- (minuscolo, da computeTransizione in route.ts) — semplicemente non veniva
-- mai eseguito perché nessun chiamante passava queste due azioni alla route.
--
-- Stesso identico corpo di 20260813200000 per tutto il resto — create or
-- replace idempotente, nessuna riscrittura delle azioni già in produzione
-- (genera/autocertifica/carica/verifica_ai).

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
  p_azione                 text,      -- azione grezza, per il branch analisi_ok / archivia / annulla
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
  v_entity_item  entity_compliance_items%rowtype;
  v_company_item company_compliance_items%rowtype;
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

  -- ── archivia — snapshot storico + reset a MANCANTE. No-op se la riga non
  -- esiste già (stesso comportamento di archiviaDocumento oggi).
  if p_azione = 'archivia' and p_scope_type = 'entity' then
    select * into v_entity_item from entity_compliance_items
      where entity_id = p_scope_id and tipo = p_doc_key;
    if found then
      insert into compliance_items_history (
        source_table, original_id, entity_id, company_id, tipo, stato,
        documento_path, documento_nome, analisi_note, data_documento, data_scadenza,
        note, conforme_dal, archived_by
      ) values (
        'entity', v_entity_item.id, v_entity_item.entity_id, v_entity_item.company_id,
        v_entity_item.tipo, v_entity_item.stato,
        v_entity_item.documento_path, v_entity_item.documento_nome, v_entity_item.analisi_note,
        v_entity_item.data_documento, v_entity_item.data_scadenza, v_entity_item.note,
        v_entity_item.updated_at, p_aggiornato_da
      );
      update entity_compliance_items set
        stato = 'MANCANTE', documento_path = null, documento_nome = null, analisi_ok = null,
        analisi_note = null, data_documento = null, data_scadenza = null, note = null,
        updated_at = v_now
      where entity_id = p_scope_id and tipo = p_doc_key;
    end if;

  elsif p_azione = 'archivia' and p_scope_type = 'company' then
    select * into v_company_item from company_compliance_items
      where company_id = p_scope_id and tipo = p_doc_key;
    if found then
      insert into compliance_items_history (
        source_table, original_id, entity_id, company_id, tipo, stato,
        documento_path, documento_nome, analisi_note, data_documento, data_scadenza,
        note, conforme_dal, archived_by
      ) values (
        'company', v_company_item.id, null, v_company_item.company_id,
        v_company_item.tipo, v_company_item.stato,
        v_company_item.documento_path, v_company_item.documento_nome, v_company_item.analisi_note,
        v_company_item.data_documento, v_company_item.data_scadenza, v_company_item.note,
        v_company_item.updated_at, p_aggiornato_da
      );
      update company_compliance_items set
        stato = 'MANCANTE', documento_path = null, documento_nome = null, analisi_ok = null,
        analisi_note = null, data_documento = null, data_scadenza = null, note = null,
        updated_at = v_now
      where company_id = p_scope_id and tipo = p_doc_key;
    end if;

  -- ── annulla — reset mirato: solo dichiarato_da/dichiarato_at, fedele al
  -- comportamento attuale di handleAnnullaDichiarazione (non tocca
  -- documento_path/nome/analisi_ok/analisi_note/date/note). Nessuno storico.
  -- No-op naturale via WHERE se la riga non esiste.
  elsif p_azione = 'annulla' and p_scope_type = 'entity' then
    update entity_compliance_items set
      stato = 'MANCANTE', dichiarato_da = null, dichiarato_at = null, updated_at = v_now
    where entity_id = p_scope_id and tipo = p_doc_key;

  elsif p_azione = 'annulla' and p_scope_type = 'company' then
    update company_compliance_items set
      stato = 'MANCANTE', dichiarato_da = null, dichiarato_at = null, updated_at = v_now
    where company_id = p_scope_id and tipo = p_doc_key;
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
