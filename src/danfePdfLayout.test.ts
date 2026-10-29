import assert from 'node:assert/strict';
import { test } from 'node:test';
import { danfeFilename, danfePdfPages } from './danfePdfLayout';

test('nome usa cliente e data de emissão, sem deslocamento de fuso ou caracteres inválidos', () => {
  assert.equal(danfeFilename('MARCO ANTONIO', '2026-10-28 23:01:04'), 'NF - MARCO ANTONIO - 28-10-2026.pdf');
  assert.equal(danfeFilename(' Empresa / Teste ', '2026-10-28T23:01:04-03:00'), 'NF - Empresa Teste - 28-10-2026.pdf');
  assert.throws(() => danfeFilename('', '2026-10-28'), /nome do cliente/);
  assert.throws(() => danfeFilename('Marco', ''), /data de emissão/);
});

test('DANFE curto cabe inteiro no A4 com margens de 8 mm', () => {
  const pages = danfePdfPages(900, 850, []);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].height, 850);
  assert.equal(pages[0].widthMm, 194);
  assert.ok(pages[0].heightMm <= 281);
});

test('pequeno excesso de altura ajusta a escala sem gerar página extra', () => {
  const pages = danfePdfPages(900, 1400, []);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].heightMm, 281);
  assert.ok(pages[0].widthMm < 194);
});

test('notas extensas preservam todas as linhas em páginas seguras', () => {
  const pages = danfePdfPages(900, 3000, [1000, 2000, 3000]);
  assert.equal(pages.length, 3);
  assert.deepEqual(pages.map(page => [page.top, page.height]), [[0, 1000], [1000, 1000], [2000, 1000]]);
  assert.ok(pages.every(page => page.heightMm <= 281));
});

test('não corta seção que não cabe e rejeita dimensões inválidas', () => {
  assert.throws(() => danfePdfPages(900, 4000, []), /sem corte/);
  assert.throws(() => danfePdfPages(0, 100, []), /dimensões/);
});
