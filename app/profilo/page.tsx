"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useActiveEntity } from "@/contexts/EntityContext";
import AppShell from "@/components/layout/AppShell";

interface Profile { id: string; full_name: string; email: string; tier: string; }
interface Entity { id: string; name: string; entity_type: string; region: string; }

const T = {
  navy:      "#0F172A",
  navyLight: "#1E293B",
  slate50:   "#F8FAFC",
  slate100:  "#E2E8F0",
  slate200:  "#CBD5E1",
  slate400:  "#94A3B8",
  slate600:  "#475569",
  slate800:  "#1E293B",
  bronze:    "#B45309",
  bronzeBg:  "#FEF3C7",
};

export default function ProfiloPage() {
  const router = useRouter();
  const supabase = createClient();
  const { entityVersion } = useActiveEntity();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [entity, setEntity] = useState<Entity | null>(null);
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const storedEntityId = localStorage.getItem("clavis_active_entity_id");
    const entityQuery = storedEntityId
      ? supabase.from("entities").select("id, name, entity_type, region").eq("id", storedEntityId).limit(1)
      : supabase.from("entities").select("id, name, entity_type, region").eq("created_by", user.id).limit(1);

    const [profRes, entityRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      entityQuery,
    ]);

    if (profRes.data) {
      setProfile(profRes.data);
      setFullName(profRes.data.full_name ?? "");
    }
    if (entityRes.data?.[0]) {
      setEntity(entityRes.data[0]);
      if (!storedEntityId) localStorage.setItem("clavis_active_entity_id", entityRes.data[0].id);
    }
    setLoading(false);
  }, [supabase, router]);

  useEffect(() => { loadData(); }, [loadData, entityVersion]);

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    await supabase.from("profiles").update({ full_name: fullName }).eq("id", profile.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: T.slate50 }}>
      <p className="font-mono text-sm uppercase tracking-widest" style={{ color: T.slate400 }}>Caricamento...</p>
    </div>
  );

  return (
    <AppShell
      profile={profile}
      activeRoute="/profilo"
    >
      <main id="main-content" className="clavis-workspace flex-1 flex flex-col items-center py-10 px-4">
        <div className="w-full max-w-lg space-y-8">

          {/* Titolo */}
          <div>
            <p className="font-bold text-xl uppercase tracking-wider" style={{ color: T.slate800 }}>
              Profilo Utente
            </p>
            <p className="text-xs mt-0.5" style={{ color: T.slate400 }}>(User Profile)</p>
          </div>

          {/* Form */}
          <div className="border p-6 space-y-5"
            style={{ borderColor: T.slate200, backgroundColor: "white", borderRadius: "4px" }}>

            {/* Nome completo — editabile */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: T.slate600 }}>
                Nome completo
              </label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border outline-none transition-colors"
                style={{
                  borderColor: T.slate200,
                  borderRadius: "4px",
                  color: T.slate800,
                }}
                onFocus={e => (e.target.style.borderColor = T.bronze)}
                onBlur={e => (e.target.style.borderColor = T.slate200)}
              />
            </div>

            {/* Email — readonly */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: T.slate600 }}>
                Email
              </label>
              <input
                type="email"
                value={profile?.email ?? ""}
                readOnly
                className="w-full px-3 py-2.5 text-sm border"
                style={{
                  borderColor: T.slate100,
                  borderRadius: "4px",
                  color: T.slate400,
                  backgroundColor: T.slate50,
                  cursor: "default",
                }}
              />
            </div>

            {/* Tier — readonly */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: T.slate600 }}>
                Piano abbonamento
              </label>
              <div className="flex items-center gap-2 px-3 py-2.5 border"
                style={{
                  borderColor: T.slate100,
                  borderRadius: "4px",
                  backgroundColor: T.slate50,
                }}>
                <span className="text-xs font-mono font-black px-2 py-0.5 rounded"
                  style={{ backgroundColor: T.bronzeBg, color: T.bronze }}>
                  {profile?.tier?.toUpperCase()}
                </span>
                <span className="text-xs" style={{ color: T.slate400 }}>
                  {profile?.tier === "free" ? "Piano gratuito" :
                   profile?.tier === "silver" ? "Piano Silver" : "Piano Gold"}
                </span>
              </div>
            </div>

            {/* Struttura — readonly */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: T.slate600 }}>
                Struttura di riferimento
              </label>
              <input
                type="text"
                value={entity ? `${entity.name} — ${entity.entity_type}, ${entity.region}` : "Nessuna struttura configurata"}
                readOnly
                className="w-full px-3 py-2.5 text-sm border"
                style={{
                  borderColor: T.slate100,
                  borderRadius: "4px",
                  color: T.slate400,
                  backgroundColor: T.slate50,
                  cursor: "default",
                }}
              />
            </div>

            {/* Azioni */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => router.push("/dashboard")}
                className="text-sm font-semibold transition-colors"
                style={{ color: T.slate400 }}
              >
                ← Torna alla dashboard
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2.5 text-sm font-bold tracking-widest uppercase transition-colors"
                style={{
                  backgroundColor: saved ? "#166534" : T.navy,
                  color: "white",
                  borderRadius: "4px",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? "Salvataggio..." : saved ? "✓ Salvato" : "Salva modifiche"}
              </button>
            </div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
