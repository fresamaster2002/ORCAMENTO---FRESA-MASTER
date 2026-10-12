import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { NfeSuccessBanner } from './NfeSuccessBanner';

test('sucesso aparece somente na autorização confirmada, com número e série', () => {
  const html = renderToStaticMarkup(<NfeSuccessBanner situation={5} number="000009" series={2} />);
  assert.match(html, /role="status"/);
  assert.match(html, /NF-e emitida com sucesso!/);
  assert.match(html, /Autorizada pela SEFAZ/);
  assert.match(html, /000009/);
  assert.match(html, /Série 2/);
  for (const situation of [undefined, null, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11]) {
    assert.equal(renderToStaticMarkup(<NfeSuccessBanner situation={situation} />), '');
  }
});

test('autorização sem numeração não inventa número ou série', () => {
  const html = renderToStaticMarkup(<NfeSuccessBanner situation={5} />);
  assert.match(html, /NF-e emitida com sucesso!/);
  assert.doesNotMatch(html, /Nº|Série|undefined|null/);
});
