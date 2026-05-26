"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface EntityContextValue {
  activeEntityId: string | null;
  entityVersion: number;
  setActiveEntityId: (id: string) => void;
}

const EntityContext = createContext<EntityContextValue>({
  activeEntityId: null,
  entityVersion: 0,
  setActiveEntityId: () => {},
});

export function EntityProvider({ children }: { children: ReactNode }) {
  const [activeEntityId, setActiveEntityIdState] = useState<string | null>(null);
  const [entityVersion, setEntityVersion] = useState(0);

  useEffect(() => {
    const stored = localStorage.getItem("clavis_active_entity_id");
    if (stored) setActiveEntityIdState(stored);
  }, []);

  const setActiveEntityId = (id: string) => {
    localStorage.setItem("clavis_active_entity_id", id);
    setActiveEntityIdState(id);
    setEntityVersion(v => v + 1); // forza re-render subscriber
  };

  return (
    <EntityContext.Provider value={{ activeEntityId, entityVersion, setActiveEntityId }}>
      {children}
    </EntityContext.Provider>
  );
}

export const useActiveEntity = () => useContext(EntityContext);
