"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EntitySelector } from "@/components/EntitySelector";
import { useActiveEntity } from "@/contexts/EntityContext";

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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleSignout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

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
    <div className="min-h-screen flex flex-col clavis-bg" style={{ fontFamily: "Inter, system-ui" }}>

      {/* TOPBAR */}
      <header className="clavis-topbar flex-shrink-0 flex items-center justify-between px-4 border-b" style={{ height: "48px", minHeight: "48px" }}>
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/dashboard")}
            className="font-black tracking-[0.12em] text-white text-lg hover:opacity-80 transition-opacity"
          >
            CLAVIS
          </button>
          <div className="h-4 w-px" style={{ backgroundColor: "#334155" }} />
          <EntitySelector tier={profile?.tier} />
          <div className="h-4 w-px" style={{ backgroundColor: "#334155" }} />
          <p className="text-sm font-medium" style={{ color: "#94A3B8" }}>Profilo Utente</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-xs px-3 py-1.5 font-bold tracking-widest uppercase transition-colors"
            style={{ border: "1px solid #334155", color: "#CBD5E1", borderRadius: "4px" }}
          >
            ← Dashboard
          </button>
          <div className="h-4 w-px" style={{ backgroundColor: "#334155" }} />

          {/* Dropdown utente */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <p className="text-xs" style={{ color: "#94A3B8" }}>
                {profile?.full_name || profile?.email?.split("@")[0]}
              </p>
              <span className="text-xs px-1.5 py-0.5 font-mono font-bold uppercase rounded"
                style={{ backgroundColor: T.bronzeBg, color: T.bronze, fontSize: "10px" }}>
                {profile?.tier}
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="#64748B" strokeWidth="2">
                <path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
              </svg>
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 top-8 w-44 rounded-lg overflow-hidden z-50"
                style={{
                  background: "#1E293B",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.4)"
                }}>
                <button
                  onClick={() => setDropdownOpen(false)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-white/5"
                  style={{ color: "#B45309" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  Profilo
                </button>
                <div style={{ height: "1px", background: "rgba(255,255,255,0.06)" }}/>
                <button
                  onClick={() => { setDropdownOpen(false); handleSignout(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-white/5"
                  style={{ color: "#F87171" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
                  </svg>
                  Esci
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* BODY */}
      <main className="clavis-workspace flex-1 flex flex-col items-center py-10 px-4">
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
    </div>
  );
}
