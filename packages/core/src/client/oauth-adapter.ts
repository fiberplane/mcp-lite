/**
 * OAuth tokens stored for a specific resource server
 */
export interface OAuthTokens {
  /** Access token for API authorization */
  accessToken: string;
  /** Optional refresh token for obtaining new access tokens */
  refreshToken?: string;
  /** Unix timestamp in seconds when the access token expires */
  expiresAt: number;
  /** Scopes granted for this token */
  scopes: string[];
  /** Token type, always "Bearer" for OAuth 2.1 */
  tokenType: "Bearer";
}

/**
 * Adapter interface for OAuth token persistence
 *
 * Implementations can store tokens in memory, localStorage, secure storage, database, etc.
 * Each resource server (MCP server) has its own set of tokens identified by the resource URL.
 */
export interface OAuthAdapter {
  /**
   * Store OAuth tokens for a specific resource server
   *
   * @param resource - Resource server URL (MCP server base URL)
   * @param tokens - OAuth tokens to store
   */
  storeTokens(resource: string, tokens: OAuthTokens): Promise<void> | void;

  /**
   * Retrieve OAuth tokens for a specific resource server
   *
   * @param resource - Resource server URL (MCP server base URL)
   * @returns OAuth tokens if found, undefined otherwise
   */
  getTokens(
    resource: string,
  ): Promise<OAuthTokens | undefined> | OAuthTokens | undefined;

  /**
   * Delete OAuth tokens for a specific resource server
   *
   * @param resource - Resource server URL (MCP server base URL)
   */
  deleteTokens(resource: string): Promise<void> | void;

  /**
   * Check if a valid (non-expired) token exists for a resource server
   *
   * @param resource - Resource server URL (MCP server base URL)
   * @returns True if a valid token exists, false otherwise
   */
  hasValidToken(resource: string): Promise<boolean> | boolean;
}

/**
 * In-memory OAuth token adapter
 *
 * Stores tokens in memory. Tokens are lost when the process exits.
 * Suitable for testing and short-lived clients.
 *
 * For production use, implement a persistent adapter that stores tokens
 * in secure storage (e.g., encrypted file, secure database, keychain).
 */
export class InMemoryOAuthAdapter implements OAuthAdapter {
  private tokens = new Map<string, OAuthTokens>();

  storeTokens(resource: string, tokens: OAuthTokens): void {
    this.tokens.set(resource, tokens);
  }

  getTokens(resource: string): OAuthTokens | undefined {
    return this.tokens.get(resource);
  }

  deleteTokens(resource: string): void {
    this.tokens.delete(resource);
  }

  hasValidToken(resource: string): boolean {
    const tokens = this.tokens.get(resource);
    if (!tokens) {
      return false;
    }

    // Check if token is expired (with 5 minute buffer)
    const now = Math.floor(Date.now() / 1000);
    const BUFFER_SECONDS = 5 * 60;
    return tokens.expiresAt > now + BUFFER_SECONDS;
  }
}
