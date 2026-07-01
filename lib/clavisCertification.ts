// lib/clavisCertification.ts
// Certificazione CLAVIS — registra su clavis_certifications l'hash del documento
// caricato e conforme, con gli elementi minimi verificati per audit trail pubblico.

import { createClient } from "@/lib/supabase/client";

export interface ClavisCertification {
  id: string;
  company_id: string;
  entity_id: string | null;
  document_type: string;
  document_hash: string;
  elementi_verificati: string[];
  certified_at: string;
  certified_by: string;
  norma: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

async function sha256Hex(content: ArrayBuffer | string): Promise<string> {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createCertification(params: {
  company_id: string;
  entity_id?: string;
  document_type: string;
  document_content: ArrayBuffer | string;
  elementi_verificati: string[];
  norma?: string;
  expires_at?: string;
}): Promise<ClavisCertification | null> {
  const supabase = createClient();

  const document_hash = await sha256Hex(params.document_content);

  const { data, error } = await supabase
    .from("clavis_certifications")
    .insert({
      company_id: params.company_id,
      entity_id: params.entity_id ?? null,
      document_type: params.document_type,
      document_hash,
      elementi_verificati: params.elementi_verificati,
      norma: params.norma ?? null,
      expires_at: params.expires_at ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error("[CLAVIS CERT] Errore creazione certificazione:", error);
    return null;
  }

  return data;
}

export function getCertificationUrl(id: string): string {
  return `https://clavisapp.it/verifica/${id}`;
}
