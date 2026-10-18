import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cadastralFields,
  CadastralExtractionError,
  extractCadastralDocument,
  normalizeCadastralResult,
  prepareCadastralInput,
} from '../supabase/functions/_shared/cadastralExtraction.ts';

function reading(values: Record<string, string> = {}) {
  const client = Object.fromEntries(cadastralFields.map((field) => [field, '']));
  Object.assign(client, { name: 'Cliente de teste', document: '59085330000170' }, values);
  return {
    client,
    evidence: Object.fromEntries(cadastralFields.map((field) => [field, client[field] ? `${field}: ${client[field]}` : ''])),
    warnings: [],
    ambiguousIdentity: false,
  };
}

function aiResponse(value: unknown) {
  return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] });
}

const attachment = { file: { mimeType: 'application/pdf', base64: 'JVBERg==' } };

test('valida entrada vazia, texto excessivo, formato e base64 antes de chamar IA', () => {
  for (const [input, status] of [
    [{}, 400],
    [{ text: 'a'.repeat(12001) }, 413],
    [{ file: { mimeType: 'text/plain', base64: 'YWJj' } }, 415],
    [{ file: { mimeType: 'application/pdf', base64: 'corrompido!' } }, 400],
  ] as const) {
    assert.throws(() => prepareCadastralInput(input), (error: unknown) =>
      error instanceof CadastralExtractionError && error.status === status);
  }
  const prepared = prepareCadastralInput({ file: { ...attachment.file, base64: 'data:application/pdf;base64,JVBERg==' } });
  assert.equal(prepared.hasFile, true);
  assert.deepEqual(prepared.parts[0], { inlineData: { mimeType: 'application/pdf', data: 'JVBERg==' } });
});

test('preserva endereço e contatos expressos e formata documentos sem completar campos ausentes', () => {
  const result = normalizeCadastralResult(reading({
    address: 'Rua do cadastro', number: '17', cep: '13329350',
    email: 'fiscal@example.invalid', phone: '(11) 99999-8888', state: 'sp',
  }));
  assert.equal(result.client.document, '59.085.330/0001-70');
  assert.equal(result.client.address, 'Rua do cadastro');
  assert.equal(result.client.number, '17');
  assert.equal(result.client.cep, '13329-350');
  assert.equal(result.client.state, 'SP');
  assert.equal(result.client.ie, '');
  assert.equal(result.client.tradeName, '');
});

test('recusa identidade ambígua em vez de escolher uma empresa', () => {
  assert.throws(() => normalizeCadastralResult({ ...reading(), ambiguousIdentity: true }), /mais de um possível cliente/);
});

test('remove valores sem evidência e números que não correspondem ao trecho de origem', () => {
  const raw = reading({ number: '99', ie: '123456', email: 'inventado@example.invalid' });
  raw.evidence.number = 'Número: 17';
  raw.evidence.ie = '';
  raw.evidence.email = 'E-mail: fiscal@example.invalid';
  const result = normalizeCadastralResult(raw);
  assert.equal(result.client.number, '');
  assert.equal(result.client.ie, '');
  assert.equal(result.client.email, '');
  assert.ok(result.warnings.length >= 3);
});

test('avisa sobre CPF/CNPJ, CEP, UF e contatos inválidos sem adivinhar correções', () => {
  const result = normalizeCadastralResult(reading({
    document: '11111111111111', cep: '1234', state: 'XX',
    email: 'sem-arroba', phone: '123',
  }));
  for (const field of ['document', 'cep', 'state', 'email', 'phone'] as const) assert.equal(result.client[field], '');
  assert.ok(result.warnings.length >= 5);
  assert.equal(normalizeCadastralResult(reading({ document: '52998224725' })).client.document, '529.982.247-25');
});

test('texto usa uma leitura e não recebe dados de cadastro anterior', async () => {
  let calls = 0;
  const result = await extractCadastralDocument({ text: 'Cliente de teste', currentClient: { ie: '999' } }, {
    apiKey: 'test',
    fetcher: async () => { calls++; return aiResponse(reading()); },
  });
  assert.equal(calls, 1);
  assert.equal(result.client.ie, '');
});

test('PDF faz conferência dupla e retorna os campos revistos', async () => {
  let calls = 0;
  const result = await extractCadastralDocument(attachment, {
    apiKey: 'test',
    fetcher: async () => aiResponse(reading({ number: ++calls === 1 ? '17' : '18' })),
  });
  assert.equal(calls, 2);
  assert.equal(result.client.number, '18');
});

test('bloqueia aplicação quando duas leituras encontram CNPJs válidos diferentes', async () => {
  let calls = 0;
  await assert.rejects(extractCadastralDocument(attachment, {
    apiKey: 'test',
    fetcher: async () => aiResponse(reading({ document: ++calls === 1 ? '59085330000170' : '29931837000136' })),
  }), /CPF\/CNPJ diferentes/);
});

test('falha da conferência mantém leitura inicial com aviso explícito', async () => {
  let calls = 0;
  const result = await extractCadastralDocument(attachment, {
    apiKey: 'test',
    fetcher: async () => ++calls === 1 ? aiResponse(reading()) : new Response('', { status: 503 }),
  });
  assert.equal(result.success, true);
  assert.match(result.warnings.join(' '), /segunda conferência.*não ficou disponível/);
});

test('respeita limite de custo antes da leitura e exige configuração de IA', async () => {
  await assert.rejects(extractCadastralDocument({ text: 'Cliente' }, { apiKey: '' }), /não está configurado/);
  await assert.rejects(extractCadastralDocument({ text: 'Cliente' }, {
    apiKey: 'test',
    reserve: async () => false,
    fetcher: async () => { throw new Error('Não deve chamar a IA'); },
  }), (error: unknown) => error instanceof CadastralExtractionError && error.status === 429);
});
