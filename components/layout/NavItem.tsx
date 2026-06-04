"use client";

import React from "react";

const BADGE_BG = "#E8634A";

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  badge?: number;
  collapsed?: boolean;
}

export default function NavItem({ icon, label, active, onClick, badge, collapsed }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all text-sm focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
      style={{
        backgroundColor: active ? "rgba(58,109,240,.12)" : undefined,
        color: active ? "var(--bone)" : "var(--bone-dim)",
        borderLeft: active ? "3px solid var(--shield-soft)" : "3px solid transparent",
        fontWeight: active ? 600 : 400,
      }}
    >
      <span className="w-4 flex-shrink-0 flex items-center justify-center">{icon}</span>
      {!collapsed && <span className="flex-1 truncate">{label}</span>}
      {!collapsed && badge !== undefined && badge > 0 && (
        <span
          className="text-xs font-mono px-1.5 py-0.5 rounded text-white"
          style={{ backgroundColor: BADGE_BG, fontSize: "12px" }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
