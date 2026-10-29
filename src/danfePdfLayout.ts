export interface DanfePage {
  top: number;
  height: number;
  widthMm: number;
  heightMm: number;
  leftMm: number;
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
