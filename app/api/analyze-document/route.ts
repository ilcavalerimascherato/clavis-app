import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as XLSX from "xlsx";

export async function POST(req: NextRequest) {
  try {
    const { filePath, documentType } = await req.json();

    if (!filePath || !documentType) {
      return NextResponse.json(
        { error: "filePath e documentType richiesti" },
        { status: 400 }
      );
    }

    // 1. Scarica il file da Supabase Storage
    const supabase = await createClient();
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from("supplier-docs")
      .download(filePath);

    if (downloadError || !fileData) {
      return NextResponse.json(
        { error: "File non trovato: " + downloadError?.message },
        { status: 404 }
      );
    }

    const arrayBuffer = await fileData.arrayBuffer();

    // 2. Rileva formato
    const isExcel =
      filePath.endsWith(".xlsx") || filePath.endsWith(".xls");

    // 3. Prepara il prompt in base al tipo documento
    const prompt =
      documentType === "REGISTRO_TRATTAMENTI"
        ? `Sei un esperto di GDPR, NIS2 e compliance sanitaria.
Analizza questo Registro dei Trattamenti (Art. 30 GDPR).
Il documento può essere in formato PDF descrittivo
o tabellare (Excel/CSV) — adatta l'estrazione al formato.

Per ogni trattamento identificato restituisci:
{
  "trattamenti": [
    {
      "trattamento": "nome/natura del trattamento",
      "id_trattamento": "numero ID se presente",
      "direzione": "direzione o funzione responsabile",
      "responsabile_interno": "nome responsabile interno se presente",
      "unita_organizzativa": "reparto o ufficio se presente",
      "categorie_interessati": ["Clienti", "Dipendenti", "Fornitori", "Pazienti"],
      "documento_riferimento": "documento da cui nasce il trattamento",
      "categorie_dati": ["PERSONALI", "SANITARI", "AMMINISTRATIVI", "BIOMETRICI", "PARTICOLARI"],
      "dati_specifici": "descrizione dati trattati",
      "operazioni": ["raccolta", "registrazione", "conservazione", "comunicazione"],
      "finalita": "finalità del trattamento",
      "base_giuridica": "contratto / consenso / obbligo legale / interesse legittimo",
      "destinatari_interni": "chi internamente accede ai dati",
      "destinatari_esterni": ["nome responsabile o destinatario esterno"],
      "formato_cartaceo": "descrizione banca dati cartacea se presente",
      "formato_digitale": "descrizione banca dati digitale se presente",
      "durata_trattamento": "periodo di trattamento",
      "durata_conservazione": "periodo di conservazione es. 10 anni",
      "misure_tecniche": "misure di sicurezza tecniche adottate",
      "misure_organizzative": "misure di sicurezza organizzative adottate",
      "misure_fisiche": "misure di sicurezza fisiche adottate",
      "misure_sicurezza": "sintesi di tutte le misure se non distinte",
      "informativa_resa": true,
      "consenso_richiesto": false,
      "trasferimenti_extra_ue": false,
      "note": "note aggiuntive rilevanti",
      "triage_hints": {
        "ha_accesso_elettronico": true,
        "ha_backup": false,
        "ha_credenziali_accesso": true,
        "ha_logging": false,
        "ha_cifratura": false,
        "ha_formazione_personale": false,
        "ha_procedure_data_breach": false,
        "usa_cloud_esterno": false,
        "dati_extra_ue": false
      }
    }
  ],
  "meta": {
    "titolare_trattamento": "nome titolare",
    "dpo": "nome DPO se presente",
    "data_documento": "data del documento se presente",
    "versione": "versione documento se presente",
    "totale_trattamenti": 5,
    "tipo_organizzazione": "es. SSD, RSA, Studio medico, Palestra"
  }
}

ISTRUZIONI:
- Estrai TUTTI i trattamenti presenti nel documento
- Se un campo non è presente lascia stringa vuota o array vuoto
- Per triage_hints: inferisci dal testo delle misure di sicurezza
  (es. "user ID e password" → ha_credenziali_accesso: true)
- I destinatari_esterni diventano potenziali fornitori da censire
- Rispondi SOLO con il JSON valido, senza testo aggiuntivo,
  senza backtick, senza markdown`
        : `Sei un esperto di compliance NIS2 e GDPR. Analizza questo Registro Fornitori e estrai i dati in formato JSON strutturato.

Per ogni fornitore identificato restituisci:
{
  "fornitori": [
    {
      "ragione_sociale": "nome fornitore",
      "piva": "partita iva se presente",
      "servizio": "descrizione servizio",
      "categoria": "una di: SOFTWARE_GESTIONALE, INFRASTRUTTURA_IT, DISPOSITIVI_CONNESSI, SERVIZI_ESTERNI",
      "dati_trattati": ["SANITARI", "PERSONALI", "AMMINISTRATIVI"],
      "dpa_firmato": true,
      "note": "eventuali note"
    }
  ]
}

Estrai TUTTI i fornitori presenti nel documento.
Rispondi SOLO con il JSON, senza testo aggiuntivo, senza backtick, senza markdown.`;

    // 4. Costruisci il body per Claude in base al formato
    let claudeMessages: object[];

    if (isExcel) {
      // ── PERCORSO EXCEL: converti in testo CSV e invia come testo
      const buffer = Buffer.from(arrayBuffer);
      const workbook = XLSX.read(buffer, { type: "buffer" });

      // Cerca il foglio "TRATTAMENT*" oppure usa il primo
      const sheetName =
        workbook.SheetNames.find(n =>
          n.toUpperCase().includes("TRATTAMENT")
        ) ?? workbook.SheetNames[0];

      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
        header: 1,
        defval: "",
      });

      // Converti in testo pipe-separated (CSV leggibile da Claude)
      const csvText = rows
        .map(row => row.join(" | "))
        .join("\n");

      const excelPrompt = `${prompt}\n\nDati del registro in formato tabellare:\n${csvText}`;

      claudeMessages = [
        {
          role: "user",
          content: excelPrompt,
        },
      ];
    } else {
      // ── PERCORSO PDF: invia come document base64
      const base64 = Buffer.from(arrayBuffer).toString("base64");

      claudeMessages = [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64,
              },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ];
    }

    // 5. Chiama Claude API
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        messages: claudeMessages,
      }),
    });

    console.log("Claude response status:", response.status);
    const responseText = await response.text();
    console.log("Claude response body:", responseText.substring(0, 500));

    if (!response.ok) {
      return NextResponse.json(
        { error: "Claude API error: " + responseText },
        { status: 500 }
      );
    }

    const claudeData = JSON.parse(responseText);
    const rawText = claudeData.content
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("");

    // 6. Parse JSON
    let parsed;
    try {
      const clean = rawText
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();
      parsed = JSON.parse(clean);
    } catch {
      return NextResponse.json(
        { error: "Parsing JSON fallito", raw: rawText },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: parsed,
      documentType,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Errore sconosciuto";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
