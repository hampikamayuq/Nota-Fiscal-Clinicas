import { describe, expect, it } from 'vitest';
import { acaoDaFila, guardarMemoria, lerMemoria, linkWhatsApp, mensagemWhatsApp, prefillDeUrl } from './emissao';

describe('WhatsApp', () => {
  it('mensagem com primeiro nome, número, empresa, valor e link público', () => {
    expect(mensagemWhatsApp({ paciente: 'Maria de Souza', numero: '1234', empresa: 'Clínica Exemplo', totalCents: 70000, pdfUrl: 'https://x/p.pdf' })).toBe(
      'Olá, Maria. Segue a sua nota fiscal nº 1234 da Clínica Exemplo, no valor de R$ 700,00: https://x/p.pdf',
    );
  });
  it('telefone com 10 ou 11 dígitos vai no link; sem telefone, a recepção escolhe o contato', () => {
    expect(linkWhatsApp('21999990000', 'oi')).toBe('https://wa.me/5521999990000?text=oi');
    expect(linkWhatsApp('(21) 3333-4444', 'oi')).toBe('https://wa.me/552133334444?text=oi');
    expect(linkWhatsApp(null, 'olá, você')).toBe('https://wa.me/?text=ol%C3%A1%2C%20voc%C3%AA');
    expect(linkWhatsApp('12345', 'oi')).toBe('https://wa.me/?text=oi');
  });
});

describe('prefill da nova nota', () => {
  const empresas = [{ id: 'e1' }, { id: 'e2' }];
  it('a URL vence a memória, que vence a empresa única', () => {
    expect(prefillDeUrl(new URLSearchParams('empresa=e2&profissional=p9&paciente=pa'), { empresa: 'e1', profissional: 'p1' }, empresas)).toEqual({ empresa: 'e2', profissional: 'p9', paciente: 'pa' });
    expect(prefillDeUrl(new URLSearchParams(''), { empresa: 'e1', profissional: 'p1' }, empresas)).toEqual({ empresa: 'e1', profissional: 'p1', paciente: null });
    expect(prefillDeUrl(new URLSearchParams(''), null, [{ id: 'e1' }])).toEqual({ empresa: 'e1', profissional: null, paciente: null });
    expect(prefillDeUrl(new URLSearchParams(''), null, empresas)).toEqual({ empresa: null, profissional: null, paciente: null });
  });
  it('memória corrompida é ignorada e a gravação não lança', () => {
    expect(lerMemoria({ getItem: () => '{nao é json' })).toBeNull();
    expect(lerMemoria({ getItem: () => '"texto"' })).toBeNull();
    expect(lerMemoria({ getItem: () => null })).toBeNull();
    expect(lerMemoria({ getItem: () => '{"empresa":"e1","profissional":"p1"}' })).toEqual({ empresa: 'e1', profissional: 'p1' });
    expect(() =>
      guardarMemoria(
        {
          setItem: () => {
            throw new Error('cheio');
          },
        },
        { empresa: 'e1', profissional: 'p1' },
      ),
    ).not.toThrow();
  });
});

describe('fila da home', () => {
  it('rótulo da ação por situação e serviços', () => {
    expect(acaoDaFila('DRAFT', 0)).toBe('Continuar');
    expect(acaoDaFila('DRAFT', 2)).toBe('Revisar e emitir');
    expect(acaoDaFila('READY', 2)).toBe('Emitir');
  });
});
