/**
 * Deja el texto leído o escrito a mano como un código: sin espacios ni
 * caracteres de control y en mayúsculas, porque los códigos del proyecto
 * son dígitos y letras mayúsculas (EAN-13, internos y C-XXXXX).
 */
export function normalizeScanText(raw: string): string {
  return raw.replace(/[\s\u0000-\u001f\u007f]+/g, '').toUpperCase();
}
