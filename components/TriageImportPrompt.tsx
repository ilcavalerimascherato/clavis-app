"use client";

/**
 * components/TriageImportPrompt.tsx
 * Check globale: triage_anonymous non migrato per l'email dell'utente loggato.
 * Montato in AppShell — copre anche utenti con entity già esistente che
 * completano un nuovo triage anonimo in futuro (non solo il flusso onboarding).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useActiveEntity } from "@/contexts/EntityContext";

const T = {
  navy:     "#0A0E1A",
  ink2:     "#0F1424",
  slate200: "rgba(238,241,248,.16)",
  slate400: "#9AA3BD",
  slate800: "#EEF1F8",
  bronze:   "#D9B25A",
  bronzeBg: "rgba(217,178,90,.12)",
};

interface AnonSession {
  id: string;
  entity_name: string | null;
  risk_score: number | null;
}

interface EntityOption {
  id: string;
  name: string;
}

const DISMISSED_KEY  = "clavis_triage_import_dismissed";
const CHECKED_PREFIX = "clavis_triage_import_checked_";

function getDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]"); } catch { return []; }
}

export default function TriageImportPrompt({
  profile,
}: {
  profile: { id: string; email: string } | null;
}) {
  const router = useRouter();
  const { activeEntityId } = useActiveEntity();

  const [anonSession,    setAnonSession]    = useState<AnonSession | null>(null);
  const [entities,       setEntities]       = useState<EntityOption[]>([]);
  const [targetEntityId, setTargetEntityId] = useState<string>("");
  const [importing,      setImporting]      = useState(false);

  useEffect(() => {
    if (!profile?.email) return;

    // Un solo check per tab/sessione — AppShell si rimonta ad ogni navigazione
    const checkedKey = CHECKED_PREFIX + profile.id;
    if (sessionStorage.getItem(checkedKey)) return;
    sessionStorage.setItem(checkedKey, "1");

    (async () => {
      const supabase = createClient();

      const { data: anonRows } = await supabase
        .from("triage_anonymous")
        .select("id, entity_name, risk_score")
        .eq("email", profile.email)
        .is("migrated_at", null)
        .order("created_at", { ascending: false })
        .limit(5);

      if (!anonRows || anonRows.length === 0) return;

      const { data: alreadyImported } = await supabase
        .from("triage_sessions")
        .select("anonymous_session_id")
        .in("anonymous_session_id", anonRows.map(r => r.id));

      const importedIds = new Set((alreadyImported ?? []).map(r => r.anonymous_session_id));
      const dismissed    = getDismissed();
      const unmigrated   = anonRows.find(r => !importedIds.has(r.id) && !dismissed.includes(r.id));
      if (!unmigrated) return;

      const { data: entityRows } = await supabase
        .from("entities")
        .select("id, name")
        .eq("created_by", profile.id)
        .order("name");

      if (!entityRows || entityRows.length === 0) return; // nessuna struttura — resta all'onboarding

      setEntities(entityRows);
      setTargetEntityId(
        activeEntityId && entityRows.some(e => e.id === activeEntityId)
          ? activeEntityId
          : entityRows[0].id
      );
      setAnonSession(unmigrated);
    })();
  }, [profile?.id, profile?.email, activeEntityId]);

  if (!anonSession) return null;

  async function handleImport() {
    if (!profile || !targetEntityId) return;
    setImporting(true);
    await fetch("/api/import-triage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        anonymous_id: anonSession!.id,
        entity_id:    targetEntityId,
        user_id:      profile.id,
      }),
    }).catch(() => {});
    setAnonSession(null);
    router.refresh();
  }

  function handleDismiss() {
    const dismissed = getDismissed();
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed, anonSession!.id]));
    setAnonSession(null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.72)" }}
      onClick={e => { if (e.target === e.currentTarget) handleDismiss(); }}
    >
      <div
        className="w-full mx-4 space-y-5 p-6"
        style={{ backgroundColor: T.ink2, border: `1px solid ${T.slate200}`, borderRadius: "6px", maxWidth: "480px" }}
      >
        <div
          className="border-l-4 pl-4 py-2 space-y-1"
          style={{ borderColor: T.bronze, backgroundColor: T.bronzeBg, borderRadius: "0 4px 4px 0" }}
        >
          <p className="font-bold text-base" style={{ color: T.slate800 }}>
            Abbiamo trovato un triage precedente
          </p>
          <p className="text-sm leading-relaxed" style={{ color: T.slate400 }}>
            Hai completato un triage anonimo
            {anonSession.entity_name ? ` per «${anonSession.entity_name}»` : ""}.
            {anonSession.risk_score != null && (
              <> Score di rischio: <strong>{anonSession.risk_score}/100</strong>.</>
            )}
          </p>
        </div>

        {entities.length > 1 && (
          <div className="space-y-1.5">
            <label className="text-sm" style={{ color: T.slate400 }}>Importa nella struttura</label>
            <select
              value={targetEntityId}
              onChange={e => setTargetEntityId(e.target.value)}
              className="w-full px-3 py-2 text-base"
              style={{ backgroundColor: T.navy, border: `1px solid ${T.slate200}`, borderRadius: "4px", color: T.slate800 }}
            >
              {entities.map(e => <option key={e.id} value={e.id} style={{ backgroundColor: T.navy, color: T.slate800 }}>{e.name}</option>)}
            </select>
          </div>
        )}

        <div className="space-y-2">
          <button
            disabled={importing}
            onClick={handleImport}
            className="w-full py-3 font-black tracking-widest uppercase text-sm transition-colors"
            style={{
              backgroundColor: importing ? T.slate200 : T.navy,
              color: importing ? T.slate400 : "white",
              borderRadius: "4px",
              cursor: importing ? "not-allowed" : "pointer",
            }}
          >
            {importing ? "Importazione in corso..." : "Importa triage precedente →"}
          </button>
          <button
            disabled={importing}
            onClick={handleDismiss}
            className="w-full py-2 text-sm"
            style={{ color: T.slate400, cursor: importing ? "not-allowed" : "pointer" }}
          >
            Non ora
          </button>
        </div>
      </div>
    </div>
  );
}
