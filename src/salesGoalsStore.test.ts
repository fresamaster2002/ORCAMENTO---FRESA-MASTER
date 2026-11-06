import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { salesGoalsStore } from './salesGoalsStore';

function fixture() {
  const calls: { url: URL; method: string; body: unknown }[] = [];
  let response: unknown = [];
  let status = 200;
  const database = createClient('https://goals.invalid', 'fictional-public-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input, init) => {
        calls.push({ url: new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url), method: init?.method || 'GET', body: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
        return new Response(JSON.stringify(response), { status, headers: { 'Content-Type': 'application/json' } });
      },
    },
  });
  return { calls, store: salesGoalsStore(database, 'owner-test'), respond: (value: unknown, code = 200) => { response = value; status = code; } };
}

test('metas consultam somente o ano e a conta e salvam um mês sem sobrescrever outras metas', async () => {
  const f = fixture();
  f.respond([{ id: 'SALES-GOAL:2026-11', quote: { version: 1, amount: 15000 } }]);
  assert.deepEqual(await f.store.load(2026), { '2026-11': 15000 });
  assert.equal(f.calls[0].url.searchParams.get('owner_id'), 'eq.owner-test');
  assert.equal(f.calls[0].url.searchParams.get('id'), 'like.SALES-GOAL:2026-%');
  assert.equal(f.calls[0].url.searchParams.get('limit'), '13');
  f.respond({ id: 'SALES-GOAL:2026-11' }, 201);
  await f.store.save('2026-11', 18000.99);
  assert.equal(f.calls[1].method, 'POST');
  assert.equal(f.calls[1].url.searchParams.get('on_conflict'), 'owner_id,id');
  const saved = f.calls[1].body as { id: string; owner_id: string; quote: unknown };
  assert.equal(saved.id, 'SALES-GOAL:2026-11');
  assert.equal(saved.owner_id, 'owner-test');
  assert.deepEqual(saved.quote, { version: 1, amount: 18000.99 });
  await f.store.save('2026-11', null);
  assert.equal(f.calls[2].method, 'DELETE');
  assert.equal(f.calls[2].url.searchParams.get('owner_id'), 'eq.owner-test');
  assert.equal(f.calls[2].url.searchParams.get('id'), 'eq.SALES-GOAL:2026-11');
});

test('metas propagam erros de leitura/gravação e rejeitam entrada inválida antes da rede', async () => {
  const f = fixture();
  f.respond({ message: 'Acesso negado', code: '42501' }, 403);
  await assert.rejects(() => f.store.load(2026), (cause: { message?: string }) => cause.message === 'Acesso negado');
  await assert.rejects(() => f.store.save('2026-11', 500), (cause: { message?: string }) => cause.message === 'Acesso negado');
  await assert.rejects(() => f.store.save('2026-11', null), (cause: { message?: string }) => cause.message === 'Acesso negado');
  const count = f.calls.length;
  await assert.rejects(() => f.store.save('2026-13', 500));
  await assert.rejects(() => f.store.save('2026-11', -1));
  await assert.rejects(() => f.store.load(NaN));
  assert.equal(f.calls.length, count);
});
