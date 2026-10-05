import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Express 4 no captura los rechazos de promesas en los manejadores asíncronos. */
export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}