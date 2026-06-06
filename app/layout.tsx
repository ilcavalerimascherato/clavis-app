// app/layout.tsx
// Root layout CLAVIS — provider globali, font, metadata

import type { Metadata } from 'next'
import Script from 'next/script'
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
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-M3X5C30MC7"
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-M3X5C30MC7');
        `}</Script>
      </head>
      <body className="clavis-bg antialiased min-h-screen">
        <EntityProvider>
          {children}
        </EntityProvider>
      </body>
    </html>
  )
}
