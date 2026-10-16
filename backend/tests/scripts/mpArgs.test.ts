import { describe, expect, it } from 'vitest';
import { requireAccessToken } from '../../scripts/mp-args.js';

describe('requireAccessToken', () => {
  it('acepta una llave presente y recorta los espacios', () => {
    const result = requireAccessToken('  llave-de-prueba  ');
    expect(result).toEqual({ ok: true, value: { accessToken: 'llave-de-prueba' } });
  });

  it('falla con un mensaje claro si la llave falta', () => {
    const result = requireAccessToken(undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('MP_ACCESS_TOKEN');
    }
  });

  it('falla si la llave está vacía', () => {
    const result = requireAccessToken('   ');
    expect(result.ok).toBe(false);
  });
});
