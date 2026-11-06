import type { SupabaseClient } from '@supabase/supabase-js';
import { goalRecordId, normalizeGoalRecords, SALES_GOAL_PREFIX } from './salesGrowth';

export function salesGoalsStore(database: SupabaseClient, ownerId: string) {
  if (!ownerId) throw new Error('Entre na sua conta para acessar as metas.');
  return {
    async load(year: number) {
      if (!Number.isInteger(year) || year < 1000 || year > 9999) throw new Error('Ano inválido para consultar metas.');
      const { data, error } = await database.from('quotes').select('id,quote')
        .eq('owner_id', ownerId).like('id', `${SALES_GOAL_PREFIX}${year}-%`).limit(13)
        .abortSignal(AbortSignal.timeout(15000));
      if (error) throw error;
      if ((data || []).length > 12) throw new Error('Existem metas duplicadas ou inválidas para este ano.');
      return normalizeGoalRecords(data || []);
    },
    async save(month: string, amount: number | null) {
      const id = goalRecordId(month);
      if (amount === null) {
        const { error } = await database.from('quotes').delete().eq('owner_id', ownerId).eq('id', id)
          .abortSignal(AbortSignal.timeout(15000));
        if (error) throw error;
      } else {
        const quote = { version: 1, amount };
        normalizeGoalRecords([{ id, quote }]);
        const { error } = await database.from('quotes').upsert({
          owner_id: ownerId, id, quote, updated_at: new Date().toISOString(),
        }, { onConflict: 'owner_id,id' }).select('id').abortSignal(AbortSignal.timeout(15000)).single();
        if (error) throw error;
      }
    },
  };
}
