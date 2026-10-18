import { cadastralMimeTypes, MAX_CADASTRAL_BYTES } from '../supabase/functions/_shared/cadastralExtraction';

export interface AttachedCadastralDocument {
  name: string;
  size: number;
  type: string;
  base64: string;
  previewUrl?: string;
}

export async function readCadastralDocument(file: File): Promise<AttachedCadastralDocument> {
  const type = file.type === 'image/jpg' ? 'image/jpeg' : file.type;
  if (!cadastralMimeTypes.includes(type)) throw new Error('Anexe um PDF, JPG, PNG ou WEBP do Cartão CNPJ ou ficha cadastral.');
  if (!file.size) throw new Error('O arquivo está vazio. Anexe novamente.');
  if (file.size > MAX_CADASTRAL_BYTES) throw new Error('O arquivo deve ter no máximo 6 MB. Divida PDFs maiores em arquivos menores.');
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Não foi possível abrir o arquivo.'));
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo. Anexe novamente.'));
    reader.onabort = () => reject(new Error('A leitura do arquivo foi interrompida.'));
    reader.readAsDataURL(file);
  });
  return { name: file.name, size: file.size, type, base64, previewUrl: type.startsWith('image/') ? base64 : undefined };
}

export function cadastralWarnings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
