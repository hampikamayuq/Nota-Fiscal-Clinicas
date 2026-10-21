/**
 * Baixar o PDF da nota: o nome útil do arquivo, o cabeçalho que o impõe e o
 * PDF de mentira do provedor falso. O PDF real é público na Focus; o proxy
 * existe só para o navegador salvar "NFS-e 1234 - Maria.pdf" em vez de um hash.
 */

export const FAKE_PDF_HOST = 'fake.invalid';

export function isFakePdfUrl(url: string): boolean {
  try {
    return new URL(url).hostname === FAKE_PDF_HOST;
  } catch {
    return false;
  }
}

export function pdfFilename(number: string | null, patientName: string): string {
  return `NFS-e ${number ?? 'sem número'} - ${patientName}.pdf`;
}

/** `filename` em ASCII para navegadores antigos e `filename*` em UTF-8 para os demais (RFC 6266 / 8187). */
export function contentDisposition(filename: string): string {
  const ascii = filename
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/"/g, "'")
    .replace(/[^\x20-\x7e]/g, '_');
  // encodeURIComponent deixa ! ' ( ) * passar, mas o attr-char da RFC 8187 não os aceita (D'Ávila, "Maria (mãe)").
  const utf8 = encodeURIComponent(filename).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

// ponytail: PDF mínimo de uma página, só para o provedor falso (host fake.invalid),
// para "Baixar PDF" funcionar sem rede em desenvolvimento e no teste. Nunca roda com a Focus.
export function fakePdf(number: string | null): Uint8Array {
  const texto = `NFS-e de teste nº ${number ?? 'sem número'}`.replace(/[\\()]/g, (c) => `\\${c}`);
  const conteudo = `BT /F1 18 Tf 72 760 Td (${texto}) Tj ET`;
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
  ];
  // Tudo em latin1 (º e ú são um byte cada), então o comprimento da string é o deslocamento em bytes.
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objetos.forEach((corpo, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${corpo}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, 'latin1'));
}

/** O corpo do PDF, ou `null` quando a origem falha (rede, status não-ok ou demora além de `timeoutMs`). Quem chama decide o erro HTTP. */
export async function fetchPdf(url: string, timeoutMs = 15_000): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch {
    return null;
  }
}
