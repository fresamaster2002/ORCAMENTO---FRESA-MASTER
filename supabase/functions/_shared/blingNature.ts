import { blingFetch } from './blingTransport.ts';
import { formatBlingError } from './blingErrors.ts';
import { natureSelectionIssue, type FiscalClient, type BlingNature } from './clientFiscalReview.ts';

export async function listBlingNatures(token: string): Promise<BlingNature[]> {
  if (!token) throw new Error('Conecte o Bling para consultar as naturezas de operação.');
  const result: BlingNature[] = [];
  for (let page = 1; page <= 10; page++) {
    const response = await blingFetch(token, `/naturezas-operacoes?pagina=${page}&limite=100&situacao=1`);
    const data = await response.json();
    if (!response.ok) throw new Error(formatBlingError(data, 'Não foi possível consultar as naturezas de operação do Bling.'));
    if (!Array.isArray(data.data)) throw new Error('O Bling não retornou a lista de naturezas de operação.');
    for (const entry of data.data) {
      if (!/^\d+$/.test(String(entry?.id)) || typeof entry?.descricao !== 'string') throw new Error('Natureza de operação inválida na resposta do Bling.');
      result.push({ id: String(entry.id), description: entry.descricao });
    }
    if (data.data.length < 100) return result;
  }
  throw new Error('A lista de naturezas excede o limite de consulta.');
}

export async function selectedBlingNature(token: string, client: FiscalClient): Promise<BlingNature> {
  const issue = natureSelectionIssue(client);
  if (issue) throw new Error(issue);
  const natures = await listBlingNatures(token);
  const nature = natures.find((entry) => entry.id === String(client.operationNature?.id || ''));
  if (!nature || nature.description !== client.operationNature?.description) throw new Error('A natureza selecionada não corresponde a uma natureza de venda ativa do Bling. Atualize a consulta e confira.');
  return nature;
}
