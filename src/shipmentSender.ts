import { DEFAULT_ORIGIN_CEP } from '../supabase/functions/_shared/shippingDefaults';

export interface SenderData {
  name: string;
  document: string;
  ie: string;
  email: string;
  phone: string;
  address: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
}

export const initialSender: SenderData = {
  name: 'Fresa Master', document: '59.085.330/0001-70', ie: '600320622110',
  email: 'fresamaster0@gmail.com', phone: '(11) 99852-4939',
  address: 'Rua das Nações Unidas', number: '600', complement: '',
  neighborhood: 'Olaria', city: 'Salto', state: 'SP', cep: DEFAULT_ORIGIN_CEP,
};
export const SENDER_STORAGE_KEY = 'fresa_master_sender_v2';
export const senderFields: Array<{ key: keyof SenderData; label: string; required?: boolean }> = [
  { key: 'name', label: 'Nome / Razão social', required: true },
  { key: 'document', label: 'CPF / CNPJ', required: true },
  { key: 'ie', label: 'Inscrição estadual / isenção confirmada', required: true },
  { key: 'email', label: 'E-mail' }, { key: 'phone', label: 'Telefone' },
  { key: 'address', label: 'Endereço', required: true }, { key: 'number', label: 'Número', required: true },
  { key: 'complement', label: 'Complemento' }, { key: 'neighborhood', label: 'Bairro', required: true },
  { key: 'city', label: 'Cidade', required: true }, { key: 'state', label: 'UF', required: true },
  { key: 'cep', label: 'CEP', required: true },
];

export function loadSender(): SenderData {
  try {
    const raw = localStorage.getItem(SENDER_STORAGE_KEY);
    if (!raw) return { ...initialSender };
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('Remetente salvo inválido.');
    const sender = { ...initialSender };
    for (const { key } of senderFields) {
      const value = Reflect.get(saved, key);
      if (typeof value === 'string') sender[key] = value;
    }
    return sender;
  } catch (cause) {
    console.error('Não foi possível recuperar o remetente; confira os dados padrão antes de enviar:', cause);
    return { ...initialSender };
  }
}
