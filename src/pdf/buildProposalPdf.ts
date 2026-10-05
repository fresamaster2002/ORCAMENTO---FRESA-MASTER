import jsPDF from 'jspdf';
import { QuoteData } from '../types';

export const PIX_KEY = '59.085.330/0001-70';

const C = {
  navy: '#0b1220',
  slate900: '#0f172a',
  slate700: '#334155',
  slate600: '#475569',
  slate500: '#64748b',
  slate400: '#94a3b8',
  slate300: '#cbd5e1',
  slate200: '#e2e8f0',
  slate50: '#f8fafc',
  orange: '#ff6a00',
  amber: '#f59e0b',
  amberLight: '#fcd34d',
  green: '#34d399',
  greenDark: '#065f46',
  red: '#e11d48',
  white: '#ffffff',
};

const money = (value: number) =>
  (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, ' ');

const hexToRgb = (hex: string): [number, number, number] => {
  const v = hex.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
};

const mix = (a: string, b: string, t: number) => {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return [ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t].map(Math.round) as [number, number, number];
};

const loadEmblem = async (baseUrl: string) => {
  try {
    const res = await fetch(`${baseUrl}fresa-master-emblem.png`);
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const size: { w: number; h: number } = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = reject;
      img.src = dataUrl;
    });
    return { dataUrl, ...size };
  } catch {
    return null;
  }
};

export async function buildProposalPdf(quote: QuoteData, baseUrl: string): Promise<jsPDF> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const emblem = await loadEmblem(baseUrl);

  const PW = 210;
  const PH = 297;
  const M = 3;
  const PAD = 12;
  const L = M + PAD;
  const R = PW - M - PAD;
  const CW = R - L;
  const BOTTOM = PH - M - 20;

  const fill = (hex: string) => pdf.setFillColor(...hexToRgb(hex));
  const stroke = (hex: string) => pdf.setDrawColor(...hexToRgb(hex));
  const color = (hex: string) => pdf.setTextColor(...hexToRgb(hex));
  const font = (style: 'normal' | 'bold', size: number, family: 'helvetica' | 'courier' = 'helvetica') => {
    pdf.setFont(family, style);
    pdf.setFontSize(size);
  };

  const spacedWidth = (text: string, charSpace: number) => pdf.getTextWidth(text) + charSpace * Math.max(0, text.length - 1);

  const frame = () => {
    stroke(C.amber);
    pdf.setLineWidth(0.7);
    pdf.roundedRect(M, M, PW - M * 2, PH - M * 2, 2.5, 2.5, 'S');
  };

  let y = 0;

  // ---------- Cabeçalho ----------
  const stripeH = 2.2;
  const headerH = 58;
  const headerY = M + stripeH;
  const slices = 140;
  const sliceW = (PW - M * 2) / slices;

  for (let i = 0; i < slices; i += 1) {
    pdf.setFillColor(...mix(C.orange, C.amber, i / (slices - 1)));
    pdf.rect(M + sliceW * i, M, sliceW + 0.35, stripeH, 'F');
  }
  const stops: Array<[number, string]> = [
    [0, '#070b14'],
    [0.38, '#0f172a'],
    [0.68, '#1f2937'],
    [1, '#4b5563'],
  ];
  for (let i = 0; i < slices; i += 1) {
    const t = i / (slices - 1);
    let k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k += 1;
    const [t0, c0] = stops[k];
    const [t1, c1] = stops[k + 1];
    const local = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    pdf.setFillColor(...mix(c0, c1, local));
    pdf.rect(M + sliceW * i, headerY, sliceW + 0.35, headerH, 'F');
  }
  fill(C.orange);
  pdf.rect(M, headerY + headerH, PW - M * 2, 1.4, 'F');

  const emblemH = 25;
  let textX = L;
  if (emblem) {
    const emblemW = (emblem.w / emblem.h) * emblemH;
    pdf.addImage(emblem.dataUrl, 'PNG', L, headerY + 6, emblemW, emblemH, undefined, 'NONE');
    textX = L + emblemW + 4;
  }
  font('bold', 27);
  color(C.white);
  pdf.text('FRESA MASTER', textX, headerY + 17.5, { charSpace: 0.9 });
  font('bold', 10.5);
  color('#f97316');
  pdf.text('CNC MACHINING', textX, headerY + 25, { charSpace: 2.4 });

  font('bold', 10);
  color('#f8fafc');
  pdf.text('Ferramentas de Alta Precisão para Router CNC', L, headerY + 37);
  font('normal', 9.5);
  color(C.slate300);
  ['fresamaster0@gmail.com', 'CNPJ 59.085.330/0001-70', '(11) 99852-4939', 'Salto/SP • CEP 13329-350'].forEach((line, i) =>
    pdf.text(line, L, headerY + 42.5 + i * 4.4)
  );

  const pillW = 64;
  const pillH = 9.5;
  const pillX = R - pillW;
  const pillY = headerY + 6;
  fill(C.orange);
  pdf.roundedRect(pillX, pillY, pillW, pillH, 1.2, 1.2, 'F');
  font('bold', 9);
  color(C.navy);
  const pillText = 'PROPOSTA COMERCIAL';
  const cs = 0.9;
  pdf.text(pillText, pillX + (pillW - spacedWidth(pillText, cs)) / 2, pillY + pillH / 2 + 1.25, { charSpace: cs });

  font('bold', 21, 'courier');
  color(C.white);
  pdf.text(String(quote.id), R, headerY + 29, { align: 'right' });
  const emissao = new Date(quote.createdAt).toLocaleDateString('pt-BR');
  font('bold', 9.5);
  const emissaoW = pdf.getTextWidth(emissao);
  color(C.white);
  pdf.text(emissao, R, headerY + 35, { align: 'right' });
  font('normal', 9.5);
  color(C.slate300);
  pdf.text('Emissão: ', R - emissaoW, headerY + 35, { align: 'right' });
  font('bold', 9.5);
  color(C.green);
  pdf.text(`Válida por ${quote.project.validityDays || 10} dias`, R, headerY + 40.5, { align: 'right' });

  y = headerY + headerH + 1.4 + 9;

  const newPage = () => {
    pdf.addPage();
    frame();
    fill(C.orange);
    pdf.rect(M, M, PW - M * 2, 1.6, 'F');
    y = M + 12;
  };
  const ensure = (h: number) => {
    if (y + h > BOTTOM) newPage();
  };
  const label = (text: string, x: number, yy: number, align: 'left' | 'right' = 'left') => {
    font('bold', 8);
    color(C.slate500);
    pdf.text(text.toUpperCase(), x, yy, { align, charSpace: 0.5 });
  };

  frame();

  // ---------- Cartões Cliente / Entrega ----------
  const gap = 6;
  const cardW = (CW - gap) / 2;
  const cardH = 40;
  const drawCard = (x: number, accent: string) => {
    fill(C.slate50);
    stroke(C.slate300);
    pdf.setLineWidth(0.4);
    pdf.roundedRect(x, y, cardW, cardH, 1.8, 1.8, 'FD');
    fill(accent);
    pdf.roundedRect(x, y, 1.6, cardH, 0.8, 0.8, 'F');
  };
  drawCard(L, C.amber);
  drawCard(L + cardW + gap, C.slate900);

  const kv = (key: string, value: string, x: number, yy: number, mono = false) => {
    font('normal', 9);
    color(C.slate700);
    pdf.text(key, x, yy);
    const kw = pdf.getTextWidth(key);
    font('bold', 9, mono ? 'courier' : 'helvetica');
    color(C.slate900);
    pdf.text(value, x + kw, yy);
  };

  let cx = L + 6;
  let cy = y + 7;
  label('Cliente', cx, cy);
  font('bold', 11.5);
  color(C.slate900);
  const clientName = (pdf.splitTextToSize(quote.client.name || 'Cliente / Empresa', cardW - 10) as string[]).slice(0, 2);
  pdf.text(clientName, cx, cy + 6);
  cy += 6 + clientName.length * 5;
  kv('CNPJ/CPF: ', quote.client.document || 'A confirmar', cx, cy, true);
  cy += 4.8;
  kv('Inscrição Estadual: ', quote.client.ie || 'ISENTO', cx, cy);
  cy += 4.8;
  if (quote.client.city || quote.client.state) {
    font('normal', 9);
    color(C.slate700);
    pdf.text(`${quote.client.city || ''}${quote.client.city && quote.client.state ? ' / ' : ''}${quote.client.state || ''}`, cx, cy);
    cy += 4.8;
  }
  if (quote.client.phone) {
    font('normal', 9);
    color(C.slate700);
    pdf.text(`Contato: ${quote.client.phone}`, cx, cy);
  }

  cx = L + cardW + gap + 6;
  cy = y + 7;
  label('Entrega', cx, cy);
  font('bold', 12);
  color(C.slate900);
  pdf.text(quote.shipping.selectedOption?.name || 'A combinar', cx, cy + 6.2);
  cy += 6.2 + 5;
  font('normal', 9);
  color(C.slate700);
  pdf.text(`Destino: CEP ${quote.client.cep || quote.shipping.destinationCep || 'A confirmar'}`, cx, cy);
  cy += 4.8;
  kv('Peso estimado: ', `${quote.shipping.weightKg || 0.5} kg`, cx, cy, true);
  cy += 4.8;
  const prazo = pdf.splitTextToSize(`Prazo: ${quote.project.deadline || '2 a 4 dias úteis após despacho'}`, cardW - 10) as string[];
  font('normal', 9);
  color(C.slate700);
  pdf.text(prazo, cx, cy);
  cy += prazo.length * 4.4 + 0.6;
  font(quote.shipping.insuranceEnabled ? 'bold' : 'normal', 8.5);
  color(quote.shipping.insuranceEnabled ? C.greenDark : C.slate500);
  pdf.text(quote.shipping.insuranceEnabled ? 'Carga segurada' : 'Sem seguro adicional', cx, cy);

  y += cardH + 9;

  // ---------- Itens ----------
  label('Itens da proposta', L, y);
  y += 3;
  const colNum = L + 3;
  const colDesc = L + 12;
  const colNcm = L + CW * 0.55;
  const colQty = L + CW * 0.7;
  const colUnit = L + CW * 0.86;
  const colTotal = R - 3;

  const drawTableHeader = () => {
    fill(C.slate900);
    pdf.roundedRect(L, y, CW, 8.5, 1.4, 1.4, 'F');
    font('bold', 8);
    color(C.white);
    pdf.text('#', colNum, y + 5.4, { charSpace: 0.4 });
    pdf.text('DESCRIÇÃO', colDesc, y + 5.4, { charSpace: 0.4 });
    pdf.text('NCM', colNcm, y + 5.4, { charSpace: 0.4 });
    pdf.text('QTD', colQty, y + 5.4, { align: 'center', charSpace: 0.4 });
    pdf.text('UNITÁRIO', colUnit, y + 5.4, { align: 'right', charSpace: 0.4 });
    pdf.text('TOTAL', colTotal, y + 5.4, { align: 'right', charSpace: 0.4 });
    y += 8.5;
  };
  const closeTable = (startY: number) => {
    stroke(C.slate900);
    pdf.setLineWidth(0.5);
    pdf.roundedRect(L, startY - 8.5, CW, y - startY + 8.5, 1.4, 1.4, 'S');
  };
  drawTableHeader();

  let rowsStartY = y;
  quote.items.forEach((item, idx) => {
    font('bold', 10);
    const descLines = pdf.splitTextToSize(item.description || '', colNcm - colDesc - 4) as string[];
    const noteLines = item.notes ? (pdf.splitTextToSize(String(item.notes), colNcm - colDesc - 4) as string[]) : [];
    const rowH = 4 + descLines.length * 4.6 + 4 + noteLines.length * 3.8 + 2.4;
    if (y + rowH > BOTTOM - 4) {
      closeTable(rowsStartY);
      newPage();
      drawTableHeader();
      rowsStartY = y;
    }
    fill(idx % 2 === 1 ? C.slate50 : C.white);
    pdf.rect(L, y, CW, rowH, 'F');
    stroke(C.slate200);
    pdf.setLineWidth(0.2);
    pdf.line(L, y, R, y);

    font('normal', 9, 'courier');
    color(C.slate400);
    pdf.text(String(idx + 1), colNum, y + 6);
    font('bold', 10);
    color(C.slate900);
    pdf.text(descLines, colDesc, y + 6);
    const ty = y + 6 + (descLines.length - 1) * 4.6 + 4;
    font('normal', 8, 'courier');
    color(C.slate500);
    pdf.text(`SKU ${item.sku || 'FM-TCT'}`, colDesc, ty);
    if (noteLines.length) {
      font('normal', 8);
      pdf.text(noteLines, colDesc, ty + 3.8);
    }
    font('normal', 9, 'courier');
    color(C.slate600);
    pdf.text(item.ncm || '8207.70.00', colNcm, y + 6);
    font('bold', 10);
    color(C.slate900);
    pdf.text(String(item.quantity), colQty, y + 6, { align: 'center' });
    font('normal', 9.5, 'courier');
    color(C.slate700);
    pdf.text(money(item.unitPrice), colUnit, y + 6, { align: 'right' });
    font('bold', 9.5, 'courier');
    color(C.slate900);
    pdf.text(money(item.totalPrice), colTotal, y + 6, { align: 'right' });
    y += rowH;
  });
  closeTable(rowsStartY);

  y += 8;

  // ---------- Pagamento + Resumo ----------
  const summary: Array<{ text: string; value: string; tone?: 'green' | 'red' }> = [
    { text: 'Ferramentas', value: money(quote.financials.subtotal) },
    {
      text: `Frete (${quote.shipping.selectedOption?.service || quote.shipping.selectedOption?.name || 'Envio'})`,
      value: money(quote.financials.shippingAmount || 0),
    },
  ];
  if (quote.shipping.insuranceEnabled && (quote.financials.insuranceAmount || 0) > 0) {
    summary.push({ text: 'Seguro de carga', value: `+ ${money(quote.financials.insuranceAmount || 0)}`, tone: 'green' });
  }
  if (quote.financials.discountAmount > 0) {
    summary.push({ text: 'Desconto', value: `- ${money(quote.financials.discountAmount)}`, tone: 'red' });
  }
  const totalBarH = 14;
  const boxH = Math.max(8 + summary.length * 6.4 + 3 + totalBarH, 40);
  ensure(boxH + 6);

  const leftW = CW * 0.56;
  const rightW = CW - leftW - gap;
  const rightX = L + leftW + gap;

  label('Pagamento', L, y);
  label('Resumo', rightX, y);
  y += 3;
  const boxY = y;

  fill(C.slate50);
  stroke(C.slate300);
  pdf.setLineWidth(0.4);
  pdf.roundedRect(L, boxY, leftW, boxH, 1.8, 1.8, 'FD');
  font('bold', 10.5);
  color(C.slate900);
  pdf.text('Pix ou link de pagamento com cartão de crédito', L + 5, boxY + 8);
  font('normal', 9.5);
  color(C.slate700);
  pdf.text('Chave Pix (CNPJ):', L + 5, boxY + 16);
  const kw = pdf.getTextWidth('Chave Pix (CNPJ):') + 3;
  font('bold', 10.5, 'courier');
  const pixW = pdf.getTextWidth(PIX_KEY) + 6;
  fill(C.white);
  stroke(C.slate200);
  pdf.roundedRect(L + 5 + kw, boxY + 11.4, pixW, 7.4, 1.2, 1.2, 'FD');
  color(C.slate900);
  pdf.text(PIX_KEY, L + 5 + kw + 3, boxY + 16.4);
  font('normal', 8.5);
  color(C.slate500);
  pdf.text(pdf.splitTextToSize('Pagamento via cartão de crédito é feito por link e possui juros.', leftW - 10) as string[], L + 5, boxY + 25);

  fill(C.slate50);
  stroke(C.slate300);
  pdf.roundedRect(rightX, boxY, rightW, boxH, 1.8, 1.8, 'FD');
  let sy = boxY + 8;
  summary.forEach((row) => {
    font('normal', 9.5);
    color(row.tone === 'green' ? C.greenDark : row.tone === 'red' ? C.red : C.slate600);
    pdf.text(row.text, rightX + 5, sy);
    font('bold', 9.5, 'courier');
    color(row.tone === 'green' ? C.greenDark : row.tone === 'red' ? C.red : C.slate900);
    pdf.text(row.value, rightX + rightW - 5, sy, { align: 'right' });
    sy += 6.4;
  });
  const barY = boxY + boxH - totalBarH;
  fill(C.slate900);
  pdf.roundedRect(rightX, barY, rightW, totalBarH, 1.8, 1.8, 'F');
  pdf.rect(rightX, barY, rightW, 4, 'F');
  font('bold', 9.5);
  color(C.amberLight);
  pdf.text('TOTAL', rightX + 5, barY + 8.8, { charSpace: 0.5 });
  font('bold', 15, 'courier');
  color(C.white);
  pdf.text(money(quote.financials.totalAmount), rightX + rightW - 5, barY + 9, { align: 'right' });

  y = boxY + boxH + 8;

  // ---------- Condições ----------
  const validity = quote.project.validityDays || 10;
  const conditions = [
    `Proposta válida por ${validity} dias a partir da data de emissão. Após esse prazo, valores e disponibilidade podem ser reavaliados.`,
    'O prazo de entrega é informado pela transportadora e conta a partir do despacho do pedido.',
    'Garantia contra defeitos de fabricação.',
  ];
  font('normal', 8.5);
  const wrapped = conditions.map((c) => pdf.splitTextToSize(c, CW - 14) as string[]);
  const condH = 12 + wrapped.reduce((acc, w) => acc + w.length * 4 + 1.2, 0);
  ensure(condH);
  fill(C.white);
  stroke(C.slate200);
  pdf.setLineWidth(0.3);
  pdf.roundedRect(L, y, CW, condH, 1.8, 1.8, 'S');
  fill(C.amber);
  pdf.roundedRect(L, y, 1.6, condH, 0.8, 0.8, 'F');
  label('Condições da proposta', L + 6, y + 6.2);
  let ly = y + 11.5;
  wrapped.forEach((lines) => {
    font('normal', 8.5);
    color(C.slate600);
    fill(C.amber);
    pdf.circle(L + 7, ly - 1, 0.55, 'F');
    pdf.text(lines, L + 10, ly);
    ly += lines.length * 4 + 1.2;
  });

  // ---------- Rodapé na última página ----------
  const footY = PH - M - 10;
  stroke(C.amber);
  pdf.setLineWidth(0.5);
  pdf.line(L, footY - 5, R, footY - 5);
  font('bold', 9.5);
  color(C.slate700);
  pdf.text('Obrigado pela preferência! • Fresa Master CNC', PW / 2, footY, { align: 'center' });
  font('normal', 8.2);
  color(C.slate500);
  pdf.text('CNPJ 59.085.330/0001-70 • fresamaster0@gmail.com • Salto/SP', PW / 2, footY + 4.6, { align: 'center' });

  pdf.setProperties({ title: `Orçamento ${quote.id} - Fresa Master`, author: 'Fresa Master CNC' });

  return pdf;
}
