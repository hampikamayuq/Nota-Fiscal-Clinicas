import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Campo } from '@/components/campo';
import { centavosDe, reais } from '@/lib/format';

export type DadosItem = { name: string; description: string; tussCode: string | null; quantity: number; unitAmountCents: number };

type Props = {
  aberto: boolean;
  titulo: string;
  inicial: DadosItem;
  travas: { descricao: boolean; valor: boolean };
  pendente: boolean;
  onSalvar: (d: DadosItem) => void;
  onFechar: () => void;
};

/** Edição de um item antes da emissão (plano, §13): nome, descrição, TUSS, quantidade, valor. */
export function ItemDialog({ aberto, titulo, inicial, travas, pendente, onSalvar, onFechar }: Props) {
  const [nome, setNome] = useState(inicial.name);
  const [descricao, setDescricao] = useState(inicial.description);
  const [tuss, setTuss] = useState(inicial.tussCode ?? '');
  const [quantidade, setQuantidade] = useState(String(inicial.quantity));
  const [valor, setValor] = useState((inicial.unitAmountCents / 100).toFixed(2).replace('.', ','));

  const centavos = centavosDe(valor);
  const qtd = Number(quantidade);
  const problemas = [
    !nome.trim() && 'nome do serviço',
    !descricao.trim() && 'descrição',
    tuss && !/^\d{8}$/.test(tuss) && 'TUSS com 8 dígitos',
    !(Number.isInteger(qtd) && qtd >= 1) && 'quantidade inteira a partir de 1',
    centavos === null && 'valor em reais',
  ].filter(Boolean) as string[];
  const total = centavos !== null && Number.isInteger(qtd) ? centavos * qtd : null;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (problemas.length || centavos === null) return;
    onSalvar({ name: nome.trim(), description: descricao.trim(), tussCode: tuss || null, quantity: qtd, unitAmountCents: centavos });
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>O que mudar aqui vale só para esta nota; o catálogo continua igual.</DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="grid gap-4" noValidate>
          <Campo id="i-nome" label="Nome exibido">
            <Input id="i-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </Campo>
          <Campo id="i-desc" label="Descrição na nota" dica={travas.descricao ? 'Este serviço não permite mudar a descrição.' : 'Procedimento, nunca diagnóstico ou CID: a nota é pública.'}>
            <Textarea id="i-desc" rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} disabled={travas.descricao} />
          </Campo>
          <div className="grid grid-cols-3 gap-3">
            <Campo id="i-tuss" label="TUSS">
              <Input id="i-tuss" inputMode="numeric" maxLength={8} value={tuss} onChange={(e) => setTuss(e.target.value.replace(/\D/g, ''))} />
            </Campo>
            <Campo id="i-qtd" label="Quantidade">
              <Input id="i-qtd" inputMode="numeric" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
            </Campo>
            <Campo id="i-valor" label="Valor unitário (R$)" dica={travas.valor ? 'Valor fixo neste serviço.' : undefined}>
              <Input id="i-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} disabled={travas.valor} className="tabular" />
            </Campo>
          </div>
          <p className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">{problemas.length ? `Falta: ${problemas.join(', ')}.` : 'Total do item'}</span>
            <span className="tabular font-medium">{total !== null ? reais(total) : '—'}</span>
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente || problemas.length > 0}>
              {pendente ? 'Salvando…' : 'Salvar item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
