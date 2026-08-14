"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ClavisTitle } from "@/components/ui/ClavisTitle";
import { useActiveEntity } from "@/contexts/EntityContext";
import AppShell from "@/components/layout/AppShell";
import { T } from "@/lib/clavis-tokens";

// ─── TIPI

interface Profile { id: string; full_name: string; email: string; tier: string; }

type ColoreEvento = "green" | "blue" | "teal" | "amber" | "gray" | "purple";

interface EventoStoria {
  id: string;
  data: string;
  categoria: "documento" | "triage" | "azione";
  tipo: string;
  titolo: string;
  dettaglio: string | null;
  colore: ColoreEvento;
}

// ─── COLORI

const COLORI: Record<ColoreEvento, { dot: string; border: string }> = {
  green: { dot: "#639922", border: "#C0DD97" },
  blue:  { dot: "#185FA5", border: "#A8C4E8" },
  teal:  { dot: "#0F6E56", border: "#7EC8B0" },
  amber: { dot: "#854F0B", border: "#FAC775" },
  gray:  { dot: "rgba(238,241,248,.30)", border: "rgba(238,241,248,.16)" },
  purple:{ dot: "#7E22CE", border: "#E9D5FF" },
};

// ─── HELPERS

function titoloLeggibile(tipo: string): string {
  switch (tipo) {
    case "generato":                return "Documento generato con CLAVIS";
    case "caricato":                return "Documento caricato";
    case "verificato_ai":           return "Documento verificato da CLAVIS AI";
    case "autocertificato":         return "Documento autocertificato dal LR";
    case "DICHIARATO":              return "Documento autocertificato";
    case "dichiarazione_annullata": return "Autocertificazione annullata";
    case "ANNULLATO":               return "Autocertificazione annullata";
    case "annullato":               return "Autocertificazione annullata";
    case "ARCHIVIATO":              return "Documento archiviato";
    case "archiviato":              return "Documento archiviato";
    case "documento_caricato":      return "Documento caricato";
    case "documento_generato":      return "Documento generato con CLAVIS";
    case "CONFORME":                return "Documento verificato — conforme";
    case "NON_CONFORME":            return "Documento non conforme";
    default:                        return tipo;
  }
}

// Eventi di compliance_activity_log il cui azione/action_type descrive un
// evento sul DOCUMENTO (stesso set che titoloLeggibile già etichetta
// "Documento ..."/"Autocertificazione ..."), non sull'azione di remediation
// in sé — senza questo, finivano tutti taggati "azione" a prescindere,
// disallineando il badge blu "documenti" da quello che la timeline mostra.
const AZIONI_DOCUMENTO = new Set([
  "generato", "caricato", "verificato_ai", "autocertificato", "DICHIARATO",
  "dichiarazione_annullata", "ANNULLATO", "annullato", "ARCHIVIATO", "archiviato",
  "documento_caricato", "documento_generato", "CONFORME", "NON_CONFORME",
  "documento_verificato", "documento_non_conforme",
]);

// Azioni per cui esiste ANCHE un insert manuale su compliance_events (GenerateDocModal.doGenerate,
// DocumentoModal.handleBluUpload, DocumentoModal.handleAutocertifica — fonte ricca, non toccare) a
// fianco di quello che fn_obblighi_aggiorna_atomic scrive incondizionatamente su
// compliance_activity_log per la stessa azione/istante: senza esclusione qui, ogni azione in questo
// set produrrebbe due righe identiche in timeline (Fonte 1 + Fonte 4). Se un domani un nuovo azione
// guadagna lo stesso doppio-insert, va aggiunta qui — non serve toccare il filtro sotto.
const AZIONI_DUPLICATE_CON_COMPLIANCE_EVENTS = new Set([
  "GENERATO", "CARICATO", "VERIFICATO_AI", "AUTOCERTIFICATO",
]);

function categoriaPerAzione(azione: string): "documento" | "azione" {
  return AZIONI_DOCUMENTO.has(azione) ? "documento" : "azione";
}

function colorePerTipo(tipo: string): ColoreEvento {
  switch (tipo) {
    case "verificato_ai":
    case "CONFORME":
    case "documento_generato":      return "green";
    case "generato":                return "blue";
    case "caricato":
    case "documento_caricato":      return "teal";
    case "autocertificato":
    case "DICHIARATO":              return "amber";
    case "ANNULLATO":
    case "dichiarazione_annullata":  return "gray";
    case "NON_CONFORME":             return "purple";
    default:                        return "gray";
  }
}

function dayKey(isoDate: string): string {
  return isoDate.slice(0, 10);
}

function labelGiorno(key: string): string {
  const oggi = new Date().toISOString().slice(0, 10);
  const ieri = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (key === oggi) return "oggi";
  if (key === ieri) return "ieri";
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("it-IT", {
    day: "numeric", month: "long", year: "numeric",
  });
}

function formatOra(isoDate: string): string {
  return new Date(isoDate).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

// ─── PAGE

export default function StoriaPage() {
  const router   = useRouter();
  const supabase = createClient();
  const { entityVersion } = useActiveEntity();

  const [profile,    setProfile]    = useState<Profile | null>(null);
  const [entityName, setEntityName] = useState<string>("");
  const [eventi,     setEventi]     = useState<EventoStoria[]>([]);
  const [loading,    setLoading]    = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    setEventi([]);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const storedEntityId = localStorage.getItem("clavis_active_entity_id");
      const entityQuery = storedEntityId
        ? supabase.from("entities").select("id, name, company_id").eq("id", storedEntityId).limit(1)
        : supabase.from("entities").select("id, name, company_id").eq("created_by", user.id).limit(1);

      const [profRes, entityRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        entityQuery,
      ]);

      if (profRes.data) setProfile(profRes.data as Profile);
      if (!entityRes.data || entityRes.data.length === 0) { router.push("/onboarding"); return; }

      const eid   = entityRes.data[0].id         as string;
      const cid   = entityRes.data[0].company_id as string | null;
      const ename = (entityRes.data[0].name as string) ?? "";
      setEntityName(ename);
      if (!storedEntityId) localStorage.setItem("clavis_active_entity_id", eid);

      // Fonte 1 — compliance_events (mai scritto con company_id: nessun evento
      // company-level, niente su cui allineare il filtro — gap noto, non nuovo)
      const { data: eventiDoc } = await supabase
        .from("compliance_events")
        .select("id, created_at, tipo, documento_key, documento_titolo, note")
        .eq("entity_id", eid)
        .order("created_at", { ascending: false });

      // Fonte 2 — triage_sessions (per definizione entity-scoped, corretto così)
      const { data: triages } = await supabase
        .from("triage_sessions")
        .select("id, created_at, risk_score")
        .eq("entity_id", eid)
        .order("created_at", { ascending: false });

      // Fonte 3 — remediation_plans (solo chiuse). company_id qui è popolato
      // solo per i flag davvero company-level (stesso principio di /remediation
      // e /scadenze) — l'.or() è sicuro, nessun rischio di leak entity-level.
      const piansQuery = cid
        ? supabase.from("remediation_plans").select("id, created_at, completed_at, flag_key, planned_action, status")
            .or(`entity_id.eq.${eid},company_id.eq.${cid}`)
        : supabase.from("remediation_plans").select("id, created_at, completed_at, flag_key, planned_action, status")
            .eq("entity_id", eid);
      const { data: piani } = await piansQuery.not("completed_at", "is", null);

      // Fonte 4 — compliance_activity_log. ATTENZIONE: qui company_id viene
      // scritto SEMPRE (anche per eventi entity-level) — un .or() nudo su
      // entity_id/company_id farebbe trapelare gli eventi entity-level di
      // altre strutture della stessa società. Si allarga per company_id e si
      // filtra client-side su "entity_id === eid OR livello === company".
      const activityQuery = cid
        ? supabase.from("compliance_activity_log").select("id, created_at, azione, action_type, tipo_item, livello, entity_id, company_id")
            .eq("company_id", cid)
        : supabase.from("compliance_activity_log").select("id, created_at, azione, action_type, tipo_item, livello, entity_id, company_id")
            .eq("entity_id", eid);
      const { data: activityLogAll } = await activityQuery.order("created_at", { ascending: false });
      // Ogni azione in AZIONI_DUPLICATE_CON_COMPLIANCE_EVENTS viene scritta SEMPRE
      // insieme a un compliance_events.tipo equivalente per lo stesso documento
      // (stessa chiamata, stesso istante — case a parte: fn_obblighi_aggiorna_atomic
      // scrive minuscolo, alcuni insert manuali storici scrivevano maiuscolo,
      // entrambe le forme coesistono nello storico) — è un duplicato del più ricco
      // evento di Fonte 1, va escluso qui per non doppiare la riga in timeline.
      const activityLog = (activityLogAll ?? []).filter(r =>
        (r.entity_id === eid || r.livello === "company")
        && !AZIONI_DUPLICATE_CON_COMPLIANCE_EVENTS.has((r.azione ?? r.action_type ?? "").toUpperCase())
      );

      // Fonte 5 — compliance_items_history. Stesso motivo di Fonte 4:
      // company_id è sempre popolato, "source_table" (livello dell'item
      // archiviato) è il discriminante corretto per gli eventi company-level.
      const { data: archivioAll } = cid
        ? await supabase
            .from("compliance_items_history")
            .select("id, archived_at, tipo, stato, documento_nome, entity_id, source_table")
            .eq("company_id", cid)
            .order("archived_at", { ascending: false })
        : { data: [] as { id: string; archived_at: string; tipo: string; stato: string; documento_nome: string | null; entity_id: string; source_table: string | null }[] };
      const archivio = (archivioAll ?? []).filter(r => r.entity_id === eid || r.source_table === "company");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const listaDoc: EventoStoria[] = (eventiDoc ?? []).map((r: any) => ({
        id: r.id,
        data: r.created_at,
        categoria: "documento" as const,
        tipo: r.tipo,
        titolo: titoloLeggibile(r.tipo),
        dettaglio: r.documento_titolo ?? r.documento_key ?? null,
        colore: colorePerTipo(r.tipo),
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const listaTriage: EventoStoria[] = (triages ?? []).map((r: any) => ({
        id: r.id,
        data: r.created_at,
        categoria: "triage" as const,
        tipo: "triage",
        titolo: "Analisi normativa completata",
        dettaglio: r.risk_score != null
          ? `Score: ${r.risk_score}/100 — ${r.risk_score >= 70 ? "alto" : r.risk_score >= 40 ? "medio" : "basso"}`
          : null,
        colore: "gray" as const,
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const listaAzioni: EventoStoria[] = (piani ?? []).map((r: any) => ({
        id: `${r.id}_closed`,
        data: r.completed_at,
        categoria: "azione" as const,
        tipo: "azione_chiusa",
        titolo: "Azione completata",
        dettaglio: r.planned_action ?? null,
        colore: "green" as const,
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const listaActivity: EventoStoria[] = activityLog.map((r: any) => {
        const azione = r.azione ?? r.action_type ?? "";
        return {
          id: `act_${r.id}`,
          data: r.created_at,
          categoria: categoriaPerAzione(azione),
          tipo: azione || "azione",
          titolo: titoloLeggibile(azione || (r.tipo_item ?? "")),
          dettaglio: r.tipo_item ?? null,
          colore: colorePerTipo(azione) as ColoreEvento,
        };
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const listaArchivio: EventoStoria[] = archivio.map((r: any) => ({
        id: `arch_${r.id}`,
        data: r.archived_at,
        categoria: "documento" as const,
        tipo: "ARCHIVIATO",
        titolo: "Documento archiviato",
        dettaglio: r.documento_nome ?? r.tipo ?? null,
        colore: "amber" as const,
      }));

      const tutti = [...listaDoc, ...listaTriage, ...listaAzioni, ...listaActivity, ...listaArchivio]
        .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

      setEventi(tutti);
    } finally {
      setLoading(false);
    }
  }, [supabase, router]);

  useEffect(() => { loadData(); }, [loadData, entityVersion]);

  const gruppiPerGiorno = useMemo(() => {
    const map = new Map<string, EventoStoria[]>();
    for (const ev of eventi) {
      const k = dayKey(ev.data);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(ev);
    }
    return Array.from(map.entries());
  }, [eventi]);

  const nDoc     = eventi.filter(e => e.categoria === "documento").length;
  const nAzioni  = eventi.filter(e => e.categoria === "azione").length;
  const nTriages = eventi.filter(e => e.categoria === "triage").length;

  if (loading) return (
    <div className="clavis-bg min-h-screen flex items-center justify-center">
      <p className="font-mono text-sm uppercase tracking-widest" style={{ color: "var(--bone-dim)" }}>
        Caricamento storia...
      </p>
    </div>
  );

  return (
    <AppShell profile={profile} activeRoute="/storia">
      <main id="main-content" className="clavis-workspace flex-1 flex flex-col overflow-auto p-6 gap-6">

        {/* ── HEADER */}
        <div className="flex items-start justify-between gap-4 flex-wrap flex-shrink-0">
          <div>
            <ClavisTitle it="Storia" en="Compliance Trail" as="h1" variant="page" />
            {entityName && (
              <p className="text-xs font-mono mt-1" style={{ color: T.slate400 }}>
                {entityName}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold px-3 py-1.5 rounded"
              style={{ backgroundColor: "rgba(58,109,240,.12)", color: "#5E86F5", border: "1px solid rgba(58,109,240,.20)" }}>
              {nDoc} document{nDoc === 1 ? "o" : "i"}
            </span>
            <span className="text-xs font-bold px-3 py-1.5 rounded"
              style={{ backgroundColor: "rgba(62,207,142,.10)", color: T.low, border: "1px solid rgba(62,207,142,.20)" }}>
              {nAzioni} azioni chiuse
            </span>
            <span className="text-xs font-bold px-3 py-1.5 rounded"
              style={{ backgroundColor: "rgba(154,163,189,.10)", color: T.slate400, border: "1px solid rgba(154,163,189,.18)" }}>
              {nTriages} analisi
            </span>
          </div>
        </div>

        {/* ── STATO VUOTO */}
        {eventi.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center py-24">
            <span style={{ fontSize: "40px", opacity: 0.35 }}>⏱</span>
            <p className="text-sm font-semibold" style={{ color: "var(--bone)" }}>
              Nessuna attività ancora registrata.
            </p>
            <p className="text-xs leading-relaxed" style={{ color: T.slate400, maxWidth: "280px" }}>
              Il tuo percorso di conformità inizia con il primo documento.
            </p>
            <button
              onClick={() => router.push("/documenti")}
              className="px-5 py-2 text-xs font-bold uppercase tracking-widest rounded transition-opacity hover:opacity-80"
              style={{ backgroundColor: "#0F6E56", color: "#fff", borderRadius: "4px" }}
            >
              Vai ai Documenti →
            </button>
          </div>
        )}

        {/* ── TIMELINE */}
        {eventi.length > 0 && (
          <div className="flex-1 relative" style={{ paddingLeft: "32px" }}>

            {/* Linea verticale */}
            <div
              className="absolute top-0 bottom-0"
              style={{ left: "9px", width: "2px", backgroundColor: "rgba(238,241,248,.16)" }}
            />

            <div className="flex flex-col" style={{ gap: "28px" }}>
              {gruppiPerGiorno.map(([giorno, eventiGiorno]) => (
                <div key={giorno} className="flex flex-col" style={{ gap: "10px" }}>

                  {/* Label giorno */}
                  <p
                    className="font-bold uppercase"
                    style={{
                      fontSize: "11px",
                      letterSpacing: "0.08em",
                      color: T.slate400,
                      marginLeft: "-24px",
                    }}
                  >
                    {labelGiorno(giorno)}
                  </p>

                  {/* Eventi */}
                  {eventiGiorno.map(ev => {
                    const cfg = COLORI[ev.colore];
                    return (
                      <div key={ev.id} className="relative">
                        {/* Pallino */}
                        <div
                          style={{
                            position: "absolute",
                            left: "-27px",
                            top: "12px",
                            width: "10px",
                            height: "10px",
                            borderRadius: "50%",
                            backgroundColor: cfg.dot,
                            border: `2px solid ${cfg.border}`,
                            zIndex: 1,
                          }}
                        />
                        {/* Card */}
                        <div
                          className="flex items-start justify-between gap-3"
                          style={{
                            padding: "10px 14px",
                            border: `0.5px solid ${cfg.border}`,
                            borderRadius: "6px",
                            backgroundColor: "var(--ink2)",
                          }}
                        >
                          <div className="flex flex-col min-w-0" style={{ gap: "2px" }}>
                            <p className="font-medium truncate" style={{ fontSize: "13px", color: "var(--bone)" }}>
                              {ev.titolo}
                            </p>
                            {ev.dettaglio && (
                              <p className="truncate" style={{ fontSize: "12px", color: T.slate400 }}>
                                {ev.dettaglio}
                              </p>
                            )}
                          </div>
                          <p className="flex-shrink-0 font-mono" style={{ fontSize: "11px", color: T.slate400, paddingTop: "1px" }}>
                            {formatOra(ev.data)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </AppShell>
  );
}
