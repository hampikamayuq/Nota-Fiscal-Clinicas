import type { ReactNode } from 'react';

type Props = { trilha?: ReactNode; titulo: string; descricao?: string; acoes?: ReactNode };

export function PageHeader({ trilha, titulo, descricao, acoes }: Props) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b pb-6">
      <div className="min-w-0">
        {trilha && <nav aria-label="Você está em" className="mb-2 text-sm text-muted-foreground">{trilha}</nav>}
        <h1 className="text-3xl leading-tight">{titulo}</h1>
        {descricao && <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </header>
  );
}
