export type ServiceErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "INTERNAL";

export class ServiceError extends Error {
  public readonly code: ServiceErrorCode;
  public readonly field?: string;

  constructor(code: ServiceErrorCode, message: string, field?: string) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
    this.field = field;
  }
}

export const HTTP_STATUS_MAP: Record<ServiceErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL: 500,
};

export function validationError(message: string, field?: string): never {
  throw new ServiceError("VALIDATION", message, field);
}

export function notFound(entity: string, id: string): never {
  throw new ServiceError("NOT_FOUND", `${entity} ID ${id} not found or unauthorized`);
}

export function unauthorized(message = "Authentication required"): never {
  throw new ServiceError("UNAUTHORIZED", message);
}

export function forbidden(message = "Access forbidden"): never {
  throw new ServiceError("FORBIDDEN", message);
}

export function conflict(message: string): never {
  throw new ServiceError("CONFLICT", message);
}

export function isValidPositiveNumber(val: unknown): val is number {
  return typeof val === "number" && Number.isFinite(val) && val > 0;
}

export function isValidFiniteNumber(val: unknown): val is number {
  return typeof val === "number" && Number.isFinite(val);
}

export function isValidUUID(id: unknown): id is string {
  return typeof id === "string" && id.trim().length > 0;
}
