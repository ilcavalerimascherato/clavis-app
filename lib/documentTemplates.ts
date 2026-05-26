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
  // Campi nominativi — arrivano da entities/companies o dal form del modal
  legale_rappresentante?: string | null;
  nome_dpo?:              string | null;
  email_dpo?:             string | null;
  dpo_qualifica?:         string | null;
  dpo_telefono?:          string | null;
  responsabile_it?:       string | null;
}

export interface CompanyData {
  name: string;
  vat_number?: string | null;
  legal_address?: string | null;
  modello_231?: string | null;
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

export function buildDocument(flagKey: string, entity: EntityData, company: CompanyData): DocumentOutput | null {
  switch (flagKey) {
    case "Flag_GDPR_DPO":        return buildNominaDPO(entity, company);
    case "Flag_NIS2_BCP":        return buildBCP(entity, company);
    case "Flag_NIS2_IRP":        return buildIRP(entity, company);
    case "Flag_GDPR_Breach":     return buildProceduraBreachPDF(entity, company);
    case "Flag_NIS2_CdA":        return buildDeliberaCdA(entity, company);
    case "Flag_D231_BYOD":       return buildPolicyBYOD(entity, company);
    case "Flag_D231_ShadowAI":   return buildCircolareAI(entity, company);
    case "Flag_GDPR_Messaging":  return buildPolicyMessaggistica(entity, company);
    case "Flag_AIACT_Literacy":  return buildRegistroPresenze(entity, company);
    case "Flag_D231_Formazione": return buildPianoFormativo(entity, company);
    case "Flag_GDPR_DPIA":       return buildAvvioProceduraDPIA(entity, company);
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
};

// ─── 1. NOMINA DPO (PDF)

function buildNominaDPO(e: EntityData, c: CompanyData): DocumentOutput {
  return {
    title: "Atto di Nomina del Responsabile della Protezione dei Dati",
    subtitle: "Data Protection Officer — Art. 37 Regolamento (UE) 2016/679",
    flagKey: "Flag_GDPR_DPO",
    outputType: "pdf",
    sections: [
      {
        heading: "Premesse",
        content: `Il Regolamento (UE) 2016/679 (GDPR), all'Art. 37, par. 1, lett. c), stabilisce l'obbligo di designare un Responsabile della Protezione dei Dati (Data Protection Officer — DPO) per i soggetti che effettuano, su larga scala, trattamenti di categorie particolari di dati ai sensi dell'Art. 9 GDPR, tra cui i dati relativi alla salute.

${c.name}, in qualità di Titolare del Trattamento per la struttura "${e.entity_name}" (${e.entity_type}, ${e.region}), che eroga servizi sociosanitari residenziali e tratta sistematicamente dati sanitari degli ospiti, è soggetto all'obbligo di nomina del DPO.`,
      },
      {
        heading: "Designazione",
        content: `Con il presente atto, ${c.name} — C.F./P.IVA: ${c.vat_number ?? "______________________"}, con sede legale in ${c.legal_address ?? "______________________"} — designa quale Responsabile della Protezione dei Dati:

Nome e Cognome: ${fill(e.nome_dpo)}
Qualifica / Rapporto con il Titolare: ${fill(e.dpo_qualifica)}
Recapito email dedicato DPO: ${fill(e.email_dpo)}
Recapito telefonico: ${fill(e.dpo_telefono)}`,
      },
      {
        heading: "Compiti del DPO",
        content: "Ai sensi dell'Art. 39 GDPR, il DPO designato è incaricato di:",
        isList: true,
        items: [
          "Informare e consigliare il Titolare, i responsabili del trattamento e i dipendenti in merito agli obblighi derivanti dal GDPR e dalla normativa nazionale applicabile (D.Lgs. 196/2003 s.m.i.)",
          "Sorvegliare l'osservanza del Regolamento, delle politiche del Titolare in materia di protezione dei dati personali, compresi l'attribuzione delle responsabilità, la sensibilizzazione e la formazione del personale",
          "Fornire, se richiesto, un parere in merito alla valutazione d'impatto sulla protezione dei dati (DPIA) ex Art. 35 GDPR e sorvegliarne lo svolgimento",
          "Cooperare con il Garante per la Protezione dei Dati Personali e fungere da punto di contatto per il Garante su tutte le questioni connesse al trattamento",
          "Tenere aggiornato il Registro dei Trattamenti ex Art. 30 GDPR",
          "Gestire le richieste degli interessati ex Artt. 15-22 GDPR (accesso, rettifica, cancellazione, portabilità, opposizione)",
          "Coordinare la gestione dei data breach ex Art. 33-34 GDPR",
        ],
      },
      {
        heading: "Indipendenza e Risorse",
        content: `Il DPO opera in piena indipendenza, non riceve istruzioni riguardo all'esecuzione dei propri compiti e riferisce direttamente al vertice gerarchico del Titolare. ${c.name} si impegna a fornire al DPO le risorse necessarie allo svolgimento dei compiti, l'accesso ai dati personali e ai trattamenti, nonché il mantenimento delle competenze specialistiche.

Il DPO è raggiungibile dagli interessati (ospiti, familiari, dipendenti) tramite il recapito dedicato indicato al paragrafo precedente, pubblicato ai sensi dell'Art. 37, par. 7 GDPR.`,
      },
      {
        heading: "Comunicazione al Garante",
        content: `Il Titolare provvederà a comunicare i dati di contatto del DPO al Garante per la Protezione dei Dati Personali tramite il portale istituzionale (https://www.gpdp.it), ai sensi dell'Art. 37, par. 7 GDPR, entro 30 giorni dalla presente designazione.`,
      },
      {
        heading: "Durata e Revoca",
        content: `La presente nomina ha efficacia dalla data di sottoscrizione e rimane valida a tempo indeterminato, salvo revoca motivata comunicata per iscritto. In caso di cessazione dall'incarico, il Titolare si impegna a procedere a nuova designazione senza soluzione di continuità.`,
      },
      {
        heading: "Firme",
        content: `Data: ${today()}
Luogo: ${e.region}

Per ${c.name} — Il Legale Rappresentante:
Nome: ${fill(e.legale_rappresentante)}
Firma: ______________________________

Il DPO designato, per accettazione:
Nome: ${fill(e.nome_dpo)}
Firma: ______________________________`,
      },
    ],
    footer: `${c.name} | ${e.entity_name} | Generato da CLAVIS il ${today()}`,
    metadata: {
      norma: "Regolamento (UE) 2016/679 — GDPR",
      articoli: "Art. 37, 38, 39 GDPR — D.Lgs. 196/2003 s.m.i.",
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
