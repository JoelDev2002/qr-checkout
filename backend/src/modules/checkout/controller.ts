import type { Request, Response } from "express";
import type { ZodError, ZodIssue } from "zod";
import { ApiError } from "../../middlewares/errorHandler.js";
import { getSalesToday } from "./service.js";

function describeIssue(issue: ZodIssue): string {
  if (issue.code === 'unrecognized_keys') {
    return `Estos campos no se permiten aqui: ${issue.keys.join(", ")}.`;
  }
  return issue.message;
}

function parse<T>(result: { success: true; data: T } | { success: false; error: ZodError }): T {
  if (!result.success) {
    const message = result.error.issues.map(describeIssue).join(" ");
    throw new ApiError(400, 'VALIDATION_ERROR', message);
  }
  return result.data;
}

function actorUserId(req: Request): number {
  if (!req.user) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Se requiere autenticacion.');
  }
  return Number(req.user.sub);
}

export async function getSalesTodayController(req: Request, res: Response): Promise<void> {
  const result = await getSalesToday(actorUserId(req), new Date());
  res.json({ data: result });
}
