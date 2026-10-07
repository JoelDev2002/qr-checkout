import { signAuthToken } from '../../infrastructure/jwt.js';
import { hashPassword, verifyPassword } from '../../infrastructure/password.js';
import type { GoogleIdTokenVerifier } from '../../infrastructure/googleAuth.js';
import { ApiError } from '../../middlewares/errorHandler.js';
import {
  createCustomer,
  findUserByEmail,
  findUserById,
  findUserByGoogleId,
  linkGoogleId,
  type AuthRepository,
  type UserRecord,
} from './repository.js';

/** Único mensaje para contraseña incorrecta, correo desconocido, usuario inactivo o sin contraseña. */
export const GENERIC_LOGIN_ERROR_MESSAGE = 'Correo o contraseña incorrectos';

export const GOOGLE_LOGIN_FORBIDDEN_MESSAGE = 'Esta cuenta no puede entrar con Google';

export const DEV_LOGIN_EMAIL = 'cliente.prueba@qrcheckout.test';
const DEV_LOGIN_NAME = 'Cliente de prueba';

const defaultRepository: AuthRepository = {
  findUserByEmail,
  findUserByGoogleId,
  linkGoogleId,
  createCustomer,
};

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

async function issueSession(user: UserRecord): Promise<LoginResult> {
  const token = signAuthToken({ sub: String(user.id), role: user.role, email: user.email });

  return { token, user: toPublicUser(user) };
}

/** Solo los clientes entran con la cuenta de Google; un inactivo recibe el 401 genérico. */
async function ensureCustomerSession(user: UserRecord): Promise<LoginResult> {
  if (user.role !== 'CUSTOMER') {
    throw new ApiError(403, 'FORBIDDEN', GOOGLE_LOGIN_FORBIDDEN_MESSAGE);
  }

  if (!user.active) {
    throw new ApiError(401, 'UNAUTHORIZED', GENERIC_LOGIN_ERROR_MESSAGE);
  }

  return issueSession(user);
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

  return issueSession(user);
}

export async function getCurrentUser(userId: number): Promise<PublicUser> {
  const user = await findUserById(userId);

  if (!user || !user.active) {
    throw new ApiError(401, 'UNAUTHORIZED', 'La sesión ya no está vigente.');
  }

  return toPublicUser(user);
}

export type GoogleLoginDeps = {
  /** Verificador inyectado: las pruebas le pasan uno falso y evitan llamadas a Google. */
  verifier: GoogleIdTokenVerifier;
  repository?: AuthRepository;
};

/**
 * RN-14: el cliente entra con Google firmando él mismo el ID token. El servidor solo verifica
 * la firma (audience = GOOGLE_CLIENT_ID) y decide entre usar, vincular o crear al cliente.
 */
export async function loginWithGoogle(credential: string, deps: GoogleLoginDeps): Promise<LoginResult> {
  let profile;
  try {
    profile = await deps.verifier(credential);
  } catch {
    // Un token rechazado por Google no dice si fue por firma, vencimiento o audiencia.
    throw new ApiError(401, 'UNAUTHORIZED', GENERIC_LOGIN_ERROR_MESSAGE);
  }

  if (!profile.email || !profile.emailVerified) {
    throw new ApiError(401, 'UNAUTHORIZED', GENERIC_LOGIN_ERROR_MESSAGE);
  }

  const repo = deps.repository ?? defaultRepository;

  const existingGoogle = await repo.findUserByGoogleId(profile.googleId);

  if (existingGoogle) {
    return ensureCustomerSession(existingGoogle);
  }

  const existingEmail = await repo.findUserByEmail(profile.email);

  if (existingEmail) {
    if (existingEmail.role !== 'CUSTOMER') {
      throw new ApiError(403, 'FORBIDDEN', GOOGLE_LOGIN_FORBIDDEN_MESSAGE);
    }

    if (!existingEmail.active) {
      throw new ApiError(401, 'UNAUTHORIZED', GENERIC_LOGIN_ERROR_MESSAGE);
    }

    // Un cliente ya vinculado a otro Google no se re-vincula en silencio.
    if (existingEmail.googleId) {
      throw new ApiError(403, 'FORBIDDEN', GOOGLE_LOGIN_FORBIDDEN_MESSAGE);
    }

    return issueSession(await repo.linkGoogleId(existingEmail.id, profile.googleId));
  }

  const created = await repo.createCustomer({
    email: profile.email,
    name: profile.name ?? profile.email,
    googleId: profile.googleId,
  });

  return issueSession(created);
}

/** Login falso para pruebas y demo del frontend: crea o reutiliza siempre el mismo cliente. */
export async function devLogin(repository: AuthRepository = defaultRepository): Promise<LoginResult> {
  const customer =
    (await repository.findUserByEmail(DEV_LOGIN_EMAIL)) ??
    (await repository.createCustomer({ email: DEV_LOGIN_EMAIL, name: DEV_LOGIN_NAME }));

  if (!customer.active) {
    throw new ApiError(401, 'UNAUTHORIZED', GENERIC_LOGIN_ERROR_MESSAGE);
  }

  return issueSession(customer);
}