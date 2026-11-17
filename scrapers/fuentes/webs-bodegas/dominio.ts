/** Dominio registrable aproximado: «tienda.matarromera.es» → «matarromera.es»; «x.com.es» → «x.com.es». */
export function dominioBase(host: string): string {
  const partes = host.toLowerCase().replace(/^www\d*\./, "").split(".");
  const n = /^(com|org|net|gob|edu|nom)$/.test(partes[partes.length - 2] ?? "") && partes.length >= 3 ? 3 : 2;
  return partes.slice(-n).join(".");
}
