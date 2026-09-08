export class AuthorizationError extends Error {
  constructor(public readonly statusCode: 400 | 403 | 404, public readonly code: "validation_error" | "forbidden" | "not_found", message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}
