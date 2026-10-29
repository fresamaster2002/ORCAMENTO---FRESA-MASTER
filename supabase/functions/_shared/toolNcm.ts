export const DEFAULT_FRESA_NCM = '8207.70.10';

export function resolveToolNcm(value: string | undefined, description: string): string {
  const ncm = (value || '').trim();
  const digits = ncm.replace(/\D/g, '');
  if ((!ncm || digits === '82077000') && /\bfresas?\b/i.test(description)) return DEFAULT_FRESA_NCM;
  return ncm;
}
