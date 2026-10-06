import type { PrismaClient } from '@prisma/client';
import { adminCredentialsSchema } from '../../domain/adminCredentials.js';
import { hashPassword } from '../../infrastructure/password.js';
import { ApiError } from '../../middlewares/errorHandler.js';
import {
  createAdminUser,
  createCashier as createCashierRecord,
  findCashierById,
  findUserByEmail,
  findUserWithEmail,
  isUniqueViolation,
  listCashiers as listCashierRecords,
  setCashierActive as setCashierActiveRecord,
  type CashierRecord,
} from './repository.js';
import type { CreateCashierInput, ListCashiersQuery } from './schemas.js';

export const ADMIN_NAME = 'Administrador';

const CASHIER_NOT_FOUND_MESSAGE = 'El cajero no existe.';

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

export type CashierView = {
  id: number;
  name: string;
  email: string;
  active: boolean;
  createdAt: string;
};

function toCashierView(cashier: CashierRecord): CashierView {
  return {
    id: cashier.id,
    name: cashier.name,
    email: cashier.email,
    active: cashier.active,
    createdAt: cashier.createdAt.toISOString(),
  };
}

async function guardDuplicateEmail<T>(message: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    // El preaviso evita el gasto normal; esto cubre la carrera de dos altas simultáneas.
    if (isUniqueViolation(error)) {
      throw new ApiError(409, 'CONFLICT', message);
    }

    throw error;
  }
}

/** Solo los cajeros, en orden por nombre; nada se borra, se desactivan (RN-14). */
export async function listCashiers(query: ListCashiersQuery): Promise<CashierView[]> {
  return (await listCashierRecords(query.active)).map(toCashierView);
}

/** El correo es único en toda la tabla, no solo entre cajeros: si existe, es 409. */
export async function createCashier(input: CreateCashierInput): Promise<CashierView> {
  const duplicado = `Ya existe un usuario con el correo ${input.email}.`;

  if (await findUserWithEmail(input.email)) {
    throw new ApiError(409, 'CONFLICT', duplicado);
  }

  return toCashierView(
    await guardDuplicateEmail(duplicado, async () =>
      createCashierRecord({
        name: input.name,
        email: input.email,
        passwordHash: await hashPassword(input.password),
      }),
    ),
  );
}

/** Un id de admin o de cliente no es un cajero: responde 404 y no se toca. */
export async function setCashierActive(id: number, active: boolean): Promise<CashierView> {
  if (!(await findCashierById(id))) {
    throw new ApiError(404, 'NOT_FOUND', CASHIER_NOT_FOUND_MESSAGE);
  }

  return toCashierView(await setCashierActiveRecord(id, active));
}