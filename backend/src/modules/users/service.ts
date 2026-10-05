import type { PrismaClient } from '@prisma/client';
import { adminCredentialsSchema } from '../../domain/adminCredentials.js';
import { hashPassword } from '../../infrastructure/password.js';
import { createAdminUser, findUserByEmail } from './repository.js';

export const ADMIN_NAME = 'Administrador';

export class SeedAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedAdminError';
  }
}

export type SeedAdminResult = {
  /** false si el admin ya existía: no se creó otro ni se cambió su contraseña. */
  created: boolean;
  userId: number;
  email: string;
};

/** Crea el admin inicial. Idempotente: si el correo ya es ADMIN, no repite ni toca la contraseña. */
export async function seedAdmin(
  client: PrismaClient,
  email: string,
  password: string,
): Promise<SeedAdminResult> {
  const parsed = adminCredentialsSchema.safeParse({ email, password });

  if (!parsed.success) {
    throw new SeedAdminError(parsed.error.issues.map((issue) => issue.message).join(' '));
  }

  const credentials = parsed.data;
  const existing = await findUserByEmail(client, credentials.email);

  if (existing) {
    if (existing.role !== 'ADMIN') {
      throw new SeedAdminError(
        `Ya existe un usuario con el correo ${existing.email} y su rol es ${existing.role}: cambia su rol o usa otro ADMIN_EMAIL.`,
      );
    }

    return { created: false, userId: existing.id, email: existing.email };
  }

  const created = await createAdminUser(client, {
    email: credentials.email,
    name: ADMIN_NAME,
    passwordHash: await hashPassword(credentials.password),
  });

  return { created: true, userId: created.id, email: created.email };
}
