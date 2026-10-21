import { describe, expect, it } from 'vitest';
import { cnpjValido, cpfValido, descricaoSensivel } from '../src/dps/validate.ts';


describe('documentos', () => {
  it('valida CPF pelos dígitos verificadores', () => {
    expect(cpfValido('11144477735')).toBe(true);
    expect(cpfValido('11144477736')).toBe(false);
    expect(cpfValido('11111111111')).toBe(false);
    expect(cpfValido('111.444.777-35')).toBe(false);
  });

  it('valida CNPJ pelos dígitos verificadores', () => {
    expect(cnpjValido('11222333000181')).toBe(true);
    expect(cnpjValido('11222333000182')).toBe(false);
    expect(cnpjValido('00000000000000')).toBe(false);
  });
});

describe('LGPD na descrição do serviço', () => {
  it('deixa passar descrição genérica', () => {
    expect(descricaoSensivel('Prestação de serviços médicos')).toBeNull();
    expect(descricaoSensivel('Consulta')).toBeNull();
    expect(descricaoSensivel('Sessão de fisioterapia')).toBeNull();
  });

  it('barra diagnóstico e afins', () => {
    expect(descricaoSensivel('Consulta com diagnóstico de asma')).toBe('diagnostico');
    expect(descricaoSensivel('Exame de HIV')).toBe('hiv');
    expect(descricaoSensivel('Acompanhamento psiquiátrico')).toBe('psiquiatr');
  });

  it('barra código CID', () => {
    expect(descricaoSensivel('Atendimento J45.0')).toContain('CID');
    expect(descricaoSensivel('Consulta E11')).toContain('CID');
  });

  it('não confunde número de sala com CID', () => {
    expect(descricaoSensivel('Consulta na sala 12')).toBeNull();
  });
});

