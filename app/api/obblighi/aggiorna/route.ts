import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import LEGAL_DICT from "@/config/legal_dictionary.json";

/**
 * POST /api/obblighi/aggiorna
 * Unico punto di scrittura per la tabella `obblighi`. Dual-write verso
 * entity_compliance_items/company_compliance_items + remediation_plans,
 * riproducendo il comportamento di ActionModal/DocumentoModal/GenerateDocModal.
 *
 * Isolata: nessun componente esistente la chiama ancora.
 *
 * Scelte non coperte 1:1 dai writer legacy (vedi thread di spec):
 * - Il body non porta documento_nome/note/analisi_note/documento_path (non
 *   previsti dalla forma della chiamata) — il dual-write valorizza solo i
 *   campi derivabili da { flag_key, doc_key, scope_type, scope_id, azione, esito }.
 * - annulla/archivia/waive: nessun writer legacy tocca oggi compliance_items
 *   per queste tre azioni — scrivono solo su `obblighi`, per non introdurre
 *   comportamento nuovo non richiesto.
 * - Il caso speciale ricorrente_annuale (Flag_NIS2_Categorizzazione, oggi
 *   solo in ActionModal.handleAutocertifica) resta fuori scope: se serve,
 *   il chiamante farà una seconda POST con il doc_key del documento ciclico.
 * - scope_type deve corrispondere a dict.flags[flag_key].livello (assente/
 *   "entity" → "entity", "company" → "company"; "system" solo se un flag lo
 *   dichiara esplicitamente — nessuno lo fa oggi): mismatch → 400, zero scritture.
 *
 * Atomicità: obblighi + dual-write + remediation_plans + log avvengono in
 * un'unica transazione DB reale via RPC (fn_obblighi_aggiorna_atomic, vedi
 * supabase/migrations/20260813190000_fn_obblighi_aggiorna_atomic.sql) — non
 * client-side: supabase-js/PostgREST non espone BEGIN/COMMIT multi-tabella,
 * quindi la sola strada per un vero tutto-o-niente è una funzione plpgsql
 * chiamata con una singola .rpc(). Se una qualunque scrittura interna fallisce,
 * Postgres annulla automaticamente tutto ciò che la funzione aveva già fatto.
 */

type Azione =
  | "genera"
  | "autocertifica"
  | "carica"
  | "verifica_ai"
  | "annulla"
  | "archivia"
  | "waive";

type ScopeType = "entity" | "company" | "system";

const AZIONI_VALIDE: readonly Azione[] = [
  "genera", "autocertifica", "carica", "verifica_ai", "annulla", "archivia", "waive",
];

const SCOPE_TYPES_VALIDI: readonly ScopeType[] = ["entity", "company", "system"];

// scope_type atteso, in ordine di priorità:
//   1. dict.flags[flag_key].documents.find(d => d.key === doc_key)?.livello — il dizionario mette
//      il livello sul DOCUMENTO in diversi flag (es. Flag_Gelli_RC, Flag_GDPR_DPO,
//      Flag_D231_Formazione: nessun campo livello sul flag, presente solo sui singoli documents[]).
//      Se assente, il default "entity" scatterebbe erroneamente anche per documenti company-level.
//   2. dict.flags[flag_key].livello — livello a livello di FLAG (comportamento originale, invariato
//      come fallback; stessa convenzione di useRemediationRows.ts:
//      `dictFlag?.livello === "company" ? "company" : "entity"`).
//   3. default "entity".
// "system" è accettato solo se dichiarato esplicitamente (flag o documento) — nessuno lo fa oggi.
const FLAGS_DICT = (LEGAL_DICT as {
  flags?: Record<string, { livello?: string; documents?: { key?: string; livello?: string }[] }>;
}).flags ?? {};

function livelloToScopeType(livello: string | undefined): ScopeType | undefined {
  if (livello === "company") return "company";
  if (livello === "system") return "system";
  if (livello === "entity") return "entity";
  return undefined;
}

function scopeTypeAtteso(flagKey: string, docKey: string): ScopeType | null {
  const entry = FLAGS_DICT[flagKey];
  if (!entry) return null;

  const doc = entry.documents?.find((d) => d.key === docKey);
  const daDocumento = livelloToScopeType(doc?.livello);
  if (daDocumento) return daDocumento;

  const daFlag = livelloToScopeType(entry.livello);
  if (daFlag) return daFlag;

  return "entity";
}

interface Body {
  flag_key: string;
  doc_key: string;
  scope_type: ScopeType;
  scope_id: string;
  azione: Azione;
  esito?: boolean;
}

interface Transizione {
  stato: "GENERATO" | "DICHIARATO" | "CONFORME" | "NON_CONFORME" | "MANCANTE" | "WAIVED";
  /** undefined = non toccare la colonna (upsert la lascia invariata su conflitto) */
  soddisfatto_il: string | null | undefined;
  ultima_azione: string;
  /** Il final-state di questa transizione soddisfa l'obbligo (DICHIARATO/CONFORME)? */
  soddisfa: boolean;
}

class RichiestaNonValida extends Error {}

// ─── TRADUZIONE azione→stato — unica fonte, non duplicare altrove
function computeTransizione(azione: Azione, esito: boolean | undefined, now: string): Transizione {
  switch (azione) {
    case "genera":
      return { stato: "GENERATO", soddisfatto_il: undefined, ultima_azione: "generato", soddisfa: false };

    case "autocertifica":
      return { stato: "DICHIARATO", soddisfatto_il: now, ultima_azione: "autocertificato", soddisfa: true };

    case "carica":
      // Nel codice reale (ActionModal.handleBluUploadAndAnalyze, DocumentoModal.handleBluUpload)
      // upload e verifica AI avvengono sempre nella stessa interazione utente, mai come due
      // step separati: se il chiamante passa già `esito`, applichiamo direttamente l'esito
      // della verifica invece di fermarci allo stato intermedio DICHIARATO.
      if (typeof esito === "boolean") {
        return esito
          ? { stato: "CONFORME", soddisfatto_il: now, ultima_azione: "verificato_ai", soddisfa: true }
          : { stato: "NON_CONFORME", soddisfatto_il: null, ultima_azione: "verificato_ai", soddisfa: false };
      }
      return { stato: "DICHIARATO", soddisfatto_il: now, ultima_azione: "caricato", soddisfa: true };

    case "verifica_ai":
      if (typeof esito !== "boolean") {
        throw new RichiestaNonValida("esito (boolean) è richiesto per l'azione 'verifica_ai'");
      }
      return esito
        ? { stato: "CONFORME", soddisfatto_il: now, ultima_azione: "verificato_ai", soddisfa: true }
        : { stato: "NON_CONFORME", soddisfatto_il: null, ultima_azione: "verificato_ai", soddisfa: false };

    case "annulla":
      return { stato: "MANCANTE", soddisfatto_il: null, ultima_azione: "annullato", soddisfa: false };

    case "archivia":
      return { stato: "MANCANTE", soddisfatto_il: null, ultima_azione: "archiviato", soddisfa: false };

    case "waive":
      return { stato: "WAIVED", soddisfatto_il: null, ultima_azione: "waived", soddisfa: false };
  }
}

// Azioni con un writer legacy noto su entity/company_compliance_items
// (ActionModal AMBRA/BLU, DocumentoModal AMBRA/BLU, GenerateDocModal VERDE).
// annulla/archivia/waive non hanno oggi alcun writer equivalente: vedi commento in testa al file.
function haDualWriteComplianceItems(azione: Azione): boolean {
  return azione === "genera" || azione === "autocertifica" || azione === "carica" || azione === "verifica_ai";
}

// Normalizza il risultato di fn_accessible_entity_ids()/fn_accessible_company_ids():
// funzioni SETOF scalare — PostgREST può restituire un array di valori grezzi o,
// a seconda della versione, un array di oggetti { <nome_funzione>: valore }.
function normalizzaIds(data: unknown, fnName: string): string[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((v) => {
      if (typeof v === "string") return v;
      if (v && typeof v === "object") {
        const obj = v as Record<string, unknown>;
        const val = obj[fnName] ?? obj.id;
        return typeof val === "string" ? val : null;
      }
      return null;
    })
    .filter((v): v is string => v !== null);
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Partial<Body> | null;
  if (!body) return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });

  const { flag_key, doc_key, scope_type, scope_id, azione, esito } = body;

  if (!flag_key || !doc_key || !scope_type || !scope_id || !azione) {
    return NextResponse.json(
      { error: "Campi richiesti: flag_key, doc_key, scope_type, scope_id, azione" },
      { status: 400 }
    );
  }
  if (!SCOPE_TYPES_VALIDI.includes(scope_type)) {
    return NextResponse.json({ error: `scope_type non valido: ${scope_type}` }, { status: 400 });
  }
  if (!AZIONI_VALIDE.includes(azione)) {
    return NextResponse.json({ error: `azione non valida: ${azione}` }, { status: 400 });
  }
  if (esito !== undefined && typeof esito !== "boolean") {
    return NextResponse.json({ error: "esito deve essere boolean se presente" }, { status: 400 });
  }

  // ─── FIX 1: scope_type deve corrispondere a dict.flags[flag_key].livello.
  // Controllo puramente deterministico dal dizionario legale, prima di qualunque
  // accesso a sessione/DB: se non corrisponde, niente viene scritto da nessuna parte.
  const attesoScopeType = scopeTypeAtteso(flag_key, doc_key);
  if (attesoScopeType === null) {
    return NextResponse.json({ error: `flag_key sconosciuto nel dizionario legale: ${flag_key}` }, { status: 400 });
  }
  if (scope_type !== attesoScopeType) {
    return NextResponse.json(
      { error: `flag_key '${flag_key}' richiede scope_type '${attesoScopeType}' (ricevuto '${scope_type}')` },
      { status: 400 }
    );
  }

  // ─── 1/2. Client di sessione + utente autenticato — MAI dal body
  const session = await createClient();
  const { data: { user }, error: authErr } = await session.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  // ─── 3. Verifica accesso allo scope — con il client di SESSIONE, non service-role:
  // fn_accessible_entity_ids()/fn_accessible_company_ids() leggono auth.uid() dalla sessione
  // che le chiama. Se le chiamassimo col client service-role (usato solo dopo, per la
  // scrittura), auth.uid() sarebbe nullo e il controllo d'accesso sarebbe silenziosamente
  // inutile — stessa classe di bug già vista altrove su questo progetto.
  let entityIdPerCompanyLookup: string | null = null; // company_id dell'entity, per il dual-write fedele al legacy

  if (scope_type === "entity") {
    const { data, error } = await session.rpc("fn_accessible_entity_ids");
    if (error) return NextResponse.json({ error: "Errore verifica accesso", detail: error.message }, { status: 500 });
    const ids = normalizzaIds(data, "fn_accessible_entity_ids");
    if (!ids.includes(scope_id)) return NextResponse.json({ error: "Accesso negato allo scope" }, { status: 403 });
  } else if (scope_type === "company") {
    const { data, error } = await session.rpc("fn_accessible_company_ids");
    if (error) return NextResponse.json({ error: "Errore verifica accesso", detail: error.message }, { status: 500 });
    const ids = normalizzaIds(data, "fn_accessible_company_ids");
    if (!ids.includes(scope_id)) return NextResponse.json({ error: "Accesso negato allo scope" }, { status: 403 });
  } else {
    // system → scope_id è un supplier_systems.id, accessibile se la sua entity lo è
    const { data: accEntityIds, error: accErr } = await session.rpc("fn_accessible_entity_ids");
    if (accErr) return NextResponse.json({ error: "Errore verifica accesso", detail: accErr.message }, { status: 500 });
    const ids = normalizzaIds(accEntityIds, "fn_accessible_entity_ids");
    const { data: sys, error: sysErr } = await session
      .from("supplier_systems")
      .select("id, entity_id")
      .eq("id", scope_id)
      .in("entity_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
      .maybeSingle();
    if (sysErr) return NextResponse.json({ error: "Errore verifica accesso", detail: sysErr.message }, { status: 500 });
    if (!sys) return NextResponse.json({ error: "Accesso negato allo scope" }, { status: 403 });
  }

  // ─── Client service-role — SOLO ora che l'accesso è confermato, unico writer di `obblighi`
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY non configurata" }, { status: 500 });
  }
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const now = new Date().toISOString();
  let transizione: Transizione;
  try {
    transizione = computeTransizione(azione, esito, now);
  } catch (e) {
    if (e instanceof RichiestaNonValida) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  // company_id dell'entity coinvolta — stesso dato che il codice legacy ricava con una query
  // identica (lib/hooks/useRemediationRows.ts: `setCompanyId(entityRow.company_id ?? null)`),
  // qui necessario per riprodurre fedelmente le righe legacy su entity_compliance_items (che
  // portano sempre anche company_id) e sul log. FIX 2: un fallimento qui non deve degradare a
  // null silenzioso — abortiamo prima di scrivere qualunque cosa.
  if (scope_type === "entity") {
    const { data: entityRow, error: entityErr } = await admin
      .from("entities")
      .select("company_id")
      .eq("id", scope_id)
      .maybeSingle();
    if (entityErr) {
      return NextResponse.json(
        { error: "Impossibile risolvere company_id dell'entity", detail: entityErr.message },
        { status: 500 }
      );
    }
    if (!entityRow) {
      return NextResponse.json({ error: "Entity non trovata per scope_id" }, { status: 404 });
    }
    entityIdPerCompanyLookup = (entityRow.company_id as string | null) ?? null;
  }

  // ─── 4/5/5b/7 in un'unica chiamata atomica — vedi
  // supabase/migrations/20260813190000_fn_obblighi_aggiorna_atomic.sql.
  // FIX 3: niente più "warnings" su fallimento parziale — o l'intera scrittura
  // (obblighi + dual-write + remediation_plans + log) va a buon fine in una sola
  // transazione DB, o fn_obblighi_aggiorna_atomic solleva un'eccezione e Postgres
  // annulla automaticamente tutto ciò che la funzione aveva già scritto.
  const { data: obbligo, error: rpcErr } = await admin
    .rpc("fn_obblighi_aggiorna_atomic", {
      p_flag_key: flag_key,
      p_doc_key: doc_key,
      p_scope_type: scope_type,
      p_scope_id: scope_id,
      p_stato: transizione.stato,
      p_touch_soddisfatto_il: transizione.soddisfatto_il !== undefined,
      p_soddisfatto_il: transizione.soddisfatto_il ?? null,
      p_ultima_azione: transizione.ultima_azione,
      p_aggiornato_da: user.id, // 6. SEMPRE da auth.getUser(), mai dal body
      p_dual_write: scope_type !== "system" && haDualWriteComplianceItems(azione),
      p_azione: azione,
      p_soddisfa: transizione.soddisfa,
      p_esito: esito ?? null,
      p_entity_company_id: entityIdPerCompanyLookup,
      p_log_note: `doc_key=${doc_key}; scope_id=${scope_id}${typeof esito === "boolean" ? `; esito=${esito}` : ""}`,
    })
    .single();

  if (rpcErr) {
    return NextResponse.json({ error: "Scrittura obblighi fallita, nessuna modifica applicata", detail: rpcErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    obbligo,
    stato: transizione.stato,
    ultima_azione: transizione.ultima_azione,
  });
}
