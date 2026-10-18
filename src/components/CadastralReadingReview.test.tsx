import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { CadastralReadingReview, readingReview } from './CadastralReadingReview';
import { SavedQuotesModal } from './SavedQuotesModal';

test('avisos de leitura não são apresentados como cadastro pronto ou sucesso fiscal', () => {
  const review = readingReview({ verification: 'double-read', warnings: ['CEP inválido', 'CEP inválido'], evidence: { cep: 'CEP: 123', name: 42 } }, ['Confira a IE']);
  assert.deepEqual(review.warnings, ['CEP inválido', 'Confira a IE']);
  const html = renderToStaticMarkup(<CadastralReadingReview review={review} />);
  assert.match(html, /duas passagens/);
  assert.match(html, /Pontos para conferir/);
  assert.match(html, /não uma validação independente/);
  assert.match(html, /CEP: 123/);
  assert.doesNotMatch(html, /Pronto para aplicar|Identificados com Sucesso/);
});

test('resposta antiga sem evidências continua utilizável sem afirmar dupla conferência', () => {
  const html = renderToStaticMarkup(<CadastralReadingReview review={readingReview({ warnings: null })} />);
  assert.match(html, /Dados lidos para revisão/);
  assert.doesNotMatch(html, /duas passagens|Ver trechos/);
});

test('lista de orçamentos oferece busca acessível e filtro por situação', () => {
  const html = renderToStaticMarkup(<SavedQuotesModal isOpen quotes={[]} currentId="" onClose={() => {}} onOpen={() => {}} onDelete={() => {}} onDuplicate={() => {}} />);
  assert.match(html, /role="dialog"/);
  assert.match(html, /Buscar orçamento/);
  assert.match(html, /Todas as situações/);
  assert.match(html, /Nenhum orçamento salvo/);
});
