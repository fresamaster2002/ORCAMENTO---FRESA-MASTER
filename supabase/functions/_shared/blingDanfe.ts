export class DanfeDocumentError extends Error {
  readonly status = 502;
}

export type DanfeDocument =
  | { kind: 'html'; html: string; css: string }
  | { kind: 'pdf'; base64: string };

async function readDocument(url: string, limit: number) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok || !response.body) throw new DanfeDocumentError('Não foi possível baixar o DANFE no Bling. Recarregue a nota e tente novamente.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new DanfeDocumentError('O DANFE excedeu o limite de download do app. Abra o documento original no Bling.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function fetchBlingDanfe(source: unknown): Promise<DanfeDocument> {
  let url: URL;
  try { url = new URL(String(source || '')); }
  catch { throw new DanfeDocumentError('O Bling não disponibilizou o DANFE. Recarregue a nota.'); }
  if (url.protocol !== 'https:' || !['www.bling.com.br', 'bling.com.br'].includes(url.hostname)
    || url.port || url.username || url.password || url.pathname !== '/doc.view.php') {
    throw new DanfeDocumentError('O Bling retornou um endereço de DANFE não reconhecido. Use Abrir DANFE para conferir o documento original.');
  }
  const bytes = await readDocument(url.href, 8 * 1024 * 1024);
  if (new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-') {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return { kind: 'pdf', base64: btoa(binary) };
  }
  const html = new TextDecoder().decode(bytes);
  if (bytes.length > 2 * 1024 * 1024 || !/id\s*=\s*["']container["']/i.test(html) || !/\bDANFE\b/i.test(html)) {
    throw new DanfeDocumentError('A resposta do Bling não contém um DANFE válido. Recarregue a nota; nenhum PDF foi gerado.');
  }
  const css = new TextDecoder().decode(await readDocument('https://www.bling.com.br/styles/danfe.css', 256 * 1024));
  if (!css.includes('.grid')) throw new DanfeDocumentError('O estilo do DANFE não está disponível. Tente novamente ou abra o original no Bling.');
  return { kind: 'html', html, css };
}
