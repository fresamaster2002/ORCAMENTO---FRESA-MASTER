export interface DanfePage {
  top: number;
  height: number;
  widthMm: number;
  heightMm: number;
  leftMm: number;
}

export function danfeFilename(clientName: string, issuedAt: string): string {
  const name = clientName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
  const match = issuedAt.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ]|$)/);
  if (!name || !match) throw new Error('O Bling não informou o nome do cliente ou a data de emissão para nomear o PDF. Recarregue a nota.');
  return `NF - ${name} - ${match[3]}-${match[2]}-${match[1]}.pdf`;
}

export function danfePdfPages(width: number, height: number, safeBreaks: number[]): DanfePage[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('O DANFE não possui dimensões válidas.');
  const availableWidth = 194;
  const availableHeight = 281;
  const widthRatio = availableWidth / width;
  const fitRatio = Math.min(widthRatio, availableHeight / height);
  if (fitRatio >= widthRatio * 0.85) {
    return [{ top: 0, height, widthMm: width * fitRatio, heightMm: height * fitRatio, leftMm: (210 - width * fitRatio) / 2 }];
  }
  const pages: DanfePage[] = [];
  const maxHeight = availableHeight / widthRatio;
  const breaks = [...new Set([...safeBreaks, height])].filter(y => Number.isFinite(y) && y > 0 && y <= height).sort((a, b) => a - b);
  let top = 0;
  while (top < height) {
    const end = breaks.filter(y => y > top && y <= top + maxHeight).at(-1);
    if (end === undefined) throw new Error('Uma seção do DANFE não cabe no A4 sem corte. Use o documento original do Bling.');
    pages.push({ top, height: end - top, widthMm: availableWidth, heightMm: (end - top) * widthRatio, leftMm: 8 });
    top = end;
  }
  return pages;
}
