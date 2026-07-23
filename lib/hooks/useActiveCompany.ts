"use client";
import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useActiveEntity } from "@/contexts/EntityContext";
import { type UserTier } from "@/lib/tier";

export interface ActiveCompany {
  id: string;
  name: string;
  verde_doc_count: number;
}

interface UseActiveCompanyResult {
  company: ActiveCompany | null;
  tier: UserTier;
  loading: boolean;
}

// Cache SOLO sul record company grezzo, keyed per company_id — i valori
// derivati (tier/gating) non vanno mai cachati, sempre ricalcolati.
const companyCache = new Map<string, ActiveCompany>();

export function invalidateActiveCompanyCache(companyId: string) {
  companyCache.delete(companyId);
}

export function useActiveCompany(): UseActiveCompanyResult {
  const supabase = useMemo(() => createClient(), []);
  const { activeEntityId, entityVersion } = useActiveEntity();
  const [company, setCompany] = useState<ActiveCompany | null>(null);
  const [tier, setTier] = useState<UserTier>("free");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!activeEntityId) { setCompany(null); setLoading(false); return; }

    setLoading(true);
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;

      if (user) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("tier")
          .eq("id", user.id)
          .maybeSingle();
        if (!cancelled) setTier((prof?.tier as UserTier) ?? "free");
      }

      const { data: entity } = await supabase
        .from("entities")
        .select("company_id")
        .eq("id", activeEntityId)
        .maybeSingle();
      if (cancelled) return;

      const companyId = entity?.company_id ?? null;
      if (!companyId) { setCompany(null); setLoading(false); return; }

      const cached = companyCache.get(companyId);
      if (cached) { setCompany(cached); setLoading(false); return; }

      const { data: comp } = await supabase
        .from("companies")
        .select("id, name, verde_doc_count")
        .eq("id", companyId)
        .maybeSingle();
      if (cancelled) return;

      const result = comp
        ? { id: comp.id, name: comp.name, verde_doc_count: comp.verde_doc_count ?? 0 }
        : null;
      if (result) companyCache.set(companyId, result);
      setCompany(result);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [supabase, activeEntityId, entityVersion]);

  return { company, tier, loading };
}
