import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Arranque con JWT_SECRET inválido (T3.3 parte B). La sonda corre `config/env.ts` en un proceso
 * aparte, ignorando el `.env` real, así que un secreto corto o ausente debe terminar el proceso
 * con código 1 y un mensaje que nombre la variable, sin arrancar la API.
 */

const backendDir = fileURLToPath(new URL('..', import.meta.url));
const fixturePath = fileURLToPath(new URL('./fixtures/envProbe.ts', import.meta.url));

const VALID_SECRET = 'clave-de-prueba-con-al-menos-32-caracteres';

const BASE_ENV = {
  NODE_ENV: 'test',
  FRONTEND_URL: 'http://localhost:5173',
  DATABASE_URL: 'mysql://usuario:clave@localhost:3306/qrcheckout',
};

type ProbeResult = { status: number | null; stdout: string; stderr: string };

function runProbe(overrides: Record<string, string>): ProbeResult {
  const env: Record<string, string | undefined> = { ...process.env, ...BASE_ENV };
  delete env.JWT_SECRET;
  Object.assign(env, overrides);

  const result = spawnSync(process.execPath, ['--import', 'tsx', fixturePath], {
    cwd: backendDir,
    env,
    encoding: 'utf8',
  });

  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('arranque con JWT_SECRET inválido', () => {
  it('arranca cuando el secreto tiene al menos 32 caracteres', () => {
    const result = runProbe({ JWT_SECRET: VALID_SECRET });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ENV_OK');
    expect(result.stderr).not.toContain('No se pudo iniciar la API');
  });

  it('falla con un secreto corto, sin arrancar y nombrando la variable', () => {
    const result = runProbe({ JWT_SECRET: 'corto' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('JWT_SECRET');
    expect(result.stderr).toContain('No se pudo iniciar la API');
    expect(result.stdout).not.toContain('ENV_OK');
  });

  it('falla sin secreto, sin arrancar y nombrando la variable', () => {
    const result = runProbe({});

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('JWT_SECRET');
    expect(result.stderr).toContain('No se pudo iniciar la API');
    expect(result.stdout).not.toContain('ENV_OK');
  });
});
