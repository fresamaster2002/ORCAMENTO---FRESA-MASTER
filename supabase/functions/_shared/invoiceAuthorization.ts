const content = (xml: string, tag: string) => xml.match(new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>`, 'i'))?.[1]?.trim() || '';

export function hasProductionAuthorization(xml: string, key: string): boolean {
  const info = content(xml, 'infNFe');
  const protocol = content(xml, 'infProt');
  const invoiceId = xml.match(/<(?:[\w-]+:)?infNFe\b[^>]*\bId=["']NFe(\d{44})["']/i)?.[1];
  return /^\d{44}$/.test(key) && invoiceId === key
    && content(info, 'tpAmb') === '1' && content(protocol, 'tpAmb') === '1'
    && content(protocol, 'chNFe') === key && ['100', '150'].includes(content(protocol, 'cStat'))
    && /^\d+$/.test(content(protocol, 'nProt'));
}

export async function readBlingInvoiceXml(source: string): Promise<string> {
  if (source.trim().startsWith('<')) {
    if (source.length > 2 * 1024 * 1024) throw new Error('O XML excedeu o limite de conferência.');
    return source;
  }
  const url = new URL(source);
  if (url.protocol !== 'https:' || !['www.bling.com.br', 'bling.com.br'].includes(url.hostname)
    || url.port || url.username || url.password || url.pathname !== '/relatorios/nfe.xml.php') {
    throw new Error('O link do XML retornado pelo Bling não foi reconhecido.');
  }
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok || !response.body) throw new Error('Não foi possível ler o XML atual do Bling.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let xml = '';
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) throw new Error('O XML excedeu o limite de conferência.');
      xml += decoder.decode(value, { stream: true });
    }
    return xml + decoder.decode();
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}
