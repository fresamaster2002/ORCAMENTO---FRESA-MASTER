import { AlertTriangle, ExternalLink } from 'lucide-react';

export function ProductionShipmentNotice() {
  return (
    <div className="space-y-3">
      <p className="fm-warning-soft flex gap-2 rounded-lg border p-3 text-sm"><AlertTriangle className="h-5 w-5 shrink-0" />Esta tela usa a conta real. O app só inclui o envio no carrinho: não paga, não compra nem emite etiqueta. Pagamento e emissão serão feitos por você no painel oficial.</p>
      <a href="https://melhorenvio.com.br/carrinho" target="_blank" rel="noopener noreferrer" className="fm-accent inline-flex items-center gap-2 font-bold underline"><ExternalLink className="h-4 w-4" />Abrir carrinho REAL para pagar e emitir etiqueta</a>
    </div>
  );
}
