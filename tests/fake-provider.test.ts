/** Provedor fiscal falso: autoriza na hora, idempotente por referência. */
import { describe, expect, it } from 'vitest';
import type { FiscalIssueInput } from '../src/fiscal/invoice-provider.ts';
import { FakeFiscalProvider } from '../src/fiscal/providers/fake/fake.provider.ts';

const entrada = (reference: string): FiscalIssueInput => ({
  reference,
  emitter: {
    cnpj: '12345678000195',
    legalName: 'CLINICA EXEMPLO LTDA',
    municipalityCode: '3304557',
    serviceMunicipalityCode: '3304557',
    simplesNacionalOption: '3',
    simplesNacionalRegime: '1',
    specialTaxRegime: '0',
    municipalRegistration: null,
  },
  taker: { kind: 'UNIDENTIFIED', name: 'Não identificado', email: null, phone: null, address: null },
  description: 'Consulta médica',
  amountCents: 10000,
  competenceDate: '2026-10-02',
  fiscal: { nationalTaxCode: '040101', municipalTaxCode: null, nbsCode: null, issRate: null, taxationType: '1', issWithholdingType: '1', pisCofins: null, ibsCbs: null, additional: null },
});

const cancelar = (reference: string) => ({ reference, reasonCode: '1', justification: 'Erro na emissão da nota fiscal' }) as const;

describe('FakeFiscalProvider', () => {
  it('por padrão autoriza com número, código, chave e URLs determinísticos', async () => {
    const fake = new FakeFiscalProvider();
    expect(fake.name).toBe('fake');
    expect(await fake.issue(entrada('a'))).toEqual({
      status: 'AUTHORIZED',
      providerStatus: 'fake_authorized',
      number: '1',
      verificationCode: 'FAKE000001',
      pdfUrl: `https://fake.invalid/nfse/${'1'.padStart(50, '0')}.pdf`,
      xmlUrl: `https://fake.invalid/nfse/${'1'.padStart(50, '0')}.xml`,
      error: null,
    });
    expect((await fake.issue(entrada('b'))).number).toBe('2');
  });

  it('emitir a mesma referência duas vezes devolve a mesma nota, sem criar outra', async () => {
    const fake = new FakeFiscalProvider();
    const primeira = await fake.issue(entrada('a'));
    expect(await fake.issue(entrada('a'))).toEqual(primeira);
    expect((await fake.issue(entrada('b'))).number).toBe('2');
    expect(await fake.getStatus('a')).toEqual(primeira);
    expect(await fake.getStatus('desconhecida')).toBeNull();
  });

  it('cancelar só funciona em nota AUTHORIZED', async () => {
    const fake = new FakeFiscalProvider();
    await fake.issue(entrada('a'));
    expect(await fake.cancel(cancelar('a'))).toEqual({ status: 'CANCELLED', providerStatus: 'fake_cancelled' });
    expect(await fake.getStatus('a')).toMatchObject({ status: 'CANCELLED', number: '1' });
    expect(await fake.cancel(cancelar('a'))).toMatchObject({ status: 'CANCELLATION_ERROR', error: { category: 'VALIDATION' } });
    expect(await fake.cancel(cancelar('nao-existe'))).toMatchObject({ status: 'CANCELLATION_ERROR' });
  });
});
