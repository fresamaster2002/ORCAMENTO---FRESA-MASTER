import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const bundle = buildSync({
  entryPoints: [fileURLToPath(new URL('./AuthGate.tsx', import.meta.url))],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  define: { 'import.meta.env.BASE_URL': '"/"' },
});
const bundledModule = { exports: {} as typeof import('./AuthGate') };
runInNewContext(bundle.outputFiles[0].text, {
  module: bundledModule,
  exports: bundledModule.exports,
  require: createRequire(import.meta.url),
});
const { AuthGate } = bundledModule.exports;

const props = {
  email: '',
  password: '',
  onEmailChange: () => {},
  onPasswordChange: () => {},
  onPasswordSignIn: () => {},
  onPasswordRecovery: () => {},
  onPasswordUpdate: () => {},
};

test('login renders empty credentials and requests no automatic completion', () => {
  const markup = renderToStaticMarkup(<AuthGate {...props} />);
  for (const id of ['auth-email', 'auth-password']) {
    const input = markup.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0];
    assert.ok(input);
    assert.match(input, /value=""/);
    assert.match(input, /autoComplete="off"/);
  }
  assert.doesNotMatch(markup, /fresamaster0@gmail\.com/);
});

test('password recovery keeps new-password semantics', () => {
  const markup = renderToStaticMarkup(<AuthGate {...props} isPasswordRecovery />);
  assert.match(markup, /autoComplete="new-password"/);
  assert.match(markup, /Salvar senha/);
  assert.doesNotMatch(markup, /Esqueci a senha/);
});
