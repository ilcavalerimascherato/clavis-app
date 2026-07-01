/**
 * CLAVIS — Componente PDF condiviso (@react-pdf/renderer)
 * Estratto da GenerateDocModal.tsx per essere riusabile anche
 * da flussi di generazione PDF al di fuori del modal generico
 * (es. DPA fornitore in app/fornitori/page.tsx).
 */

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { DocumentOutput } from "@/lib/documentTemplates";

export const pdfStyles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 52,
    backgroundColor: "#FFFFFF",
    color: "#1A1A2E",
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: "#1A3A6B",
    paddingBottom: 12,
    marginBottom: 20,
  },
  logoArea: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  clavisLabel: {
    fontSize: 8,
    color: "#6B7FA3",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  dateLabel: {
    fontSize: 8,
    color: "#6B7FA3",
  },
  title: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: "#0A1628",
    marginBottom: 4,
    lineHeight: 1.3,
  },
  subtitle: {
    fontSize: 9,
    color: "#4A6FA5",
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  normaTag: {
    fontSize: 7.5,
    color: "#6B7FA3",
    marginTop: 4,
  },
  section: {
    marginBottom: 14,
  },
  sectionHeading: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#1A3A6B",
    backgroundColor: "#F0F4FF",
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: "#3A6DF0",
  },
  paragraph: {
    fontSize: 9.5,
    lineHeight: 1.55,
    color: "#2A2A3E",
    marginBottom: 4,
  },
  listItem: {
    fontSize: 9.5,
    lineHeight: 1.55,
    color: "#2A2A3E",
    marginBottom: 3,
    paddingLeft: 12,
  },
  listBullet: {
    fontSize: 9.5,
    color: "#3A6DF0",
    marginRight: 4,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 3,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 52,
    right: 52,
    borderTopWidth: 0.5,
    borderTopColor: "#C8D0E4",
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 7,
    color: "#8A95B4",
  },
  disclaimer: {
    fontSize: 7,
    color: "#9AA3BD",
    marginTop: 16,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: "#E0E4F0",
    lineHeight: 1.4,
    fontStyle: "italic",
  },
  pageNumber: {
    fontSize: 7,
    color: "#8A95B4",
    textAlign: "right",
  },
});

export function ClavisPdfDocument({ doc }: { doc: DocumentOutput }) {
  return (
    <Document
      title={doc.title}
      author="CLAVIS — Governance Normativa"
      subject={doc.metadata.norma}
      creator="CLAVIS"
      producer="CLAVIS"
    >
      <Page size="A4" style={pdfStyles.page}>

        {/* Header */}
        <View style={pdfStyles.header}>
          <View style={pdfStyles.logoArea}>
            <Text style={pdfStyles.clavisLabel}>CLAVIS — Governance Normativa</Text>
            <Text style={pdfStyles.dateLabel}>{doc.metadata.dataGenerazione}</Text>
          </View>
          <Text style={pdfStyles.title}>{doc.title}</Text>
          <Text style={pdfStyles.subtitle}>{doc.subtitle}</Text>
          <Text style={pdfStyles.normaTag}>{doc.metadata.articoli}</Text>
        </View>

        {/* Sezioni */}
        {doc.sections.map((section, idx) => (
          <View key={idx} style={pdfStyles.section}>
            <Text style={pdfStyles.sectionHeading}>{section.heading}</Text>
            {section.isList && section.items ? (
              section.items.map((item, i) => (
                <View key={i} style={pdfStyles.listRow}>
                  <Text style={pdfStyles.listBullet}>•</Text>
                  <Text style={pdfStyles.listItem}>{item}</Text>
                </View>
              ))
            ) : (
              <Text style={pdfStyles.paragraph}>{section.content}</Text>
            )}
          </View>
        ))}

        {/* Disclaimer */}
        <Text style={pdfStyles.disclaimer}>{doc.metadata.disclaimerLegale}</Text>

        {/* Footer */}
        <View style={pdfStyles.footer} fixed>
          <Text style={pdfStyles.footerText}>{doc.footer}</Text>
          <Text style={pdfStyles.pageNumber} render={({ pageNumber, totalPages }) =>
            `${pageNumber} / ${totalPages}`
          } />
        </View>
      </Page>
    </Document>
  );
}
