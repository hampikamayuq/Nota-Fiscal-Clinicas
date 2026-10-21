import { afterEach, describe, expect, it, vi } from 'vitest';
import { contentDisposition, fakePdf, fetchPdf, isFakePdfUrl, pdfFilename } from '../src/app/invoices/pdf-download.ts';

afterEach(() => vi.unstubAllGlobals());

describe('download do PDF', () => {
  it('nome do arquivo com número e paciente', () => {
    expect(pdfFilename('1234', 'Maria de Souza')).toBe('NFS-e 1234 - Maria de Souza.pdf');
    expect(pdfFilename(null, 'Maria')).toBe('NFS-e sem número - Maria.pdf');
  });
  it('Content-Disposition com fallback ASCII e versão UTF-8', () => {
    expect(contentDisposition('NFS-e 12 - José "Zé" Ângelo.pdf')).toBe(
      `attachment; filename="NFS-e 12 - Jose 'Ze' Angelo.pdf"; filename*=UTF-8''${encodeURIComponent('NFS-e 12 - José "Zé" Ângelo.pdf')}`,
    );
  });
  it("Content-Disposition codifica aspas simples, parênteses e asterisco no filename* (RFC 8187)", () => {
    expect(contentDisposition("NFS-e 7 - D'Ávila (mãe)*.pdf")).toBe(
      `attachment; filename="NFS-e 7 - D'Avila (mae)*.pdf"; filename*=UTF-8''NFS-e%207%20-%20D%27%C3%81vila%20%28m%C3%A3e%29%2A.pdf`,
    );
  });
  it('fetchPdf desiste depois do tempo limite', async () => {
    const pendurado = ((_u: unknown, init?: RequestInit) =>
      new Promise<Response>((_, rej) => init?.signal?.addEventListener('abort', () => rej(init.signal!.reason)))) as unknown as typeof fetch;
    vi.stubGlobal('fetch', pendurado);
    expect(await fetchPdf('https://x/p.pdf', 20)).toBeNull();
  });
  it('reconhece o host do provedor falso', () => {
    expect(isFakePdfUrl('https://fake.invalid/nfse/x.pdf')).toBe(true);
    expect(isFakePdfUrl('https://focusnfe.s3.sa-east-1.amazonaws.com/x.pdf')).toBe(false);
    expect(isFakePdfUrl('isso não é url')).toBe(false);
  });
  it('PDF embutido é um PDF com o texto de teste', () => {
    const texto = Buffer.from(fakePdf('7')).toString('latin1');
    expect(texto.startsWith('%PDF-1.4')).toBe(true);
    expect(texto).toContain('NFS-e de teste nº 7');
    expect(texto.trimEnd().endsWith('%%EOF')).toBe(true);
  });
  it('fetchPdf devolve o corpo quando ok e null quando falha', async () => {
    vi.stubGlobal('fetch', async () => new Response(Buffer.from('%PDF-1.4 x'), { status: 200 }));
    expect(Buffer.from((await fetchPdf('https://x/p.pdf'))!).toString()).toBe('%PDF-1.4 x');
    vi.stubGlobal('fetch', async () => new Response('x', { status: 500 }));
    expect(await fetchPdf('https://x/p.pdf')).toBeNull();
    vi.stubGlobal('fetch', async () => { throw new Error('rede'); });
    expect(await fetchPdf('https://x/p.pdf')).toBeNull();
  });
});
