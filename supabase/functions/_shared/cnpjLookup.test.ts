import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CnpjLookupError, lookupCnpj, normalizeAndValidateCnpj } from './cnpjLookup.ts';

const testCnpj = '00000000000191';

test('normaliza e valida CNPJ antes de consultar provedores', async () => {
  assert.equal(normalizeAndValidateCnpj('00.000.000/0001-91'), testCnpj);
  assert.equal(normalizeAndValidateCnpj('00000000000190'), '');
  assert.equal(normalizeAndValidateCnpj('11111111111111'), '');

  let requestCount = 0;
  await assert.rejects(
    lookupCnpj('00000000000190', async () => {
      requestCount += 1;
      return Response.json({});
    }),
    (error: unknown) => error instanceof CnpjLookupError && error.status === 400,
  );
  assert.equal(requestCount, 0);
});

test('retorna cadastro e IE ativa correspondente à UF', async () => {
  const fetcher: typeof fetch = async (input) => {
    if (String(input).includes('brasilapi.com.br')) {
      return Response.json({
        cnpj: testCnpj,
        razao_social: 'Empresa Teste SA',
        nome_fantasia: 'Empresa Teste',
        cep: '',
        descricao_tipo_de_logradouro: '',
        logradouro: '',
        numero: '100',
        bairro: '',
        municipio: '',
        uf: 'SP',
        ddd_telefone_1: '1133334444',
      });
    }
    return Response.json({
      estabelecimento: {
        cnpj: testCnpj,
        cep: '01001000',
        tipo_logradouro: 'Avenida',
        logradouro: 'Alternativa',
        numero: '200',
        bairro: 'Centro',
        cidade: { nome: 'São Paulo' },
        estado: { sigla: 'SP' },
        inscricoes_estaduais: [
          { inscricao_estadual: '123.456.789.112', ativo: true, estado: { sigla: 'SP' } },
          { inscricao_estadual: '987.654.321.000', ativo: true, estado: { sigla: 'RJ' } },
        ],
      },
    });
  };

  const result = await lookupCnpj(testCnpj, fetcher);
  assert.equal(result.client.name, 'Empresa Teste SA');
  assert.equal(result.client.document, '00.000.000/0001-91');
  assert.equal(result.client.ie, '123.456.789.112');
  assert.equal(result.client.cep, '01001-000');
  assert.equal(result.client.address, 'Avenida Alternativa');
  assert.equal(result.client.city, 'São Paulo');
  assert.equal(result.client.phone, '(11) 3333-4444');
  assert.deepEqual(result.warnings, []);
});

test('não presume isenção quando a IE não consta na consulta', async () => {
  const fetcher: typeof fetch = async (input) => String(input).includes('brasilapi.com.br')
    ? Response.json({ cnpj: testCnpj, razao_social: 'Empresa Teste SA', uf: 'SP' })
    : Response.json({ estabelecimento: { cnpj: testCnpj, inscricoes_estaduais: [] } });

  const result = await lookupCnpj(testCnpj, fetcher);
  assert.equal(result.client.ie, '');
  assert.match(result.warnings.join(' '), /não confirma isenção/i);
});

test('usa CNPJ.ws como alternativa e mapeia município e UF aninhados', async () => {
  const fetcher: typeof fetch = async (input) => {
    if (String(input).includes('brasilapi.com.br')) return new Response(null, { status: 503 });
    return Response.json({
      razao_social: 'Empresa Alternativa SA',
      estabelecimento: {
        cnpj: testCnpj,
        nome_fantasia: 'Alternativa',
        cep: '01001000',
        logradouro: 'Rua de Teste',
        cidade: { nome: 'São Paulo' },
        estado: { sigla: 'SP' },
        inscricoes_estaduais: [
          { inscricao_estadual: '123456789', ativo: true, estado: { sigla: 'SP' } },
        ],
      },
    });
  };

  const result = await lookupCnpj(testCnpj, fetcher);
  assert.equal(result.source, 'CNPJ.ws');
  assert.equal(result.client.city, 'São Paulo');
  assert.equal(result.client.state, 'SP');
  assert.equal(result.client.ie, '123456789');
});

test('sinaliza CNPJ não encontrado quando ambos os provedores retornam 404', async () => {
  await assert.rejects(
    lookupCnpj(testCnpj, async () => new Response(null, { status: 404 })),
    (error: unknown) => error instanceof CnpjLookupError && error.status === 404,
  );
});
