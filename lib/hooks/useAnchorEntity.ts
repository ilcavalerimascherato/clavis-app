"use client";
import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useActiveEntity } from "@/contexts/EntityContext";

export interface AnchorEntity {
  id: string;
  nome: string;
}

interface UseAnchorEntityResult {
  anchorEntity: AnchorEntity | null;
  isAnchor: boolean;
  loading: boolean;
}

// Cache per company_id — evita di ricalcolare l'àncora ad ogni mount degli hook consumer.
const anchorCache = new Map<string, AnchorEntity>();

export function invalidateAnchorCache(companyId: string) {
  anchorCache.delete(companyId);
}

export function useAnchorEntity(): UseAnchorEntityResult {
  const supabase = useMemo(() => createClient(), []);
  const { activeEntityId, entityVersion } = useActiveEntity();
  const [anchorEntity, setAnchorEntity] = useState<AnchorEntity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!activeEntityId) { setAnchorEntity(null); setLoading(false); return; }

    setLoading(true);
    (async () => {
      const { data: active } = await supabase
        .from("entities")
        .select("id, name, company_id")
        .eq("id", activeEntityId)
        .maybeSingle();
      if (cancelled) return;

      const companyId = active?.company_id ?? null;
      if (!companyId) {
        setAnchorEntity(active ? { id: active.id, nome: active.name } : null);
        setLoading(false);
        return;
      }

      const cached = anchorCache.get(companyId);
      if (cached) { setAnchorEntity(cached); setLoading(false); return; }

      const { data: company } = await supabase
        .from("companies")
        .select("anchor_entity_id")
        .eq("id", companyId)
        .maybeSingle();
      if (cancelled) return;

      let anchor: AnchorEntity | null = null;

      if (company?.anchor_entity_id) {
        const { data: explicit } = await supabase
          .from("entities")
          .select("id, name")
          .eq("id", company.anchor_entity_id)
          .maybeSingle();
        if (explicit) anchor = { id: explicit.id, nome: explicit.name };
      }

      if (!anchor) {
        const { data: oldest } = await supabase
          .from("entities")
          .select("id, name")
          .eq("company_id", companyId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (oldest) anchor = { id: oldest.id, nome: oldest.name };
      }

      if (cancelled) return;
      if (anchor) anchorCache.set(companyId, anchor);
      setAnchorEntity(anchor);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [supabase, activeEntityId, entityVersion]);

  return {
    anchorEntity,
    isAnchor: !!anchorEntity && anchorEntity.id === activeEntityId,
    loading,
  };
}
