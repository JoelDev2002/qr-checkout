import type { ErrorRequestHandler, RequestHandler } from 'express';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'La ruta solicitada no existe.' },
  });
};

/**
 * Errores de body-parser: se responden con mensaje propio en el formato de ARCHITECTURE §6
 * y sin el detalle técnico que trae el error original.
 */
const bodyParserErrors: Record<string, { status: number; code: string; message: string }> = {
  'entity.parse.failed': {
    status: 400,
    code: 'VALIDATION_ERROR',
    message: 'El cuerpo de la petición no es JSON válido.',
  },
  'entity.too.large': {
    status: 413,
    code: 'VALIDATION_ERROR',
    message: 'El cuerpo de la petición supera el tamaño máximo permitido.',
  },
};

function bodyParserResponse(
  error: unknown,
): { status: number; code: string; message: string } | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }

  const { type } = error as { type?: unknown };

  return typeof type === 'string' ? (bodyParserErrors[type] ?? null) : null;
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }

  const bodyParserError = bodyParserResponse(error);

  if (bodyParserError) {
    res
      .status(bodyParserError.status)
      .json({ error: { code: bodyParserError.code, message: bodyParserError.message } });
    return;
  }

  // El error completo, con su stack, solo se registra en consola: la respuesta es siempre genérica.
  console.error(error);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado.' },
  });
};
