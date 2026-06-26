/**
 * CLAVIS — Document Templates & Email Builder
 * SSOT per tutti i documenti generabili e le email ai fornitori.
 * Nessuna AI, nessuna chiamata esterna. Template fill con variabili entity/company.
 */

// ─── TIPI

export interface EntityData {
  entity_name: string;
  entity_type: string;
  region: string;
  total_beds: number | null;
  n_ospiti?: string | null;
  n_dipendenti?: string | null;
  convenzione_ssn?: boolean;
  tipo_convenzione?: string | null;
  gestione_it?: string | null;
  // Campi nominativi — arrivano da entities/companies o dal form del modal
  legale_rappresentante?: string | null;
  nome_dpo?:               string | null;
  email_dpo?:              string | null;
  dpo_qualifica?:          string | null;
  dpo_telefono?:           string | null;
  responsabile_it?:        string | null;
  email_responsabile_it?:  string | null;
  ai_officer?:             string | null;
  email_ai_officer?:       string | null;
  referente_breach?:       string | null;
  email_referente_breach?: string | null;
  website_url?:            string | null;
  address?:                string | null;
}

export interface CompanyData {
  id?: string;
  name: string;
  vat_number?: string | null;
  legal_address?: string | null;
  codice_fiscale?: string | null;
  pec?: string | null;
  legale_rappresentante?: string | null;
  fatturato_fascia?: string | null;
  n_dipendenti_fascia?: string | null;
  modello_231?: string | null;
  nome_dpo?: string | null;
  email_dpo?: string | null;
  dpo_qualifica?: string | null;
  dpo_telefono?: string | null;
}

export interface DocumentOutput {
  title: string;
  subtitle: string;
  flagKey: string;
  outputType: "pdf" | "docx";
  sections: DocumentSection[];
  footer: string;
  metadata: {
    norma: string;
    articoli: string;
    dataGenerazione: string;
    disclaimerLegale: string;
  };
}

export interface DocumentValidationError {
  type: "missing_fields";
  missingFields: { label: string; field: string; source: "company" | "entity" }[];
}

export type DocumentResult = DocumentOutput | DocumentValidationError;

export function isValidationError(r: DocumentResult): r is DocumentValidationError {
  return (r as DocumentValidationError).type === "missing_fields";
}

export interface DocumentSection {
  heading: string;
  content: string;
  isList?: boolean;
  items?: string[];
}

export interface FornitoreConFlag {
  id: string;
  ragione_sociale: string;
  email_fornitore: string | null;
  referente_fornitore: string | null;
  dpa_firmato: boolean;
  categorie: string[];
  flagsAperti: FlagEmail[];
}

export interface FlagEmail {
  flagKey: string;
  oggetto: string;
  corpo: string;
}

// ─── MAPPING FLAG → CATEGORIE FORNITORE
// Determina quali fornitori ricevono comunicazioni per ogni flag aperto.

export const FLAG_CATEGORIA_MAP: Record<string, {
  categorie: string[] | "ALL" | "NO_DPA";
  tipoEmail: "conformita" | "data_residency" | "dpa" | "mdr" | "fse" | "censimento";
}> = {
  Flag_NIS2_SC_01:         { categorie: "ALL",                                              tipoEmail: "censimento" },
  Flag_GDPR_Art28:         { categorie: "NO_DPA",                                           tipoEmail: "dpa" },
  Flag_GDPR_DataResidency: { categorie: ["INFRASTRUTTURA_IT"],                              tipoEmail: "data_residency" },
  Flag_AIACT_Deployer:     { categorie: ["SOFTWARE_GESTIONALE"],                            tipoEmail: "conformita" },
  Flag_MDR_Software:       { categorie: ["DISPOSITIVI_CONNESSI"],                           tipoEmail: "mdr" },
  Flag_NIS2_Logging:       { categorie: ["INFRASTRUTTURA_IT"],                              tipoEmail: "conformita" },
  Flag_FSE_Interop:        { categorie: ["SOFTWARE_GESTIONALE"],                            tipoEmail: "fse" },
  Flag_AIACT_HR_01:        { categorie: ["SOFTWARE_GESTIONALE", "DISPOSITIVI_CONNESSI"],    tipoEmail: "conformita" },
};

// ─── HELPER

function today(): string {
  return new Date().toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

/** Restituisce il valore se presente e non vuoto, altrimenti una riga bianca da compilare */
function fill(val: string | null | undefined): string {
  return (val && val.trim()) ? val.trim() : "______________________________";
}

const DISCLAIMER = "Il presente documento è generato automaticamente da CLAVIS a fini organizzativi interni. Non sostituisce la consulenza legale specializzata. Si raccomanda validazione da parte di un professionista abilitato prima dell'adozione formale.";

// ═══════════════════════════════════════════════════════════════
// SEZIONE 1 — TEMPLATE DOCUMENTI PDF/DOCX
// ═══════════════════════════════════════════════════════════════

export function buildDocument(flagKey: string, entity: EntityData, company: CompanyData): DocumentResult | null {
  switch (flagKey) {
    case "nomina_dpo":
    case "Flag_GDPR_DPO":        return buildNominaDPO(entity, company);

    case "bcp":
    case "Flag_NIS2_BCP":        return buildBCP(entity, company);

    case "irp":
    case "Flag_NIS2_IRP":        return buildIRP(entity, company);

    case "procedura_breach":
    case "Flag_GDPR_Breach":     return buildProceduraBreachPDF(entity, company);

    case "pacchetto_cda":
    case "Flag_NIS2_CdA":        return buildDeliberaCdA(entity, company);

    case "policy_byod":
    case "Flag_D231_BYOD":       return buildPolicyBYOD(entity, company);

    case "circolare_shadow_ai":
    case "Flag_D231_ShadowAI":   return buildCircolareAI(entity, company);

    case "policy_messaggistica":
    case "Flag_GDPR_Messaging":  return buildPolicyMessaggistica(entity, company);

    case "registro_presenze_ai":
    case "Flag_AIACT_Literacy":  return buildRegistroPresenze(entity, company);

    case "piano_formativo_231":
    case "Flag_D231_Formazione": return buildPianoFormativo(entity, company);

    case "dpia_guidata":
    case "dpia_bozza":
    case "Flag_GDPR_DPIA":       return buildAvvioProceduraDPIA(entity, company);

    // Nuovi PDF v3
    case "lettera_garante_dpo":           return buildLetteraGaranteDpo(entity, company);
    case "dpa_fornitore":                 return buildDpaFornitore(entity, company);
    case "autocert_nis2":                 return buildAutocertNis2(entity, company);
    case "scheda_registrazione_acn":      return buildSchedaRegistrazioneAcn(entity, company);
    case "report_supply_chain":           return buildReportSupplyChain(entity, company);
    case "registro_mdr_software":         return buildRegistroMdrSoftware(entity, company);
    case "dichiarazione_fse":             return buildDichiarazioneFse(entity, company);
    case "attestato_formazione_annuale":  return buildAttestatoFormazioneAnnuale(entity, company);
    case "dichiarazione_accessibilita":   return buildDichiarazioneAccessibilita(entity, company);
    case "autocert_tso_cartaceo":         return buildAutocertTsoCartaceo(entity, company);
    // Nuovi DOCX v3
    case "registro_attivita_dpo":          return buildRegistroAttivitaDpo(entity, company);
    case "registro_trasferimenti_extraue": return buildRegistroTrasferimentiExtraUe(entity, company);
    case "poster_breach":                  return buildPosterBreach(entity, company);
    case "circolare_messaggistica":        return buildCircolareMessaggistica(entity, company);
    case "dichiarazione_uso_ai":           return buildDichiarazioneUsoAi(entity, company);
    case "piano_formativo_ai":             return buildPianoFormativoAi(entity, company);
    case "lettera_incarico_formatore":     return buildLettaraIncaricoFormatore(entity, company);
    case "scheda_emergenza_bcp":           return buildSchedaEmergenzaBcp(entity, company);
    case "scheda_operativa_irp":           return buildSchedaOperativaIrp(entity, company);
    case "agenda_simulazione_irp_bcp":     return buildAgendaSimulazioneBcpIrp(entity, company);
    case "formazione_cda":                 return buildFormazioneCda(entity, company);
    case "report_semestrale_cda":          return buildReportSemestraleCda(entity, company);
    case "procedura_logging":              return buildProceduraLogging(entity, company);
    case "scheda_byod":                    return buildSchedaByod(entity, company);
    case "scheda_shadow_ai":               return buildSchedaShadowAi(entity, company);
    case "piano_adeguamento_wcag":         return buildPianoAdeguamentoWcag(entity, company);
    case "procedura_consenso_psich":       return buildProceduraConsensoPsich(entity, company);
    case "scheda_consenso_psich":          return buildSchedaConsensoPsich(entity, company);
    case "checklist_rc_sanitaria":         return buildChecklistRcSanitaria(entity, company);
    case "procedura_tso_digitale":         return buildProceduraTsoDigitale(entity, company);
    case "protocollo_consensi_minori":     return buildProtocolloConsensiMinori(entity, company);
    case "procedura_autorita_minori":      return buildProceduraAutoritaMinori(entity, company);
    case "procedura_anonimato_serd":       return buildProceduraAnonimatoSerd(entity, company);
    case "registro_utenti_anonimi":        return buildRegistroUtentiAnonimiserd(entity, company);
    case "briefing_rems_penale":           return buildBriefingRemsPenale(entity, company);
    case "matrice_accessi_rems":           return buildMatriceAccessiRems(entity, company);
    case "fria_guidata":                   return buildFriaGuidata(entity, company);
    case "richiesta_dossier_tecnico_ai":  return buildRichiestaDossierTecnicoAi(entity, company);
    case "allegato_clausola_aiact":       return buildAllegatoClausolaAiact(entity, company);
    case "contratto_fornitura_aiact":     return buildContrattoFornituraAiact(entity, company);
    case "nomina_ai_supervisor":          return buildNominaAiSupervisor(entity, company);
    case "protocollo_supervisione_ai":    return buildProtocolloSupervisioneAi(entity, company);
    case "richiesta_log_retention_ai":    return buildRichiestaLogRetentionAi(entity, company);
    case "procedura_incidenti_ai":        return buildProceduraIncidentiAi(entity, company);
    case "informativa_trasparenza_ai":    return buildInformativaTrasparenzaAi(entity, company);
    case "autocert_no_ai_highrisks":      return buildAutocertNoAiHighrisks(entity, company);
    case "nomina_ai_officer":             return buildNominaAiOfficer(entity, company);

    case "autocert_no_mdr":  return buildAutocertNoMdr(entity, company);
    case "email_regione_fse": return buildEmailRegioneFse(entity, company);
    case "pianifica_test_bcp": return buildPianificaTestBcp(entity, company);

    default: return null;
  }
}

// Mappa flag → tipo output
export const FLAG_OUTPUT_TYPE: Record<string, "pdf" | "docx"> = {
  Flag_GDPR_DPO:        "pdf",   // atto formale
  Flag_NIS2_IRP:        "pdf",   // piano formale
  Flag_GDPR_Breach:     "pdf",   // procedura formale
  Flag_NIS2_CdA:        "pdf",   // delibera formale
  Flag_GDPR_DPIA:       "pdf",   // avvio procedura formale
  Flag_NIS2_BCP:        "docx",  // da personalizzare
  Flag_D231_BYOD:       "docx",  // policy interna editabile
  Flag_D231_ShadowAI:   "docx",  // circolare interna
  Flag_GDPR_Messaging:  "docx",  // policy interna
  Flag_AIACT_Literacy:  "docx",  // registro da compilare
  Flag_D231_Formazione: "docx",  // piano da completare
  // Nuovi v3 — PDF non editabili
  lettera_garante_dpo:           "pdf",
  dpa_fornitore:                 "pdf",
  autocert_nis2:                 "pdf",
  scheda_registrazione_acn:      "pdf",
  report_supply_chain:           "pdf",
  pacchetto_cda:                 "pdf",
  registro_mdr_software:         "pdf",
  dichiarazione_fse:             "pdf",
  attestato_formazione_annuale:  "pdf",
  dichiarazione_accessibilita:   "pdf",
  autocert_tso_cartaceo:         "pdf",
  // Nuovi v3 — DOCX editabili
  registro_attivita_dpo:          "docx",
  registro_trasferimenti_extraue: "docx",
  dpia_bozza:                     "docx",
  dpia_guidata:                   "docx",
  poster_breach:                  "docx",
  circolare_messaggistica:        "docx",
  dichiarazione_uso_ai:           "docx",
  piano_formativo_ai:             "docx",
  lettera_incarico_formatore:     "docx",
  scheda_emergenza_bcp:           "docx",
  scheda_operativa_irp:           "docx",
  agenda_simulazione_irp_bcp:     "docx",
  formazione_cda:                 "docx",
  report_semestrale_cda:          "docx",
  procedura_logging:              "docx",
  scheda_byod:                    "docx",
  scheda_shadow_ai:               "docx",
  piano_adeguamento_wcag:         "docx",
  procedura_consenso_psich:       "docx",
  scheda_consenso_psich:          "docx",
  checklist_rc_sanitaria:         "docx",
  procedura_tso_digitale:         "docx",
  protocollo_consensi_minori:     "docx",
  procedura_autorita_minori:      "docx",
  procedura_anonimato_serd:       "docx",
  registro_utenti_anonimi:        "docx",
  briefing_rems_penale:           "docx",
  matrice_accessi_rems:           "docx",
  fria_guidata:                   "docx",
  richiesta_dossier_tecnico_ai:  "docx",
  allegato_clausola_aiact:       "docx",
  contratto_fornitura_aiact:     "docx",
  nomina_ai_supervisor:          "docx",
  protocollo_supervisione_ai:    "docx",
  richiesta_log_retention_ai:    "docx",
  procedura_incidenti_ai:        "docx",
  informativa_trasparenza_ai:    "docx",
  autocert_no_ai_highrisks:      "pdf",
  nomina_ai_officer:             "docx",
  autocert_no_mdr:               "pdf",
  email_regione_fse:             "docx",
  pianifica_test_bcp:            "docx",
};

// ─── 1. NOMINA DPO (PDF)

function buildNominaDPO(e: EntityData, c: CompanyData): DocumentResult {
  const missing: DocumentValidationError["missingFields"] = [];
  if (!c.name)                  missing.push({ label: "Ragione sociale",        field: "name",                 source: "company" });
  if (!c.vat_number)            missing.push({ label: "P.IVA / Codice Fiscale", field: "vat_number",           source: "company" });
  if (!c.legal_address)         missing.push({ label: "Sede legale",             field: "legal_address",        source: "company" });
  if (!c.legale_rappresentante) missing.push({ label: "Legale Rappresentante",  field: "legale_rappresentante",source: "company" });
  if (!e.nome_dpo)              missing.push({ label: "Nome DPO",               field: "nome_dpo",             source: "entity"  });
  if (!e.email_dpo)             missing.push({ label: "Email DPO",              field: "email_dpo",            source: "entity"  });
  if (!e.dpo_qualifica)         missing.push({ label: "Qualifica DPO",          field: "dpo_qualifica",        source: "entity"  });
  if (!e.dpo_telefono)          missing.push({ label: "Telefono DPO",           field: "dpo_telefono",         source: "entity"  });

  if (missing.length > 0) return { type: "missing_fields", missingFields: missing };

  const lr  = c.legale_rappresentante!;
  const dpo = e.nome_dpo!;

  return {
    title: "Atto di Nomina del Responsabile della Protezione dei Dati",
    subtitle: "Data Protection Officer — Art. 37 Regolamento (UE) 2016/679",
    flagKey: "Flag_GDPR_DPO",
    outputType: "pdf",
    sections: [
      {
        heading: "Premesse",
        content: `Il Regolamento (UE) 2016/679 (GDPR), all'Art. 37, par. 1, lett. c), stabilisce l'obbligo di designare un Responsabile della Protezione dei Dati (Data Protection Officer — DPO) per i soggetti che effettuano trattamenti di categorie particolari di dati ai sensi dell'Art. 9 GDPR, tra cui i dati relativi alla salute.

Le strutture sociosanitarie che trattano sistematicamente dati sanitari degli ospiti sono considerate soggetti che effettuano trattamenti su larga scala ai sensi delle Linee Guida WP243/2017 del Gruppo di Lavoro Art. 29, indipendentemente dal numero di ospiti in carico.

${c.name}, in qualità di Titolare del Trattamento per la struttura "${e.entity_name}" (${e.entity_type}, ${e.region}), è pertanto soggetto all'obbligo di nomina del DPO.`,
      },
      {
        heading: "Designazione",
        content: `Con il presente atto, ${c.name} — C.F./P.IVA: ${c.vat_number}, con sede legale in ${c.legal_address} — designa quale Responsabile della Protezione dei Dati:

Nome e Cognome: ${dpo}
Qualifica / Rapporto con il Titolare: ${e.dpo_qualifica}
Recapito email dedicato DPO: ${e.email_dpo}
Recapito telefonico: ${e.dpo_telefono}`,
      },
      {
        heading: "Assenza di Conflitto di Interessi",
        content: `Ai sensi dell'Art. 38, par. 6, GDPR, il DPO designato non ricopre ruoli o funzioni che determinino un conflitto di interessi con l'esercizio dei compiti di protezione dei dati. Il Titolare ha verificato l'assenza di incompatibilità tra la posizione del DPO e le funzioni da questi eventualmente svolte all'interno o all'esterno dell'organizzazione. In particolare, il ruolo di DPO è incompatibile con le seguenti funzioni: Amministratore Delegato, Direttore Generale, Responsabile IT, Responsabile del Personale, Responsabile Amministrativo e qualsiasi altro ruolo che determini le finalità e i mezzi del trattamento dei dati personali (Linee Guida EDPB 07/2016).`,
      },
      {
        heading: "Compiti del DPO",
        content: "Ai sensi dell'Art. 39 GDPR, il DPO designato è incaricato di:",
        isList: true,
        items: [
          "Informare e consigliare il Titolare, i responsabili del trattamento e i dipendenti in merito agli obblighi derivanti dal GDPR e dalla normativa nazionale applicabile (D.Lgs. 196/2003 s.m.i.)",
          "Sorvegliare l'osservanza del Regolamento e delle politiche del Titolare in materia di protezione dei dati personali, compresi l'attribuzione delle responsabilità, la sensibilizzazione e la formazione del personale",
          "Fornire, se richiesto, un parere in merito alla valutazione d'impatto sulla protezione dei dati (DPIA) ex Art. 35 GDPR e sorvegliarne lo svolgimento",
          "Cooperare con il Garante per la Protezione dei Dati Personali e fungere da punto di contatto per il Garante su tutte le questioni connesse al trattamento",
          "Tenere aggiornato il Registro dei Trattamenti ex Art. 30 GDPR",
          "Gestire le richieste degli interessati ex Artt. 15–22 GDPR (accesso, rettifica, cancellazione, portabilità, opposizione)",
          "Coordinare la gestione dei data breach ex Artt. 33–34 GDPR",
        ],
      },
      {
        heading: "Indipendenza e Risorse",
        content: `Il DPO opera in piena indipendenza, non riceve istruzioni riguardo all'esecuzione dei propri compiti e riferisce direttamente al vertice gerarchico del Titolare, nella persona del Legale Rappresentante ${lr}. ${c.name} si impegna a fornire al DPO le risorse necessarie allo svolgimento dei compiti, l'accesso ai dati personali e ai trattamenti, nonché il mantenimento delle competenze specialistiche.

Il DPO è raggiungibile dagli interessati (ospiti, familiari, dipendenti) tramite il recapito dedicato ${e.email_dpo}, pubblicato ai sensi dell'Art. 37, par. 7 GDPR.`,
      },
      {
        heading: "Comunicazione al Garante",
        content: `Il Titolare provvederà a comunicare i dati di contatto del DPO al Garante per la Protezione dei Dati Personali tramite il portale istituzionale (https://www.gpdp.it), ai sensi dell'Art. 37, par. 7 GDPR, entro 30 giorni dalla presente designazione.`,
      },
      {
        heading: "Durata e Revoca",
        content: `La presente nomina ha efficacia dalla data di sottoscrizione e rimane valida a tempo indeterminato, salvo revoca motivata comunicata per iscritto. In caso di cessazione dall'incarico, il Titolare si impegna a procedere a nuova designazione senza soluzione di continuità, garantendo la copertura dell'obbligo ex Art. 37 GDPR.`,
      },
      {
        heading: "Firme",
        content: `Data: ${today()}
Luogo: ${e.region}

Per ${c.name} — Il Legale Rappresentante:
Nome: ${lr}
Firma: ______________________________

Il DPO designato, per accettazione:
Nome: ${dpo}
Firma: ______________________________`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Generato da CLAVIS il ${today()}`,
    metadata: {
      norma: "Regolamento (UE) 2016/679 — GDPR",
      articoli: "Art. 37, 38, 39 GDPR — D.Lgs. 196/2003 s.m.i. — Linee Guida WP243/2017",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

// ─── 2. BUSINESS CONTINUITY PLAN (DOCX)

function buildBCP(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Business Continuity Plan — Piano di Continuità Operativa",
    subtitle: "Art. 21 par. 2 lett. c D.Lgs. 138/2024 (NIS2)",
    flagKey: "Flag_NIS2_BCP",
    outputType: "docx",
    sections: [
      {
        heading: "Dati della Struttura",
        content: `Struttura: ${e.entity_name}
Tipologia: ${e.entity_type}
Società: ${c.name} | P.IVA: ${c.vat_number ?? "______"}
Regione: ${e.region}
Ospiti in carico: ${e.total_beds ?? e.n_ospiti ?? "______"}
Responsabile del piano: ${fill(e.responsabile_it)}
Data adozione: ${today()}
Revisione prevista: ______________________________`,
      },
      {
        heading: "1. Scopo e Ambito",
        content: `Il presente Piano di Continuità Operativa (BCP) definisce le procedure da adottare in caso di interruzione dei sistemi informatici della struttura "${e.entity_name}", al fine di garantire la continuità delle cure e la sicurezza degli ospiti.

Il piano si applica a tutti i sistemi informatici utilizzati dalla struttura, con particolare riferimento al gestionale clinico, alla cartella elettronica, ai dispositivi medici connessi e all'infrastruttura di rete.`,
      },
      {
        heading: "2. Scenari di Rischio",
        content: "Il piano si attiva in presenza dei seguenti scenari:",
        isList: true,
        items: [
          "Guasto hardware del server principale o dei dispositivi client",
          "Attacco ransomware o malware con cifratura dei dati",
          "Interruzione della connettività Internet (linea primaria e backup)",
          "Indisponibilità del fornitore del gestionale clinico (manutenzione, fallimento, attacco)",
          "Blackout elettrico prolungato oltre la capacità UPS",
          "Perdita di accesso al cloud per manutenzione straordinaria o incidente",
        ],
      },
      {
        heading: "3. Procedure Offline — Continuità Clinica",
        content: "In caso di blocco dei sistemi, il personale adotta le seguenti procedure:",
        isList: true,
        items: [
          "Attivare il registro cartaceo di emergenza (ubicazione: ____________________________)",
          "Stampare l'elenco ospiti e terapie correnti (ultima stampa disponibile in: ____________________________)",
          "Garantire la somministrazione farmaci secondo l'ultima scheda stampata — ogni variazione terapeutica va annotata su modulo cartaceo firmato",
          "Notificare il Direttore Sanitario entro 30 minuti dall'interruzione",
          "Contattare il fornitore IT per apertura ticket urgente (contatti: ____________________________)",
          "Se interruzione > 4 ore: attivare procedura di escalation alla Direzione",
        ],
      },
      {
        heading: "4. Backup e Ripristino Dati",
        content: `Frequenza backup: ______________________________
Tipo backup: ______________________________
Ubicazione backup: ______________________________
Fornitore backup: ______________________________
RTO (Recovery Time Objective — tempo massimo ripristino): ______________________________
RPO (Recovery Point Objective — perdita dati massima accettabile): ______________________________
Responsabile ripristino: ______________________________`,
      },
      {
        heading: "5. Contatti di Emergenza",
        content: `Fornitore gestionale clinico: ______________________________ — Tel: ______________________________
Fornitore infrastruttura IT: ______________________________ — Tel: ______________________________
Responsabile IT interno: ${fill(e.responsabile_it)} — Tel: ______________________________
Direttore Sanitario: ______________________________ — Tel: ______________________________
Direzione: ______________________________ — Tel: ______________________________`,
      },
      {
        heading: "6. Test e Revisione",
        content: `Il presente piano deve essere testato almeno una volta l'anno con simulazione tabletop. La prossima simulazione è prevista entro: ______________________________

Esito ultimo test (data / risultato): ______________________________
Revisione annuale a cura di: ______________________________`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Generato da CLAVIS il ${today()} — Documento da personalizzare e validare`,
    metadata: {
      norma: "D.Lgs. 138/2024 (NIS2)",
      articoli: "Art. 21 par. 2 lett. c — continuità operativa e gestione crisi",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

// ─── 3. INCIDENT RESPONSE PLAN (PDF)

function buildIRP(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Piano di Risposta agli Incidenti Informatici",
    subtitle: "Incident Response Plan — Art. 23 D.Lgs. 138/2024 (NIS2) — Art. 33 GDPR",
    flagKey: "Flag_NIS2_IRP",
    outputType: "pdf",
    sections: [
      {
        heading: "Premesse Normative",
        content: `L'Art. 23 D.Lgs. 138/2024 (recepimento NIS2) impone agli enti soggetti di notificare gli incidenti significativi all'ACN entro 24 ore (preallarme) e 72 ore (notifica completa). L'Art. 33 GDPR impone la notifica al Garante entro 72 ore in caso di data breach. Il presente piano definisce la procedura operativa per ${c.name} — struttura "${e.entity_name}" (${e.entity_type}, ${e.region}).`,
      },
      {
        heading: "Classificazione Incidenti",
        content: "Gli incidenti sono classificati per gravità:",
        isList: true,
        items: [
          "CRITICO — Interruzione totale sistemi clinici / ransomware / data breach con dati sanitari → attivazione immediata, notifica entro 24h",
          "ALTO — Accesso non autorizzato rilevato / malware contenuto / perdita dispositivo con dati → attivazione entro 2h, notifica entro 24h se confermato",
          "MEDIO — Anomalia di sistema senza impatto clinico confermato → registrazione, valutazione entro 4h",
          "BASSO — Tentativi di phishing bloccati / alert antivirus gestiti → registrazione nel registro incidenti",
        ],
      },
      {
        heading: "Team di Risposta (IRT)",
        content: `Coordinatore IRT: ${fill(e.legale_rappresentante)}
Responsabile IT: ${fill(e.responsabile_it)}
DPO: ${fill(e.nome_dpo)}
Direttore Sanitario: ______________________________
Legale esterno: ______________________________
Fornitore IT esterno: ______________________________`,
      },
      {
        heading: "Procedura Operativa — Fasi",
        content: "La risposta all'incidente segue le fasi:",
        isList: true,
        items: [
          "RILEVAZIONE — chiunque rilevi un'anomalia la segnala immediatamente al Responsabile IT tramite: ______________________________",
          "CONTENIMENTO — isolare il sistema compromesso dalla rete entro 30 minuti dalla conferma incidente",
          "VALUTAZIONE — il Coordinatore IRT classifica l'incidente e attiva i livelli di risposta appropriati entro 1 ora",
          "NOTIFICA — se CRITICO o ALTO: notifica ad ACN (portale ACN) entro 24h e al Garante entro 72h se coinvolti dati personali",
          "ERADICAZIONE — rimozione della causa, ripristino da backup verificato, test funzionali",
          "RIPRISTINO — rientro graduale dei sistemi in produzione con monitoraggio rafforzato 72h",
          "POST-MORTEM — entro 30 giorni: relazione scritta con causa, impatto, misure adottate, prevenzione futura",
        ],
      },
      {
        heading: "Contatti Istituzionali",
        content: `ACN — Agenzia per la Cybersicurezza Nazionale: https://www.acn.gov.it — portale notifiche NIS2
Garante Privacy: https://www.gpdp.it — portale notifica data breach
CSIRT Italia (supporto tecnico): https://csirt.gov.it`,
      },
      {
        heading: "Registro Incidenti",
        content: `Ogni incidente, indipendentemente dalla gravità, deve essere registrato nel Registro Incidenti con: data/ora rilevazione, descrizione, classificazione, misure adottate, esito. Il registro è conservato da: ______________________________

Ultimo aggiornamento del piano: ${today()}
Prossima revisione: ______________________________`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Generato da CLAVIS il ${today()}`,
    metadata: {
      norma: "D.Lgs. 138/2024 (NIS2) — Regolamento (UE) 2016/679 GDPR",
      articoli: "Art. 23 NIS2 — Art. 33-34 GDPR",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

// ─── 4. PROCEDURA DATA BREACH (PDF)

function buildProceduraBreachPDF(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Procedura di Gestione Data Breach",
    subtitle: "Art. 33-34 Regolamento (UE) 2016/679 — GDPR",
    flagKey: "Flag_GDPR_Breach",
    outputType: "pdf",
    sections: [
      {
        heading: "Definizione e Ambito",
        content: `Per data breach si intende qualsiasi violazione della sicurezza che comporti, accidentalmente o in modo illecito, la distruzione, la perdita, la modifica, la divulgazione non autorizzata o l'accesso ai dati personali trasmessi, conservati o altrimenti trattati (Art. 4 n. 12 GDPR).

La presente procedura si applica a ${c.name} per tutte le attività di trattamento dati della struttura "${e.entity_name}" (${e.entity_type}, ${e.region}), con particolare attenzione ai dati sanitari degli ospiti (categorie particolari ex Art. 9 GDPR).`,
      },
      {
        heading: "Procedura di Notifica al Garante — Art. 33 GDPR",
        content: "In caso di data breach che presenti rischio per i diritti e le libertà degli interessati:",
        isList: true,
        items: [
          "ENTRO 72 ORE dalla scoperta: notifica al Garante tramite portale https://www.gpdp.it",
          "La notifica deve contenere: natura della violazione, categorie di dati coinvolti, numero approssimativo di interessati, misure adottate o proposte",
          "Se la notifica non è possibile entro 72 ore: notifica con indicazione dei motivi del ritardo",
          "Conservare documentazione di ogni violazione anche quando non si procede a notifica (principio di accountability Art. 5 par. 2 GDPR)",
        ],
      },
      {
        heading: "Comunicazione agli Interessati — Art. 34 GDPR",
        content: "Se il breach presenta rischio ELEVATO per i diritti degli interessati:",
        isList: true,
        items: [
          "Comunicare senza ingiustificato ritardo agli ospiti (o ai loro rappresentanti legali) e/o ai dipendenti coinvolti",
          "La comunicazione deve descrivere in linguaggio chiaro la natura della violazione e le misure raccomandate",
          "Non è necessaria la comunicazione se i dati erano cifrati, se sono state adottate misure successive che eliminano il rischio, o se la comunicazione richiederebbe sforzi sproporzionati (in tal caso: comunicazione pubblica)",
        ],
      },
      {
        heading: "Responsabilità e Contatti",
        content: `DPO (punto di contatto principale): ${fill(e.nome_dpo)}${e.email_dpo ? ` — Email: ${e.email_dpo}` : ""}
Direttore Sanitario (per breach dati clinici): ______________________________
Legale esterno: ______________________________

Il DPO deve essere immediatamente informato di qualsiasi sospetta violazione da parte di chiunque la rilevi.`,
      },
      {
        heading: "Registro delle Violazioni",
        content: `Ai sensi dell'Art. 33 par. 5 GDPR, ${c.name} mantiene un Registro delle Violazioni contenente: data/ora, descrizione, categorie dati, numero interessati, impatto, misure, esito notifica Garante.

Il registro è tenuto da: ______________________________
Ubicazione: ______________________________`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Generato da CLAVIS il ${today()}`,
    metadata: {
      norma: "Regolamento (UE) 2016/679 — GDPR",
      articoli: "Art. 33, 34 GDPR — Linee guida EDPB 01/2021 data breach",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

// ─── 5. BOZZA DELIBERA CDA (PDF)

function buildDeliberaCdA(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Bozza Delibera del Consiglio di Amministrazione",
    subtitle: "Approvazione Piano Cybersicurezza e Protezione Dati — Art. 24 D.Lgs. 138/2024 (NIS2)",
    flagKey: "Flag_NIS2_CdA",
    outputType: "pdf",
    sections: [
      {
        heading: "Intestazione",
        content: `${c.name.toUpperCase()}
${c.legal_address ?? ""}
C.F./P.IVA: ${c.vat_number ?? "______________________"}

VERBALE DI DELIBERA DEL CONSIGLIO DI AMMINISTRAZIONE
Seduta del: ______________________________
Luogo: ______________________________
Ora: ______________________________

Presenti: ______________________________
Assenti: ______________________________
Presiede: ${fill(e.legale_rappresentante)}
Segretario verbalizzante: ______________________________`,
      },
      {
        heading: "Oggetto della Delibera",
        content: `Approvazione del Piano di Cybersicurezza e Protezione dei Dati Personali per la struttura "${e.entity_name}" (${e.entity_type}, ${e.region}) ai sensi dell'Art. 24 D.Lgs. 138/2024 (recepimento Direttiva NIS2) e del Regolamento (UE) 2016/679 (GDPR).`,
      },
      {
        heading: "Premesse",
        content: `Il Consiglio di Amministrazione prende atto che:

1. Il D.Lgs. 138/2024, che recepisce la Direttiva NIS2, impone agli organi di amministrazione dei soggetti essenziali e importanti di approvare le misure di gestione dei rischi di cybersicurezza e di sorvegliarne l'attuazione (Art. 24).

2. La struttura "${e.entity_name}" tratta sistematicamente dati sanitari degli ospiti e rientra nel perimetro di applicazione della normativa NIS2 e GDPR.

3. La mancata approvazione formale da parte del CdA costituisce fattore aggravante in caso di ispezione o sanzione da parte dell'ACN o del Garante Privacy.`,
      },
      {
        heading: "Delibera",
        content: `Il Consiglio di Amministrazione di ${c.name}, all'unanimità / a maggioranza (______________________________),

DELIBERA

1. Di approvare il Piano di Cybersicurezza e Protezione dei Dati Personali allegato alla presente delibera (Allegato A).

2. Di nominare responsabile dell'attuazione del Piano: ______________________________

3. Di stanziare le risorse necessarie all'attuazione del Piano per un importo stimato di: €______________________________

4. Di incaricare la Direzione di riferire al CdA sullo stato di attuazione con cadenza: ______________________________

5. Di procedere alla registrazione NIS2 presso ACN entro i termini previsti dalla normativa.

6. Di autorizzare la nomina / conferma del DPO ai sensi dell'Art. 37 GDPR nella persona di: ______________________________`,
      },
      {
        heading: "Chiusura",
        content: `Non essendovi altro da deliberare, il Presidente dichiara chiusa la seduta alle ore ______.

Il Segretario verbalizzante: ______________________________
Il Presidente: ${fill(e.legale_rappresentante)}

[Seguono firme dei presenti]`,
      },
    ],
    footer: `${c.name} | Bozza generata da CLAVIS il ${today()} — Da sottoporre a revisione legale prima dell'adozione`,
    metadata: {
      norma: "D.Lgs. 138/2024 (NIS2) — Regolamento (UE) 2016/679",
      articoli: "Art. 24 D.Lgs. 138/2024 — Art. 6 D.Lgs. 231/2001",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

// ─── 6. POLICY BYOD (DOCX)

function buildPolicyBYOD(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Policy Utilizzo Dispositivi Personali — BYOD",
    subtitle: "Bring Your Own Device — Art. 24-bis D.Lgs. 231/2001 — Art. 32 GDPR",
    flagKey: "Flag_D231_BYOD",
    outputType: "docx",
    sections: [
      {
        heading: "1. Ambito e Destinatari",
        content: `La presente policy si applica a tutto il personale dipendente, collaboratore e tirocinante di ${c.name} operante presso la struttura "${e.entity_name}" (${e.entity_type}, ${e.region}) che utilizzi o intenda utilizzare dispositivi personali (smartphone, tablet, laptop) per attività lavorative.`,
      },
      {
        heading: "2. Definizioni",
        content: `"Dispositivo personale" (BYOD — Bring Your Own Device): qualsiasi dispositivo elettronico di proprietà del dipendente utilizzato per accedere a sistemi, dati o comunicazioni aziendali.
"Dati aziendali": qualsiasi informazione relativa agli ospiti, ai processi clinici, alle comunicazioni interne, alle credenziali di accesso ai sistemi della struttura.`,
      },
      {
        heading: "3. Regole di Utilizzo",
        content: "L'utilizzo di dispositivi personali per attività lavorative è soggetto alle seguenti regole:",
        isList: true,
        items: [
          "È VIETATO accedere a cartelle cliniche, dati sanitari degli ospiti o sistemi gestionali con dispositivi personali non autorizzati",
          "È VIETATO fotografare, registrare o trasmettere dati degli ospiti tramite dispositivi personali",
          "È VIETATO utilizzare app di messaggistica consumer (WhatsApp, Telegram, SMS) per comunicare dati degli ospiti",
          "L'accesso ai sistemi aziendali tramite dispositivo personale è ammesso SOLO previa autorizzazione scritta e con autenticazione a due fattori",
          "I dispositivi personali autorizzati devono avere PIN/password attivi e sistema operativo aggiornato",
          "In caso di smarrimento o furto del dispositivo, il dipendente deve darne comunicazione immediata al Responsabile IT",
        ],
      },
      {
        heading: "4. Conseguenze della Violazione",
        content: `La violazione della presente policy costituisce illecito disciplinare ai sensi del CCNL applicabile e può configurare responsabilità penale ai sensi degli Art. 615-ter e 615-quater c.p. (accesso abusivo a sistemi informatici), con possibile responsabilità dell'ente ai sensi del D.Lgs. 231/2001, aggravata dalla L. 132/2025.

Le sanzioni disciplinari applicabili vanno da: ______________________________`,
      },
      {
        heading: "5. Presa Visione e Accettazione",
        content: `Il/La sottoscritto/a ______________________________, dipendente / collaboratore di ${c.name} con mansione ______________________________, dichiara di aver letto, compreso e accettato la presente policy.

Luogo: ______________________________  Data: ______________________________
Firma: ______________________________`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Generato da CLAVIS il ${today()} — Da distribuire a tutto il personale e raccogliere firma`,
    metadata: {
      norma: "D.Lgs. 231/2001 — L. 132/2025 — GDPR",
      articoli: "Art. 24-bis D.Lgs. 231/2001 — Art. 32 GDPR — Art. 615-ter c.p.",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

// ─── 7. CIRCOLARE AI (DOCX)

function buildCircolareAI(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Circolare Interna — Uso di Strumenti di Intelligenza Artificiale",
    subtitle: "Regolamentazione Shadow AI — Art. 24-bis D.Lgs. 231/2001 — Art. 9 e 32 GDPR",
    flagKey: "Flag_D231_ShadowAI",
    outputType: "docx",
    sections: [
      {
        heading: "A tutto il Personale",
        content: `${c.name} — Struttura "${e.entity_name}"
Data: ${today()}
Oggetto: Regolamentazione dell'uso di strumenti di intelligenza artificiale generativa`,
      },
      {
        heading: "Premessa",
        content: `L'uso di strumenti di intelligenza artificiale generativa (ChatGPT, Gemini, Copilot consumer, Claude consumer e simili) si è diffuso rapidamente anche in ambito lavorativo. La Direzione ritiene necessario fornire indicazioni chiare per tutelare la struttura, gli ospiti e il personale stesso da rischi legali e disciplinari.`,
      },
      {
        heading: "Cosa è VIETATO",
        content: "Con effetto immediato, è espressamente VIETATO:",
        isList: true,
        items: [
          "Inserire in qualsiasi strumento AI consumer dati identificativi degli ospiti (nome, cognome, data di nascita, diagnosi, terapia, qualsiasi informazione sanitaria)",
          "Utilizzare strumenti AI consumer per redigere, integrare o riformulare documentazione clinica",
          "Usare account personali di servizi AI per attività lavorative",
          "Condividere credenziali di accesso ai sistemi aziendali con sistemi AI di terzi",
        ],
      },
      {
        heading: "Cosa è CONSENTITO",
        content: "È consentito l'uso di strumenti AI per:",
        isList: true,
        items: [
          "Attività di studio e aggiornamento professionale senza dati reali degli ospiti",
          "Redazione di testi generici non collegati a ospiti specifici",
          "Utilizzo degli strumenti AI approvati dalla Direzione IT: ______________________________",
        ],
      },
      {
        heading: "Perché è importante",
        content: `Inserire dati sanitari in ChatGPT o strumenti analoghi equivale a trasmetterli a un soggetto terzo senza contratto privacy (DPA), senza valutazione d'impatto (DPIA), potenzialmente fuori dall'Unione Europea. Questo configura violazione del GDPR (sanzione fino a €20M o 4% del fatturato globale) e potenzialmente reato informatico con responsabilità penale dell'ente ex D.Lgs. 231/2001 (L. 132/2025).`,
      },
      {
        heading: "Presa Visione",
        content: `Il/La sottoscritto/a ______________________________ dichiara di aver ricevuto, letto e compreso la presente circolare.

Data: ______________________________  Firma: ______________________________`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Generato da CLAVIS il ${today()}`,
    metadata: {
      norma: "D.Lgs. 231/2001 — L. 132/2025 — GDPR",
      articoli: "Art. 24-bis D.Lgs. 231/2001 — Art. 9, 32 GDPR — Art. 615-quater c.p.",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

// ─── 8. POLICY MESSAGGISTICA (DOCX)

function buildPolicyMessaggistica(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Policy Messaggistica Aziendale — Divieto App Consumer",
    subtitle: "Art. 32 GDPR — Provvedimento Garante 11/01/2024 — WhatsApp in ambito sanitario",
    flagKey: "Flag_GDPR_Messaging",
    outputType: "docx",
    sections: [
      {
        heading: "1. Divieto",
        content: `È espressamente VIETATO a tutto il personale di ${c.name} — struttura "${e.entity_name}" — l'utilizzo di WhatsApp, Telegram, SMS o qualsiasi altra applicazione di messaggistica consumer per comunicare, condividere o discutere informazioni relative agli ospiti, alle loro condizioni di salute, alle terapie o a qualsiasi dato personale.

Il Provvedimento del Garante del 11/01/2024 ha confermato l'incompatibilità di WhatsApp con il GDPR per comunicazioni in ambito sanitario.`,
      },
      {
        heading: "2. Strumenti Autorizzati",
        content: `Per le comunicazioni cliniche e operative il personale deve utilizzare esclusivamente:
- Strumento approvato: ______________________________
- Accesso: ______________________________
- Supporto tecnico: ______________________________`,
      },
      {
        heading: "3. Gestione Gruppi Esistenti",
        content: "Entro 15 giorni dalla presente policy:",
        isList: true,
        items: [
          "Tutti i gruppi WhatsApp aziendali devono essere chiusi",
          "Le comunicazioni devono migrare sullo strumento autorizzato",
          "Il Responsabile IT verifica la migrazione e comunica l'esito alla Direzione",
        ],
      },
      {
        heading: "4. Firma di Accettazione",
        content: `Il/La sottoscritto/a ______________________________ dichiara di aver preso visione e di accettare la presente policy.

Data: ______________________________  Firma: ______________________________`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Generato da CLAVIS il ${today()}`,
    metadata: {
      norma: "Regolamento (UE) 2016/679 — GDPR",
      articoli: "Art. 32 GDPR — Provvedimento Garante 11/01/2024",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

// ─── 9. REGISTRO PRESENZE FORMAZIONE AI (DOCX)

function buildRegistroPresenze(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Registro Presenze — Formazione AI Literacy",
    subtitle: "Art. 4 Regolamento (UE) 2024/1689 — AI Act",
    flagKey: "Flag_AIACT_Literacy",
    outputType: "docx",
    sections: [
      {
        heading: "Dati Sessione Formativa",
        content: `Struttura: ${e.entity_name} (${e.entity_type}, ${e.region})
Società: ${c.name}
Data formazione: ______________________________
Orario: ______________________________
Docente / Formatore: ______________________________
Argomento: Uso sicuro e consapevole dell'intelligenza artificiale in ambito sanitario (AI Literacy — Art. 4 AI Act)
Durata: ______ ore`,
      },
      {
        heading: "Contenuti Trattati",
        content: "La sessione ha trattato i seguenti argomenti:",
        isList: true,
        items: [
          "Definizione di sistema AI e categorie di rischio (AI Act)",
          "Sistemi AI ad alto rischio in ambito sanitario — obblighi del deployer",
          "Divieto di utilizzo di AI consumer con dati clinici degli ospiti",
          "Strumenti AI approvati dalla struttura e modalità di utilizzo sicuro",
          "Come segnalare anomalie o dubbi nell'uso dei sistemi AI",
        ],
      },
      {
        heading: "Registro Partecipanti",
        content: `N. | Cognome e Nome | Mansione | Firma
---|----------------|----------|------
1  |                |          |
2  |                |          |
3  |                |          |
4  |                |          |
5  |                |          |
6  |                |          |
7  |                |          |
8  |                |          |
9  |                |          |
10 |                |          |

[Aggiungere righe secondo necessità]`,
      },
      {
        heading: "Validazione",
        content: `Il/La sottoscritto/a ______________________________, in qualità di Responsabile Formazione / DPO, certifica che la sessione formativa si è svolta come indicato.

Data: ______________________________  Firma: ______________________________`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Generato da CLAVIS il ${today()}`,
    metadata: {
      norma: "Regolamento (UE) 2024/1689 — AI Act",
      articoli: "Art. 4 AI Act — obbligo AI literacy personale",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

// ─── 10. PIANO FORMATIVO 231 (DOCX)

function buildPianoFormativo(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Piano Formativo Annuale — Compliance Digitale e 231",
    subtitle: "Art. 6 D.Lgs. 231/2001 — Art. 24 D.Lgs. 138/2024 (NIS2) — Art. 4 AI Act",
    flagKey: "Flag_D231_Formazione",
    outputType: "docx",
    sections: [
      {
        heading: "Dati del Piano",
        content: `Struttura: ${e.entity_name} (${e.entity_type}, ${e.region})
Società: ${c.name}
Anno di riferimento: ${new Date().getFullYear()}
Responsabile formazione: ______________________________
Approvato da: ${fill(e.legale_rappresentante)}
Data approvazione: ______________________________`,
      },
      {
        heading: "Moduli Formativi Obbligatori",
        content: "Il piano include i seguenti moduli minimi obbligatori:",
        isList: true,
        items: [
          "MODULO 1 — GDPR e protezione dati sanitari (4h) — tutto il personale — entro: ______",
          "MODULO 2 — Cybersicurezza e NIS2 — rischi e comportamenti sicuri (2h) — tutto il personale — entro: ______",
          "MODULO 3 — AI Literacy e uso sicuro dell'intelligenza artificiale (2h) — tutto il personale che usa sistemi AI — entro: ______",
          "MODULO 4 — D.Lgs. 231/2001 — responsabilità ente e Modello Organizzativo (3h) — dirigenti e responsabili — entro: ______",
          "MODULO 5 — Gestione incidenti informatici e data breach — procedura operativa (1h) — Responsabili IT e DPO — entro: ______",
        ],
      },
      {
        heading: "Metodologia",
        content: `Modalità erogazione: ______________________________
Piattaforma e-learning (se applicabile): ______________________________
Test di verifica apprendimento: Sì / No
Soglia di superamento: ______%
Registro presenze: conservato da ______________________________ per almeno 5 anni`,
      },
      {
        heading: "Budget e Risorse",
        content: `Budget stimato: €______________________________
Fornitore formazione: ______________________________
Docenti interni: ______________________________`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Generato da CLAVIS il ${today()}`,
    metadata: {
      norma: "D.Lgs. 231/2001 — D.Lgs. 138/2024 — AI Act",
      articoli: "Art. 6 D.Lgs. 231/2001 — Art. 24 NIS2 — Art. 4 AI Act",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

// ─── 11. AVVIO PROCEDURA DPIA (PDF)

function buildAvvioProceduraDPIA(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Avvio Procedura DPIA — Valutazione d'Impatto sulla Protezione dei Dati",
    subtitle: "Data Protection Impact Assessment — Art. 35 Regolamento (UE) 2016/679",
    flagKey: "Flag_GDPR_DPIA",
    outputType: "pdf",
    sections: [
      {
        heading: "Obbligo Normativo",
        content: `L'Art. 35 GDPR impone la DPIA per i trattamenti che presentano un rischio elevato per i diritti e le libertà delle persone fisiche. Per le strutture sociosanitarie come "${e.entity_name}", la DPIA è obbligatoria in particolare per:
- Trattamento sistematico di dati sanitari degli ospiti su larga scala
- Utilizzo di sistemi AI per supporto decisionale clinico (Art. 27 AI Act per FRIA)
- Sistemi di videosorveglianza in aree di degenza
- Profilazione degli ospiti per finalità cliniche`,
      },
      {
        heading: "Avvio Procedura",
        content: `${c.name} avvia formalmente la procedura DPIA per il/i seguente/i trattamento/i:

Trattamento oggetto di DPIA: ______________________________
Responsabile del trattamento (se esterno): ______________________________
DPO coinvolto: ______________________________
Data avvio: ${today()}
Completamento previsto entro: ______________________________`,
      },
      {
        heading: "Fasi della DPIA",
        content: "La DPIA si articola nelle seguenti fasi obbligatorie (Linee guida EDPB WP248):",
        isList: true,
        items: [
          "Descrizione sistematica del trattamento — finalità, natura, contesto, ambito",
          "Valutazione della necessità e proporzionalità del trattamento",
          "Valutazione dei rischi per i diritti e le libertà degli interessati",
          "Misure previste per affrontare i rischi, incluse garanzie e meccanismi di sicurezza",
          "Consultazione del DPO — parere obbligatorio prima dell'adozione",
          "Consultazione preventiva al Garante se i rischi residui rimangono elevati (Art. 36 GDPR)",
        ],
      },
      {
        heading: "Documentazione",
        content: `La DPIA completata sarà conservata da: ______________________________
Revisione periodica: ogni ______ mesi o in caso di variazione significativa del trattamento.
Esito della DPIA: da compilare al termine della procedura.`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Generato da CLAVIS il ${today()}`,
    metadata: {
      norma: "Regolamento (UE) 2016/679 — GDPR",
      articoli: "Art. 35, 36 GDPR — Linee guida EDPB WP248 rev.01",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// SEZIONE 2 — EMAIL BUILDER
// ═══════════════════════════════════════════════════════════════

interface SupplierForEmail {
  id: string;
  ragione_sociale: string;
  email_fornitore: string | null;
  referente_fornitore: string | null;
  dpa_firmato: boolean;
  categorie: string[];
}

interface FlagAperto {
  flag_key: string;
}

/**
 * Aggrega i flag aperti per fornitore e costruisce le email.
 * Restituisce un array di fornitori con le email raggruppate.
 */
export function buildEmailsPerFornitore(
  flagsAperti: FlagAperto[],
  fornitori: SupplierForEmail[],
  entity: EntityData,
  company: CompanyData,
): FornitoreConFlag[] {
  const flagKeys = flagsAperti.map(f => f.flag_key);
  const result: FornitoreConFlag[] = [];

  for (const fornitore of fornitori) {
    const emailsPerFornitore: FlagEmail[] = [];

    for (const flagKey of flagKeys) {
      const mapping = FLAG_CATEGORIA_MAP[flagKey];
      if (!mapping) continue;

      let pertinente = false;
      if (mapping.categorie === "ALL") {
        pertinente = true;
      } else if (mapping.categorie === "NO_DPA") {
        pertinente = !fornitore.dpa_firmato;
      } else {
        pertinente = fornitore.categorie.some(cat => (mapping.categorie as string[]).includes(cat));
      }

      if (!pertinente) continue;

      // Evita duplicati dello stesso tipoEmail per lo stesso fornitore
      const tipoGiaPresente = emailsPerFornitore.some(e => {
        const m = FLAG_CATEGORIA_MAP[e.flagKey];
        return m?.tipoEmail === mapping.tipoEmail;
      });
      if (tipoGiaPresente) continue;

      const email = buildEmailPerTipo(mapping.tipoEmail, flagKey, fornitore, entity, company);
      if (email) emailsPerFornitore.push(email);
    }

    if (emailsPerFornitore.length > 0) {
      result.push({
        ...fornitore,
        flagsAperti: emailsPerFornitore,
      });
    }
  }

  return result;
}

function buildEmailPerTipo(
  tipo: string,
  flagKey: string,
  fornitore: SupplierForEmail,
  entity: EntityData,
  company: CompanyData,
): FlagEmail | null {
  const referente = fornitore.referente_fornitore ? `Gentile ${fornitore.referente_fornitore},` : "Gentile Referente,";
  const struttura = `${entity.entity_name} (${entity.entity_type}, ${entity.region})`;
  const firma = `\n\nCordiali saluti,\n______________________________\n${company.name}\n${struttura}`;

  switch (tipo) {
    case "dpa":
      return {
        flagKey,
        oggetto: `Richiesta stipula Data Processing Agreement (DPA) — ${company.name} / ${fornitore.ragione_sociale}`,
        corpo: `${referente}\n\nIn qualità di Titolare del Trattamento ai sensi del Regolamento (UE) 2016/679 (GDPR), ${company.name} gestisce la struttura "${struttura}" che tratta dati sanitari degli ospiti.\n\nAi sensi dell'Art. 28 GDPR, ogni soggetto esterno che tratta dati personali per conto del Titolare deve essere designato Responsabile del Trattamento mediante apposito contratto (Data Processing Agreement — DPA).\n\nLa invitiamo pertanto a:\n1. Confermare per iscritto le categorie di dati trattati per conto della nostra struttura\n2. Sottoscrivere il contratto DPA allegato / fornitoci il vostro template conforme GDPR\n3. Fornire evidenza delle misure di sicurezza tecniche e organizzative adottate (Art. 32 GDPR)\n\nSi prega di riscontrare entro 15 giorni lavorativi dalla presente.${firma}`,
      };

    case "data_residency":
      return {
        flagKey,
        oggetto: `Richiesta dichiarazione localizzazione dati (Data Residency) — ${fornitore.ragione_sociale}`,
        corpo: `${referente}\n\nAi sensi degli Art. 44-49 GDPR, i dati sanitari trattati per conto di ${company.name} — struttura "${struttura}" — devono essere conservati e trattati all'interno dell'Unione Europea, salvo presenza di garanzie adeguate (Standard Contractual Clauses aggiornate post-Schrems II).\n\nSi richiede conferma scritta di:\n1. Paese/Paesi in cui risiedono fisicamente i server che ospitano i dati della nostra struttura\n2. Eventuale utilizzo di sub-processor con server extra-UE e relative garanzie adottate (SCC, BCR, decisione di adeguatezza)\n3. Copia delle SCC in vigore, se applicabile\n\nSi prega di riscontrare entro 15 giorni lavorativi.${firma}`,
      };

    case "conformita":
      return {
        flagKey,
        oggetto: `Richiesta documentazione conformità AI Act — ${fornitore.ragione_sociale}`,
        corpo: `${referente}\n\nIl Regolamento (UE) 2024/1689 (AI Act) prevede, a partire dal 2 agosto 2026, obblighi stringenti per i fornitori e i deployer di sistemi AI ad alto rischio in ambito sanitario.\n\n${company.name}, in qualità di deployer del/dei sistema/i AI fornito/i da Voi per la struttura "${struttura}", è tenuta a verificare la conformità AI Act dei sistemi utilizzati (Art. 26 AI Act).\n\nSi richiede pertanto:\n1. Classificazione del/dei sistema/i AI secondo l'Allegato III AI Act\n2. Dossier Tecnico (Art. 11 AI Act) o dichiarazione di conformità, se il sistema rientra nella categoria alto rischio\n3. Conferma dell'avvenuta registrazione nel database EU AI (Art. 49 AI Act), se applicabile\n4. Documentazione delle misure di supervisione umana implementate (Art. 14 AI Act)\n\nScadenza normativa: 2 agosto 2026. Si prega di riscontrare entro 30 giorni.${firma}`,
      };

    case "mdr":
      return {
        flagKey,
        oggetto: `Richiesta classificazione MDR — ${fornitore.ragione_sociale}`,
        corpo: `${referente}\n\nAi sensi del Regolamento (UE) 2017/745 (MDR) e delle Linee guida MDCG 2019-11, il software che elabora dati clinici per supportare diagnosi o terapia può essere classificato come dispositivo medico.\n\n${company.name} — struttura "${struttura}" — utilizza il/i Vostro/i prodotto/i per attività cliniche e richiede:\n1. Conferma se il prodotto è classificato come dispositivo medico ai sensi del MDR\n2. Se classificato: classe di rischio (I, IIa, IIb, III) e numero di certificato CE\n3. Se non classificato: dichiarazione scritta motivata di non applicabilità del MDR\n\nSi prega di riscontrare entro 20 giorni lavorativi.${firma}`,
      };

    case "fse":
      return {
        flagKey,
        oggetto: `Verifica requisiti interoperabilità FSE 2.0 — ${fornitore.ragione_sociale}`,
        corpo: `${referente}\n\nIl DM 77/2022 e il DPCM 07/09/2023 impongono alle strutture sociosanitarie convenzionate SSN/SSR l'integrazione con il Fascicolo Sanitario Elettronico 2.0 (FSE 2.0).\n\n${company.name} — struttura "${struttura}" (${entity.region}) — deve verificare la conformità del gestionale in uso agli standard di interoperabilità FSE.\n\nSi richiede:\n1. Stato di implementazione delle API FSE 2.0 nel Vostro sistema\n2. Documentazione tecnica dell'integrazione o roadmap di adeguamento\n3. Contatto tecnico dedicato per la verifica di conformità con la regione ${entity.region}\n\nSi prega di riscontrare entro 20 giorni lavorativi.${firma}`,
      };

    case "censimento":
      return {
        flagKey,
        oggetto: `Richiesta informazioni sicurezza e compliance — ${fornitore.ragione_sociale}`,
        corpo: `${referente}\n\nNell'ambito del censimento dei fornitori digitali richiesto dal D.Lgs. 138/2024 (NIS2) e dal GDPR, ${company.name} — struttura "${struttura}" — sta raccogliendo documentazione aggiornata da tutti i fornitori che trattano dati o gestiscono sistemi informatici per conto della struttura.\n\nSi richiede di fornire:\n1. Descrizione dei servizi erogati con accesso a sistemi o dati della struttura\n2. Misure di sicurezza adottate (certificazioni ISO 27001, SOC2, ecc.)\n3. Referente sicurezza e contatto per emergenze informatiche\n4. Disponibilità alla sottoscrizione del contratto DPA ex Art. 28 GDPR\n\nSi prega di riscontrare entro 15 giorni lavorativi.${firma}`,
      };

    default:
      return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// SEZIONE 3 — NUOVI TEMPLATE v3 (PDF)
// ═══════════════════════════════════════════════════════════════

function buildLetteraGaranteDpo(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Comunicazione Dati di Contatto DPO al Garante",
    subtitle: "Art. 37 par. 7 Regolamento (UE) 2016/679",
    flagKey: "Flag_GDPR_DPO",
    outputType: "pdf",
    sections: [
      {
        heading: "Destinatario",
        content: `Garante per la Protezione dei Dati Personali\nPiazza Venezia 11 — 00187 Roma\nprotocollo@gpdp.it\n\nData: ${today()}`,
      },
      {
        heading: "Oggetto",
        content: `Comunicazione dati di contatto del Responsabile della Protezione dei Dati (DPO) ai sensi dell'Art. 37, par. 7, Regolamento (UE) 2016/679`,
      },
      {
        heading: "Comunicazione",
        content: `Il sottoscritto ${fill(c.legale_rappresentante)}, in qualità di Legale Rappresentante di ${c.name} (P.IVA: ${fill(c.vat_number)}), con sede legale in ${fill(c.legal_address)}, comunica i seguenti dati di contatto del Responsabile della Protezione dei Dati (DPO) designato ai sensi dell'Art. 37 GDPR per la struttura: ${e.entity_name} (${e.entity_type}, ${e.region}).\n\nNome e Cognome DPO: ${fill(c.nome_dpo ?? e.nome_dpo)}\nQualifica: ${fill(c.dpo_qualifica ?? e.dpo_qualifica)}\nEmail dedicata DPO: ${fill(c.email_dpo ?? e.email_dpo)}\nTelefono: ${fill(c.dpo_telefono ?? e.dpo_telefono)}\nPEC (se disponibile): ${fill(c.pec)}`,
      },
      {
        heading: "Dichiarazione",
        content: `Il Titolare dichiara che il DPO designato possiede le qualità professionali e la conoscenza specialistica del diritto e delle prassi in materia di protezione dei dati necessarie all'assolvimento dei compiti di cui all'Art. 39 GDPR, e che opera in piena indipendenza.`,
      },
      {
        heading: "Firma",
        content: `${c.name} — ${fill(c.legale_rappresentante)}, Legale Rappresentante\n\nData: ${today()}\nFirma: ______________________________`,
      },
    ],
    footer: `${c.name} | Comunicazione al Garante | ${today()}`,
    metadata: {
      norma: "Regolamento (UE) 2016/679 — GDPR",
      articoli: "Art. 37 par. 7 GDPR",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildDpaFornitore(e: EntityData, c: CompanyData, fornitore?: { ragione_sociale?: string; piva?: string; servizi?: string[] }): DocumentOutput {
  const nomeForn = fornitore?.ragione_sociale ?? "______________________________";
  const pivaForn = fornitore?.piva ?? "______________________________";
  const servizi = fornitore?.servizi?.join(", ") ?? "______________________________";
  return {
    title: "Accordo sul Trattamento dei Dati Personali",
    subtitle: "Data Processing Agreement — Art. 28 Regolamento (UE) 2016/679",
    flagKey: "Flag_GDPR_Art28",
    outputType: "pdf",
    sections: [
      {
        heading: "Parti",
        content: `TITOLARE DEL TRATTAMENTO:\n${c.name} — P.IVA: ${fill(c.vat_number)}\nSede: ${fill(c.legal_address)}\nLegale Rappresentante: ${fill(c.legale_rappresentante)}\n\nRESPONSABILE DEL TRATTAMENTO:\n${nomeForn} — P.IVA: ${pivaForn}\nSede: ______________________________\nLegale Rappresentante: ______________________________`,
      },
      {
        heading: "Art. 1 — Oggetto e Durata",
        content: `Il presente accordo disciplina il trattamento dei dati personali effettuato dal Responsabile per conto del Titolare nell'ambito della fornitura dei seguenti servizi: ${servizi}.\n\nIl presente accordo ha efficacia dalla data di sottoscrizione e rimane valido per tutta la durata del rapporto contrattuale tra le Parti.`,
      },
      {
        heading: "Art. 2 — Natura e Finalità del Trattamento",
        content: `Il Responsabile tratta dati personali per le seguenti finalità:\n- Erogazione dei servizi contrattuali sopra indicati\n- Attività accessorie e strumentali all'erogazione dei servizi\n\nCategorie di dati trattati: ______________________________\nCategorie di interessati: personale dipendente e collaboratori di ${e.entity_name}${e.convenzione_ssn ? "; persone in carico presso la struttura" : ""}`,
      },
      {
        heading: "Art. 3 — Obblighi del Responsabile",
        content: "Il Responsabile si impegna a:",
        isList: true,
        items: [
          "Trattare i dati personali esclusivamente su istruzione documentata del Titolare",
          "Garantire che le persone autorizzate al trattamento abbiano assunto impegni di riservatezza",
          "Adottare tutte le misure di sicurezza richieste dall'Art. 32 GDPR",
          "Non ricorrere a sub-responsabili senza previa autorizzazione scritta del Titolare",
          "Assistere il Titolare nell'evasione delle richieste degli interessati ex Artt. 15-22 GDPR",
          "Notificare al Titolare qualsiasi violazione dei dati personali entro 24 ore dalla scoperta",
          "Cancellare o restituire tutti i dati al termine della prestazione, a scelta del Titolare",
        ],
      },
      {
        heading: "Art. 4 — Localizzazione dei Dati",
        content: `I dati personali sono trattati e conservati esclusivamente all'interno dell'Unione Europea, salvo diversa indicazione: ______________________________`,
      },
      {
        heading: "Firme",
        content: `Per ${c.name} — ${fill(c.legale_rappresentante)}:\nData: ${today()}  Firma: ______________________________\n\nPer ${nomeForn} — Legale Rappresentante:\nData: ______________________________  Firma: ______________________________`,
      },
    ],
    footer: `${c.name} / ${nomeForn} | DPA Art. 28 GDPR | ${today()}`,
    metadata: {
      norma: "Regolamento (UE) 2016/679 — GDPR",
      articoli: "Art. 28 GDPR — Responsabile del Trattamento",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildAutocertNis2(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Dichiarazione di Non Applicabilità D.Lgs. 138/2024 (NIS2)",
    subtitle: "Verifica soglie Art. 2 — soggetti essenziali e importanti",
    flagKey: "Flag_NIS2_Registration",
    outputType: "pdf",
    sections: [
      {
        heading: "Dichiarazione",
        content: `Il sottoscritto ${fill(c.legale_rappresentante)}, Legale Rappresentante di ${c.name} (P.IVA: ${fill(c.vat_number)}), con sede in ${fill(c.legal_address)},\n\nDICHIARA\n\nche la struttura "${e.entity_name}" (${e.entity_type}, ${e.region}) NON rientra nel campo di applicazione del D.Lgs. 138/2024 (recepimento Direttiva NIS2) per i seguenti motivi:`,
      },
      {
        heading: "Verifica Soglie",
        content: `Numero dipendenti (fascia): ${fill(c.n_dipendenti_fascia)}\n→ Soglia NIS2: 50 dipendenti\n\nFatturato annuo (fascia): ${fill(c.fatturato_fascia)}\n→ Soglia NIS2: €10 milioni\n\nEntrambe le soglie devono essere superate per rientrare nel perimetro NIS2 come soggetto importante. Per soggetti essenziali (settore sanitario) è sufficiente superare una soglia.`,
      },
      {
        heading: "Impegno di Rivalutazione",
        content: `Il Titolare si impegna a rivalutare l'applicabilità del D.Lgs. 138/2024 annualmente entro il 31 gennaio di ogni anno e in caso di variazioni significative dell'attività.`,
      },
      {
        heading: "Firma",
        content: `${fill(c.legale_rappresentante)} — Legale Rappresentante di ${c.name}\nData: ${today()}\nFirma: ______________________________`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Dichiarazione NIS2 | ${today()}`,
    metadata: {
      norma: "D.Lgs. 138/2024 — NIS2",
      articoli: "Art. 2 D.Lgs. 138/2024 — soglie applicabilità",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildSchedaRegistrazioneAcn(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Scheda Dati — Registrazione ACN NIS2",
    subtitle: "Dati da inserire sul portale ACN — acn.gov.it/portale/nis/registrazione",
    flagKey: "Flag_NIS2_Registration",
    outputType: "pdf",
    sections: [
      {
        heading: "Istruzioni",
        content: `Questo documento contiene tutti i dati necessari per la registrazione sul portale ACN. Tienilo aperto durante la compilazione del form online. La registrazione richiede SPID o CIE del Legale Rappresentante.\n\nURL portale: https://www.acn.gov.it/portale/nis/registrazione`,
      },
      {
        heading: "Dati Soggetto",
        content: `Ragione Sociale: ${c.name}\nP.IVA / Codice Fiscale: ${fill(c.vat_number)}\nSede legale: ${fill(c.legal_address)}\nSettore di attività: Sanitario / Sociosanitario\nTipologia struttura: ${e.entity_type}\nRegione: ${e.region}`,
      },
      {
        heading: "Classificazione NIS2",
        content: `Tipo soggetto: ______________________________\n(Essenziale = settore sanitario con contratto SSN/SSR; Importante = altri soggetti sopra soglia)\n\nNumero dipendenti: ${fill(c.n_dipendenti_fascia)}\nFatturato annuo: ${fill(c.fatturato_fascia)}`,
      },
      {
        heading: "Punto di Contatto NIS2",
        content: `Nome e Cognome: ${fill(e.responsabile_it)}\nEmail: ${fill(e.email_responsabile_it)}\nTelefono: ______________________________\n\n(Il punto di contatto NIS2 può coincidere con il Responsabile IT o il DPO)`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Scheda Registrazione ACN | ${today()}`,
    metadata: {
      norma: "D.Lgs. 138/2024 — NIS2",
      articoli: "Art. 3 D.Lgs. 138/2024 — obbligo registrazione ACN",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildReportSupplyChain(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Report Gestione Supply Chain Digitale",
    subtitle: "Art. 21 par. 2 lett. d D.Lgs. 138/2024 (NIS2) — Sicurezza della catena di fornitura",
    flagKey: "Flag_NIS2_SC_01",
    outputType: "pdf",
    sections: [
      {
        heading: "Dati del Report",
        content: `Struttura: ${e.entity_name} (${e.entity_type}, ${e.region})\nSocietà: ${c.name} | P.IVA: ${fill(c.vat_number)}\nData redazione: ${today()}\nResponsabile: ${fill(e.responsabile_it)}\nApprovato da: ${fill(c.legale_rappresentante)}`,
      },
      {
        heading: "Perimetro Censito",
        content: `Numero fornitori digitali censiti: ______________________________\nFornitori con DPA firmato: ______________________________\nFornitori con certificazioni sicurezza: ______________________________\nFornitori in attesa di risposta: ______________________________`,
      },
      {
        heading: "Criteri di Valutazione del Rischio",
        content: "Ogni fornitore è stato valutato secondo i seguenti criteri:",
        isList: true,
        items: [
          "Accesso a dati sanitari delle persone in carico (alto rischio)",
          "Gestione infrastruttura IT critica (alto rischio)",
          "Certificazioni di sicurezza possedute (ISO 27001, SOC2, ecc.)",
          "Presenza di DPA conforme Art. 28 GDPR",
          "Localizzazione dei dati (UE/extra-UE)",
          "Piano di continuità operativa del fornitore",
        ],
      },
      {
        heading: "Piano di Monitoraggio",
        content: `Il registro fornitori sarà aggiornato:\n- Ad ogni nuovo contratto con fornitore digitale\n- Annualmente per la revisione delle informazioni esistenti\n- Entro 30 giorni da qualsiasi incidente che coinvolga un fornitore\n\nProssima revisione pianificata: ______________________________`,
      },
      {
        heading: "Firma",
        content: `${fill(c.legale_rappresentante)} — Legale Rappresentante\n${fill(e.responsabile_it)} — Responsabile IT\nDPO: ${fill(c.nome_dpo ?? e.nome_dpo)}\n\nData: ${today()}`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Report Supply Chain NIS2 | ${today()}`,
    metadata: {
      norma: "D.Lgs. 138/2024 — NIS2",
      articoli: "Art. 21 par. 2 lett. d — sicurezza supply chain",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildPacchettoCda(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Pacchetto Governance Cybersicurezza — CdA",
    subtitle: "Art. 24 D.Lgs. 138/2024 (NIS2) — Approvazione e sorveglianza CdA",
    flagKey: "Flag_NIS2_CdA",
    outputType: "pdf",
    sections: [
      {
        heading: "Nota per il Legale Rappresentante",
        content: `Il D.Lgs. 138/2024 (NIS2) impone che il Consiglio di Amministrazione approvi formalmente le misure di cybersicurezza e ne sorvegli l'attuazione. Questo pacchetto contiene tutto il necessario per la prossima seduta del CdA.`,
      },
      {
        heading: "AGENDA SEDUTA CDA — Punti Obbligatori NIS2",
        content: `Data seduta: ______________________________\nLuogo: ______________________________\n\nORDINE DEL GIORNO:\n1. Informativa sulla normativa NIS2 (D.Lgs. 138/2024) — 20 minuti\n2. Presentazione stato attuale compliance cybersicurezza — 15 minuti\n3. Approvazione Piano di Cybersicurezza — delibera\n4. Stanziamento budget dedicato — delibera\n5. Nomina responsabile interno attuazione — delibera`,
      },
      {
        heading: "BOZZA DELIBERA — Da adottare in seduta",
        content: `${c.name.toUpperCase()}\nVerbale delibera CdA del: ______________________________\n\nIl Consiglio di Amministrazione di ${c.name}, presieduto da ${fill(c.legale_rappresentante)},\n\nDELIBERA\n\n1. Di approvare il Piano di Cybersicurezza e Protezione dei Dati allegato\n2. Di stanziare un budget dedicato di €______ per l'anno ${new Date().getFullYear()}\n3. Di nominare responsabile dell'attuazione: ______________________________\n4. Di procedere alla registrazione NIS2 presso ACN entro i termini normativi\n5. Di ricevere aggiornamenti sullo stato di compliance con cadenza semestrale\n\nIl Presidente: ${fill(c.legale_rappresentante)}\nFirma: ______________________________  Data: ______________________________`,
      },
    ],
    footer: `${c.name} | Pacchetto CdA NIS2 | ${today()} — Documento riservato`,
    metadata: {
      norma: "D.Lgs. 138/2024 — NIS2",
      articoli: "Art. 24 D.Lgs. 138/2024 — obblighi organi di amministrazione",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildRegistroMdrSoftware(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Registro Software Clinici — Classificazione MDR",
    subtitle: "Regolamento (UE) 2017/745 — Medical Device Regulation — Linee guida MDCG 2019-11",
    flagKey: "Flag_MDR_Software",
    outputType: "pdf",
    sections: [
      {
        heading: "Dati del Registro",
        content: `Struttura: ${e.entity_name} (${e.entity_type}, ${e.region})\nSocietà: ${c.name}\nData redazione: ${today()}\nResponsabile: ${fill(e.responsabile_it)}\nApprovato da: ${fill(c.legale_rappresentante)}`,
      },
      {
        heading: "Criteri di Classificazione MDR",
        content: `Un software è classificato dispositivo medico se la sua finalità d'uso dichiarata dal produttore include il supporto a diagnosi, terapia, prevenzione o monitoraggio clinico con decisioni automatiche. I software puramente amministrativi NON sono dispositivi medici.`,
      },
      {
        heading: "Registro Software Clinici",
        content: `N. | Nome Software | Fornitore | Funzione clinica | Classificazione MDR | N. Certificato CE | Data verifica\n---|--------------|----------|-----------------|---------------------|------------------|-------------\n1  |              |          |                 |                     |                  |\n2  |              |          |                 |                     |                  |\n3  |              |          |                 |                     |                  |\n\nClassificazioni possibili: Non dispositivo medico / Classe I / Classe IIa / Classe IIb / Classe III`,
      },
      {
        heading: "Firma",
        content: `${fill(e.responsabile_it)} — Responsabile IT\nFirma: ______________________________\n\nData: ${today()}`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Registro MDR Software | ${today()}`,
    metadata: {
      norma: "Regolamento (UE) 2017/745 — MDR",
      articoli: "Art. 2 MDR — Linee guida MDCG 2019-11 — classificazione software",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildDichiarazioneFse(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Dichiarazione di Interoperabilità FSE 2.0",
    subtitle: "DM 77/2022 — DPCM 07/09/2023 — Fascicolo Sanitario Elettronico 2.0",
    flagKey: "Flag_FSE_Interop",
    outputType: "pdf",
    sections: [
      {
        heading: "Dichiarazione",
        content: `Il sottoscritto ${fill(c.legale_rappresentante)}, Legale Rappresentante di ${c.name}, dichiara che la struttura "${e.entity_name}" (${e.entity_type}, ${e.region}) ha verificato e attivato l'integrazione con il Fascicolo Sanitario Elettronico 2.0 (FSE 2.0) secondo le modalità regionali applicabili.`,
      },
      {
        heading: "Dati dell'Integrazione",
        content: `Fornitore sistema gestionale: ______________________________\nVersione software con integrazione FSE: ______________________________\nGateway FSE regionale utilizzato: ______________________________\nData attivazione integrazione: ______________________________\nRegione di riferimento: ${e.region}`,
      },
      {
        heading: "Standard Tecnici Implementati",
        content: "L'integrazione è conforme ai seguenti standard:",
        isList: true,
        items: [
          "HL7 FHIR R4 per lo scambio dati strutturati",
          "CDA2 per i documenti clinici",
          "Standard INI (Infrastruttura Nazionale Interoperabilità)",
          "Specifiche tecniche regionali: ______________________________",
        ],
      },
      {
        heading: "Firma",
        content: `${fill(c.legale_rappresentante)} — Legale Rappresentante\n${fill(e.responsabile_it)} — Responsabile IT\n\nData: ${today()}`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Dichiarazione FSE 2.0 | ${today()}`,
    metadata: {
      norma: "DM 77/2022 — DPCM 07/09/2023",
      articoli: "Art. 4 DM 77/2022 — interoperabilità FSE 2.0",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildAttestatoFormazioneAnnuale(e: EntityData, c: CompanyData): DocumentOutput {
  const anno = new Date().getFullYear();
  return {
    title: `Attestato di Completamento Formazione Obbligatoria ${anno}`,
    subtitle: "Art. 6 D.Lgs. 231/2001 — Art. 24 D.Lgs. 138/2024 — Art. 4 AI Act — Art. 39 GDPR",
    flagKey: "Flag_D231_Formazione",
    outputType: "pdf",
    sections: [
      {
        heading: "Dati",
        content: `Struttura: ${e.entity_name} (${e.entity_type}, ${e.region})\nSocietà: ${c.name}\nAnno di riferimento: ${anno}\nDPO: ${fill(c.nome_dpo ?? e.nome_dpo)}`,
      },
      {
        heading: "Moduli Completati",
        content: `N. | Modulo | Destinatari | Ore | Data completamento\n---|--------|------------|-----|-------------------\n1  | D.Lgs. 231/2001 — Responsabilità ente | Dirigenti | ___ | _______________\n2  | GDPR e protezione dati sanitari | Tutto il personale | ___ | _______________\n3  | Cybersicurezza NIS2 | Tutto il personale | ___ | _______________\n4  | AI Literacy | Personale che usa sistemi AI | ___ | _______________`,
      },
      {
        heading: "Dichiarazione",
        content: `Il/La sottoscritto/a ______________________________, in qualità di Responsabile Formazione di ${c.name}, certifica che i moduli formativi sopra indicati sono stati erogati nel corso dell'anno ${anno} secondo quanto previsto dal Piano Formativo Annuale approvato dalla Direzione.`,
      },
      {
        heading: "Firma",
        content: `Responsabile Formazione: ______________________________\nFirma: ______________________________\n\nDPO: ${fill(c.nome_dpo ?? e.nome_dpo)}\nFirma: ______________________________\n\nData: ${today()}`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Attestato Formazione ${anno} | ${today()}`,
    metadata: {
      norma: "D.Lgs. 231/2001 — D.Lgs. 138/2024 — AI Act — GDPR",
      articoli: "Art. 6 D.Lgs. 231/2001 — Art. 24 NIS2 — Art. 4 AI Act — Art. 39 GDPR",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildDichiarazioneAccessibilita(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Dichiarazione di Accessibilità",
    subtitle: "D.Lgs. 62/2024 — L. 4/2004 — Standard WCAG 2.1 livello AA",
    flagKey: "Flag_CRPD_Digital",
    outputType: "pdf",
    sections: [
      {
        heading: "Soggetto",
        content: `${c.name}\nStruttura: ${e.entity_name} (${e.entity_type}, ${e.region})\nSito web: ${fill(e.website_url)}\nData dichiarazione: ${today()}`,
      },
      {
        heading: "Stato di Conformità",
        content: `Il sito web e gli strumenti digitali di ${e.entity_name} sono:\n□ Pienamente conformi agli standard WCAG 2.1 livello AA\n□ Parzialmente conformi — vedere sezione "Contenuti non accessibili"\n□ Non conformi — piano di adeguamento in corso\n\nData ultima valutazione: ______________________________`,
      },
      {
        heading: "Meccanismo di Feedback",
        content: `Gli utenti che incontrano barriere di accessibilità possono segnalarle a:\nEmail: ______________________________\nIndirizzo: ${fill(c.legal_address)}\n\nTempi di risposta: entro 30 giorni lavorativi`,
      },
      {
        heading: "Firma",
        content: `${fill(c.legale_rappresentante)} — Legale Rappresentante di ${c.name}\nData: ${today()}\nFirma: ______________________________`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Dichiarazione Accessibilità | ${today()}`,
    metadata: {
      norma: "D.Lgs. 62/2024 — L. 4/2004 — Direttiva UE 2016/2102",
      articoli: "Standard WCAG 2.1 AA — European Accessibility Act",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildAutocertTsoCartaceo(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Dichiarazione Motivata — Mantenimento Documentazione TSO Cartacea",
    subtitle: "L. 833/1978 Art. 34-35 — Valutazione sistema digitale TSO",
    flagKey: "Flag_Psich_TSO_Digital",
    outputType: "pdf",
    sections: [
      {
        heading: "Dichiarazione",
        content: `Il sottoscritto ${fill(c.legale_rappresentante)}, Legale Rappresentante di ${c.name}, in merito alla documentazione relativa ai Trattamenti Sanitari Obbligatori (TSO) presso la struttura "${e.entity_name}" (${e.entity_type}, ${e.region}),\n\nDICHIARA\n\ndi aver valutato la possibilità di adottare un sistema di documentazione digitale per i TSO e di aver deciso di mantenere il formato cartaceo per le seguenti motivazioni:`,
      },
      {
        heading: "Motivazioni",
        content: `□ Il fornitore del sistema gestionale non supporta ancora la firma digitale qualificata per i TSO\n□ Il Comune di riferimento non ha ancora adottato procedure digitali per la firma sindacale del TSO\n□ Il Tribunale competente non accetta ancora documentazione TSO in formato digitale\n□ Altro: ______________________________`,
      },
      {
        heading: "Impegno di Rivalutazione",
        content: `La struttura si impegna a rivalutare questa scelta annualmente e ad adottare la documentazione digitale non appena tutti i soggetti coinvolti saranno pronti.\n\nData prossima rivalutazione: ______________________________`,
      },
      {
        heading: "Firma",
        content: `${fill(c.legale_rappresentante)} — Legale Rappresentante\nDPO: ${fill(c.nome_dpo ?? e.nome_dpo)}\n\nData: ${today()}\nFirma LR: ______________________________\nFirma DPO: ______________________________`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Dichiarazione TSO cartaceo | ${today()}`,
    metadata: {
      norma: "L. 833/1978 — D.Lgs. 82/2005 — PNRR salute digitale",
      articoli: "Art. 34-35 L. 833/1978 — Art. 20 D.Lgs. 82/2005",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// SEZIONE 4 — NUOVI TEMPLATE v3 (DOCX)
// ═══════════════════════════════════════════════════════════════

function buildRegistroAttivitaDpo(e: EntityData, c: CompanyData): DocumentOutput {
  const anno = new Date().getFullYear();
  return {
    title: "Registro Attività DPO",
    subtitle: "Documentazione operatività DPO — Art. 38-39 GDPR",
    flagKey: "Flag_GDPR_DPO",
    outputType: "docx",
    sections: [
      {
        heading: "Dati del Registro",
        content: `DPO: ${fill(c.nome_dpo ?? e.nome_dpo)}\nQualifica: ${fill(c.dpo_qualifica ?? e.dpo_qualifica)}\nEmail: ${fill(c.email_dpo ?? e.email_dpo)}\nStruttura/e coperte: ${e.entity_name} — ${c.name}\nAnno di riferimento: ${anno}`,
      },
      {
        heading: `Registro Attività — Anno ${anno}`,
        content: `Data | Tipo Attività | Descrizione | Struttura | Esito/Note\n-----|--------------|-------------|-----------|----------\n${today()} | Nomina | Accettazione incarico DPO | ${e.entity_name} | Nomina firmata\n     | Verifica registro trattamenti | | |\n     | Audit interno processo | | |\n     | Formazione personale | | |\n     | Risposta richiesta interessato | | |\n     | Parere DPIA | | |`,
      },
      {
        heading: "Tipi di Attività — Riferimento",
        content: "Legenda per la colonna 'Tipo Attività':",
        isList: true,
        items: [
          "Verifica registro trattamenti — controllo aggiornamento ex Art. 30 GDPR",
          "Audit interno processo — verifica conformità di un processo specifico",
          "Formazione personale — sessione formativa o supervisione",
          "Risposta richiesta interessato — gestione richieste ex Artt. 15-22 GDPR",
          "Parere DPIA — parere su valutazione d'impatto ex Art. 35 GDPR",
          "Verifica fornitori DPA — controllo contratti con responsabili del trattamento",
          "Comunicazione Garante — qualsiasi comunicazione con l'autorità di controllo",
          "Gestione breach — partecipazione a gestione violazione dati",
        ],
      },
    ],
    footer: `${c.name} | DPO: ${fill(c.nome_dpo ?? e.nome_dpo)} | Registro Attività ${anno}`,
    metadata: {
      norma: "Regolamento (UE) 2016/679 — GDPR",
      articoli: "Art. 38-39 GDPR — funzioni e compiti DPO",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildRegistroTrasferimentiExtraUe(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Registro Trasferimenti Dati Extra-UE",
    subtitle: "Art. 44-49 Regolamento (UE) 2016/679 — GDPR",
    flagKey: "Flag_GDPR_DataResidency",
    outputType: "docx",
    sections: [
      {
        heading: "Dati del Registro",
        content: `Titolare: ${c.name} | P.IVA: ${fill(c.vat_number)}\nStruttura: ${e.entity_name}\nDPO responsabile: ${fill(c.nome_dpo ?? e.nome_dpo)}\nData redazione: ${today()}`,
      },
      {
        heading: "Istruzioni",
        content: `Compilare una riga per ogni fornitore che conserva o elabora dati al di fuori dell'Unione Europea. Il registro va aggiornato ad ogni nuovo contratto o modifica significativa.`,
      },
      {
        heading: "Registro",
        content: `Fornitore | Servizio | Paese server | Garanzia adottata | Data verifica\n---------|---------|-------------|------------------|-------------\n         |         |             | □ SCC □ BCR □ Adeguatezza |\n         |         |             | □ SCC □ BCR □ Adeguatezza |\n\nGaranzie: SCC = Standard Contractual Clauses post-Schrems II (2021)\n          BCR = Binding Corporate Rules\n          Adeguatezza = Paese con decisione adeguatezza Commissione UE`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Registro Trasferimenti Extra-UE | ${today()}`,
    metadata: {
      norma: "Regolamento (UE) 2016/679 — GDPR",
      articoli: "Art. 44-49 GDPR — trasferimenti verso paesi terzi",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildDpiaBozza(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Valutazione d'Impatto sulla Protezione dei Dati — Bozza",
    subtitle: "Data Protection Impact Assessment — Art. 35 Regolamento (UE) 2016/679",
    flagKey: "Flag_GDPR_DPIA",
    outputType: "docx",
    sections: [
      {
        heading: "IMPORTANTE — Istruzioni per il DPO",
        content: `Questa bozza è stata pre-compilata da CLAVIS. Il DPO deve completare tutte le sezioni contrassegnate con [DA COMPLETARE], valutare il rischio residuo nella sezione 6, decidere se è necessaria la consultazione preventiva al Garante (Art. 36 GDPR) e firmare il documento.\n\nQuesto è un documento di lavoro — NON è la DPIA definitiva fino alla firma del DPO.`,
      },
      {
        heading: "1. Identificazione del Trattamento",
        content: `Titolare: ${c.name}\nStruttura: ${e.entity_name} (${e.entity_type}, ${e.region})\nDPO: ${fill(c.nome_dpo ?? e.nome_dpo)}\nData avvio procedura DPIA: ${today()}\n\nTrattamento oggetto di DPIA: [DA COMPLETARE]`,
      },
      {
        heading: "2. Descrizione Sistematica del Trattamento",
        content: `Finalità del trattamento: [DA COMPLETARE]\nBase giuridica (Art. 6 GDPR): [DA COMPLETARE]\nCategorie di dati: dati sanitari (Art. 9 GDPR) — [DA COMPLETARE]\nNumero stimato di interessati: ${e.total_beds ?? "[DA COMPLETARE]"}\nPeriodo di conservazione: [DA COMPLETARE]`,
      },
      {
        heading: "3. Necessità e Proporzionalità",
        content: `[DA COMPLETARE — Il DPO valuta:]\n\n3.1 Il trattamento è necessario per la finalità dichiarata? ______________________________\n3.2 Esistono misure meno invasive? ______________________________\n3.3 I dati sono limitati al minimo necessario? ______________________________`,
      },
      {
        heading: "4. Misure di Sicurezza Adottate",
        content: `Misure tecniche:\n□ Cifratura dei dati in transito (TLS)\n□ Cifratura dei dati a riposo\n□ Controllo accessi con autenticazione forte\n□ Log degli accessi (audit trail)\n□ Backup e disaster recovery\n\nMisure organizzative:\n□ Autorizzazioni al trattamento per il personale\n□ Formazione periodica del personale\n□ Accordi DPA con i fornitori`,
      },
      {
        heading: "5. Valutazione Rischi",
        content: `Accesso non autorizzato: Probabilità (1-5): ___  Impatto (1-5): ___  Mitigazione: ______________________________\nPerdita dati: Probabilità (1-5): ___  Impatto (1-5): ___  Mitigazione: ______________________________\nDivulgazione non autorizzata: Probabilità (1-5): ___  Impatto (1-5): ___  Mitigazione: ______________________________`,
      },
      {
        heading: "6. Valutazione Rischio Residuo — SOLO DPO",
        content: `[DA COMPLETARE ESCLUSIVAMENTE DAL DPO]\n\n□ BASSO — il trattamento può procedere\n□ MEDIO — monitoraggio rafforzato necessario\n□ ALTO — necessaria consultazione preventiva al Garante (Art. 36 GDPR)\n\nFirma DPO: ______________________________  Data: ______________________________`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | DPIA Bozza | ${today()} — Da completare e validare dal DPO`,
    metadata: {
      norma: "Regolamento (UE) 2016/679 — GDPR",
      articoli: "Art. 35-36 GDPR — Linee guida EDPB WP248 rev.01",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildPosterBreach(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "PROCEDURA EMERGENZA — Possibile Violazione Dati",
    subtitle: "Istruzioni operative per tutto il personale — Art. 33 GDPR",
    flagKey: "Flag_GDPR_Breach",
    outputType: "docx",
    sections: [
      {
        heading: "HAI RILEVATO UNA DI QUESTE SITUAZIONI?",
        content: "",
        isList: true,
        items: [
          "Hai inviato dati di persone in carico per errore alla persona sbagliata?",
          "Hai perso o non trovi un dispositivo con dati (chiavetta USB, tablet, telefono, cartella)?",
          "Hai notato qualcosa di strano sui sistemi informatici (lentezza anomala, file cifrati)?",
          "Qualcuno ha avuto accesso a informazioni riservate senza autorizzazione?",
        ],
      },
      {
        heading: "SE SÌ — CHIAMA SUBITO",
        content: `REFERENTE DATA BREACH: ${fill(e.referente_breach)}\nTELEFONO / EMAIL: ${fill(e.email_referente_breach)}\n\nNON ASPETTARE. NON TENTARE DI RISOLVERE DA SOLO.\nAnche se non sei sicuro — segnala.`,
      },
      {
        heading: "COSA FARE NELL'ATTESA",
        content: "",
        isList: true,
        items: [
          "NON spegnere il computer o il dispositivo — potrebbe cancellare le prove",
          "NON comunicare l'accaduto a persone non autorizzate",
          "Annota: cosa è successo, quando l'hai scoperto, chi altro lo sa",
        ],
      },
      {
        heading: "PERCHÉ È IMPORTANTE",
        content: `La legge impone di notificare al Garante Privacy entro 72 ore. Se aspettiamo, la sanzione può arrivare fino a €20 milioni.`,
      },
    ],
    footer: `${e.entity_name} — ${c.name} | STAMPARE, PLASTIFICARE, APPENDERE IN OGNI REPARTO`,
    metadata: {
      norma: "Regolamento (UE) 2016/679 — GDPR",
      articoli: "Art. 33-34 GDPR — notifica data breach",
      dataGenerazione: todayISO(),
      disclaimerLegale: "",
    },
  };
}

function buildCircolareMessaggistica(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Circolare Interna — Utilizzo Strumenti di Messaggistica",
    subtitle: "Art. 32 GDPR — Provvedimento Garante 11/01/2024",
    flagKey: "Flag_GDPR_Messaging",
    outputType: "docx",
    sections: [
      {
        heading: "A tutto il Personale",
        content: `${c.name} — Struttura "${e.entity_name}"\nData: ${today()}\nOggetto: Termine utilizzo WhatsApp per dati delle persone in carico`,
      },
      {
        heading: "Perché stiamo cambiando",
        content: `Il Garante Privacy, con provvedimento dell'11 gennaio 2024, ha confermato che WhatsApp, Telegram e altri servizi di messaggistica consumer NON possono essere utilizzati per comunicazioni che riguardano le persone in carico alla struttura. Non si tratta di una scelta aziendale — è un obbligo di legge.`,
      },
      {
        heading: "Cosa cambia da oggi",
        content: `Lo strumento autorizzato per le comunicazioni operative è: ______________________________\nCome accedere: ______________________________\nPer assistenza tecnica: ${fill(e.responsabile_it)} — ${fill(e.email_responsabile_it)}\n\nEntro il: ______________________________ tutti i gruppi WhatsApp aziendali devono essere chiusi.`,
      },
      {
        heading: "Cosa puoi fare e cosa no",
        content: "",
        isList: true,
        items: [
          "✓ PUOI usare il nuovo strumento aziendale per qualsiasi comunicazione operativa",
          "✓ PUOI usare WhatsApp per comunicazioni personali non lavorative",
          "✗ NON PUOI usare WhatsApp per dati, foto o testi che riguardano persone in carico",
          "✗ NON PUOI inviare referti, terapie o informazioni cliniche su WhatsApp",
        ],
      },
      {
        heading: "Presa Visione",
        content: `Il/La sottoscritto/a ______________________________ dichiara di aver ricevuto e compreso la presente circolare.\n\nData: ______________________________  Firma: ______________________________`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | ${today()}`,
    metadata: {
      norma: "Regolamento (UE) 2016/679 — GDPR",
      articoli: "Art. 32 GDPR — Provvedimento Garante 11/01/2024",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildDichiarazioneUsoAi(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Dichiarazione di Uso Corretto — Sistemi AI ad Alto Rischio",
    subtitle: "Art. 26 Regolamento (UE) 2024/1689 — AI Act — Obblighi del Deployer",
    flagKey: "Flag_AIACT_Deployer",
    outputType: "docx",
    sections: [
      {
        heading: "Dati",
        content: `Struttura: ${e.entity_name} (${e.entity_type}, ${e.region})\nSocietà deployer: ${c.name} | P.IVA: ${fill(c.vat_number)}\nAI Officer: ${fill(e.ai_officer)}\nData: ${today()}`,
      },
      {
        heading: "Sistemi AI in Uso",
        content: `Sistema AI 1:\nNome/Prodotto: ______________________________\nFornitore (provider): ______________________________\nClassificazione AI Act: □ Alto rischio Allegato III □ Rischio limitato\nUso effettivo presso la struttura: ______________________________`,
      },
      {
        heading: "Modalità di Supervisione Umana",
        content: `Per ogni sistema AI ad alto rischio, il deployer garantisce la supervisione umana ai sensi dell'Art. 14 AI Act:\n\nResponsabile supervisione: ${fill(e.ai_officer)}\nModalità di supervisione: ______________________________\nFrequenza di revisione: ______________________________\nProcedura di override manuale: ______________________________`,
      },
      {
        heading: "Procedura Segnalazione Incidenti AI",
        content: `In caso di malfunzionamento o decisione automatica errata:\n1. Il personale segnala immediatamente a: ${fill(e.ai_officer)}\n2. Se l'incidente è grave: notifica al provider entro 24 ore\n3. Documentazione dell'incidente nel registro: ______________________________`,
      },
      {
        heading: "Firma",
        content: `${fill(c.legale_rappresentante)} — Legale Rappresentante di ${c.name}\nFirma: ______________________________\n\n${fill(e.ai_officer)} — AI Officer\nFirma: ______________________________\n\nData: ${today()}`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Dichiarazione Deployer AI Act | ${today()}`,
    metadata: {
      norma: "Regolamento (UE) 2024/1689 — AI Act",
      articoli: "Art. 26 AI Act — obblighi deployer sistemi ad alto rischio",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildPianoFormativoAi(e: EntityData, c: CompanyData): DocumentOutput {
  const anno = new Date().getFullYear();
  return {
    title: "Piano Formativo AI Literacy",
    subtitle: "Art. 4 Regolamento (UE) 2024/1689 — AI Act — Obbligo formazione personale",
    flagKey: "Flag_AIACT_Literacy",
    outputType: "docx",
    sections: [
      {
        heading: "Dati del Piano",
        content: `Struttura: ${e.entity_name} (${e.entity_type}, ${e.region})\nSocietà: ${c.name}\nAnno: ${anno}\nAI Officer responsabile: ${fill(e.ai_officer)}\nApprovato da: ${fill(c.legale_rappresentante)}`,
      },
      {
        heading: "Contenuti Minimi Obbligatori (Art. 4 AI Act)",
        content: "Il piano deve coprire i seguenti argomenti:",
        isList: true,
        items: [
          "Definizione di sistema AI e categorie di rischio secondo AI Act",
          "Sistemi AI ad alto rischio in ambito sociosanitario — obblighi del deployer",
          "Divieto assoluto di utilizzo di AI consumer con dati delle persone in carico",
          "Strumenti AI approvati dalla struttura e modalità di utilizzo sicuro",
          "Come riconoscere una decisione automatica errata e come segnalarla",
          "Responsabilità personale nell'uso di sistemi AI",
        ],
      },
      {
        heading: "Calendario Sessioni",
        content: `Sessione 1 — Tutto il personale\nData: ______________________________\nOrario: ______________________________\nFormatore: ______________________________\nDurata: ______ ore\n\nSessione 2 — Personale che usa sistemi AI ad alto rischio\nData: ______________________________\nContenuto aggiuntivo: approfondimento sui sistemi specifici in uso`,
      },
      {
        heading: "Modalità di Erogazione",
        content: `□ Formazione interna — a cura di: ______________________________\n□ Formatore esterno — ragione sociale: ______________________________\n□ E-learning — piattaforma: ______________________________\n\nTest di verifica apprendimento: □ Sì □ No\nSoglia minima superamento: ______%`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Piano Formativo AI ${anno}`,
    metadata: {
      norma: "Regolamento (UE) 2024/1689 — AI Act",
      articoli: "Art. 4 AI Act — obbligo AI literacy personale",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildLettaraIncaricoFormatore(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Lettera di Incarico — Formatore Esterno AI Literacy",
    subtitle: "Art. 4 AI Act — Formazione obbligatoria personale su sistemi AI",
    flagKey: "Flag_AIACT_Literacy",
    outputType: "docx",
    sections: [
      {
        heading: "Intestazione",
        content: `${c.name}\n${fill(c.legal_address)}\nP.IVA: ${fill(c.vat_number)}\n\nA: ______________________________  (Formatore/Società di formazione)\nData: ${today()}\nOggetto: Incarico formazione AI Literacy — Art. 4 Regolamento (UE) 2024/1689`,
      },
      {
        heading: "Incarico",
        content: `Con la presente, ${c.name} conferisce l'incarico di erogare la formazione obbligatoria in materia di AI Literacy ai sensi dell'Art. 4 del Regolamento (UE) 2024/1689 (AI Act) per il personale della struttura "${e.entity_name}" (${e.entity_type}, ${e.region}).`,
      },
      {
        heading: "Contenuti Minimi Richiesti",
        content: "Il formatore è tenuto a coprire i seguenti argomenti:",
        isList: true,
        items: [
          "Definizione di sistema AI e categorie di rischio secondo AI Act",
          "Sistemi AI ad alto rischio in ambito sociosanitario",
          "Obblighi del deployer ai sensi dell'Art. 26 AI Act",
          "Uso sicuro e responsabile degli strumenti AI approvati dalla struttura",
          "Divieto di utilizzo di AI consumer con dati delle persone in carico",
          "Procedura di segnalazione anomalie e incidenti AI",
        ],
      },
      {
        heading: "Firme",
        content: `Per ${c.name}: ${fill(c.legale_rappresentante)}\nFirma: ______________________________\n\nPer il Formatore: ______________________________\nFirma: ______________________________\n\nData: ${today()}`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Incarico Formatore AI Literacy | ${today()}`,
    metadata: {
      norma: "Regolamento (UE) 2024/1689 — AI Act",
      articoli: "Art. 4 AI Act — AI literacy — obbligo formativo",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildSchedaEmergenzaBcp(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "PROCEDURA EMERGENZA IT — Sistemi Non Disponibili",
    subtitle: "Business Continuity Plan — Istruzioni operative per il personale",
    flagKey: "Flag_NIS2_BCP",
    outputType: "docx",
    sections: [
      {
        heading: "I SISTEMI INFORMATICI SONO OFFLINE?",
        content: "Segui questi 5 passi in ordine:",
        isList: true,
        items: [
          "MANTIENI LA CALMA — le procedure offline funzionano",
          "RECUPERA i moduli cartacei di emergenza da: ______________________________",
          "USA l'ultima stampa delle terapie disponibile in: ______________________________",
          `CHIAMA il Responsabile IT: ${fill(e.responsabile_it)} — ${fill(e.email_responsabile_it)}`,
          "NOTIFICA il Direttore entro 30 minuti dall'interruzione",
        ],
      },
      {
        heading: "CONTATTI DI EMERGENZA",
        content: `Responsabile IT: ${fill(e.responsabile_it)}\nTel/Email: ${fill(e.email_responsabile_it)}\n\nFornitore gestionale clinico: ______________________________\nTel emergenze: ______________________________\n\nDirezione: ______________________________`,
      },
      {
        heading: "SE IL SISTEMA È OFFLINE DA PIÙ DI 4 ORE",
        content: "",
        isList: true,
        items: [
          "Contattare la Direzione per valutare il trasferimento delle persone in carico più critiche",
          "Aprire ticket urgente con il fornitore IT",
          "Documentare tutto su carta — orario interruzione, cause note, azioni intraprese",
        ],
      },
    ],
    footer: `${e.entity_name} — ${c.name} | STAMPARE, PLASTIFICARE, APPENDERE IN OGNI REPARTO`,
    metadata: {
      norma: "D.Lgs. 138/2024 — NIS2",
      articoli: "Art. 21 par. 2 lett. c — continuità operativa",
      dataGenerazione: todayISO(),
      disclaimerLegale: "",
    },
  };
}

function buildSchedaOperativaIrp(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "PROCEDURA INCIDENTE INFORMATICO",
    subtitle: "Incident Response Plan — Istruzioni operative immediate",
    flagKey: "Flag_NIS2_IRP",
    outputType: "docx",
    sections: [
      {
        heading: "HAI RILEVATO UN PROBLEMA INFORMATICO?",
        content: "Classifica l'incidente:",
        isList: true,
        items: [
          "🔴 CRITICO: file cifrati / ransomware / sistema completamente bloccato → CHIAMA SUBITO",
          "🟠 ALTO: accesso sospetto / malware rilevato / dispositivo perso con dati → CHIAMA ENTRO 1 ORA",
          "🟡 MEDIO: anomalia di sistema senza impatto su cure → SEGNALA ENTRO 4 ORE",
          "🟢 BASSO: email phishing bloccata / alert antivirus gestito → REGISTRA E SEGNALA DOMANI",
        ],
      },
      {
        heading: "CHI CHIAMARE",
        content: `Responsabile IT: ${fill(e.responsabile_it)}\nTel/Email: ${fill(e.email_responsabile_it)}\n\nDPO (per breach dati): ${fill(c.nome_dpo ?? e.nome_dpo)}\nTel: ${fill(c.dpo_telefono ?? e.dpo_telefono)}\n\nDirezione: ______________________________`,
      },
      {
        heading: "COSA FARE NELL'ATTESA",
        content: "",
        isList: true,
        items: [
          "NON spegnere i sistemi — potrebbe eliminare le prove",
          "NON tentare di risolvere da solo",
          "ISOLA il dispositivo dalla rete (stacca il cavo di rete o disabilita il WiFi)",
          "ANNOTA: cosa è successo, quando, su quale sistema",
        ],
      },
      {
        heading: "TEMPI DI NOTIFICA OBBLIGATORI",
        content: `Entro 24 ore → Preallarme ad ACN (se NIS2 applicabile)\nEntro 72 ore → Notifica Garante (se coinvolti dati personali)\nEntro 72 ore → Notifica completa ad ACN\n\nPortale ACN: https://www.acn.gov.it\nPortale Garante: https://www.gpdp.it`,
      },
    ],
    footer: `${e.entity_name} — ${c.name} | STAMPARE, PLASTIFICARE, APPENDERE ACCANTO ALLA SCHEDA BCP`,
    metadata: {
      norma: "D.Lgs. 138/2024 — NIS2 — GDPR",
      articoli: "Art. 23 NIS2 — Art. 33 GDPR",
      dataGenerazione: todayISO(),
      disclaimerLegale: "",
    },
  };
}

function buildAgendaSimulazioneBcpIrp(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Agenda Simulazione Tabletop — BCP + IRP",
    subtitle: "Test annuale congiunto Business Continuity Plan e Incident Response Plan",
    flagKey: "Flag_NIS2_IRP",
    outputType: "docx",
    sections: [
      {
        heading: "Dati della Simulazione",
        content: `Struttura: ${e.entity_name} (${e.entity_type}, ${e.region})\nData simulazione: ______________________________\nFacilitatore: ______________________________\nPartecipanti obbligatori: Direttore, Responsabile IT, DPO, Referente Data Breach, responsabili di reparto`,
      },
      {
        heading: "SCENARIO 1 — Ransomware sul Gestionale Clinico",
        content: `Descrizione: Lunedì mattina le 8:15, il personale non riesce ad accedere al gestionale clinico. Lo schermo mostra un messaggio che chiede un riscatto. I file sembrano cifrati.\n\nDomande per il team:\n1. Chi viene informato per primo e in che ordine?\n2. Il gestionale viene spento o lasciato acceso?\n3. Come vengono garantite le terapie nel frattempo?\n4. Entro quanto si notifica ad ACN? Chi lo fa?\n5. Quando si notifica al Garante Privacy?`,
      },
      {
        heading: "SCENARIO 2 — Smarrimento Tablet con Dati Clinici",
        content: `Descrizione: Un'operatrice segnala di aver perso il tablet aziendale. Il tablet conteneva foto di medicazioni e accesso all'email aziendale.\n\nDomande:\n1. È un data breach da notificare al Garante?\n2. Il dispositivo aveva PIN attivo? Era cifrato?\n3. Come si procede alla cancellazione remota?\n4. Le persone in carico coinvolte devono essere informate?`,
      },
      {
        heading: "Verbale della Simulazione",
        content: `Data: ______________________________\nScenario 1 — Esito: □ Buono □ Sufficiente □ Da migliorare\nGap: ______________________________\n\nScenario 2 — Esito: □ Buono □ Sufficiente □ Da migliorare\nGap: ______________________________\n\nProssima simulazione: ______________________________\n\nFirma Facilitatore: ______________________________`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Simulazione BCP+IRP | ${today()}`,
    metadata: {
      norma: "D.Lgs. 138/2024 — NIS2 — GDPR",
      articoli: "Art. 21 NIS2 — test periodici piani di continuità e risposta",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildFormazioneCda(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "NIS2 e Cybersicurezza — Sessione Formativa CdA",
    subtitle: "Art. 24 D.Lgs. 138/2024 — Formazione obbligatoria organo di amministrazione",
    flagKey: "Flag_NIS2_CdA",
    outputType: "docx",
    sections: [
      {
        heading: "A chi è rivolto questo documento",
        content: `Questo documento è preparato per i membri del CdA di ${c.name} che non hanno un background tecnico informatico. L'obiettivo non è fare di voi degli esperti IT — è assicurarvi di capire le vostre responsabilità legali.\n\nStruttura: ${e.entity_name} (${e.entity_type}, ${e.region})`,
      },
      {
        heading: "1. Cos'è la NIS2 e perché riguarda il CdA",
        content: `Il D.Lgs. 138/2024 ha introdotto una novità importante: la responsabilità della cybersicurezza non può più essere delegata solo al reparto IT. Ricade direttamente sul vertice aziendale.\n\nIn pratica: il CdA deve approvare formalmente le misure di cybersicurezza, sorvegliarne l'attuazione e ricevere aggiornamenti periodici.`,
      },
      {
        heading: "2. I rischi concreti per una struttura come la nostra",
        content: "",
        isList: true,
        items: [
          "Ransomware — blocco completo dei sistemi con richiesta di riscatto. Costo medio: €50.000-500.000 + fermo operativo",
          "Data breach — furto di dati delle persone in carico. Sanzione Garante fino a €20M o 4% fatturato",
          "Attacco attraverso un fornitore — il fornitore del gestionale viene compromesso",
          "Errore del personale — invio dati per errore, uso WhatsApp per dati clinici, smarrimento dispositivi",
          "Responsabilità legale — senza misure documentate, esposizione a cause civili",
        ],
      },
      {
        heading: "3. Cosa deve fare il CdA oggi",
        content: "Con la delibera di oggi il CdA:",
        isList: true,
        items: [
          "Approva formalmente il Piano di Cybersicurezza — protegge legalmente la struttura",
          "Stanzia il budget necessario — senza risorse le misure restano sulla carta",
          "Nomina il responsabile dell'attuazione — qualcuno deve rispondere operativamente",
          "Si impegna a ricevere aggiornamenti semestrali — la vigilanza è un obbligo continuo",
        ],
      },
    ],
    footer: `${c.name} | Sessione Formativa CdA NIS2 | ${today()} — Riservato`,
    metadata: {
      norma: "D.Lgs. 138/2024 — NIS2",
      articoli: "Art. 24 D.Lgs. 138/2024 — obblighi formazione CdA",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildReportSemestraleCda(e: EntityData, c: CompanyData): DocumentOutput {
  const semestre = new Date().getMonth() < 6 ? "I semestre" : "II semestre";
  const anno = new Date().getFullYear();
  return {
    title: `Report Semestrale Cybersicurezza — ${semestre} ${anno}`,
    subtitle: "Art. 24 D.Lgs. 138/2024 — Aggiornamento CdA su stato compliance",
    flagKey: "Flag_NIS2_CdA",
    outputType: "docx",
    sections: [
      {
        heading: "Dati del Report",
        content: `Struttura: ${e.entity_name} (${e.entity_type}, ${e.region})\nSocietà: ${c.name}\nPeriodo: ${semestre} ${anno}\nPreparato da: ${fill(e.responsabile_it)}\nDPO: ${fill(c.nome_dpo ?? e.nome_dpo)}\nData: ${today()}`,
      },
      {
        heading: "Score CLAVIS",
        content: `Score attuale: ______/100\nScore precedente: ______/100\nVariazione: ______\n\nFlag completati nel periodo: ______\nFlag aperti: ______\nFlag scaduti: ______`,
      },
      {
        heading: "Adempimenti Completati nel Periodo",
        content: `- ______________________________\n- ______________________________\n- ______________________________`,
      },
      {
        heading: "Adempimenti Aperti — Priorità",
        content: `- ______________________________ — Scadenza: ______\n- ______________________________ — Scadenza: ______`,
      },
      {
        heading: "Incidenti nel Periodo",
        content: `Numero incidenti rilevati: ______\nNumero breach notificati al Garante: ______\nAzioni correttive adottate: ______________________________`,
      },
      {
        heading: "Prossimi Passi",
        content: `1. ______________________________\n2. ______________________________\n3. ______________________________\n\nProssimo aggiornamento CdA previsto: ______________________________`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Report CdA ${semestre} ${anno} — Riservato`,
    metadata: {
      norma: "D.Lgs. 138/2024 — NIS2",
      articoli: "Art. 24 D.Lgs. 138/2024 — sorveglianza CdA",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildProceduraLogging(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Procedura Gestione Audit Trail e Log Accessi",
    subtitle: "Art. 21 D.Lgs. 138/2024 (NIS2) — Art. 32 GDPR — Monitoraggio sistemi",
    flagKey: "Flag_NIS2_Logging",
    outputType: "docx",
    sections: [
      {
        heading: "Dati",
        content: `Struttura: ${e.entity_name} (${e.entity_type}, ${e.region})\nSocietà: ${c.name}\nResponsabile IT: ${fill(e.responsabile_it)}\nDPO: ${fill(c.nome_dpo ?? e.nome_dpo)}\nData adozione: ${today()}`,
      },
      {
        heading: "Sistemi Soggetti a Logging",
        content: `Sistema 1 — Gestionale clinico\nNome/Fornitore: ______________________________\nTipo di log attivi: accessi, modifiche cartelle, stampe, export dati\nRetention: 12 mesi online + 5 anni archivio\n\nSistema 2 — Infrastruttura IT (firewall, server)\nNome/Fornitore: ______________________________\nTipo di log attivi: accessi di rete, tentativi falliti, anomalie\nRetention: 12 mesi`,
      },
      {
        heading: "Accesso ai Log",
        content: `I log sono accessibili esclusivamente a:\n- ${fill(e.responsabile_it)} — Responsabile IT (accesso completo)\n- ${fill(c.nome_dpo ?? e.nome_dpo)} — DPO (accesso per ispezioni e breach)\n\nL'accesso ai log è esso stesso loggato. Ogni accesso deve essere motivato.`,
      },
      {
        heading: "Revisione Periodica",
        content: `Frequenza revisione log: ______________________________\nResponsabile revisione: ${fill(e.responsabile_it)}\nCosa cercare:\n- Accessi fuori orario ripetuti (>3 volte)\n- Accessi falliti ripetuti (>10 in un'ora)\n- Download o export di grandi quantità di dati\n\nProcedura in caso di anomalia: segnalare immediatamente a DPO e Direzione`,
      },
      {
        heading: "Firma",
        content: `${fill(e.responsabile_it)} — Responsabile IT\nFirma: ______________________________\n\nDPO: ${fill(c.nome_dpo ?? e.nome_dpo)}\nFirma: ______________________________\n\nData: ${today()}`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Procedura Logging | ${today()}`,
    metadata: {
      norma: "D.Lgs. 138/2024 — NIS2 — GDPR",
      articoli: "Art. 21 NIS2 — Art. 32 GDPR — monitoraggio e audit trail",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildSchedaByod(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "REGOLE DISPOSITIVI PERSONALI AL LAVORO",
    subtitle: "Policy BYOD — Cosa puoi fare e cosa no",
    flagKey: "Flag_D231_BYOD",
    outputType: "docx",
    sections: [
      {
        heading: `${e.entity_name} — ${c.name}`,
        content: "Regole per l'uso del tuo smartphone/tablet/laptop personale al lavoro:",
      },
      {
        heading: "✓ PUOI",
        content: "",
        isList: true,
        items: [
          "Usare il telefono per chiamate personali nelle pause",
          "Accedere all'email aziendale con PIN attivo sul dispositivo",
          "Usare gli strumenti aziendali autorizzati da remoto (con VPN se richiesta)",
        ],
      },
      {
        heading: "✗ NON PUOI",
        content: "",
        isList: true,
        items: [
          "Fotografare le persone in carico o le loro cartelle/documenti",
          "Inviare dati di persone in carico su WhatsApp, Telegram o SMS",
          "Scaricare cartelle cliniche sul tuo dispositivo personale",
          "Usare ChatGPT, Gemini o altri AI con dati delle persone in carico",
        ],
      },
      {
        heading: "SE PERDI IL DISPOSITIVO",
        content: `Segnala SUBITO a: ${fill(e.responsabile_it)}\nTel/Email: ${fill(e.email_responsabile_it)}\n\nAnche di notte. Anche nel weekend.`,
      },
    ],
    footer: `${e.entity_name} — STAMPARE, PLASTIFICARE, APPENDERE IN SPOGLIATOIO`,
    metadata: {
      norma: "D.Lgs. 231/2001 — L. 132/2025 — GDPR",
      articoli: "Art. 24-bis D.Lgs. 231/2001 — Art. 32 GDPR",
      dataGenerazione: todayISO(),
      disclaimerLegale: "",
    },
  };
}

function buildSchedaShadowAi(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "REGOLE USO INTELLIGENZA ARTIFICIALE AL LAVORO",
    subtitle: "AI Policy — Strumenti autorizzati e vietati",
    flagKey: "Flag_D231_ShadowAI",
    outputType: "docx",
    sections: [
      {
        heading: `${e.entity_name} — ${c.name}`,
        content: "Regole per l'uso di strumenti di Intelligenza Artificiale:",
      },
      {
        heading: "✓ STRUMENTI AI AUTORIZZATI",
        content: `[Da completare con la lista degli strumenti approvati dalla struttura]\n\n1. ______________________________\n2. ______________________________\n\nPer richiedere l'autorizzazione di un nuovo strumento AI: ${fill(e.ai_officer ?? e.responsabile_it)}`,
      },
      {
        heading: "✗ VIETATO CON DATI DELLE PERSONE IN CARICO",
        content: "",
        isList: true,
        items: [
          "ChatGPT (OpenAI) — account personale o consumer",
          "Gemini (Google) — account personale o consumer",
          "Claude (Anthropic) — account personale o consumer",
          "Microsoft Copilot — versione consumer",
          "Qualsiasi AI non nell'elenco degli strumenti autorizzati",
        ],
      },
      {
        heading: "PERCHÉ È IMPORTANTE",
        content: `Inserire dati di persone in carico in un AI consumer = trasmettere dati sanitari a server esteri senza protezioni.\nSanzione GDPR: fino a €20 milioni.\nRischio penale personale (D.Lgs. 231/2001 + L. 132/2025).`,
      },
    ],
    footer: `${e.entity_name} — STAMPARE, PLASTIFICARE, APPENDERE ACCANTO ALLA SCHEDA BYOD`,
    metadata: {
      norma: "D.Lgs. 231/2001 — L. 132/2025 — GDPR — AI Act",
      articoli: "Art. 24-bis D.Lgs. 231/2001 — Art. 9 GDPR — Art. 26 AI Act",
      dataGenerazione: todayISO(),
      disclaimerLegale: "",
    },
  };
}

function buildPianoAdeguamentoWcag(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Piano di Adeguamento Accessibilità Digitale — WCAG 2.1 AA",
    subtitle: "D.Lgs. 62/2024 — L. 4/2004 — Standard WCAG 2.1 livello AA",
    flagKey: "Flag_CRPD_Digital",
    outputType: "docx",
    sections: [
      {
        heading: "Dati",
        content: `Struttura: ${e.entity_name}\nSito web: ${fill(e.website_url)}\nData valutazione: ${today()}\nResponsabile adeguamento: ______________________________`,
      },
      {
        heading: "Gap Identificati dalla Checklist WCAG",
        content: `Criterio 1 — ______________________________\nDescrizione problema: ______________________________\nPriorità: □ Alta □ Media □ Bassa\nSoluzione tecnica: ______________________________\nScadenza: ______________________________\n\n[Ripetere per ogni gap]`,
      },
      {
        heading: "Timeline Adeguamento",
        content: `Fase 1 — Gap critici: Scadenza: ______________________________\nFase 2 — Gap importanti: Scadenza: ______________________________\nFase 3 — Miglioramenti: Scadenza: ______________________________`,
      },
      {
        heading: "Approvazione",
        content: `${fill(c.legale_rappresentante)} — Legale Rappresentante\nFirma: ______________________________  Data: ${today()}`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Piano Adeguamento WCAG | ${today()}`,
    metadata: {
      norma: "D.Lgs. 62/2024 — L. 4/2004",
      articoli: "Standard WCAG 2.1 AA — European Accessibility Act",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildProceduraConsensoPsich(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Procedura Raccolta Consenso — Persone con Capacità Ridotta",
    subtitle: "Art. 9 GDPR — L. 219/2017 — L. 180/1978 — Amministrazione di Sostegno",
    flagKey: "Flag_Psich_Consenso",
    outputType: "docx",
    sections: [
      {
        heading: "Ambito di Applicazione",
        content: `La presente procedura si applica a tutte le persone in carico presso ${e.entity_name} che presentano diagnosi di demenza, disturbi psichiatrici con compromissione della capacità di intendere e volere, o qualsiasi condizione che possa limitare la capacità di esprimere consenso valido.`,
      },
      {
        heading: "SCENARIO A — Persona Capace",
        content: `La persona comprende le informazioni e può esprimere un consenso valido.\n\nProcedura:\n1. Fornire informativa privacy completa in linguaggio comprensibile\n2. Raccogliere firma sulla modulistica standard\n3. Archiviare nella cartella della persona in carico`,
      },
      {
        heading: "SCENARIO B — Persona Parzialmente Capace",
        content: `Valutare la capacità nel momento specifico — documentare la valutazione con data e ora.\n- Se capace in quel momento → procedura Scenario A\n- Se incapace in quel momento → procedura Scenario C\n\nDocumentare sempre: chi ha valutato, con quale metodologia, qual è stato il risultato.`,
      },
      {
        heading: "SCENARIO C — Persona Incapace",
        content: `Chi può firmare al posto della persona:\n□ Amministratore di Sostegno (ADS) nominato dal Tribunale → allegare decreto di nomina\n□ Tutore legale → allegare decreto di nomina\n\nSe non esiste ancora un ADS/tutore:\n1. Segnalare al Direttore Sanitario\n2. Valutare se procedere all'attivazione della procedura per nomina ADS\n\nATTENZIONE: il familiare senza nomina legale NON ha potere di firma per il trattamento dei dati sanitari.`,
      },
      {
        heading: "Approvazione",
        content: `DPO: ${fill(c.nome_dpo ?? e.nome_dpo)}\nFirma: ______________________________\n\nDirettore Sanitario: ______________________________\nFirma: ______________________________\n\nData: ${today()}`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Procedura Consenso Psichiatrico | ${today()}`,
    metadata: {
      norma: "Art. 9 GDPR — L. 219/2017 — L. 180/1978 — L. 6/2004 (ADS)",
      articoli: "Art. 9 GDPR — Art. 1 L. 219/2017 — Art. 404 c.c.",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildSchedaConsensoPsich(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "GUIDA RAPIDA — Consenso Persone con Capacità Ridotta",
    subtitle: "Procedura operativa per il personale",
    flagKey: "Flag_Psich_Consenso",
    outputType: "docx",
    sections: [
      {
        heading: `${e.entity_name}`,
        content: "Quando devi raccogliere un consenso, segui questo schema:",
      },
      {
        heading: "La persona capisce cosa le stai chiedendo?",
        content: `SÌ → Usa il modulo standard e falla firmare lei\n\nNO / NON SEI SICURO → continua sotto`,
      },
      {
        heading: "Ha un Amministratore di Sostegno o Tutore?",
        content: `SÌ → Contatta l'ADS/tutore e fai firmare lui\n       → Allega copia del decreto di nomina alla cartella\n\nNO → Non far firmare il familiare senza nomina legale\n    → Segnala al Direttore Sanitario`,
      },
      {
        heading: "DUBBI?",
        content: `Chiedi al DPO: ${fill(c.nome_dpo ?? e.nome_dpo)}\nEmail: ${fill(c.email_dpo ?? e.email_dpo)}\n\nNon procedere da solo in casi dubbi.`,
      },
    ],
    footer: `${e.entity_name} — STAMPARE, PLASTIFICARE, APPENDERE IN OGNI REPARTO`,
    metadata: {
      norma: "GDPR — L. 219/2017 — L. 6/2004",
      articoli: "Art. 9 GDPR — consenso persone vulnerabili",
      dataGenerazione: todayISO(),
      disclaimerLegale: "",
    },
  };
}

function buildChecklistRcSanitaria(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Checklist Conformità Polizza RC Sanitaria — DM 232/2023",
    subtitle: "L. 24/2017 (Legge Gelli-Bianco) — DM 232/2023 — Requisiti minimi polizza",
    flagKey: "Flag_Gelli_RC",
    outputType: "docx",
    sections: [
      {
        heading: "Istruzioni",
        content: `Portare questa checklist al proprio broker assicurativo e verificare che la polizza RC sanitaria rispetti tutti i requisiti del DM 232/2023.\n\nStruttura: ${e.entity_name} (${e.entity_type}, ${e.region})\nSocietà: ${c.name}\nData verifica: ______________________________`,
      },
      {
        heading: "Requisiti Obbligatori DM 232/2023",
        content: `□ 1. MASSIMALE — Almeno €______ per sinistro (verificare con broker il minimo per tipologia struttura)\n   Massimale attuale: €______________________________\n   Conforme: □ Sì □ No\n\n□ 2. COPERTURA COLPA GRAVE — La polizza copre esplicitamente la colpa grave\n   Conforme: □ Sì □ No\n\n□ 3. RETROATTIVITÀ — Copertura retroattiva di almeno 10 anni\n   Conforme: □ Sì □ No\n\n□ 4. ULTRATTIVITÀ — Copertura post-scadenza di almeno 10 anni\n   Conforme: □ Sì □ No\n\n□ 5. ATTIVITÀ COPERTE — Tutte le attività svolte dalla struttura sono esplicitamente coperte\n   Conforme: □ Sì □ No`,
      },
      {
        heading: "Dichiarazione del Broker",
        content: `Il/La sottoscritto/a ______________________________, in qualità di broker assicurativo di ${c.name}, dichiara che la polizza RC sanitaria:\n\n□ È pienamente conforme al DM 232/2023\n□ Presenta i seguenti gap da colmare entro: ______________________________\n\nFirma broker: ______________________________  Data: ______________________________`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Checklist RC Sanitaria DM 232/2023 | ${today()}`,
    metadata: {
      norma: "L. 24/2017 — DM 232/2023",
      articoli: "Art. 10 L. 24/2017 — DM 232/2023 requisiti minimi polizza RC",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildProceduraTsoDigitale(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Procedura Operativa — Documentazione TSO Digitale",
    subtitle: "L. 833/1978 Art. 34-35 — D.Lgs. 82/2005 — Conservazione sostitutiva",
    flagKey: "Flag_Psich_TSO_Digital",
    outputType: "docx",
    sections: [
      {
        heading: "Premessa",
        content: `Il sistema gestionale di ${e.entity_name} supporta la documentazione digitale del TSO con firma digitale qualificata e conservazione sostitutiva certificata AgID.\n\nFornitore gestionale: ______________________________\nConservatore AgID accreditato: ______________________________`,
      },
      {
        heading: "Flusso Operativo TSO Digitale",
        content: "Il TSO si documenta seguendo questo flusso:",
        isList: true,
        items: [
          "Il medico redige la proposta di TSO nel sistema gestionale",
          "Il medico appone la firma digitale qualificata sulla proposta",
          "Il sistema genera automaticamente il timestamp certificato",
          "La proposta firmata viene trasmessa al Comune tramite: ______________________________",
          "Il sindaco (o delegato) appone la propria firma",
          "Il documento completamente firmato viene trasmesso al Giudice Tutelare",
          "Il sistema archivia automaticamente in conservazione sostitutiva certificata",
        ],
      },
      {
        heading: "Procedura di Emergenza — Sistema Offline",
        content: `Se il sistema digitale non è disponibile durante un TSO urgente:\n1. Procedere con i moduli cartacei standard\n2. Documentare il motivo dell'uso del cartaceo\n3. Entro 48 ore dal ripristino: digitalizzare i documenti cartacei\n4. Segnalare al Responsabile IT: ${fill(e.responsabile_it)}`,
      },
      {
        heading: "Conservazione",
        content: `I documenti TSO digitali sono conservati per: minimo 10 anni dalla data del TSO\nSistema di conservazione: ______________________________\nResponsabile archivio: ______________________________`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Procedura TSO Digitale | ${today()}`,
    metadata: {
      norma: "L. 833/1978 — D.Lgs. 82/2005 — DPCM 03/12/2013",
      articoli: "Art. 34-35 L. 833/1978 — Art. 20-23 D.Lgs. 82/2005",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildProtocolloConsensiMinori(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Protocollo Acquisizione Consensi — Persone in Carico Minorenni",
    subtitle: "Art. 8 GDPR — Art. 2-quinquies D.Lgs. 196/2003 — L. 219/2017",
    flagKey: "Flag_Minori_Dati",
    outputType: "docx",
    sections: [
      {
        heading: "Soggetti Autorizzati alla Firma",
        content: `CASO 1 — Genitori non separati: firma di entrambi i genitori\n\nCASO 2 — Genitori separati/divorziati:\n- Affidamento congiunto: firma di entrambi\n- Affidamento esclusivo: firma del genitore affidatario + allegare copia del provvedimento\n\nCASO 3 — Tutore legale nominato dal Tribunale:\n- Firma del tutore + copia decreto di nomina\n\nCASO 4 — Minore straniero non accompagnato:\n- Contattare il tutore nominato dal Tribunale per i minorenni`,
      },
      {
        heading: "Archiviazione",
        content: `I consensi firmati sono archiviati:\n- Nella cartella della persona in carico (copia)\n- In archivio dedicato minorenni (originale): ______________________________\n- Conservazione: per tutta la durata della presa in carico + 10 anni\n\nAd ogni nuovo ingresso di minore: verificare che la modulistica completa sia presente prima di avviare qualsiasi trattamento.`,
      },
      {
        heading: "Approvazione",
        content: `DPO: ${fill(c.nome_dpo ?? e.nome_dpo)}\nFirma: ______________________________\n\nDirettore: ______________________________\nFirma: ______________________________\n\nData: ${today()}`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Protocollo Consensi Minori | ${today()}`,
    metadata: {
      norma: "Art. 8 GDPR — D.Lgs. 196/2003 — L. 219/2017",
      articoli: "Art. 8 GDPR — Art. 2-quinquies D.Lgs. 196/2003 — L. 184/1983",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildProceduraAutoritaMinori(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Procedura Gestione Richieste Autorità Giudiziaria Minorile",
    subtitle: "Art. 9-10 GDPR — L. 184/1983 — DPR 448/1988",
    flagKey: "Flag_Minori_Autorita",
    outputType: "docx",
    sections: [
      {
        heading: "Soggetti che Possono Richiedere Dati",
        content: "La struttura può ricevere richieste di dati sui minori in carico da:",
        isList: true,
        items: [
          "Tribunale per i Minorenni — richiesta formale con timbro e firma del giudice",
          "Procura della Repubblica presso il Tribunale per i Minorenni",
          "Forze dell'Ordine — solo con mandato del PM o ordine del giudice",
          "Servizi Sociali comunali — per minori in tutela",
          "Tutore legale nominato dal Tribunale",
        ],
      },
      {
        heading: "Procedura Operativa",
        content: "Quando arriva una richiesta:",
        isList: true,
        items: [
          "Chi riceve la richiesta NON risponde direttamente — la inoltra immediatamente al Direttore",
          "Il Direttore contatta il DPO entro 2 ore",
          "Il DPO valuta la richiesta: è formalmente valida? È dell'autorità competente?",
          "Se valida: si prepara la risposta con solo le informazioni richieste",
          "Ogni risposta viene documentata: data, mittente, informazioni comunicate, chi ha autorizzato",
        ],
      },
      {
        heading: "Approvazione",
        content: `DPO: ${fill(c.nome_dpo ?? e.nome_dpo)}\nFirma: ______________________________\n\n${fill(c.legale_rappresentante)} — Legale Rappresentante\nFirma: ______________________________\n\nData: ${today()}`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Procedura Autorità Giudiziaria Minorile | ${today()}`,
    metadata: {
      norma: "Art. 9-10 GDPR — L. 184/1983 — DPR 448/1988",
      articoli: "Art. 9 GDPR — Art. 331 c.p. — L. 184/1983",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildProceduraAnonimatoSerd(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Procedura Pseudonimizzazione Utenti — Regime Anonimato SerD",
    subtitle: "Art. 120 DPR 309/1990 — Art. 4 e 32 GDPR — Diritto all'anonimato",
    flagKey: "Flag_Dip_Anonimato",
    outputType: "docx",
    sections: [
      {
        heading: "Diritto all'Anonimato",
        content: `L'Art. 120 DPR 309/1990 garantisce a chiunque si rivolga ai servizi per le dipendenze il diritto all'anonimato. La struttura non può rifiutarlo né rivelare l'identità dell'utente a nessun soggetto esterno, incluse le Forze dell'Ordine, salvo ordine esplicito del Tribunale.`,
      },
      {
        heading: "Sistema di Pseudonimizzazione",
        content: `All'accesso, all'utente che richiede anonimato viene assegnato un codice identificativo univoco.\n\nChiave di decodifica:\n- La corrispondenza codice-identità reale è conservata SOLO in forma cartacea\n- Ubicazione: ______________________________\n- Accessibile SOLO al Direttore del Servizio: ______________________________`,
      },
      {
        heading: "Risposta a Richieste di Terzi",
        content: `Forze dell'Ordine SENZA ordine del Tribunale:\n→ Risposta: "Non possiamo fornire informazioni sugli utenti del servizio"\n→ Non confermare né smentire la presenza di una persona specifica\n→ Segnalare immediatamente al DPO e al Direttore\n\nForze dell'Ordine CON ordine del Tribunale:\n→ Contattare immediatamente il DPO e il legale esterno prima di rispondere`,
      },
      {
        heading: "Approvazione",
        content: `Direttore del Servizio: ______________________________\nFirma: ______________________________\n\nDPO: ${fill(c.nome_dpo ?? e.nome_dpo)}\nFirma: ______________________________\n\nData: ${today()}`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Procedura Anonimato SerD | ${today()}`,
    metadata: {
      norma: "DPR 309/1990 — GDPR",
      articoli: "Art. 120 DPR 309/1990 — Art. 4 n. 5 e Art. 32 GDPR",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildRegistroUtentiAnonimiserd(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Registro Utenti in Regime di Anonimato",
    subtitle: "Art. 120 DPR 309/1990 — Solo codici identificativi — Nessun dato personale",
    flagKey: "Flag_Dip_Anonimato",
    outputType: "docx",
    sections: [
      {
        heading: "AVVISO IMPORTANTE",
        content: `Questo registro contiene SOLO codici identificativi. NON inserire mai nome, cognome, data di nascita o qualsiasi altro dato identificativo in questo documento. La chiave di decodifica è conservata separatamente in forma cartacea dal Direttore del Servizio.`,
      },
      {
        heading: "Registro",
        content: `Struttura: ${e.entity_name}\nAnno: ${new Date().getFullYear()}\n\nCodice | Data primo accesso | Data ultima visita | Sostanza primaria | Note cliniche (anonime)\n-------|-------------------|-------------------|------------------|----------------------\n       |                   |                   |                  |\n\nNOTA: Le note cliniche devono essere redatte in modo da non consentire l'identificazione dell'utente.`,
      },
      {
        heading: "Conservazione",
        content: `Questo registro è conservato in: ______________________________\nAccesso autorizzato: solo Direttore del Servizio e personale clinico autorizzato\nDurata conservazione: 10 anni dall'ultima visita`,
      },
    ],
    footer: `${e.entity_name} | Registro Utenti Anonimi | ${new Date().getFullYear()} — RISERVATO`,
    metadata: {
      norma: "DPR 309/1990 — GDPR",
      articoli: "Art. 120 DPR 309/1990 — anonimato utenti SerD",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildBriefingRemsPenale(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Briefing per Consulente Legale — Regime Dati Ibrido REMS",
    subtitle: "D.Lgs. 230/1999 — DPCM 01/04/2008 — Art. 9-10 GDPR — W7",
    flagKey: "Flag_REMS_Penale",
    outputType: "docx",
    sections: [
      {
        heading: "Dati della Struttura",
        content: `REMS: ${e.entity_name} (${e.region})\nSocietà: ${c.name} | P.IVA: ${fill(c.vat_number)}\nDPO: ${fill(c.nome_dpo ?? e.nome_dpo)}\nResponsabile IT: ${fill(e.responsabile_it)}\nSistema gestionale in uso: ______________________________`,
      },
      {
        heading: "Descrizione del Problema",
        content: `La REMS tratta contemporaneamente dati sanitari (regime GDPR Art. 9) e dati giudiziari (regime D.Lgs. 230/1999 e normativa DAP). Questi due tipi di dati richiedono basi giuridiche diverse, soggetti autorizzati diversi e sistemi di accesso separati.`,
      },
      {
        heading: "Domande per il Consulente",
        content: "",
        isList: true,
        items: [
          "Come separare correttamente i dati sanitari dai dati giudiziari nel sistema informatico?",
          "Quale base giuridica si applica a ciascuna categoria di dati?",
          "Chi può accedere a quali dati e con quale autorizzazione formale?",
          "Come gestire le comunicazioni al DAP nel rispetto del GDPR?",
          "La DPIA deve coprire entrambe le categorie di dati? Come?",
          "Quali clausole inserire nel contratto con il fornitore del gestionale?",
        ],
      },
      {
        heading: "Mappa Preliminare Dati",
        content: `DATI SANITARI (GDPR Art. 9):\n- Diagnosi psichiatrica, terapia farmacologica, cartella clinica, consenso al trattamento\n\nDATI GIUDIZIARI (D.Lgs. 230/1999):\n- Misura di sicurezza applicata, provvedimenti del magistrato, comunicazioni al DAP\n\nDATI IBRIDI (da classificare con il consulente):\n- Valutazione della pericolosità sociale\n- Relazioni sul percorso terapeutico-giudiziario`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Briefing REMS W7 | ${today()} — Riservato`,
    metadata: {
      norma: "D.Lgs. 230/1999 — DPCM 01/04/2008 — GDPR",
      articoli: "Art. 9-10 GDPR — D.Lgs. 230/1999 — normativa DAP",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildMatriceAccessiRems(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Matrice Accessi — Separazione Dati Sanitari e Giudiziari",
    subtitle: "REMS — Schema preliminare da validare con consulente legale — W7",
    flagKey: "Flag_REMS_Penale",
    outputType: "docx",
    sections: [
      {
        heading: "BOZZA PRELIMINARE — DA VALIDARE",
        content: `Questo schema è una bozza preliminare da completare e validare con il consulente legale specializzato in diritto penitenziario e privacy prima di qualsiasi implementazione.`,
      },
      {
        heading: "Perimetro Sanitario",
        content: `Dati inclusi: diagnosi, terapia, cartella clinica, consenso\nBase giuridica: Art. 9 par. 2 lett. h GDPR\n\nRuoli autorizzati:\n□ Psichiatra responsabile — accesso completo\n□ Infermieri — accesso terapia e note infermieristiche\n□ Psicologi — accesso valutazioni cliniche`,
      },
      {
        heading: "Perimetro Giudiziario",
        content: `Dati inclusi: misura di sicurezza, provvedimenti magistrato, comunicazioni DAP\nBase giuridica: D.Lgs. 230/1999 + normativa DAP\n\nRuoli autorizzati:\n□ Direttore REMS — accesso completo\n□ Magistrato di sorveglianza — su richiesta formale\n□ DAP — comunicazioni formali`,
      },
      {
        heading: "Dati Ibridi — DA CLASSIFICARE",
        content: `[Da completare con il consulente legale]\n\nValutazione pericolosità sociale: □ Sanitario □ Giudiziario □ Ibrido\nRelazioni terapeutico-giudiziarie: □ Sanitario □ Giudiziario □ Ibrido`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Matrice Accessi REMS — Bozza W7 | ${today()}`,
    metadata: {
      norma: "D.Lgs. 230/1999 — GDPR",
      articoli: "Art. 9-10 GDPR — normativa REMS",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER + " DOCUMENTO BOZZA — Non adottare senza validazione legale specializzata.",
    },
  };
}

function buildFriaGuidata(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Fundamental Rights Impact Assessment (FRIA)",
    subtitle: "Art. 27 Regolamento (UE) 2024/1689 — AI Act — Valutazione impatto diritti fondamentali",
    flagKey: "Flag_AIACT_HR_01",
    outputType: "docx",
    sections: [
      {
        heading: "Dati",
        content: `Struttura: ${e.entity_name} (${e.entity_type}, ${e.region})\nSocietà deployer: ${c.name}\nAI Officer: ${fill(e.ai_officer)}\nDPO: ${fill(c.nome_dpo ?? e.nome_dpo)}\nSistema AI oggetto di FRIA: ______________________________\nData avvio FRIA: ${today()}`,
      },
      {
        heading: "1. Descrizione del Sistema AI",
        content: `Nome e versione: ______________________________\nFinalità d'uso dichiarata dal provider: ______________________________\nUso effettivo presso la struttura: ______________________________\nClassificazione AI Act: □ Alto rischio Allegato III — punto: ______`,
      },
      {
        heading: "2. Persone Coinvolte",
        content: `Categorie di persone interessate dalle decisioni del sistema AI:\n□ Persone in carico (ospiti/utenti/pazienti)\n□ Dipendenti della struttura\n□ Famiglie delle persone in carico\n\nNumero stimato: ______________________________\nSono presenti categorie vulnerabili? □ Sì □ No`,
      },
      {
        heading: "3. Diritti Fondamentali Potenzialmente Impattati",
        content: `Diritto alla dignità umana (Art. 1 Carta UE):\nImpatto: □ Nessuno □ Basso □ Medio □ Alto\nMotivazione: ______________________________\n\nDiritto alla non discriminazione (Art. 21 Carta UE):\nImpatto: □ Nessuno □ Basso □ Medio □ Alto\nIl sistema può produrre decisioni discriminatorie? ______________________________\n\nDiritto alla protezione dei dati personali (Art. 8 Carta UE):\nImpatto: □ Nessuno □ Basso □ Medio □ Alto\nIl sistema tratta dati sanitari (Art. 9 GDPR)? □ Sì □ No`,
      },
      {
        heading: "4. Misure di Mitigazione",
        content: `Misura 1: ______________________________\nMisura 2: ______________________________\nMisura 3: ______________________________`,
      },
      {
        heading: "5. Conclusioni e Approvazione",
        content: `Valutazione complessiva:\n□ BASSO — il sistema può essere usato con le misure di mitigazione adottate\n□ MEDIO — monitoraggio rafforzato necessario\n□ ALTO — consultare il DPO e valutare la sospensione dell'uso\n\nAI Officer: ${fill(e.ai_officer)}\nFirma: ______________________________\n\nDPO — parere obbligatorio: ${fill(c.nome_dpo ?? e.nome_dpo)}\nFirma: ______________________________\n\nData: ${today()}`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | FRIA AI Act | ${today()}`,
    metadata: {
      norma: "Regolamento (UE) 2024/1689 — AI Act",
      articoli: "Art. 27 AI Act — Fundamental Rights Impact Assessment",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// SEZIONE 5 — AI ACT TEMPLATE v4 (9 template mancanti)
// ═══════════════════════════════════════════════════════════════

function buildRichiestaDossierTecnicoAi(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Richiesta Dossier Tecnico — Conformità AI Act",
    subtitle: "Art. 11 + Art. 26 Regolamento (UE) 2024/1689 — AI Act",
    flagKey: "Flag_AIACT_Deployer",
    outputType: "docx",
    sections: [
      {
        heading: "Mittente",
        content: `${c.name}
Legale Rappresentante: ${fill(c.legale_rappresentante)}
Struttura: ${e.entity_name} (${e.entity_type}, ${e.region})
PEC: ${fill(c.pec)}
Data: ${today()}`,
      },
      {
        heading: "Oggetto",
        content: `Richiesta documentazione di conformità ai sensi del Regolamento (UE) 2024/1689 — Artificial Intelligence Act — per il sistema AI in uso presso la struttura.`,
      },
      {
        heading: "Richiesta Formale",
        content: `In qualità di deployer ai sensi dell'Art. 26 AI Act, con la presente richiediamo formalmente la seguente documentazione relativa al sistema AI denominato:

Nome sistema/prodotto: ______________________________
Versione: ______________________________

Documentazione richiesta:

1. Dossier Tecnico (Art. 11 AI Act)
   Contenuto atteso: architettura del sistema, logica algoritmica, dataset utilizzati, metriche di validazione, misure di cybersicurezza.

2. Dichiarazione di Conformità UE (Art. 47 AI Act)
   Attestante il rispetto dei requisiti del Capo III Sezione 2 AI Act.

3. Documentazione Log Retention (Art. 12 AI Act)
   Conferma che il sistema conserva automaticamente i log delle decisioni per almeno 6 mesi, con indicazione del sistema di storage.

4. Istruzioni operative per il deployer (Art. 13 AI Act)
   Modalità d'uso previste, limiti del sistema, procedure di supervisione umana raccomandate.`,
      },
      {
        heading: "Termine e Canale di Risposta",
        content: `Si richiede riscontro entro 30 giorni dalla presente.
La documentazione dovrà essere inviata a:
Email: ${fill(c.pec)}
Referente: ${fill(c.legale_rappresentante)}

In assenza di riscontro entro il termine indicato, la struttura si riserva di valutare la sospensione dell'uso del sistema ai sensi dell'Art. 26 par. 5 AI Act.`,
      },
      {
        heading: "Firma",
        content: `${fill(c.legale_rappresentante)} — Legale Rappresentante
${c.name}
Firma: ______________________________
Data: ${today()}`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Richiesta Dossier Tecnico AI Act | ${today()}`,
    metadata: {
      norma: "Regolamento (UE) 2024/1689 — AI Act",
      articoli: "Art. 11, Art. 13, Art. 26 AI Act",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildAllegatoClausolaAiact(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Allegato AI Act — Clausola di Conformità",
    subtitle: "Allegato al Contratto di Fornitura | Art. 26 Regolamento (UE) 2024/1689",
    flagKey: "Flag_AIACT_Deployer",
    outputType: "docx",
    sections: [
      {
        heading: "Parti",
        content: `Deployer (Cliente): ${c.name}
Legale Rappresentante: ${fill(c.legale_rappresentante)}
Struttura utilizzatrice: ${e.entity_name}

Fornitore (Provider): ______________________________
Legale Rappresentante fornitore: ______________________________
P.IVA fornitore: ______________________________

Il presente allegato si riferisce al contratto di fornitura n. ______ del ______
relativo al sistema AI denominato: ______________________________`,
      },
      {
        heading: "1. Obblighi del Fornitore (Provider)",
        content: `Il Fornitore dichiara e garantisce che:

a) Il sistema AI fornito è conforme ai requisiti del Regolamento (UE) 2024/1689 (AI Act) applicabili alla sua categoria di rischio.

b) Il Fornitore mantiene e aggiorna il Dossier Tecnico (Art. 11 AI Act) e lo rende disponibile al Deployer su richiesta entro 15 giorni lavorativi.

c) Il sistema conserva automaticamente i log delle decisioni per almeno 6 mesi (Art. 12 AI Act).

d) Il Fornitore notifica tempestivamente il Deployer di qualsiasi aggiornamento significativo al sistema che possa modificarne la classificazione di rischio o le modalità d'uso.

e) In caso di incidente grave (Art. 3 par. 49 AI Act), il Fornitore collabora con il Deployer nella gestione e segnalazione alle autorità competenti.`,
      },
      {
        heading: "2. Obblighi del Deployer",
        content: `Il Deployer (${c.name}) si impegna a:

a) Utilizzare il sistema AI esclusivamente per le finalità previste dal Fornitore e documentate nel Dossier Tecnico.

b) Garantire la supervisione umana del sistema AI (Art. 14 AI Act) tramite personale appositamente formato e nominato.

c) Non apportare modifiche al sistema AI che ne alterino le caratteristiche di sicurezza o conformità.

d) Informare gli ospiti/utenti dell'utilizzo del sistema AI (Art. 13 AI Act).

e) Segnalare al Fornitore eventuali malfunzionamenti o incidenti entro 24 ore dalla rilevazione.`,
      },
      {
        heading: "3. Aggiornamenti Normativi",
        content: `Le parti si impegnano a rinegoziare il presente allegato entro 60 giorni da qualsiasi modifica normativa che impatti gli obblighi AI Act del Fornitore o del Deployer.`,
      },
      {
        heading: "Firme",
        content: `Per il Deployer:
${fill(c.legale_rappresentante)} — Legale Rappresentante ${c.name}
Firma: ______________________________  Data: ${today()}

Per il Fornitore:
______________________________ — Legale Rappresentante
Firma: ______________________________  Data: ______________________________`,
      },
    ],
    footer: `${c.name} | Allegato Clausola AI Act | ${today()}`,
    metadata: {
      norma: "Regolamento (UE) 2024/1689 — AI Act",
      articoli: "Art. 11, Art. 12, Art. 13, Art. 14, Art. 26 AI Act",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildContrattoFornituraAiact(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Contratto di Fornitura Servizi AI",
    subtitle: "Con clausole di conformità Regolamento (UE) 2024/1689 — AI Act",
    flagKey: "Flag_AIACT_Deployer",
    outputType: "docx",
    sections: [
      {
        heading: "Parti Contraenti",
        content: `DEPLOYER (Cliente):
Ragione sociale: ${c.name}
P.IVA: ${fill(c.vat_number)}
Sede legale: ${fill(c.legal_address)}
Legale Rappresentante: ${fill(c.legale_rappresentante)}
PEC: ${fill(c.pec)}
Struttura utilizzatrice: ${e.entity_name} (${e.entity_type}, ${e.region})

FORNITORE (Provider):
Ragione sociale: ______________________________
P.IVA: ______________________________
Sede legale: ______________________________
Legale Rappresentante: ______________________________
PEC: ______________________________`,
      },
      {
        heading: "Art. 1 — Oggetto del Contratto",
        content: `Il presente contratto disciplina la fornitura del sistema AI denominato:
Nome: ______________________________
Versione: ______________________________
Classificazione AI Act: □ Alto rischio (Allegato III) □ Rischio limitato □ Rischio minimo

Finalità d'uso: ______________________________
Struttura utilizzatrice: ${e.entity_name}`,
      },
      {
        heading: "Art. 2 — Obblighi del Fornitore (AI Act)",
        content: `Il Fornitore garantisce:

2.1 Conformità del sistema ai requisiti AI Act applicabili alla categoria di rischio dichiarata.
2.2 Mantenimento e aggiornamento del Dossier Tecnico (Art. 11) — disponibile su richiesta entro 15 gg.
2.3 Conservazione automatica log decisioni per almeno 6 mesi (Art. 12).
2.4 Notifica al Deployer di aggiornamenti significativi al sistema entro 10 giorni.
2.5 Supporto nella gestione di incidenti gravi AI Act (Art. 73).
2.6 Fornitura di istruzioni operative aggiornate per il personale del Deployer.`,
      },
      {
        heading: "Art. 3 — Obblighi del Deployer (AI Act)",
        content: `Il Deployer si impegna a:

3.1 Utilizzare il sistema per le sole finalità dichiarate.
3.2 Designare un AI Officer responsabile della supervisione umana (Art. 14): ${fill(e.ai_officer)}
3.3 Formare il personale utilizzatore (Art. 4 — AI Literacy).
3.4 Informare gli ospiti/utenti dell'utilizzo del sistema AI (Art. 13).
3.5 Non modificare il sistema in modo da alterarne la conformità.
3.6 Segnalare incidenti gravi al Fornitore entro 24 ore.`,
      },
      {
        heading: "Art. 4 — Durata e Rinnovo",
        content: `Il contratto ha durata di ______ mesi dalla firma, con rinnovo tacito salvo disdetta con preavviso di 60 giorni.

Le clausole AI Act si adeguano automaticamente a eventuali aggiornamenti normativi — le parti si impegnano a rinegoziare entro 60 giorni da modifiche significative al Regolamento.`,
      },
      {
        heading: "Art. 5 — Responsabilità",
        content: `Il Fornitore è responsabile della conformità del sistema AI Act come provider (Art. 16).
Il Deployer è responsabile del corretto utilizzo come deployer (Art. 26).
In caso di utilizzo non conforme alle istruzioni del Fornitore, la responsabilità ricade esclusivamente sul Deployer.`,
      },
      {
        heading: "Firme",
        content: `Per il Deployer:
${fill(c.legale_rappresentante)} — Legale Rappresentante ${c.name}
Firma: ______________________________  Data: ${today()}

Per il Fornitore:
______________________________ — Legale Rappresentante
Firma: ______________________________  Data: ______________________________`,
      },
    ],
    footer: `${c.name} | Contratto Fornitura AI Act | ${today()}`,
    metadata: {
      norma: "Regolamento (UE) 2024/1689 — AI Act",
      articoli: "Art. 11, Art. 12, Art. 13, Art. 14, Art. 16, Art. 26, Art. 73 AI Act",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildNominaAiSupervisor(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Atto di Nomina — AI Supervisor",
    subtitle: "Art. 14 Regolamento (UE) 2024/1689 — Supervisione Umana Sistemi AI Alto Rischio",
    flagKey: "Flag_AIACT_HumanOversight",
    outputType: "docx",
    sections: [
      {
        heading: "Il Legale Rappresentante",
        content: `${fill(c.legale_rappresentante)}
in qualità di Legale Rappresentante di ${c.name}
per la struttura ${e.entity_name} (${e.entity_type}, ${e.region})`,
      },
      {
        heading: "Nomina",
        content: `NOMINA formalmente quale AI Supervisor il/la Sig./Sig.ra:

Nome e Cognome: ______________________________
Ruolo in struttura: ______________________________
Email: ______________________________
Telefono: ______________________________

quale responsabile della supervisione umana dei sistemi AI ad alto rischio in uso presso la struttura, ai sensi dell'Art. 14 del Regolamento (UE) 2024/1689 — AI Act.`,
      },
      {
        heading: "Sistemi AI Supervisionati",
        content: `Il presente atto di nomina si riferisce ai seguenti sistemi AI ad alto rischio:

Sistema 1:
Nome/Prodotto: ______________________________
Fornitore: ______________________________
Uso: ______________________________

Sistema 2 (se applicabile):
Nome/Prodotto: ______________________________
Fornitore: ______________________________
Uso: ______________________________`,
      },
      {
        heading: "Poteri e Responsabilità dell'AI Supervisor",
        content: `L'AI Supervisor nominato ha i seguenti poteri e responsabilità:

1. MONITORAGGIO — verificare regolarmente il funzionamento del sistema AI e rilevare anomalie o comportamenti inattesi.

2. OVERRIDE — ha il potere e la responsabilità di ignorare, correggere o annullare le decisioni del sistema AI quando queste appaiano errate, inappropriate o lesive degli interessi degli ospiti.

3. ARRESTO — ha il potere di sospendere o arrestare il sistema AI in caso di malfunzionamento grave, senza necessità di autorizzazione preventiva.

4. SEGNALAZIONE — segnala immediatamente alla Direzione e all'AI Officer (${fill(e.ai_officer)}) qualsiasi incidente grave o anomalia rilevante.

5. DOCUMENTAZIONE — mantiene un registro delle proprie attività di supervisione e degli interventi effettuati.`,
      },
      {
        heading: "Formazione",
        content: `L'AI Supervisor dichiara di aver ricevuto adeguata formazione sull'uso, i limiti e i rischi del/dei sistema/i AI supervisionato/i, ai sensi dell'Art. 4 AI Act.

Data formazione ricevuta: ______________________________
Ente/soggetto formatore: ______________________________`,
      },
      {
        heading: "Firme",
        content: `Il Legale Rappresentante:
${fill(c.legale_rappresentante)}
Firma: ______________________________  Data: ${today()}

L'AI Supervisor nominato, per accettazione:
______________________________
Firma: ______________________________  Data: ______________________________

AI Officer (per conoscenza):
${fill(e.ai_officer)}
Firma: ______________________________`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Nomina AI Supervisor | ${today()}`,
    metadata: {
      norma: "Regolamento (UE) 2024/1689 — AI Act",
      articoli: "Art. 14 AI Act — misure di supervisione umana sistemi alto rischio",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildProtocolloSupervisioneAi(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Protocollo Operativo di Supervisione Umana — Sistemi AI",
    subtitle: "Art. 14 Regolamento (UE) 2024/1689 — AI Act",
    flagKey: "Flag_AIACT_HumanOversight",
    outputType: "docx",
    sections: [
      {
        heading: "Dati",
        content: `Struttura: ${e.entity_name} (${e.entity_type}, ${e.region})
Società: ${c.name}
AI Officer: ${fill(e.ai_officer)}
AI Supervisor: ______________________________
Data adozione protocollo: ${today()}`,
      },
      {
        heading: "1. Ambito di Applicazione",
        content: `Il presente protocollo disciplina le modalità di supervisione umana dei seguenti sistemi AI ad alto rischio in uso presso la struttura:

Sistema: ______________________________  Fornitore: ______________________________
Sistema: ______________________________  Fornitore: ______________________________

Il protocollo si applica a tutto il personale che interagisce con i sistemi AI elencati.`,
      },
      {
        heading: "2. Attività di Monitoraggio Ordinario",
        content: `Frequenza di revisione output sistema AI: ______________________________
Personale responsabile della revisione: ______________________________

Parametri monitorati:
□ Accuratezza delle decisioni/alert rispetto all'osservazione clinica diretta
□ Frequenza di falsi positivi/negativi
□ Comportamenti inattesi o anomali del sistema
□ Tempi di risposta del sistema

Modalità di documentazione del monitoraggio: ______________________________`,
      },
      {
        heading: "3. Procedura di Override",
        content: `L'AI Supervisor può ignorare o correggere le decisioni del sistema AI nei seguenti casi:

a) La decisione del sistema contraddice evidentemente la valutazione clinica diretta del personale.
b) Il sistema genera un alert che appare chiaramente non pertinente alla situazione dell'ospite.
c) Il sistema si comporta in modo inatteso o produce output incongruenti.

COME FARE L'OVERRIDE:
1. Il personale segnala la decisione anomala all'AI Supervisor: ______________________________
2. L'AI Supervisor valuta e decide se ignorare l'output del sistema
3. La decisione clinica alternativa viene documentata nella cartella dell'ospite
4. L'override viene registrato nel Registro Supervisione AI (modulo allegato)
5. Se l'override si ripete >= 3 volte per lo stesso tipo di anomalia -> segnalazione all'AI Officer`,
      },
      {
        heading: "4. Procedura di Arresto del Sistema",
        content: `Il sistema AI deve essere immediatamente sospeso nei seguenti casi:

□ Il sistema produce decisioni errate in modo sistematico che mettono a rischio la sicurezza degli ospiti
□ Si verifica un malfunzionamento tecnico che altera il funzionamento normale
□ Il fornitore comunica una vulnerabilità critica

CHI PUÒ ORDINARE L'ARRESTO:
- AI Supervisor: ______________________________ — autonomamente e senza autorizzazione preventiva
- AI Officer: ${fill(e.ai_officer)} — in qualsiasi momento
- Direttore Sanitario: in qualsiasi momento

COME ARRESTARE IL SISTEMA:
1. ______________________________
2. ______________________________
3. Notifica immediata al fornitore: ______________________________
4. Documentazione dell'evento`,
      },
      {
        heading: "5. Segnalazione Incidenti",
        content: `Per la gestione degli incidenti gravi AI Act si rimanda alla procedura:
□ Sezione AI Act del Piano di Risposta agli Incidenti
□ Procedura separata — Incidenti Gravi AI (documento allegato)

Contatti fornitore per emergenze:
Referente tecnico fornitore: ______________________________
Email emergenze: ______________________________
Telefono emergenze: ______________________________`,
      },
      {
        heading: "Approvazione",
        content: `AI Officer: ${fill(e.ai_officer)}
Firma: ______________________________  Data: ${today()}

Direttore Sanitario: ______________________________
Firma: ______________________________  Data: ______________________________

Legale Rappresentante: ${fill(c.legale_rappresentante)}
Firma: ______________________________`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Protocollo Supervisione AI | ${today()}`,
    metadata: {
      norma: "Regolamento (UE) 2024/1689 — AI Act",
      articoli: "Art. 14 AI Act — supervisione umana sistemi alto rischio",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildRichiestaLogRetentionAi(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Richiesta Documentazione Log Retention — Sistemi AI",
    subtitle: "Art. 12 + Art. 26 par. 5 Regolamento (UE) 2024/1689 — AI Act",
    flagKey: "Flag_AIACT_LogRetention",
    outputType: "docx",
    sections: [
      {
        heading: "Mittente",
        content: `${c.name}
Legale Rappresentante: ${fill(c.legale_rappresentante)}
AI Officer: ${fill(e.ai_officer)}
Struttura: ${e.entity_name}
PEC: ${fill(c.pec)}
Data: ${today()}`,
      },
      {
        heading: "Oggetto",
        content: `Richiesta di documentazione relativa alla conservazione automatica dei log delle decisioni del sistema AI, ai sensi dell'Art. 12 del Regolamento (UE) 2024/1689 — AI Act.

Sistema AI di riferimento: ______________________________
Fornitore: ______________________________`,
      },
      {
        heading: "Documentazione Richiesta",
        content: `In qualità di deployer ai sensi dell'Art. 26 AI Act, richiediamo formale conferma scritta dei seguenti punti:

1. ATTIVAZIONE LOG
   Conferma che il sistema conserva automaticamente i log di tutte le decisioni/output generati.
   □ Sì, i log sono attivi e automatici
   □ I log richiedono configurazione manuale (dettagliare: ______________________________)

2. DURATA CONSERVAZIONE
   Conferma che i log sono conservati per almeno 6 mesi dalla generazione.
   Durata effettiva di conservazione: ______________________________

3. SISTEMA DI STORAGE
   Dove sono conservati fisicamente i log: ______________________________
   Localizzazione server (UE/Extra-UE): ______________________________

4. ACCESSIBILITÀ
   Modalità di accesso ai log da parte del deployer: ______________________________
   Formato di esportazione disponibile: ______________________________

5. CONTENUTO DEI LOG
   I log includono: □ timestamp □ input ricevuto □ output generato □ confidence score □ versione modello`,
      },
      {
        heading: "Termine",
        content: `Si richiede riscontro scritto entro 15 giorni dalla presente a:
${fill(c.pec)}

In assenza di conferma entro il termine, la struttura provvederà a documentare la non conformità ai fini della valutazione del rischio AI Act.`,
      },
      {
        heading: "Firma",
        content: `${fill(c.legale_rappresentante)} — Legale Rappresentante
${c.name}
Firma: ______________________________  Data: ${today()}`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Richiesta Log Retention AI Act | ${today()}`,
    metadata: {
      norma: "Regolamento (UE) 2024/1689 — AI Act",
      articoli: "Art. 12, Art. 26 par. 5 AI Act",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildProceduraIncidentiAi(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Procedura Gestione Incidenti Gravi — Sistemi AI",
    subtitle: "Art. 73 Regolamento (UE) 2024/1689 — AI Act | Allegato al Piano di Risposta agli Incidenti",
    flagKey: "Flag_AIACT_IncidentPlan",
    outputType: "docx",
    sections: [
      {
        heading: "Dati",
        content: `Struttura: ${e.entity_name} (${e.entity_type}, ${e.region})
Società: ${c.name}
AI Officer: ${fill(e.ai_officer)}
Referente Breach/Incidenti: ${fill(e.referente_breach)} — ${fill(e.email_referente_breach)}
Data adozione: ${today()}`,
      },
      {
        heading: "1. Definizione di Incidente Grave AI Act",
        content: `Ai sensi dell'Art. 3 par. 49 AI Act, un incidente grave è qualsiasi evento che causa o potrebbe causare:

a) La morte di una persona o danno grave alla salute di persone fisiche
b) Interruzione grave e prolungata della fornitura di servizi essenziali
c) Violazione grave di diritti fondamentali

SOGLIE SPECIFICHE PER I SISTEMI IN USO:

Sistema: ______________________________
Soglie incidente grave:
□ Output errato che ha determinato una decisione clinica dannosa per un ospite
□ Malfunzionamento che ha interrotto il monitoraggio di ospiti ad alto rischio per > ______ ore
□ Decisione discriminatoria sistematica rilevata su una categoria di ospiti
□ Altro: ______________________________`,
      },
      {
        heading: "2. Procedura di Risposta — Tempistiche",
        content: `T+0 — RILEVAZIONE
Chi rileva l'incidente: ______________________________
Come segnalare: ______________________________

T+1 ora — VALUTAZIONE INIZIALE
Responsabile: AI Officer — ${fill(e.ai_officer)}
Azione: valutare se l'evento soddisfa le soglie di "incidente grave" AI Act

T+24 ore — NOTIFICA AL FORNITORE (se incidente grave confermato)
Contatto fornitore: ______________________________
Email/PEC fornitore: ______________________________
Contenuto notifica: descrizione evento, data/ora, sistemi coinvolti, impatto stimato

T+72 ore — VALUTAZIONE NOTIFICA AUTORITÀ
Se l'incidente ha causato danni a persone o violazioni di diritti fondamentali:
Autorità competente AI Act: AGID / Ufficio IA (verificare canale aggiornato al momento della notifica)
Canale: ______________________________

Parallelamente — verificare se l'incidente configura anche:
□ Notifica NIS2 ad ACN (entro 24h preallarme / 72h notifica formale)
□ Notifica GDPR al Garante (entro 72h se coinvolti dati personali)`,
      },
      {
        heading: "3. Documentazione dell'Incidente",
        content: `Per ogni incidente grave AI Act aprire una scheda con:

Data e ora rilevazione: ______________________________
Sistema AI coinvolto: ______________________________
Descrizione dell'evento: ______________________________
Ospiti/utenti coinvolti (anonimizzati): ______________________________
Decisione/output errato del sistema: ______________________________
Impatto effettivo: ______________________________
Misure immediate adottate: ______________________________
Override effettuato: □ Sì □ No — da chi: ______________________________
Notifica fornitore: □ Sì (data: ______) □ No (motivazione: ______)
Notifica autorità: □ Sì (data: ______) □ No (motivazione: ______)`,
      },
      {
        heading: "4. Analisi Post-Incidente",
        content: `Entro 30 giorni dall'incidente grave:

Analisi causa radice: ______________________________
Misure correttive adottate: ______________________________
Aggiornamento protocollo supervisione: □ Sì □ No
Comunicazione al personale: □ Sì (data: ______) □ No
Valutazione sospensione sistema: □ Sì □ No — decisione: ______________________________`,
      },
      {
        heading: "Approvazione",
        content: `AI Officer: ${fill(e.ai_officer)}
Firma: ______________________________  Data: ${today()}

Legale Rappresentante: ${fill(c.legale_rappresentante)}
Firma: ______________________________  Data: ______________________________

DPO: ${fill(c.nome_dpo ?? e.nome_dpo)}
Firma: ______________________________`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Procedura Incidenti Gravi AI | ${today()}`,
    metadata: {
      norma: "Regolamento (UE) 2024/1689 — AI Act",
      articoli: "Art. 3 par. 49, Art. 73 AI Act",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildInformativaTrasparenzaAi(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Informativa sull'Utilizzo di Sistemi di Intelligenza Artificiale",
    subtitle: "Art. 13 Regolamento (UE) 2024/1689 — AI Act | Da consegnare all'ammissione",
    flagKey: "Flag_AIACT_Transparency",
    outputType: "docx",
    sections: [
      {
        heading: "Gentile Ospite / Familiare / Tutore",
        content: `${e.entity_name} — ${c.name}
${fill(e.address)}

La informa che presso questa struttura vengono utilizzati sistemi informatici con componenti di intelligenza artificiale (AI) che possono riguardarLa direttamente.

Questa informativa Le è fornita in conformità all'Art. 13 del Regolamento (UE) 2024/1689 — AI Act, in linguaggio chiaro e accessibile.`,
      },
      {
        heading: "1. Quali sistemi AI utilizziamo",
        content: `Presso la nostra struttura sono in uso i seguenti sistemi con componenti AI:

Sistema: ______________________________
Cosa fa: ______________________________
Come La riguarda: ______________________________

Sistema: ______________________________
Cosa fa: ______________________________
Come La riguarda: ______________________________

Questi sistemi supportano il nostro personale nelle attività di cura e assistenza. Non sostituiscono il giudizio clinico del personale sanitario.`,
      },
      {
        heading: "2. Come vengono usati questi sistemi",
        content: `I sistemi AI utilizzati:

✓ SUPPORTANO le decisioni del personale — il personale valuta sempre gli output del sistema prima di agire
✓ SONO SUPERVISIONATI — ogni sistema ha un responsabile umano designato che può intervenire e correggerlo
✓ NON DECIDONO autonomamente — le decisioni cliniche e assistenziali sono sempre prese da personale qualificato
✓ POSSONO ESSERE DISATTIVATI — il personale può disattivare il sistema in qualsiasi momento

Il responsabile della supervisione dei sistemi AI è:
Nome: ______________________________
Ruolo: ______________________________
Contatto: ______________________________`,
      },
      {
        heading: "3. I Suoi diritti",
        content: `In relazione all'uso di sistemi AI che La riguardano, ha il diritto di:

□ ESSERE INFORMATO — richiedere in qualsiasi momento informazioni più dettagliate sui sistemi AI in uso
□ RICHIEDERE SPIEGAZIONI — chiedere al personale di spiegare come il sistema AI ha contribuito a una decisione che La riguarda
□ OPPORSI — manifestare la propria preferenza a non essere soggetto a specifici sistemi AI (nei limiti della sicurezza delle cure)
□ PRESENTARE RECLAMO — rivolgersi alla Direzione o all'AI Officer in caso di preoccupazioni sull'uso dei sistemi AI

Per esercitare questi diritti o per qualsiasi domanda:
AI Officer: ${fill(e.ai_officer)} — ${fill(e.email_ai_officer)}
Direzione: ______________________________`,
      },
      {
        heading: "4. Protezione dei Suoi dati",
        content: `I dati personali e sanitari utilizzati dai sistemi AI sono trattati nel rispetto del GDPR (Regolamento UE 2016/679). Per informazioni complete sul trattamento dei dati personali si rimanda all'Informativa Privacy consegnata all'ammissione.

DPO (Data Protection Officer): ${fill(c.nome_dpo ?? e.nome_dpo)}
Email DPO: ${fill(c.email_dpo ?? e.email_dpo)}`,
      },
      {
        heading: "Ricevuta per Presa Visione",
        content: `Il/La sottoscritto/a ______________________________
in qualità di: □ Ospite  □ Familiare/Tutore dell'ospite ______________________________

dichiara di aver ricevuto e preso visione della presente Informativa sull'utilizzo di sistemi AI presso ${e.entity_name}.

Data: ______________________________
Firma: ______________________________

(Copia per la struttura — da conservare nel fascicolo dell'ospite)

Consegnata da: ______________________________  Data: ______________________________`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Informativa Trasparenza AI Act | ${today()}`,
    metadata: {
      norma: "Regolamento (UE) 2024/1689 — AI Act",
      articoli: "Art. 13, Art. 26 par. 8 AI Act",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildNominaAiOfficer(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Atto di Nomina — AI Officer",
    subtitle: "Art. 26 Regolamento (UE) 2024/1689 — AI Act — Responsabile Supervisione Sistemi AI",
    flagKey: "Flag_AIACT_Deployer",
    outputType: "docx",
    sections: [
      {
        heading: "Il Legale Rappresentante",
        content: `${fill(c.legale_rappresentante)}
in qualità di Legale Rappresentante di ${c.name}
per la struttura ${e.entity_name} (${e.entity_type}, ${e.region})`,
      },
      {
        heading: "Nomina",
        content: `NOMINA formalmente quale AI Officer il/la Sig./Sig.ra:

Nome e Cognome: ${fill(e.ai_officer)}
Ruolo in struttura: ______________________________
Email: ${fill(e.email_ai_officer)}
Telefono: ______________________________

quale responsabile della governance dei sistemi AI ad alto rischio in uso presso la struttura, ai sensi dell'Art. 26 del Regolamento (UE) 2024/1689 — AI Act.`,
      },
      {
        heading: "Responsabilità dell'AI Officer",
        content: `L'AI Officer ha le seguenti responsabilità:

1. INVENTARIO — mantenere aggiornato il registro dei sistemi AI in uso (supplier_systems).
2. CLASSIFICAZIONE — verificare e aggiornare la classificazione AI Act di ogni sistema.
3. CONFORMITÀ FORNITORI — richiedere e verificare la documentazione di conformità AI Act dei fornitori.
4. SUPERVISIONE — coordinare i supervisori umani designati per ogni sistema AI ad alto rischio.
5. FORMAZIONE — garantire che il personale riceva la formazione AI literacy richiesta dall'Art. 4.
6. INCIDENTI — gestire la procedura di notifica incidenti gravi AI Act.
7. FRIA — coordinare la redazione e l'aggiornamento della Fundamental Rights Impact Assessment.
8. REPORTING — riferire periodicamente alla Direzione sullo stato di conformità AI Act.`,
      },
      {
        heading: "Sistemi AI in Perimetro",
        content: `L'AI Officer esercita le proprie funzioni su tutti i sistemi AI in uso presso la struttura classificati come alto rischio o da classificare, inclusi quelli censiti nell'Inventario Sistemi Digitali CLAVIS.`,
      },
      {
        heading: "Firme",
        content: `Il Legale Rappresentante:
${fill(c.legale_rappresentante)}
Firma: ______________________________  Data: ${today()}

L'AI Officer nominato, per accettazione:
${fill(e.ai_officer)}
Firma: ______________________________  Data: ______________________________`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Nomina AI Officer | ${today()}`,
    metadata: {
      norma: "Regolamento (UE) 2024/1689 — AI Act",
      articoli: "Art. 26 AI Act — obblighi deployer sistemi ad alto rischio",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

function buildAutocertNoAiHighrisks(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Autocertificazione — Assenza Sistemi AI ad Alto Rischio",
    subtitle: "Art. 6 + Allegato III Regolamento (UE) 2024/1689 — AI Act",
    flagKey: "Flag_AIACT_HR_01",
    outputType: "pdf",
    sections: [
      {
        heading: "Il sottoscritto",
        content: `${fill(c.legale_rappresentante)}
in qualità di Legale Rappresentante di ${c.name}
per la struttura ${e.entity_name} (${e.entity_type}, ${e.region})`,
      },
      {
        heading: "DICHIARA",
        content: `Ai sensi dell'Art. 47 DPR 445/2000 e consapevole delle responsabilità penali previste dall'Art. 76 del medesimo decreto per le ipotesi di falsità in atti e dichiarazioni mendaci, che:

1. La struttura ${e.entity_name} ha effettuato una verifica sistematica di tutti i software e sistemi informatici in uso, con particolare riferimento alle categorie elencate nell'Allegato III del Regolamento (UE) 2024/1689 — AI Act.

2. Dalla verifica effettuata in data ${today()} risulta che NESSUN sistema in uso presso la struttura rientra nella categoria dei sistemi AI ad alto rischio ai sensi dell'Art. 6 par. 2 e dell'Allegato III AI Act.

3. In particolare, la struttura non utilizza sistemi AI per:
□ Supporto decisionale clinico (scoring rischio, alert parametri vitali, valutazione outcome)
□ Valutazione dell'ammissibilità alle cure
□ Monitoraggio automatizzato degli ospiti con output che influenzano decisioni cliniche
□ Profilazione degli ospiti con finalità di gestione delle cure

4. I software in uso sono stati classificati come:
□ Software gestionali rule-based senza componenti ML/AI
□ Software con funzionalità AI limitate al rischio minimo o limitato
□ Nessun software con componenti AI dichiarate dal fornitore`,
      },
      {
        heading: "Verifica Effettuata",
        content: `La verifica è stata condotta con le seguenti modalità:
□ Analisi del registro fornitori e dei contratti in essere
□ Richiesta di classificazione AI Act ai fornitori di software clinico
□ Valutazione interna con il supporto di CLAVIS — Inventario Sistemi Digitali

Elenco software verificati:
1. ______________________________  Fornitore: ______________________________  Esito: Non AI / Rule-based
2. ______________________________  Fornitore: ______________________________  Esito: Non AI / Rule-based
3. ______________________________  Fornitore: ______________________________  Esito: Non AI / Rule-based`,
      },
      {
        heading: "Impegno di Aggiornamento",
        content: `Il sottoscritto si impegna a rivalutare la presente dichiarazione e ad aggiornare la classificazione dei sistemi in uso in caso di:
- Adozione di nuovi software con potenziali componenti AI
- Aggiornamento significativo di software esistenti che introducano funzionalità algoritmiche
- Comunicazione da parte di fornitori di nuove caratteristiche AI dei sistemi forniti`,
      },
      {
        heading: "Firma",
        content: `${fill(c.legale_rappresentante)} — Legale Rappresentante
${c.name}
Firma: ______________________________

Data e luogo: ${today()}, ${fill(e.region)}

AI Officer (se designato): ${fill(e.ai_officer)}
Firma: ______________________________`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Autocertificazione No AI Alto Rischio | ${today()}`,
    metadata: {
      norma: "Regolamento (UE) 2024/1689 — AI Act",
      articoli: "Art. 6, Allegato III AI Act | Art. 47 DPR 445/2000",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

// ─── AUTOCERTIFICAZIONE ASSENZA SOFTWARE DISPOSITIVI MEDICI (PDF)

function buildAutocertNoMdr(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Autocertificazione — Assenza Software Dispositivi Medici",
    subtitle: "Art. 2 + Allegato VIII Regolamento (UE) 2017/745 — MDR",
    flagKey: "autocert_no_mdr",
    outputType: "pdf",
    sections: [
      {
        heading: "Premesse",
        content: `Il Regolamento (UE) 2017/745 (MDR), all'Art. 2 e all'Allegato VIII, definisce il software come dispositivo medico (SaMD) quando è destinato a essere utilizzato, da solo o in combinazione, per scopi medici quali diagnosi, prevenzione, monitoraggio, previsione, prognosi, trattamento o attenuazione di una malattia.

Il sottoscritto ${fill(c.legale_rappresentante)}, Legale Rappresentante di ${c.name} (P.IVA: ${fill(c.vat_number)}), per la struttura "${e.entity_name}" (${e.entity_type}, ${e.region}), rende la seguente dichiarazione ai sensi dell'Art. 47 DPR 445/2000.`,
      },
      {
        heading: "Dichiarazione",
        content: `Il sottoscritto DICHIARA che, a seguito di verifica sistematica di tutti i software e sistemi informatici in uso presso la struttura "${e.entity_name}" alla data ${today()}, NESSUN software in uso è classificabile come dispositivo medico ai sensi dell'Art. 2 e dell'Allegato VIII del Regolamento (UE) 2017/745 (MDR).

In particolare si dichiara che i software in uso non sono destinati, per concezione o destinazione d'uso del fabbricante, a finalità diagnostiche, terapeutiche o di monitoraggio clinico individuale che ne determinerebbero la qualificazione come dispositivo medico.`,
      },
      {
        heading: "Elenco Software Verificati",
        content: `Nome software | Fornitore | Esito verifica MDR
--------------------|----------------------|--------------------
____________________| ____________________ | □ Non SaMD — rule-based / gestionale puro
____________________| ____________________ | □ Non SaMD — rule-based / gestionale puro
____________________| ____________________ | □ Non SaMD — rule-based / gestionale puro
____________________| ____________________ | □ Non SaMD — rule-based / gestionale puro
____________________| ____________________ | □ Non SaMD — rule-based / gestionale puro

[Aggiungere righe secondo necessità]`,
      },
      {
        heading: "Impegno di Aggiornamento Annuale",
        content: `Il sottoscritto si impegna a:
- Rivalutare la presente dichiarazione con cadenza annuale entro il 31 gennaio di ogni anno
- Aggiornare immediatamente la classificazione in caso di adozione di nuovi software con potenziali finalità mediche
- Richiedere al fornitore dichiarazione scritta di non applicabilità del MDR per ogni nuovo software clinico adottato

Prossima revisione programmata: ______________________________`,
      },
      {
        heading: "Firma e Data",
        content: `${fill(c.legale_rappresentante)} — Legale Rappresentante
${c.name} — P.IVA: ${fill(c.vat_number)}

Struttura: ${e.entity_name} (${e.entity_type}, ${e.region})

Data: ${today()}
Firma: ______________________________`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Autocertificazione No MDR | ${today()}`,
    metadata: {
      norma: "Regolamento (UE) 2017/745 — MDR",
      articoli: "Art. 2 + Allegato VIII MDR Reg. UE 2017/745 | Art. 47 DPR 445/2000",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

// ─── RICHIESTA ATTIVAZIONE GATEWAY FSE 2.0 (DOCX)

function buildEmailRegioneFse(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: `Richiesta Attivazione Gateway FSE 2.0 — Regione ${e.region}`,
    subtitle: "Art. 4 DM 77/2022 + DPCM 7 settembre 2023",
    flagKey: "email_regione_fse",
    outputType: "docx",
    sections: [
      {
        heading: "Intestazione",
        content: `MITTENTE:
${c.name}
${e.entity_name} (${e.entity_type})
P.IVA: ${fill(c.vat_number)}
PEC: ${fill(c.pec)}
Referente tecnico: ${fill(e.responsabile_it)}

DESTINATARIO:
Regione ${e.region} — Direzione Welfare / Salute
Email/PEC regionale: ______________________________

Data: ${today()}`,
      },
      {
        heading: "Oggetto",
        content: `Richiesta attivazione interoperabilità FSE 2.0 — ${e.entity_name} — P.IVA ${fill(c.vat_number)}`,
      },
      {
        heading: "Corpo della Richiesta",
        content: `La scrivente struttura "${e.entity_name}", tipologia ${e.entity_type}, afferente a ${c.name} (P.IVA: ${fill(c.vat_number)}), operante nella Regione ${e.region}, in ottemperanza all'Art. 4 del DM 77/2022 e al DPCM 7 settembre 2023 in materia di Fascicolo Sanitario Elettronico 2.0 (FSE 2.0), richiede formalmente l'attivazione del gateway di interoperabilità per l'alimentazione del FSE 2.0.

Dati della struttura:
- Denominazione: ${e.entity_name}
- Tipologia: ${e.entity_type}
- Regione: ${e.region}
- Legale Rappresentante: ${fill(c.legale_rappresentante)}
- PEC: ${fill(c.pec)}

Fornitore software gestionale: ______________________________
Versione software in uso: ______________________________
Referente tecnico interno: ${fill(e.responsabile_it)}
Contatto referente tecnico: ______________________________

Si richiede pertanto:
1. Comunicazione delle credenziali di accesso al gateway FSE 2.0 regionale
2. Documentazione tecnica delle API e dei tracciati dati regionali
3. Indicazione del referente tecnico regionale per il coordinamento dell'integrazione
4. Eventuale accesso all'ambiente di test/collaudo prima della messa in produzione`,
      },
      {
        heading: "Allegati Richiesti dalla Regione",
        content: `□ ______________________________
□ ______________________________
□ ______________________________
□ ______________________________

[Compilare con gli allegati specifici richiesti dalla Regione ${e.region}]`,
      },
      {
        heading: "Firma",
        content: `In attesa di riscontro, porgiamo cordiali saluti.

${fill(c.legale_rappresentante)} — Legale Rappresentante
${c.name}

Data: ${today()}
Firma: ______________________________`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Richiesta FSE 2.0 Regione ${e.region} | ${today()} — Da inviare via PEC`,
    metadata: {
      norma: "DM 77/2022 — DPCM 7 settembre 2023",
      articoli: "Art. 4 DM 77/2022 + DPCM 07/09/2023 — FSE 2.0",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

// ─── PIANO DI TEST BCP — SIMULAZIONE ANNUALE (DOCX)

function buildPianificaTestBcp(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Piano di Test BCP — Simulazione Annuale",
    subtitle: "Art. 21 par. 2 lett. c D.Lgs. 138/2024 (NIS2)",
    flagKey: "pianifica_test_bcp",
    outputType: "docx",
    sections: [
      {
        heading: "01 — Obiettivi del Test",
        content: `Il presente Piano di Test BCP definisce la simulazione annuale obbligatoria del Business Continuity Plan ai sensi dell'Art. 21 par. 2 lett. c D.Lgs. 138/2024 (NIS2) per la struttura "${e.entity_name}" (${e.entity_type}, ${e.region}) — ${c.name}.

Obiettivi della simulazione:
- Verificare la funzionalità delle procedure di continuità operativa in condizioni di stress controllate
- Identificare gap tra le procedure documentate e la loro applicabilità pratica
- Formare il personale chiave alla gestione delle crisi informatiche
- Documentare gli esiti per adempimento normativo NIS2 e miglioramento continuo`,
      },
      {
        heading: "02 — Scenario di Simulazione",
        content: `La simulazione prevede i seguenti scenari precompilati (scegliere uno o eseguire entrambi):

SCENARIO A — Ransomware su gestionale clinico
Descrizione: alle ore 08:30 il personale rileva che il gestionale clinico è inaccessibile. Un messaggio di riscatto compare sui terminali. I dati degli ospiti risultano cifrati.
Domande chiave: Chi viene notificato e in quale ordine? Quando si attivano le procedure cartacee? Entro quanto viene contattato il fornitore IT? Viene notificato ACN entro 24h?

SCENARIO B — Interruzione connettività Internet
Descrizione: il router principale cessa di funzionare alle 14:00. La connettività Internet è assente. Il gestionale SaaS risulta irraggiungibile. La linea backup non si attiva automaticamente.
Domande chiave: Esiste un accesso offline al gestionale? Dove sono le ultime stampe delle terapie? Come vengono gestite le comunicazioni con i familiari?`,
      },
      {
        heading: "03 — Partecipanti",
        content: `Ruolo                    | Nome                              | Contatto
-------------------------|-----------------------------------|---------
Responsabile IT          | ${fill(e.responsabile_it)}        | ______________________________
DPO / Referente Privacy  | ${fill(e.nome_dpo)}               | ______________________________
Legale Rappresentante    | ${fill(c.legale_rappresentante)}  | ______________________________
Direttore Sanitario      | ______________________________    | ______________________________
Coordinatore Infermieri  | ______________________________    | ______________________________
Fornitore IT esterno     | ______________________________    | ______________________________

[Aggiungere righe secondo necessità]`,
      },
      {
        heading: "04 — Data e Luogo Pianificati",
        content: `Data simulazione: ______________________________
Ora inizio: ______________________________
Ora fine prevista: ______________________________
Luogo / modalità: ______________________________  (presenza / remoto / misto)

Comunicazione ai partecipanti entro: ______________________________
Referente organizzativo: ______________________________`,
      },
      {
        heading: "05 — Criteri di Successo",
        content: "La simulazione si considera superata se:",
        isList: true,
        items: [
          "Attivazione procedure cartacee entro 30 minuti dall'inizio dello scenario",
          "Identificazione del coordinatore IRT entro 15 minuti",
          "Comunicazione al Legale Rappresentante entro 1 ora",
          "Corretta identificazione della soglia di notifica ACN (incidente significativo NIS2)",
          "Tutto il personale partecipante sa dove trovare il registro cartaceo di emergenza",
          "Nessuna somministrazione farmaci bloccata per più di 2 ore durante la simulazione",
        ],
      },
      {
        heading: "06 — Verbale Post-Test",
        content: `[Da compilare al termine della simulazione]

Data esecuzione: ______________________________
Scenario eseguito: ______________________________
Durata effettiva: ______________________________

Esito complessivo: □ Superato  □ Parzialmente superato  □ Non superato

Gap rilevati:
1. ______________________________
2. ______________________________
3. ______________________________

Azioni correttive:
1. ______________________________  Responsabile: ______________________________  Scadenza: ______
2. ______________________________  Responsabile: ______________________________  Scadenza: ______

Note aggiuntive: ______________________________`,
      },
      {
        heading: "07 — Firma Direttore e Responsabile IT",
        content: `Il Legale Rappresentante / Direttore:
${fill(c.legale_rappresentante)} — ${c.name}
Data: ______________________________  Firma: ______________________________

Il Responsabile IT:
${fill(e.responsabile_it)}
Data: ______________________________  Firma: ______________________________`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Piano Test BCP ${new Date().getFullYear()} | ${today()} — Da archiviare come evidenza NIS2`,
    metadata: {
      norma: "D.Lgs. 138/2024 (NIS2)",
      articoli: "Art. 21 par. 2 lett. c D.Lgs. 138/2024 — test continuità operativa",
      dataGenerazione: todayISO(),
      disclaimerLegale: DISCLAIMER,
    },
  };
}

