/**
 * Auth errors - mimics the errors from the @modelcontextprotocol/sdk package
 */

/**
 * Base auth error class
 */
export class BaseAuthError extends Error {
  errorCode: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.errorCode = code;
    this.status = status;
  }
  toResponseObject(): Record<string, unknown> {
    return { error: this.errorCode, error_description: this.message };
  }
}

export class InvalidTokenError extends BaseAuthError {
  constructor(message: string) {
    super("invalid_token", message, 401);
  }
}

export class InsufficientScopeError extends BaseAuthError {
  constructor(message: string) {
    super("insufficient_scope", message, 403);
  }
}

export class ServerError extends BaseAuthError {
  constructor(message: string) {
    super("server_error", message, 500);
  }
}
