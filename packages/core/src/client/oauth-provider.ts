import type { OAuthTokens } from "./oauth-adapter.js";

/**
 * Parameters for starting an OAuth authorization flow
 */
export interface StartAuthorizationFlowParams {
  /** OAuth authorization endpoint URL */
  authorizationEndpoint: string;
  /** OAuth client ID */
  clientId: string;
  /** Redirect URI for the authorization callback */
  redirectUri: string;
  /** Requested OAuth scopes */
  scopes: string[];
  /** Resource server URL (RFC 8707) */
  resource: string;
  /** Optional state parameter for CSRF protection */
  state?: string;
}

/**
 * Result of starting an authorization flow
 */
export interface AuthorizationFlowResult {
  /** Complete authorization URL to redirect user to */
  authorizationUrl: string;
  /** PKCE code verifier to use in token exchange */
  codeVerifier: string;
  /** State parameter for CSRF validation */
  state: string;
}

/**
 * Parameters for exchanging authorization code for tokens
 */
export interface ExchangeCodeParams {
  /** OAuth token endpoint URL */
  tokenEndpoint: string;
  /** Authorization code from callback */
  code: string;
  /** PKCE code verifier from authorization flow */
  codeVerifier: string;
  /** OAuth client ID */
  clientId: string;
  /** Redirect URI used in authorization request */
  redirectUri: string;
  /** Resource server URL (RFC 8707) */
  resource: string;
}

/**
 * Parameters for refreshing an access token
 */
export interface RefreshTokenParams {
  /** OAuth token endpoint URL */
  tokenEndpoint: string;
  /** Refresh token */
  refreshToken: string;
  /** OAuth client ID */
  clientId: string;
  /** Resource server URL (RFC 8707) */
  resource: string;
}

/**
 * OAuth provider interface for handling OAuth 2.1 flows
 *
 * Implementations handle PKCE generation, authorization URL construction,
 * token exchange, and token refresh.
 */
export interface OAuthProvider {
  /**
   * Start an OAuth authorization flow with PKCE
   *
   * Generates a PKCE code verifier and challenge, constructs the authorization URL,
   * and returns everything needed to complete the flow.
   *
   * @param params - Authorization flow parameters
   * @returns Authorization URL and flow state (verifier, state)
   */
  startAuthorizationFlow(
    params: StartAuthorizationFlowParams,
  ): Promise<AuthorizationFlowResult>;

  /**
   * Exchange an authorization code for OAuth tokens
   *
   * Sends a token request to the OAuth server with the authorization code
   * and PKCE code verifier.
   *
   * @param params - Token exchange parameters
   * @returns OAuth tokens
   */
  exchangeCodeForTokens(params: ExchangeCodeParams): Promise<OAuthTokens>;

  /**
   * Refresh an expired access token
   *
   * Uses a refresh token to obtain a new access token without user interaction.
   *
   * @param params - Token refresh parameters
   * @returns New OAuth tokens
   */
  refreshAccessToken(params: RefreshTokenParams): Promise<OAuthTokens>;
}

/**
 * Standard OAuth 2.1 provider implementation
 *
 * Implements OAuth 2.1 authorization code flow with PKCE (RFC 7636).
 * Uses Web Crypto API for secure random generation and SHA-256 hashing.
 *
 * PKCE is mandatory for all OAuth 2.1 flows to prevent authorization code
 * interception attacks.
 */
export class StandardOAuthProvider implements OAuthProvider {
  /**
   * Generate a cryptographically random code verifier for PKCE
   *
   * Generates a 43-character base64url-encoded random string as specified in RFC 7636.
   *
   * @returns Base64url-encoded code verifier
   */
  private generateCodeVerifier(): string {
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    return this.base64UrlEncode(randomBytes);
  }

  /**
   * Generate a code challenge from a code verifier using S256 method
   *
   * Creates a SHA-256 hash of the code verifier and base64url-encodes it.
   *
   * @param verifier - Code verifier to hash
   * @returns Base64url-encoded code challenge
   */
  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return this.base64UrlEncode(new Uint8Array(hash));
  }

  /**
   * Generate a cryptographically random state parameter
   *
   * @returns Random state string for CSRF protection
   */
  private generateState(): string {
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    return this.base64UrlEncode(randomBytes);
  }

  /**
   * Base64url encode a byte array (RFC 4648 Section 5)
   *
   * @param bytes - Bytes to encode
   * @returns Base64url-encoded string
   */
  private base64UrlEncode(bytes: Uint8Array): string {
    // Convert bytes to base64
    const base64 = btoa(String.fromCharCode(...bytes));

    // Convert base64 to base64url (replace + with -, / with _, remove =)
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  async startAuthorizationFlow(
    params: StartAuthorizationFlowParams,
  ): Promise<AuthorizationFlowResult> {
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);
    const state = params.state || this.generateState();

    // Build authorization URL with all required parameters
    const url = new URL(params.authorizationEndpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", params.clientId);
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", state);
    url.searchParams.set("scope", params.scopes.join(" "));
    url.searchParams.set("resource", params.resource);

    return {
      authorizationUrl: url.toString(),
      codeVerifier,
      state,
    };
  }

  async exchangeCodeForTokens(
    params: ExchangeCodeParams,
  ): Promise<OAuthTokens> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
      client_id: params.clientId,
      code_verifier: params.codeVerifier,
      resource: params.resource,
    });

    const response = await fetch(params.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Token exchange failed: HTTP ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
      token_type: string;
    };

    return this.parseTokenResponse(data);
  }

  async refreshAccessToken(
    params: RefreshTokenParams,
  ): Promise<OAuthTokens> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: params.refreshToken,
      client_id: params.clientId,
      resource: params.resource,
    });

    const response = await fetch(params.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Token refresh failed: HTTP ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope?: string;
      token_type: string;
    };

    return this.parseTokenResponse(data);
  }

  /**
   * Parse OAuth token response into OAuthTokens structure
   *
   * @param data - Token response from OAuth server
   * @returns Parsed OAuth tokens
   */
  private parseTokenResponse(data: {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
    token_type: string;
  }): OAuthTokens {
    // Calculate expiry timestamp
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + data.expires_in;

    // Parse scopes
    const scopes = data.scope ? data.scope.split(" ") : [];

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
      scopes,
      tokenType: "Bearer",
    };
  }
}
