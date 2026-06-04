"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AppShell from "@/components/layout/AppShell";
import { T, getBandTokens } from "@/lib/clavis-tokens";

// ─── TIPI
interface Profile { id: string; full_name: string; email: string; tier: string; }

interface EntityCard {
  id: string;
  name: string;
  entity_type: string;
  region: string | null;
  total_beds: number | null;
  company_id: string;
  company_name: string;
  risk_score: number | null;
  last_triage_date: string | null;
  open_actions: number;
  band: { color: string; textColor: string; bg: string; label: string; border: string };
}

interface CompanyGroup {
  company_id: string;
  company_name: string;
  entities: EntityCard[];
  weighted_score: number | null;
  most_critical: EntityCard | null;
  total_open_actions: number;
}

// ─── ORDINAMENTO
function sortCards(cards: EntityCard[]): EntityCard[] {
  return [...cards].sort((a, b) => {
    // Senza triage → in cima
    if (a.risk_score === null && b.risk_score !== null) return -1;
    if (a.risk_score !== null && b.risk_score === null) return 1;
    if (a.risk_score === null && b.risk_score === null) return 0;
    // Score decrescente
    const scoreDiff = (b.risk_score ?? 0) - (a.risk_score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    // Ultimo triage più vecchio (scadenza più vicina) → prima
    const aDate = a.last_triage_date ? new Date(a.last_triage_date).getTime() : 0;
    const bDate = b.last_triage_date ? new Date(b.last_triage_date).getTime() : 0;
    return aDate - bDate;
  });
}

// ─── SCORE PONDERATO PER SOCIETÀ
function weightedScore(entities: EntityCard[]): number | null {
  const withScore = entities.filter(e => e.risk_score !== null && e.total_beds);
  if (withScore.length === 0) return null;
  const totalBeds = withScore.reduce((s, e) => s + (e.total_beds ?? 0), 0);
  if (totalBeds === 0) return null;
  return Math.round(
    withScore.reduce((s, e) => s + (e.risk_score! * (e.total_beds ?? 0)), 0) / totalBeds
  );
}

export default function StrutturePage() {
  const router  = useRouter();
  const supabase = React.useMemo(() => createClient(), []);

  const [profile, setProfile]           = useState<Profile | null>(null);
  const [cards, setCards]               = useState<EntityCard[]>([]);
  const [companyGroups, setCompanyGroups] = useState<CompanyGroup[]>([]);
  const [loading, setLoading]           = useState(true);
  const [view, setView]                 = useState<"struttura" | "societa">("struttura");
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  function toggleGroup(id: string) {
    setExpandedGroups(prev =>
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    );
  }

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    // 1. Profile
    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    setProfile(profileData);

    // 2. Entities
    const { data: entitiesData } = await supabase
      .from("entities")
      .select("id, name, entity_type, region, total_beds, company_id")
      .eq("created_by", user.id);
    const entities = entitiesData ?? [];

    if (entities.length === 0) {
      setCards([]);
      setCompanyGroups([]);
      setLoading(false);
      return;
    }

    const entity_ids = entities.map(e => e.id);
    const company_ids = [...new Set(entities.map(e => e.company_id).filter(Boolean))] as string[];

    // 3. Companies, 4. Triage, 5. Remediation — in parallelo
    const [companiesRes, triageRes, remRes] = await Promise.all([
      company_ids.length > 0
        ? supabase.from("companies").select("id, name").in("id", company_ids)
        : Promise.resolve({ data: [] }),
      supabase
        .from("v_triage_dashboard")
        .select("entity_id, risk_score, completed_at")
        .eq("user_id", user.id)
        .eq("status", "generated")
        .order("completed_at", { ascending: false }),
      supabase
        .from("remediation_plans")
        .select("entity_id, id")
        .in("status", ["open", "non_conforme", "declared"])
        .in("entity_id", entity_ids),
    ]);

    const companiesMap: Record<string, string> = {};
    for (const c of (companiesRes.data ?? [])) {
      companiesMap[c.id] = c.name;
    }

    // Ultimo triage per entity (già ordinato desc)
    const triageMap: Record<string, { risk_score: number; completed_at: string }> = {};
    for (const t of (triageRes.data ?? [])) {
      if (!triageMap[t.entity_id]) {
        triageMap[t.entity_id] = { risk_score: t.risk_score, completed_at: t.completed_at };
      }
    }

    // Conteggio azioni aperte per entity
    const actionsMap: Record<string, number> = {};
    for (const r of (remRes.data ?? [])) {
      actionsMap[r.entity_id] = (actionsMap[r.entity_id] ?? 0) + 1;
    }

    // Costruisci EntityCard[]
    const built: EntityCard[] = entities.map(e => {
      const triage = triageMap[e.id] ?? null;
      const score  = triage?.risk_score ?? null;
      return {
        id:               e.id,
        name:             e.name,
        entity_type:      e.entity_type ?? "",
        region:           e.region ?? null,
        total_beds:       e.total_beds ?? null,
        company_id:       e.company_id ?? "",
        company_name:     companiesMap[e.company_id] ?? "—",
        risk_score:       score,
        last_triage_date: triage?.completed_at ?? null,
        open_actions:     actionsMap[e.id] ?? 0,
        band:             score !== null ? getBandTokens(score) : getBandTokens(0),
      };
    });

    const sorted = sortCards(built);
    setCards(sorted);

    // Costruisci CompanyGroup[]
    const groupMap: Record<string, EntityCard[]> = {};
    for (const card of sorted) {
      const key = card.company_id || "__no_company__";
      if (!groupMap[key]) groupMap[key] = [];
      groupMap[key].push(card);
    }

    const groups: CompanyGroup[] = Object.entries(groupMap).map(([cid, ents]) => {
      const ws = weightedScore(ents);
      const critical = sortCards(ents.filter(e => e.risk_score !== null))[0] ?? null;
      return {
        company_id:          cid,
        company_name:        ents[0]?.company_name ?? "—",
        entities:            ents,
        weighted_score:      ws,
        most_critical:       critical && (critical.risk_score ?? 0) >= 75 ? critical : null,
        total_open_actions:  ents.reduce((s, e) => s + e.open_actions, 0),
      };
    });

    groups.sort((a, b) => (b.weighted_score ?? -1) - (a.weighted_score ?? -1));
    setCompanyGroups(groups);
    setLoading(false);
  }, [supabase, router]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── AGGREGATI HEADER
  const totalEntities = cards.length;
  const withScore     = cards.filter(c => c.risk_score !== null);
  const avgScore      = weightedScore(cards);
  const critiche      = withScore.filter(c => (c.risk_score ?? 0) >= 75).length;
  const alte          = withScore.filter(c => (c.risk_score ?? 0) >= 50 && (c.risk_score ?? 0) < 75).length;
  const medie         = withScore.filter(c => (c.risk_score ?? 0) >= 25 && (c.risk_score ?? 0) < 50).length;
  const totalActions  = cards.reduce((s, c) => s + c.open_actions, 0);

  // ─── LOADING
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--ink)" }}>
      <div className="text-center space-y-2">
        <p className="font-mono text-sm uppercase tracking-widest" style={{ color: T.slate400 }}>CLAVIS</p>
        <p className="text-sm" style={{ color: T.slate400 }}>Caricamento portfolio...</p>
      </div>
    </div>
  );

  // ─── RENDER
  return (
    <AppShell
      profile={profile}
      activeRoute="/strutture"
    >
      <main id="main-content" className="clavis-workspace flex-1 flex flex-col overflow-hidden">
        <div className="flex flex-col flex-1 overflow-hidden p-4 gap-4">

          {/* ── HEADER AGGREGATO */}
          <div className="flex-shrink-0 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-6 flex-wrap">
              <div>
                <p className="text-xs font-mono uppercase tracking-widest" style={{ color: T.slate400 }}>Portfolio</p>
                <p className="font-bold text-base" style={{ color: T.slate800 }}>
                  {totalEntities} struttur{totalEntities === 1 ? "a" : "e"}
                </p>
              </div>

              {avgScore !== null && (
                <>
                  <div className="w-px h-8" style={{ backgroundColor: T.slate200 }} />
                  <div>
                    <p className="text-xs" style={{ color: T.slate400 }}>Score medio</p>
                    <p className="font-mono font-black text-base" style={{ color: getBandTokens(avgScore).color }}>
                      {avgScore}
                    </p>
                  </div>
                </>
              )}

              {(critiche > 0 || alte > 0 || medie > 0) && (
                <>
                  <div className="w-px h-8" style={{ backgroundColor: T.slate200 }} />
                  <div className="flex items-center gap-3 text-xs font-semibold">
                    {critiche > 0 && (
                      <span style={{ color: T.critical }}>{critiche} CRITICA{critiche > 1 ? "" : ""}</span>
                    )}
                    {alte > 0 && (
                      <span style={{ color: T.high }}>{alte} ALTA{alte > 1 ? "" : ""}</span>
                    )}
                    {medie > 0 && (
                      <span style={{ color: T.medium }}>{medie} MEDIA{medie > 1 ? "" : ""}</span>
                    )}
                  </div>
                </>
              )}

              {totalActions > 0 && (
                <>
                  <div className="w-px h-8" style={{ backgroundColor: T.slate200 }} />
                  <div>
                    <p className="text-xs" style={{ color: T.slate400 }}>Azioni aperte</p>
                    <p className="font-semibold text-sm" style={{ color: T.critical }}>{totalActions}</p>
                  </div>
                </>
              )}
            </div>

            {/* Toggle vista */}
            <div className="flex border rounded-sm overflow-hidden flex-shrink-0" style={{ borderColor: T.slate200 }}>
              <button
                onClick={() => setView("struttura")}
                style={{ background: view === "struttura" ? T.slate200 : "transparent", color: T.slate800 }}
                className="px-4 py-1.5 text-sm font-medium"
              >
                Per struttura
              </button>
              <button
                onClick={() => setView("societa")}
                style={{
                  background: view === "societa" ? T.slate200 : "transparent",
                  color: T.slate800,
                  borderLeft: `1px solid ${T.slate200}`,
                }}
                className="px-4 py-1.5 text-sm font-medium"
              >
                Per società
              </button>
            </div>
          </div>

          {/* ── EMPTY STATE */}
          {cards.length === 0 && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4 max-w-sm">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
                  style={{ backgroundColor: T.slate100 }}>
                  <span className="text-2xl">🏢</span>
                </div>
                <p className="font-semibold text-base" style={{ color: T.slate800 }}>Nessuna struttura trovata</p>
                <p className="text-sm" style={{ color: T.slate400 }}>
                  Aggiungi strutture dalla sezione Anagrafica per visualizzare il portfolio.
                </p>
                <button
                  onClick={() => router.push("/anagrafica")}
                  className="px-6 py-3 text-sm font-bold tracking-widest uppercase transition-colors"
                  style={{ backgroundColor: "var(--shield)", color: "var(--bone)", borderRadius: "4px" }}
                >
                  Vai ad Anagrafica →
                </button>
              </div>
            </div>
          )}

          {/* ── VISTA PER STRUTTURA */}
          {view === "struttura" && cards.length > 0 && (
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                {cards.map(card => (
                  <div
                    key={card.id}
                    style={{
                      background: "var(--ink2)",
                      border: `1px solid ${card.risk_score === null ? T.slate200 : card.band.color}`,
                      borderLeft: `4px solid ${card.risk_score === null ? T.slate400 : card.band.color}`,
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      localStorage.setItem("clavis_active_entity_id", card.id);
                      router.push("/dashboard");
                    }}
                  >
                    {/* Header card */}
                    <div className="px-4 py-3 border-b" style={{ borderColor: T.slate200 }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-sm truncate" style={{ color: T.slate800 }}>{card.name}</p>
                          <p className="text-xs mt-0.5" style={{ color: T.slate400 }}>
                            {card.entity_type} · {card.region ?? "—"}
                          </p>
                        </div>
                        {card.risk_score !== null ? (
                          <div className="flex-shrink-0 px-2 py-1 text-center" style={{ background: card.band.bg, borderRadius: "4px" }}>
                            <p className="text-sm font-mono font-black leading-none" style={{ color: card.band.color }}>
                              {card.risk_score}
                            </p>
                            <p className="font-bold uppercase" style={{ color: card.band.color, fontSize: "12px" }}>
                              {card.band.label}
                            </p>
                          </div>
                        ) : (
                          <div className="flex-shrink-0 px-2 py-1" style={{ background: T.slate100, borderRadius: "4px" }}>
                            <p className="text-xs font-mono" style={{ color: T.slate400 }}>No triage</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Body card */}
                    <div className="px-4 py-3 space-y-2">
                      <div className="flex justify-between text-xs">
                        <span style={{ color: T.slate400 }}>Azioni aperte</span>
                        <span style={{ color: card.open_actions > 0 ? T.critical : T.low, fontWeight: 600 }}>
                          {card.open_actions > 0 ? `${card.open_actions} aperte` : "Nessuna"}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span style={{ color: T.slate400 }}>Ultimo triage</span>
                        <span style={{ color: T.slate600 }}>
                          {card.last_triage_date
                            ? new Date(card.last_triage_date).toLocaleDateString("it-IT")
                            : "Mai effettuato"}
                        </span>
                      </div>
                      {card.total_beds && (
                        <div className="flex justify-between text-xs">
                          <span style={{ color: T.slate400 }}>Posti letto</span>
                          <span style={{ color: T.slate600 }}>{card.total_beds}</span>
                        </div>
                      )}
                    </div>

                    {/* Footer card */}
                    <div className="px-4 py-2 border-t flex justify-between items-center"
                      style={{ borderColor: T.slate200 }}>
                      <p className="text-xs truncate" style={{ color: T.slate400 }}>{card.company_name}</p>
                      <p className="text-xs font-semibold flex-shrink-0" style={{ color: T.bronze }}>
                        Apri dashboard →
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── VISTA PER SOCIETÀ */}
          {view === "societa" && cards.length > 0 && (
            <div className="flex-1 overflow-y-auto space-y-3">
              {companyGroups.map(group => (
                <div
                  key={group.company_id}
                  style={{ background: "var(--ink2)", border: "1px solid var(--line2)", borderRadius: "4px" }}
                >
                  {/* Header gruppo */}
                  <button
                    onClick={() => toggleGroup(group.company_id)}
                    className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left"
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate" style={{ color: T.slate800 }}>{group.company_name}</p>
                        <p className="text-xs mt-0.5" style={{ color: T.slate400 }}>
                          {group.entities.length} struttur{group.entities.length === 1 ? "a" : "e"} · {group.total_open_actions} azioni aperte
                        </p>
                      </div>
                      {group.most_critical && (
                        <div className="text-xs px-2 py-1 rounded flex-shrink-0"
                          style={{ background: T.critBg, color: T.critical, fontSize: "12px" }}>
                          Critica: {group.most_critical.name}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      {group.weighted_score !== null && (
                        <div className="text-right">
                          <p className="font-mono font-black text-lg leading-none"
                            style={{ color: getBandTokens(group.weighted_score).color }}>
                            {group.weighted_score}
                          </p>
                          <p className="font-bold uppercase" style={{ color: getBandTokens(group.weighted_score).color, fontSize: "12px" }}>
                            {getBandTokens(group.weighted_score).label}
                          </p>
                        </div>
                      )}
                      <span style={{ color: T.slate400, fontSize: "12px" }}>
                        {expandedGroups.includes(group.company_id) ? "▲" : "▼"}
                      </span>
                    </div>
                  </button>

                  {/* Strutture figlie */}
                  {expandedGroups.includes(group.company_id) && (
                    <div className="border-t" style={{ borderColor: T.slate200 }}>
                      {group.entities.map((entity, i) => (
                        <div
                          key={entity.id}
                          onClick={() => {
                            localStorage.setItem("clavis_active_entity_id", entity.id);
                            router.push("/dashboard");
                          }}
                          className="px-5 py-3 flex items-center justify-between gap-4 cursor-pointer hover:opacity-80 transition-opacity"
                          style={{
                            borderBottom: i < group.entities.length - 1 ? `1px solid ${T.slate200}` : "none",
                            borderLeft: `3px solid ${entity.risk_score !== null ? entity.band.color : T.slate400}`,
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: T.slate800 }}>{entity.name}</p>
                            <p className="text-xs" style={{ color: T.slate400 }}>
                              {entity.entity_type} · {entity.region ?? "—"}
                            </p>
                          </div>
                          <div className="flex items-center gap-6 text-xs flex-shrink-0">
                            <span style={{ color: entity.open_actions > 0 ? T.critical : T.slate400 }}>
                              {entity.open_actions > 0 ? `${entity.open_actions} azioni` : "OK"}
                            </span>
                            <span style={{ color: T.slate400 }}>
                              {entity.last_triage_date
                                ? new Date(entity.last_triage_date).toLocaleDateString("it-IT")
                                : "Mai"}
                            </span>
                            {entity.risk_score !== null ? (
                              <span className="font-mono font-black text-sm"
                                style={{ color: entity.band.color, minWidth: "32px", textAlign: "right" }}>
                                {entity.risk_score}
                              </span>
                            ) : (
                              <span className="text-xs" style={{ color: T.slate400, minWidth: "32px", textAlign: "right" }}>—</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

        </div>
      </main>
    </AppShell>
  );
}
