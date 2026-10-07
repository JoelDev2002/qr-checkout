import { describe, expect, it } from 'vitest';
import { CAMERA_BLOCKED_MESSAGE, IN_APP_BROWSER_MESSAGE } from './messages';

describe('mensajes de error de cámara', () => {
  it('usa los textos exactos de DESIGN.md §5', () => {
    expect(CAMERA_BLOCKED_MESSAGE).toBe(
      'No podemos usar la cámara. Actívala en los permisos del navegador o escribe el código.',
    );
    expect(IN_APP_BROWSER_MESSAGE).toBe('Abre esta página en Chrome o Safari para usar la cámara.');
  });
});
