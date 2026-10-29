import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { apiFetch } from './api';
import { danfeFilename, danfePdfPages } from './danfePdfLayout';
import type { DanfeDocument } from '../supabase/functions/_shared/blingDanfe';

async function withDeadline<T>(operation: Promise<T>, message: string, milliseconds = 20000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

export function danfeFrameHtml(html: string, css: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const container = parsed.querySelector('#container');
  if (!container) throw new Error('O Bling não retornou o conteúdo do DANFE.');
  const styles = [...parsed.querySelectorAll('style')].map(style => style.textContent).join('\n');
  parsed.querySelectorAll('script,link,meta,base,iframe,object,embed,form,input,button,audio,video').forEach(node => node.remove());
  container.querySelectorAll('*').forEach(node => {
    for (const attribute of [...node.attributes]) {
      if (/^on/i.test(attribute.name) || ['srcset', 'href', 'xlink:href'].includes(attribute.name)) node.removeAttribute(attribute.name);
    }
  });
  container.querySelectorAll('img').forEach(image => {
    if (/linhaBrancaDANFE\.JPG/i.test(image.getAttribute('src') || '')) {
      const spacer = parsed.createElement('span');
      spacer.style.cssText = `display:inline-block;padding:0;width:${image.width || 315}px;height:${image.height || 1}px;background:#fff`;
      image.replaceWith(spacer);
    } else if (!/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(image.getAttribute('src') || '')) {
      throw new Error('O DANFE contém uma imagem externa. Abra o original no Bling para preservar o documento completo.');
    }
  });
  const style = `${css}\n${styles}\nhtml,body{margin:0;padding:0;background:#fff;color:#000;width:1000px}#container{margin:2px;overflow:visible!important;line-height:1.4}#container td{height:auto;vertical-align:top}#container span{line-height:1.4}*{animation:none!important;transition:none!important}`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; form-action 'none'; base-uri 'none'"><style>${style.replace(/<\/style/gi, '<\\/style')}</style></head><body>${container.outerHTML}</body></html>`;
}

async function renderDanfe(document: Extract<DanfeDocument, { kind: 'html' }>, onProgress: (message: string) => void): Promise<Blob> {
  const frame = window.document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:0;top:0;width:1020px;height:1200px;border:0;pointer-events:none;opacity:0.01;z-index:-1';
  const html = danfeFrameHtml(document.html, document.css);
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('O DANFE demorou para carregar. Tente novamente.')), 15000);
      frame.onload = () => { window.clearTimeout(timeout); resolve(); };
      frame.srcdoc = html;
      window.document.body.appendChild(frame);
    });
    const doc = frame.contentDocument;
    const sheet = doc?.querySelector<HTMLElement>('#container');
    if (!doc || !sheet) throw new Error('Não foi possível preparar o DANFE para PDF.');
    onProgress('Carregando logotipo da nota...');
    await Promise.all([...doc.images].map(image => new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Uma imagem do DANFE demorou para carregar. Tente novamente.')), 10000);
      image.onload = () => { window.clearTimeout(timeout); resolve(); };
      image.onerror = () => { window.clearTimeout(timeout); reject(new Error('Não foi possível carregar uma imagem do DANFE.')); };
      if (image.complete && image.naturalWidth > 0) {
        window.clearTimeout(timeout);
        resolve();
      } else if (image.complete) {
        const source = image.src;
        image.removeAttribute('src');
        image.src = source;
      }
    })));
    // Safari waits again for images in html2canvas's cloned iframe; copy decoded logos first.
    for (const image of [...doc.images]) {
      const canvas = doc.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('O navegador não conseguiu preparar o logotipo da nota.');
      context.drawImage(image, 0, 0);
      canvas.style.cssText = image.style.cssText;
      canvas.style.width = `${image.width}px`;
      canvas.style.height = `${image.height}px`;
      image.replaceWith(canvas);
    }
    await withDeadline(doc.fonts.ready, 'O carregamento das fontes demorou demais. Tente novamente.');
    const rect = sheet.getBoundingClientRect();
    const width = Math.ceil(Math.max(rect.width, sheet.scrollWidth));
    const height = Math.ceil(Math.max(rect.height, sheet.scrollHeight));
    if (height > 18000 || width > 1800) throw new Error('O DANFE excedeu o tamanho de conversão. Baixe o original pelo Bling.');
    const rows = [...sheet.querySelectorAll('tr')].map(row => {
      const r = row.getBoundingClientRect();
      return { top: r.top - rect.top, bottom: r.bottom - rect.top };
    });
    const breaks = rows.map(row => Math.ceil(row.bottom) + 1).filter(y => !rows.some(row => row.top < y && row.bottom > y));
    const pages = danfePdfPages(width, height, breaks);
    onProgress('Renderizando página A4...');
    const canvas = await withDeadline(
      html2canvas(sheet, {
        scale: 2, width, height, windowWidth: 1020, windowHeight: 1200, scrollX: 0, scrollY: 0,
        backgroundColor: '#ffffff', logging: false, imageTimeout: 10000,
      }),
      'A conversão do DANFE demorou demais neste navegador. Tente novamente com o app aberto em primeiro plano.',
    );
    onProgress('Finalizando arquivo PDF...');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    for (const [index, page] of pages.entries()) {
      const slice = window.document.createElement('canvas');
      slice.width = canvas.width;
      const start = Math.round(page.top * canvas.height / height);
      const end = Math.round((page.top + page.height) * canvas.height / height);
      slice.height = end - start;
      const context = slice.getContext('2d');
      if (!context) throw new Error('O navegador não conseguiu preparar a página do PDF.');
      context.drawImage(canvas, 0, start, canvas.width, slice.height, 0, 0, slice.width, slice.height);
      if (index) pdf.addPage();
      pdf.addImage(slice.toDataURL('image/png'), 'PNG', page.leftMm, 8, page.widthMm, page.heightMm, undefined, 'FAST');
    }
    return pdf.output('blob');
  } finally {
    frame.remove();
  }
}

export async function prepareDanfePdf(nfeId: string | number, orderId: string | number, token: string, onProgress: (message: string) => void = () => {}): Promise<File> {
  onProgress('Consultando DANFE no Bling...');
  const response = await apiFetch('/api/bling/nfe/danfe-document', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nfeId, orderId, token: token.trim() || undefined }),
    signal: AbortSignal.timeout(30000),
  });
  const data: { success?: boolean; error?: string; nfeId?: number; clientName?: string; issuedAt?: string; document?: DanfeDocument } = await response.json();
  if (!response.ok || !data.success || String(data.nfeId) !== String(nfeId) || !data.document) throw new Error(data.error || 'Não foi possível obter o DANFE desta nota.');
  const filename = danfeFilename(data.clientName || '', data.issuedAt || '');
  let blob: Blob;
  if (data.document.kind === 'pdf') {
    const bytes = Uint8Array.from(atob(data.document.base64), char => char.charCodeAt(0));
    blob = new Blob([bytes], { type: 'application/pdf' });
  } else if (data.document.kind === 'html') {
    onProgress('Ajustando documento para A4...');
    blob = await renderDanfe(data.document, onProgress);
  } else {
    throw new Error('O Bling retornou um formato de documento não reconhecido.');
  }
  return new File([blob], filename, { type: 'application/pdf' });
}
