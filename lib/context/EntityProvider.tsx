"use client";

/**
 * lib/context/EntityProvider.tsx
 * Unico punto di IO per l'entity attiva (localStorage + fallback).
 * Wrappa EntityContext (contexts/EntityContext.tsx), che resta puro/no-IO.
 */

import { useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { EntityContext } from "@/contexts/EntityContext";

const STORAGE_KEY = "clavis_active_entity_id";

export function EntityProvider({ children }: { children: ReactNode }) {
  const [activeEntityId, setActiveEntityIdState] = useState<string | null>(null);
  const [entityVersion, setEntityVersion] = useState(0);
  const bootstrapped = useRef(false);

  const setActiveEntityId = useCallback((id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    setActiveEntityIdState(id);
    setEntityVersion(v => v + 1); // forza re-render subscriber
  }, []);

  const refreshData = useCallback(() => setEntityVersion(v => v + 1), []);

  // Bootstrap: risolve l'entity attiva UNA volta al mount — valida lo storage
  // contro le entity accessibili all'utente, fallback a entities[0] (ordine
  // alfabetico) se assente o non più valida, e persiste il fallback qui.
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    let cancelled = false;

    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;

      const { data: entities } = await supabase
        .from("entities")
        .select("id")
        .eq("created_by", user.id)
        .order("name");
      if (cancelled) return;

      const validIds = new Set((entities ?? []).map(e => e.id));
      const stored = localStorage.getItem(STORAGE_KEY);

      if (stored && validIds.has(stored)) {
        setActiveEntityIdState(stored);
        return;
      }

      const fallback = entities?.[0]?.id ?? null;
      if (fallback) {
        localStorage.setItem(STORAGE_KEY, fallback);
        setActiveEntityIdState(fallback);
      } else if (stored) {
        localStorage.removeItem(STORAGE_KEY);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return (
    <EntityContext.Provider value={{ activeEntityId, entityVersion, setActiveEntityId, refreshData }}>
      {children}
    </EntityContext.Provider>
  );
}
