import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

const STAMP_GREEN = rgb(0.102, 0.420, 0.227); // #1a6b3a

export async function POST(req: NextRequest) {
  const {
    documento_path,
    bucket = "compliance-docs",
    cert_id,
    certified_at,
  } = await req.json();

  if (!documento_path || !cert_id || !certified_at) {
    return NextResponse.json({ error: "documento_path, cert_id e certified_at richiesti" }, { status: 400 });
  }

  if (!documento_path.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Il timbro è supportato solo per documenti PDF" }, { status: 415 });
  }

  const supabase = await createClient();

  // 1. Scarica PDF originale da Storage
  const { data: fileData, error: downloadError } = await supabase.storage
    .from(bucket)
    .download(documento_path);

  if (downloadError || !fileData) {
    return NextResponse.json({ error: "File non trovato" }, { status: 404 });
  }

  // 2. Scarica QR code da api.qrserver.com
  const verifyUrl = `https://clavisapp.it/verifica/${cert_id}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(verifyUrl)}&bgcolor=ffffff&color=1a6b3a`;

  const qrResponse = await fetch(qrUrl);
  if (!qrResponse.ok) {
    return NextResponse.json({ error: "Generazione QR code fallita" }, { status: 502 });
  }
  const qrBytes = await qrResponse.arrayBuffer();

  // 3. Carica PDF con pdf-lib
  const pdfBytes = await fileData.arrayBuffer();
  let pdfDoc: PDFDocument;
  try {
    pdfDoc = await PDFDocument.load(pdfBytes);
  } catch {
    return NextResponse.json({ error: "PDF non valido o corrotto" }, { status: 422 });
  }
  const firstPage = pdfDoc.getPages()[0];
  if (!firstPage) {
    return NextResponse.json({ error: "PDF senza pagine" }, { status: 422 });
  }
  const { width, height } = firstPage.getSize();

  // 4. Embed QR image
  const qrImage = await pdfDoc.embedPng(qrBytes);

  // 5. Dimensioni timbro
  const stampW = 160;
  const stampH = 90;
  const margin = 20;
  const x = width - stampW - margin;
  const y = height - stampH - margin;

  // 6. Disegna rettangolo timbro
  // Banda verde sinistra
  firstPage.drawRectangle({
    x,
    y,
    width: 35,
    height: stampH,
    color: STAMP_GREEN,
    borderWidth: 0,
  });

  // Corpo bianco con bordo verde
  firstPage.drawRectangle({
    x: x + 35,
    y,
    width: stampW - 35,
    height: stampH,
    color: rgb(1, 1, 1),
    borderColor: STAMP_GREEN,
    borderWidth: 1.5,
  });

  // Bordo verde attorno all'intero timbro (nessun fill, solo contorno)
  firstPage.drawRectangle({
    x,
    y,
    width: stampW,
    height: stampH,
    borderColor: STAMP_GREEN,
    borderWidth: 1.5,
  });

  // 7. QR code nella banda verde
  firstPage.drawImage(qrImage, {
    x: x + 2,
    y: y + 5,
    width: 31,
    height: 31,
  });

  // 8. Testo "CLAVIS" sopra QR
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  firstPage.drawText("CLAVIS", {
    x: x + 3,
    y: y + stampH - 14,
    size: 7,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });

  // 9. Testo corpo timbro
  firstPage.drawText("DOCUMENTO CERTIFICATO", {
    x: x + 40,
    y: y + stampH - 14,
    size: 6,
    font: helveticaBold,
    color: STAMP_GREEN,
  });

  firstPage.drawText("CONFORME", {
    x: x + 40,
    y: y + stampH - 32,
    size: 14,
    font: helveticaBold,
    color: STAMP_GREEN,
  });

  firstPage.drawText(`Verificato da CLAVIS Governance Normativa`, {
    x: x + 40,
    y: y + stampH - 48,
    size: 5.5,
    font: helvetica,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Linea separatrice
  firstPage.drawLine({
    start: { x: x + 40, y: y + stampH - 55 },
    end: { x: x + stampW - 5, y: y + stampH - 55 },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });

  firstPage.drawText(`Data: ${new Date(certified_at).toLocaleDateString("it-IT")}`, {
    x: x + 40,
    y: y + stampH - 66,
    size: 5.5,
    font: helvetica,
    color: rgb(0.4, 0.4, 0.4),
  });

  firstPage.drawText(`ID: ${String(cert_id).substring(0, 8).toUpperCase()}`, {
    x: x + 40,
    y: y + stampH - 76,
    size: 5.5,
    font: helvetica,
    color: rgb(0.4, 0.4, 0.4),
  });

  firstPage.drawText(`clavisapp.it/verifica/${String(cert_id).substring(0, 8)}...`, {
    x: x + 40,
    y: y + stampH - 86,
    size: 4.5,
    font: helvetica,
    color: rgb(0.6, 0.6, 0.6),
  });

  // 10. Serializza e risalva su Storage
  const stampedPdfBytes = await pdfDoc.save();

  const stampedPath = documento_path.replace(/\.pdf$/i, "_certified.pdf");

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(stampedPath, stampedPdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: "Errore salvataggio" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    stamped_path: stampedPath,
  });
}
