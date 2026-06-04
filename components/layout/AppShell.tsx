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
  FolderOpen,
  Truck,
  Contact,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import NavItem from "@/components/layout/NavItem";

// ─── Tokens used by the shell only
const S = {
  slate200:  "rgba(238,241,248,.16)",
  slate400:  "#9AA3BD",
  bronze:    "#D9B25A",
  bronzeBg:  "rgba(217,178,90,.12)",
};

interface AppShellProps {
  profile: { full_name: string; email: string; tier: string } | null;
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
  const router  = useRouter();
  const supabase = React.useMemo(() => createClient(), []);

  const [dropdownOpen,    setDropdownOpen]    = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
          {score && (
            <div className="flex items-center gap-2 px-3 py-1 rounded" style={{ backgroundColor: score.bg, borderRadius: "4px" }}>
              <span className="text-xs font-mono font-black" style={{ color: score.color }}>{score.value}/100</span>
              <span className="text-xs font-bold uppercase"  style={{ color: score.color }}>{score.label}</span>
            </div>
          )}
          <button
            onClick={() => router.push("/triage/autenticato")}
            className="text-xs px-3 py-1.5 font-bold tracking-widest uppercase transition-colors focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
            style={{ border: "1px solid var(--line2)", color: "var(--bone-dim)", borderRadius: "4px" }}
          >
            + Nuovo Triage
          </button>
          <div className="h-4 w-px" style={{ backgroundColor: "var(--line2)" }} />

          {/* Dropdown utente */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              aria-label="Menu utente"
              aria-expanded={dropdownOpen}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
            >
              <p className="text-xs" style={{ color: "var(--bone-dim)" }}>
                {profile?.full_name || profile?.email?.split("@")[0]}
              </p>
              <span
                className="text-xs px-1.5 py-0.5 font-mono font-bold uppercase rounded"
                style={{ backgroundColor: S.bronzeBg, color: S.bronze, fontSize: "12px" }}
              >
                {profile?.tier}
              </span>
              {/* Settings gear icon */}
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
            <NavItem icon={<LayoutDashboard size={16} />} label="Panoramica"  active={activeRoute === "/dashboard"}  onClick={() => router.push("/dashboard")}  collapsed={sidebarCollapsed} />
            <NavItem icon={<Building2 size={16} />}       label="Portfolio"   active={activeRoute === "/strutture"}  onClick={() => router.push("/strutture")}  collapsed={sidebarCollapsed} />
            <NavItem icon={<ClipboardList size={16} />}   label="Remediation" active={activeRoute === "/remediation"} onClick={() => router.push("/remediation")} collapsed={sidebarCollapsed} badge={openActionsCount} />
            <NavItem icon={<CalendarClock size={16} />}   label="Scadenze"    active={activeRoute === "/scadenze"}   onClick={() => router.push("/scadenze")}    collapsed={sidebarCollapsed} />
            <NavItem icon={<FolderOpen size={16} />}      label="Documenti"   active={activeRoute === "/documenti"}  onClick={() => router.push("/documenti")}   collapsed={sidebarCollapsed} />
            <NavItem icon={<Truck size={16} />}           label="Fornitori"   active={activeRoute === "/fornitori"}  onClick={() => router.push("/fornitori")}   collapsed={sidebarCollapsed} />
            <NavItem icon={<Contact size={16} />}         label="Anagrafica"  active={activeRoute === "/anagrafica"} onClick={() => router.push("/anagrafica")}  collapsed={sidebarCollapsed} />
          </div>

          <div className="border-t py-2" style={{ borderColor: "var(--line)", position: "relative", zIndex: 1 }}>
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
            {/* Stars layer */}
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

            <div
              className="px-3 py-2.5 border-b flex-shrink-0"
              style={{ borderColor: S.slate200, backgroundColor: "#141B30", position: "relative", zIndex: 1 }}
            >
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: S.slate400 }}>Alert</p>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ position: "relative", zIndex: 1 }}>
              {alertsSlot}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
