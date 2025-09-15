/**
 * Similar type to the @modelcontextprotocol/sdk AuthInfo type.
 * Allows for cross-compatibility with the @modelcontextprotocol/sdk.
 */
export type AuthInfo = {
  token: string;
  scopes: string[];
  /** Token expiry in seconds since epoch */
  expiresAt?: number;
  /** Additional provider-specific data */
  extra?: Record<string, unknown>;
};
