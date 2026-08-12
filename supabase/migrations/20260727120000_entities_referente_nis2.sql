-- Referente NIS2 dedicato a livello di singola struttura (entity), distinto dal
-- Responsabile IT. Usato dal builder "Scheda Registrazione ACN" (Flag_NIS2_Registration,
-- lib/documentTemplates.ts) come Punto di Contatto NIS2 quando compilato; se assente,
-- il builder ripiega sul Responsabile IT della stessa entity (comportamento preesistente).
-- Colonne nullable, additive — nessun impatto su righe esistenti.

ALTER TABLE public.entities
  ADD COLUMN referente_nis2_nome text NULL;
ALTER TABLE public.entities
  ADD COLUMN referente_nis2_cognome text NULL;
ALTER TABLE public.entities
  ADD COLUMN referente_nis2_email text NULL;
ALTER TABLE public.entities
  ADD COLUMN referente_nis2_telefono text NULL;
