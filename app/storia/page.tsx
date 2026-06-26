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

type ColoreEvento = "green" | "blue" | "teal" | "amber" | "gray";

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
};

// ─── HELPERS

function titoloLeggibile(tipo: string): string {
  switch (tipo) {
    case "generato":       return "Documento generato con CLAVIS";
    case "caricato":       return "Documento caricato";
    case "verificato_ai":  return "Documento verificato da CLAVIS AI";
    case "autocertificato": return "Documento autocertificato dal LR";
    default:               return tipo;
  }
}

function colorePerTipo(tipo: string): ColoreEvento {
  switch (tipo) {
    case "verificato_ai":  return "green";
    case "generato":       return "blue";
    case "caricato":       return "teal";
    case "autocertificato": return "amber";
    default:               return "gray";
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
        ? supabase.from("entities").select("id, name").eq("id", storedEntityId).limit(1)
        : supabase.from("entities").select("id, name").eq("created_by", user.id).limit(1);

      const [profRes, entityRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        entityQuery,
      ]);

      if (profRes.data) setProfile(profRes.data as Profile);
      if (!entityRes.data || entityRes.data.length === 0) { router.push("/onboarding"); return; }

      const eid   = entityRes.data[0].id   as string;
      const ename = (entityRes.data[0].name as string) ?? "";
      setEntityName(ename);
      if (!storedEntityId) localStorage.setItem("clavis_active_entity_id", eid);

      // Fonte 1 — compliance_events
      const { data: eventiDoc } = await supabase
        .from("compliance_events")
        .select("id, created_at, tipo, documento_key, documento_titolo, note")
        .eq("entity_id", eid)
        .order("created_at", { ascending: false });

      // Fonte 2 — triage_sessions
      const { data: triages } = await supabase
        .from("triage_sessions")
        .select("id, created_at, risk_score, risk_band")
        .eq("entity_id", eid)
        .order("created_at", { ascending: false });

      // Fonte 3 — remediation_plans (solo chiuse)
      const { data: piani } = await supabase
        .from("remediation_plans")
        .select("id, created_at, closed_at, flag_key, action_text, status")
        .eq("entity_id", eid)
        .not("closed_at", "is", null);

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
          ? `Score: ${r.risk_score}/100 — ${r.risk_band ?? ""}`
          : null,
        colore: "gray" as const,
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const listaAzioni: EventoStoria[] = (piani ?? []).map((r: any) => ({
        id: `${r.id}_closed`,
        data: r.closed_at,
        categoria: "azione" as const,
        tipo: "azione_chiusa",
        titolo: "Azione completata",
        dettaglio: r.action_text ?? null,
        colore: "green" as const,
      }));

      const tutti = [...listaDoc, ...listaTriage, ...listaAzioni]
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
