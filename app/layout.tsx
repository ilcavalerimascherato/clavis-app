// app/layout.tsx
// Root layout CLAVIS — provider globali, font, metadata

import type { Metadata } from 'next'
import './globals.css'
import { EntityProvider } from '@/contexts/EntityContext'

export const metadata: Metadata = {
  title: {
    default: 'CLAVIS',
    template: '%s — CLAVIS',
  },
  description: 'Governance Normativa per Strutture Sociosanitarie',
  robots: {
    index: false,   // app privata — non indicizzare
    follow: false,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body className="clavis-bg antialiased min-h-screen">
        <EntityProvider>
          {children}
        </EntityProvider>
      </body>
    </html>
  )
}
