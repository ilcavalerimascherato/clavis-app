"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EntitySelector } from "@/components/EntitySelector";
import {
  LayoutDashboard,
  Building2,
  ClipboardList,
  CalendarClock,
  History,
  FolderOpen,
  Truck,
  Cpu,
  Contact,
  ChevronLeft,
  ChevronRight,
  Shield,
  Lock,
  Zap,
} from "lucide-react";
import NavItem from "@/components/layout/NavItem";
import { type UserTier, TIER_RANK, useFeatureGate } from "@/lib/tier";

// ─── Tokens used by the shell only
const S = {
  slate200:  "rgba(238,241,248,.16)",
  slate400:  "#9AA3BD",
  bronze:    "#D9B25A",
  bronzeBg:  "rgba(217,178,90,.12)",
};

// ─── ProGate — wrappa qualsiasi contenuto Pro con blur+lock overlay
export function ProGate({
  feature,
  userTier,
  children,
}: {
  feature: string;
  userTier: UserTier;
  children: React.ReactNode;
}) {
  const allowed = useFeatureGate(feature, userTier);
  if (allowed) return <>{children}</>;

  return (
    <div className="relative rounded-lg overflow-hidden">
      <div className="pointer-events-none select-none blur-sm opacity-30">
        {children}
      </div>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-3"
        style={{ background: "rgba(8,12,20,0.72)", border: "1px solid rgba(37,99,235,0.25)", borderRadius: "8px" }}
      >
        <Lock size={20} color="#2563eb" />
        <p className="text-sm font-bold leading-relaxed" style={{ color: "var(--bone)" }}>
          Funzione Pro
        </p>
        <a
          href="/upgrade"
          className="px-4 py-2 text-sm font-bold rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
          style={{ backgroundColor: "#2563eb", color: "white" }}
        >
          Passa a Silver →
        </a>
      </div>
    </div>
  );
}

interface AppShellProps {
  profile: { id: string; full_name: string; email: string; tier: string } | null;
  activeRoute: string;
  score?: { value: number; label: string; color: string; bg: string } | null;
  children: React.ReactNode;
  alertsSlot?: React.ReactNode;
  openActionsCount?: number;
}

export default function AppShell({
  profile,
  activeRoute,
  score,
  children,
  alertsSlot,
  openActionsCount,
}: AppShellProps) {
  const router   = useRouter();
  const supabase = React.useMemo(() => createClient(), []);

  const [dropdownOpen,     setDropdownOpen]     = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Tier derivato da profile — typed
  const userTier = (profile?.tier ?? "free") as UserTier;
  const isPro    = TIER_RANK[userTier] >= TIER_RANK["silver"];

  const [verdeCount, setVerdeCount] = useState<number>(0);

  useEffect(() => {
    if (isPro || !profile) return;
    const supabase = createClient();
    supabase
      .from("companies")
      .select("verde_doc_count")
      .eq("created_by", profile.id)
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) setVerdeCount(data.verde_doc_count ?? 0);
      });
  }, [isPro, profile]);

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

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "var(--ink)", fontFamily: "DM Sans, system-ui" }}>

      {/* Skip link — accessibilità */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-black"
      >
        Vai al contenuto
      </a>

      {/* ── TOPBAR */}
      <header className="clavis-topbar flex-shrink-0 flex flex-row items-center justify-between px-4" style={{ height: "48px", minHeight: "48px" }}>

        {/* Sinistra — Brand */}
        <div className="flex items-center gap-4">
          <p className="font-black tracking-[0.12em] text-lg" style={{ color: "var(--bone)" }}>CLAVIS</p>
          <div className="h-4 w-px" style={{ backgroundColor: "var(--line2)" }} />
          <EntitySelector tier={profile?.tier} />
        </div>

        {/* Destra — azioni */}
        <div className="flex items-center gap-3">

          {/* Upgrade CTA — solo free */}
          {!isPro && (
            <a
              href="/upgrade"
              className="text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
              style={{ color: "#2563eb" }}
            >
              Passa a Pro →
            </a>
          )}

          {score && (
            <div className="flex items-center px-3 py-1" style={{ backgroundColor: score.bg, borderRadius: "4px" }}>
              <span style={{ fontSize: "14px", fontWeight: 600, color: score.color, letterSpacing: "0.02em" }}>
                Rischio {score.value} · {score.label}
              </span>
            </div>
          )}
          {!isPro && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded"
              style={{
                backgroundColor: verdeCount >= 3 ? "rgba(232,99,74,0.12)" : "rgba(37,99,235,0.12)",
                border: `1px solid ${verdeCount >= 3 ? "rgba(232,99,74,0.3)" : "rgba(37,99,235,0.25)"}`,
              }}
            >
              <span className="text-xs font-mono font-bold" style={{ color: verdeCount >= 3 ? "#E8634A" : "#2563eb" }}>
                {3 - verdeCount}/3
              </span>
              <span className="text-xs leading-relaxed" style={{ color: "var(--bone-dim)" }}>
                doc gratuiti
              </span>
            </div>
          )}
          <div className="h-4 w-px" style={{ backgroundColor: "var(--line2)" }} />

          {/* Dropdown utente */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              aria-label="Menu utente"
              aria-expanded={dropdownOpen}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
            >
              <p style={{ fontSize: "14px", fontWeight: 500, color: "var(--bone-dim)" }}>
                {profile?.full_name || profile?.email?.split("@")[0]}
              </p>
              <span
                className="font-mono uppercase rounded"
                style={{ backgroundColor: S.bronzeBg, color: S.bronze, fontSize: "12px", fontWeight: 600, padding: "3px 8px" }}
              >
                {profile?.tier}
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9AA3BD" strokeWidth="2" aria-hidden="true">
                <path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/>
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
              </svg>
            </button>

            {dropdownOpen && (
              <div
                className="absolute right-0 top-8 w-44 rounded-lg overflow-hidden z-50"
                style={{ background: "var(--ink2)", border: "1px solid var(--line2)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}
              >
                <button
                  onClick={() => { setDropdownOpen(false); router.push("/profilo"); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
                  style={{ color: "var(--bone)" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  Profilo
                </button>
                <div style={{ height: "1px", background: "var(--line2)" }} />
                <button
                  onClick={() => { setDropdownOpen(false); handleSignout(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
                  style={{ color: "#F87171" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
                  </svg>
                  Esci
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── BODY */}
      <div className="flex flex-1 overflow-hidden">

        {/* SIDEBAR */}
        <aside
          className="clavis-sidebar flex-shrink-0 flex flex-col border-r transition-all duration-200"
          role="navigation"
          aria-label="Navigazione principale"
          style={{ width: sidebarCollapsed ? "48px" : "188px", borderColor: S.slate200, position: "relative", overflow: "hidden" }}
        >
          {/* Stars layer */}
          <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
            <svg width="100%" height="55%" viewBox="0 0 200 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
              <circle cx="15"  cy="18"  r="1.2" fill="white" opacity="0.30"/>
              <circle cx="85"  cy="8"   r="0.8" fill="white" opacity="0.20"/>
              <circle cx="140" cy="25"  r="1.5" fill="white" opacity="0.35"/>
              <circle cx="58"  cy="42"  r="1.0" fill="white" opacity="0.25"/>
              <circle cx="172" cy="12"  r="0.9" fill="white" opacity="0.15"/>
              <circle cx="28"  cy="68"  r="1.8" fill="white" opacity="0.40"/>
              <circle cx="118" cy="55"  r="1.2" fill="white" opacity="0.20"/>
              <circle cx="75"  cy="80"  r="0.8" fill="white" opacity="0.30"/>
              <circle cx="155" cy="72"  r="1.4" fill="white" opacity="0.25"/>
              <circle cx="10"  cy="110" r="1.0" fill="white" opacity="0.20"/>
              <circle cx="100" cy="105" r="0.9" fill="white" opacity="0.15"/>
              <circle cx="44"  cy="130" r="1.3" fill="white" opacity="0.30"/>
              <circle cx="180" cy="118" r="1.6" fill="white" opacity="0.35"/>
              <circle cx="128" cy="140" r="0.8" fill="white" opacity="0.20"/>
              <circle cx="68"  cy="148" r="1.1" fill="white" opacity="0.25"/>
            </svg>
            <div className="shooting-star" style={{ top: "12%", animationDuration: "8s",  animationDelay: "2s" }} />
            <div className="shooting-star" style={{ top: "30%", animationDuration: "11s", animationDelay: "6s" }} />
          </div>

          <div className="flex-1 py-2 space-y-0.5" style={{ position: "relative", zIndex: 1 }}>
            <NavItem icon={<LayoutDashboard size={16} />} label="Panoramica"  active={activeRoute === "/dashboard"}   onClick={() => router.push("/dashboard")}   collapsed={sidebarCollapsed} />
            <NavItem icon={<Building2 size={16} />}       label="Portfolio"   active={activeRoute === "/strutture"}   onClick={() => router.push("/strutture")}   collapsed={sidebarCollapsed} />
            <NavItem icon={<ClipboardList size={16} />}   label="Remediation" active={activeRoute === "/remediation"} onClick={() => router.push("/remediation")} collapsed={sidebarCollapsed} badge={openActionsCount} />
            <NavItem icon={<CalendarClock size={16} />}   label="Scadenze"    active={activeRoute === "/scadenze"}    onClick={() => router.push("/scadenze")}    collapsed={sidebarCollapsed} />
            <NavItem icon={<History size={16} />}         label="Storia"      active={activeRoute === "/storia"}      onClick={() => router.push("/storia")}      collapsed={sidebarCollapsed} />
            <NavItem icon={<FolderOpen size={16} />}      label="Documenti"   active={activeRoute === "/documenti"}   onClick={() => router.push("/documenti")}   collapsed={sidebarCollapsed} />
            <NavItem icon={<Truck size={16} />}           label="Fornitori"   active={activeRoute === "/fornitori"}   onClick={() => router.push("/fornitori")}   collapsed={sidebarCollapsed} />
            <NavItem icon={<Cpu size={16} />}             label="Sistemi"     active={activeRoute === "/sistemi"}     onClick={() => router.push("/sistemi")}     collapsed={sidebarCollapsed} />
            <NavItem icon={<Contact size={16} />}         label="Anagrafica"  active={activeRoute === "/anagrafica"}  onClick={() => router.push("/anagrafica")}  collapsed={sidebarCollapsed} />

            {/* ── NIS2 */}
            <NavItem
              icon={<Shield size={16} />}
              label="NIS2"
              active={activeRoute === "/nis2"}
              onClick={() => router.push("/nis2")}
              collapsed={sidebarCollapsed}
              badge={undefined}
            />
            {/* ── Upgrade / Piani */}
            <NavItem
              icon={<Zap size={16} />}
              label="Piani"
              active={activeRoute === "/upgrade"}
              onClick={() => router.push("/upgrade")}
              collapsed={sidebarCollapsed}
              badge={undefined}
            />
          </div>

          {/* Tier badge + collapse button */}
          <div className="border-t py-2" style={{ borderColor: "var(--line)", position: "relative", zIndex: 1 }}>
            {!sidebarCollapsed && (
              <div className="px-3 pb-2">
                <span
                  className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                  style={{
                    backgroundColor: isPro ? "rgba(37,99,235,0.15)" : "rgba(156,163,175,0.12)",
                    color: isPro ? "#2563eb" : S.slate400,
                  }}
                >
                  {userTier}
                </span>
              </div>
            )}
            <button
              onClick={() => setSidebarCollapsed(v => !v)}
              aria-label={sidebarCollapsed ? "Espandi sidebar" : "Comprimi sidebar"}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
              style={{ color: S.slate400 }}
            >
              {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
              {!sidebarCollapsed && <span>Comprimi</span>}
            </button>
          </div>
        </aside>

        {/* CONTENUTO PRINCIPALE */}
        {children}

        {/* COLONNA DESTRA — alerts */}
        {alertsSlot && (
          <aside
            className="flex-shrink-0 border-l flex flex-col overflow-hidden"
            aria-label="Alert e notifiche"
            style={{ width: "200px", backgroundColor: "var(--ink2)", borderColor: S.slate200, position: "relative" }}
          >
            <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
              <svg width="100%" height="55%" viewBox="0 0 200 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                <circle cx="20"  cy="22"  r="1.0" fill="white" opacity="0.25"/>
                <circle cx="90"  cy="10"  r="1.4" fill="white" opacity="0.35"/>
                <circle cx="165" cy="30"  r="0.8" fill="white" opacity="0.20"/>
                <circle cx="48"  cy="50"  r="1.6" fill="white" opacity="0.40"/>
                <circle cx="130" cy="18"  r="0.9" fill="white" opacity="0.15"/>
                <circle cx="78"  cy="75"  r="1.2" fill="white" opacity="0.30"/>
                <circle cx="185" cy="58"  r="1.0" fill="white" opacity="0.20"/>
                <circle cx="35"  cy="95"  r="0.8" fill="white" opacity="0.25"/>
                <circle cx="110" cy="85"  r="1.5" fill="white" opacity="0.35"/>
                <circle cx="155" cy="100" r="1.1" fill="white" opacity="0.20"/>
                <circle cx="62"  cy="120" r="0.9" fill="white" opacity="0.15"/>
                <circle cx="142" cy="135" r="1.3" fill="white" opacity="0.30"/>
                <circle cx="18"  cy="145" r="1.8" fill="white" opacity="0.40"/>
                <circle cx="95"  cy="125" r="0.8" fill="white" opacity="0.25"/>
                <circle cx="175" cy="148" r="1.2" fill="white" opacity="0.20"/>
              </svg>
              <div className="shooting-star" style={{ top: "8%",  animationDuration: "9s",  animationDelay: "0s" }} />
              <div className="shooting-star" style={{ top: "22%", animationDuration: "13s", animationDelay: "4s" }} />
            </div>
            <div className="flex-1 overflow-y-auto" style={{ position: "relative", zIndex: 1 }}>
              {alertsSlot}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
