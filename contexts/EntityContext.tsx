"use client";
import { createContext, useContext } from "react";

interface EntityContextValue {
  activeEntityId: string | null;
  entityVersion: number;
  setActiveEntityId: (id: string) => void;
  refreshData: () => void;
}

// Puro/no-IO: espone solo lo stato e i setter. La lettura/scrittura di
// localStorage e la logica di fallback vivono in lib/context/EntityProvider.tsx —
// unico punto di IO per l'entity attiva.
export const EntityContext = createContext<EntityContextValue>({
  activeEntityId: null,
  entityVersion: 0,
  setActiveEntityId: () => {},
  refreshData: () => {},
});

export const useActiveEntity = () => useContext(EntityContext);
