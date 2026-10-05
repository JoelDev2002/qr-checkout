import { signAuthToken } from '../../infrastructure/jwt.js';
import { hashPassword, verifyPassword } from '../../infrastructure/password.js';
import { ApiError } from '../../middlewares/errorHandler.js';
import { findUserByEmail, findUserById, type UserRecord } from './repository.js';

/** Único mensaje para contraseña incorrecta, correo desconocido, usuario inactivo o sin contraseña. */
export const GENERIC_LOGIN_ERROR_MESSAGE = 'Correo o contraseña incorrectos';

const ROLES_WITH_PASSWORD: UserRecord['role'][] = ['CASHIER', 'ADMIN'];

export type PublicUser = {
  id: number;
  email: string;
  name: string;
  role: UserRecord['role'];
};

export type LoginResult = {
  token: string;
  user: PublicUser;
};

function toPublicUser(user: UserRecord): PublicUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

let dummyHash: Promise<string> | null = null;

/** Hash de mentira: hace que un correo inexistente tarde lo mismo que un correo real. */
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('qrcheckout-correo-inexistente');
  return dummyHash;
}

export async function loginWithPassword(email: string, password: string): Promise<LoginResult> {
  const user = await findUserByEmail(email);
  const hash = user?.passwordHash ?? (await getDummyHash());
  const passwordMatches = await verifyPassword(password, hash);

  if (!user || !passwordMatches || !user.active || !ROLES_WITH_PASSWORD.includes(user.role)) {
    throw new ApiError(401, 'UNAUTHORIZED', GENERIC_LOGIN_ERROR_MESSAGE);
  }

  const token = signAuthToken({ sub: String(user.id), role: user.role, email: user.email });

  return { token, user: toPublicUser(user) };
}

export async function getCurrentUser(userId: number): Promise<PublicUser> {
  const user = await findUserById(userId);

  if (!user || !user.active) {
    throw new ApiError(401, 'UNAUTHORIZED', 'La sesión ya no está vigente.');
  }

  return toPublicUser(user);
}