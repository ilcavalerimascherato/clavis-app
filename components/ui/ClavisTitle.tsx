/**
 * components/ui/ClavisTitle.tsx
 *
 * Componente base per tutti i titoli di CLAVIS.
 * Regola UI obbligatoria: italiano principale + inglese ridimensionato tra parentesi.
 *
 * Utilizzo:
 *   <ClavisTitle it="Analisi del Rischio" en="Risk Analysis" />
 *   <ClavisTitle it="Wizard di Triage Normativo" en="Regulatory Triage Wizard" as="h1" />
 */

import { cn } from '@/lib/utils';

type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4';

interface ClavisTitleProps {
  it: string;                    // Titolo italiano — principale
  en: string;                    // Dizione inglese — secondaria
  as?: HeadingLevel;
  className?: string;
  enClassName?: string;
  variant?: 'page' | 'section' | 'card';
}

const variantStyles: Record<string, { it: string; en: string }> = {
  page: {
    it: 'text-2xl font-bold uppercase tracking-widest text-zinc-100',
    en: 'text-sm font-mono text-zinc-500 tracking-wide',
  },
  section: {
    it: 'text-base font-bold uppercase tracking-wider text-zinc-200',
    en: 'text-xs font-mono text-zinc-600 tracking-wide',
  },
  card: {
    it: 'text-sm font-bold uppercase tracking-wide text-zinc-300',
    en: 'text-xs font-mono text-zinc-700 tracking-wide',
  },
};

export function ClavisTitle({
  it,
  en,
  as: Tag = 'h2',
  className,
  enClassName,
  variant = 'section',
}: ClavisTitleProps) {
  const styles = variantStyles[variant];

  return (
    <Tag className={cn('flex flex-col gap-0.5', className)}>
      <span className={styles.it}>{it}</span>
      <span className={cn(styles.en, enClassName)}>({en})</span>
    </Tag>
  );
}

// ─── Versione inline per contesti compatti ────────────────────────────────────

interface ClavisTitleInlineProps {
  it: string;
  en: string;
  className?: string;
}

export function ClavisTitleInline({ it, en, className }: ClavisTitleInlineProps) {
  return (
    <div className={cn('flex flex-col', className)}>
      <span className="font-bold uppercase tracking-wider text-zinc-100">{it}</span>
      <span className="text-xs font-mono text-zinc-600">({en})</span>
    </div>
  );
}
