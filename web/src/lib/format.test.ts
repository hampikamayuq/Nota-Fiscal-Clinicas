import { describe, expect, it } from 'vitest';
import { centavosDe, compacto, fraseVariacao, notas, cnpj, cpf, dataEmissao, documento, nomeMes, reais, rotuloPagamentos, semCifrao, slug } from './format';

describe('dinheiro', () => {
  it('formata centavos em reais', () => {
    expect(reais(95000)).toBe('R$ 950,00');
    expect(reais(0)).toBe('R$ 0,00');
  });
  it('lê o que a recepção digita', () => {
    expect(centavosDe('400,00')).toBe(40000);
    expect(centavosDe('1.234,5')).toBe(123450);
    expect(centavosDe('R$ 55')).toBe(5500);
    expect(centavosDe('1234.56')).toBe(123456);
    expect(centavosDe('abc')).toBeNull();
    expect(centavosDe('-1')).toBeNull();
    expect(centavosDe('')).toBeNull();
    expect(centavosDe('1.234')).toBe(123400);
    expect(centavosDe('1.500')).toBe(150000);
    expect(centavosDe('1.5')).toBe(150);
    expect(centavosDe('0,5')).toBe(50);
    expect(centavosDe('1.234,567')).toBeNull();
    expect(centavosDe('0x10')).toBeNull();
    expect(centavosDe('1e3')).toBeNull();
    expect(centavosDe('1.2.3')).toBeNull();
  });
});

describe('documentos', () => {
  it('mascara CPF e CNPJ', () => {
    expect(cpf('11144477735')).toBe('111.444.777-35');
    expect(cnpj('12345678000195')).toBe('12.345.678/0001-95');
  });
  it('descreve o documento disponível', () => {
    expect(documento({ cpf: '11144477735' })).toBe('CPF 111.444.777-35');
    expect(documento({ cnpj: '12345678000195' })).toBe('CNPJ 12.345.678/0001-95');
    expect(documento({ foreignDocument: 'P1' })).toBe('Doc. P1');
    expect(documento({})).toBe('sem documento');
  });
});

describe('pagamentos', () => {
  it('rótulo da lista de pagamentos', () => {
    expect(rotuloPagamentos([])).toBe('Não informado');
    expect(rotuloPagamentos([{ method: 'PIX', amountCents: 95000 }])).toBe('Pix');
    expect(rotuloPagamentos([{ method: 'PIX', amountCents: 30000 }, { method: 'CREDIT_CARD', amountCents: 20000 }])).toBe('Pix R$\u00a0300,00 + Cartão de crédito R$\u00a0200,00');
  });
  it('data de emissão no fuso da clínica e nome do mês', () => {
    expect(dataEmissao('2026-10-01T01:00:00Z')).toBe('30/09/2026');
    expect(nomeMes('2026-10')).toBe('Outubro');
    expect(nomeMes('2026-10', true)).toBe('Outubro de 2026');
  });
});

describe('valores grandes e tendência', () => {
  it('tira o cifrão para o componente Dinheiro', () => {
    expect(semCifrao(95000)).toBe('950,00');
    expect(semCifrao(123456789)).toBe('1.234.567,89');
  });
  it('valor compacto para o rótulo da barra', () => {
    expect(compacto(1234500)).toBe('12,3 mil');
    expect(compacto(95000)).toBe('950');
    expect(compacto(0)).toBe('0');
  });
  it('frase de variação sobre o mês anterior', () => {
    expect(fraseVariacao(112000, 100000, 'setembro')).toBe('+12% sobre setembro');
    expect(fraseVariacao(92000, 100000, 'setembro')).toBe('−8% sobre setembro');
    expect(fraseVariacao(100000, 100000, 'setembro')).toBe('igual a setembro');
    expect(fraseVariacao(0, 0, 'setembro')).toBe('igual a setembro');
    expect(fraseVariacao(5000, 0, 'setembro')).toBe('setembro sem notas');
  });
});

describe('notas', () => {
  it('usa o singular para 1', () => {
    expect(notas(1)).toBe('1 nota');
    expect(notas(0)).toBe('0 notas');
    expect(notas(41)).toBe('41 notas');
  });
});

describe('slug', () => {
  it('vira identificador de pasta e de variável de ambiente', () => {
    expect(slug('Clínica São João LTDA')).toBe('clinica-sao-joao-ltda');
    expect(slug('  Exemplo — Serviços Médicos ')).toBe('exemplo-servicos-medicos');
    expect(slug('x'.repeat(50))).toHaveLength(40);
    expect(slug('!!!')).toBe('');
  });
});
