import type { CredentialResponse } from '@react-oauth/google';
import { describe, expect, it } from 'vitest';
import { readGoogleCredential } from './googleCredential';

describe('readGoogleCredential', () => {
  it('devuelve el token cuando viene', () => {
    expect(readGoogleCredential({ credential: 'token-de-google' })).toBe('token-de-google');
  });

  it.each([[undefined], ['']])('devuelve null con credential %s', (credential) => {
    expect(readGoogleCredential({ credential })).toBeNull();
  });

  it('devuelve null si el token no es texto', () => {
    const respuesta = { credential: 123 } as unknown as CredentialResponse;
    expect(readGoogleCredential(respuesta)).toBeNull();
  });

  it('devuelve null con una respuesta vacía', () => {
    expect(readGoogleCredential({})).toBeNull();
  });
});
