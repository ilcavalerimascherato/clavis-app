export type Step = "intro" | "profilo" | "triage" | "anagrafica" | "result";

export interface Profilo {
  tipo_struttura: string;
  n_ospiti: string;
  n_dipendenti: string;
  regione: string;
  gestione_it: string;
  modello_231: string;
}

export interface Anagrafica {
  nome_struttura: string;
  nome_referente: string;
  email: string;
}

export interface Question {
  id: string;
  weight: number;
  threshold: number;
  text: string;
  sublabel: string;
  normativa: string;
  labels: string[];
}

export interface Section {
  id: string;
  label_it: string;
  label_en: string;
  weight_pct: number;
  framework: string;
  questions: Question[];
}

export interface Band {
  min: number;
  label: string;
  color: string;
  border: string;
  bg: string;
}
