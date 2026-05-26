"use client";

/**
 * components/EntitySelector.tsx
 * Selettore struttura attiva nell'header CLAVIS.
 * — 1 entity → mostra solo il nome (non cliccabile)
 * — ≥2 entity → dropdown con switch + "Aggiungi struttura" (solo tier premium+)
 * Persistenza: localStorage key "clavis_active_entity_id" via EntityContext
 */

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useActiveEntity } from "@/contexts/EntityContext";

interface EntityOption {
  id: string;
  name: string;
  entity_type: string | null;
  company_id: string | null;
  // Supabase foreign-key join — può essere oggetto o array a seconda della relazione
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  companies: any;
}

function getCompanyName(entity: EntityOption): string {
  if (!entity.companies) return "";
  if (Array.isArray(entity.companies)) return (entity.companies[0] as { name?: string })?.name ?? "";
  return (entity.companies as { name?: string }).name ?? "";
}

const PREMIUM_TIERS = ["gold", "premium", "platinum"];

interface EntitySelectorProps {
  tier?: string;
}

export function EntitySelector({ tier }: EntitySelectorProps) {
  const router = useRouter();
  const { activeEntityId, setActiveEntityId } = useActiveEntity();
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Carica tutte le entity dell'utente
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("entities")
        .select("id, name, entity_type, company_id, companies(name)")
        .eq("created_by", user.id)
        .order("name");
      if (data) setEntities(data as EntityOption[]);
    }
    load();
  }, []);

  // Chiude il dropdown al click esterno
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Entity attiva: prima dal context, poi il primo della lista
  const activeEntity = entities.find(e => e.id === activeEntityId) ?? entities[0] ?? null;

  if (!activeEntity) return null;

  // Singola entity — solo testo, nessun dropdown
  if (entities.length <= 1) {
    return (
      <span className="text-sm font-medium" style={{ color: "var(--bone-dim)" }}>
        {activeEntity.name}
      </span>
    );
  }

  // Multi-entity — dropdown
  const isPremium = tier ? PREMIUM_TIERS.includes(tier.toLowerCase()) : false;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-sm font-medium hover:opacity-80 transition-opacity"
        style={{
          color: "var(--bone-dim)",
          border: "1px solid var(--shield)",
          borderRadius: "4px",
          padding: "2px 8px",
        }}
      >
        <span>{activeEntity.name}</span>
        <svg
          width="10" height="10" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute left-0 top-8 min-w-[240px] z-50 py-1"
          style={{
            background: "var(--ink2)",
            border: "1px solid var(--line2)",
            borderRadius: "6px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}
        >
          {entities.map(ent => {
            const isActive = ent.id === (activeEntityId ?? entities[0]?.id);
            const cName = getCompanyName(ent);
            return (
              <button
                key={ent.id}
                onClick={() => {
                  setActiveEntityId(ent.id);
                  setOpen(false);
                  router.refresh();
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 transition-colors"
              >
                {/* Bullet attivo */}
                <span
                  className="flex-shrink-0 w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: isActive ? "var(--shield)" : "transparent", border: isActive ? "none" : "1px solid var(--line2)" }}
                />
                <span className="flex flex-col min-w-0">
                  <span
                    className="text-sm font-medium truncate"
                    style={{ color: isActive ? "var(--bone)" : "var(--bone-dim)" }}
                  >
                    {ent.name}
                  </span>
                  {cName && (
                    <span className="text-xs truncate" style={{ color: "var(--bone-dim)", opacity: 0.55 }}>
                      {cName}
                    </span>
                  )}
                </span>
              </button>
            );
          })}

          {isPremium && (
            <>
              <div style={{ height: "1px", background: "var(--line2)", margin: "4px 0" }} />
              <button
                onClick={() => { setOpen(false); router.push("/onboarding"); }}
                className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-white/5 transition-colors"
                style={{ color: "var(--shield)", fontSize: "12px" }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Aggiungi struttura
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
