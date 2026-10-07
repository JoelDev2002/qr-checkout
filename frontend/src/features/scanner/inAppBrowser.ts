/**
 * Navegadores que abren las páginas dentro de otra app. Ahí la cámara suele
 * estar bloqueada, así que conviene avisar antes de pedir el permiso.
 */
const IN_APP_PATTERNS: readonly RegExp[] = [
  /instagram/i,
  /facebook/i,
  /fb(an|av|ios|4a|iab)/i, // UAs de la app de Facebook: FBAN, FBAV, FBIOS, FB4A, FB_IAB
  /tiktok/i,
  /twitter/i,
  /\bline\b/i,
  /snapchat/i,
  /micromessenger/i, // WeChat
  /telegram/i,
  /kakaotalk/i,
  /discord/i,
  /whatsapp/i,
  /;\s*wv\)/, // WebView de Android (la app de turno muestra la página en su propio visor)
];

export function isInAppBrowser(userAgent: string): boolean {
  return IN_APP_PATTERNS.some((pattern) => pattern.test(userAgent));
}
