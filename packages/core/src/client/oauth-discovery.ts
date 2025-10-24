/**
 * OAuth endpoint information discovered from an MCP server
 */
export interface OAuthEndpoints {
  /** Authorization server URL */
  authorizationServer: string;
  /** Authorization endpoint URL for starting OAuth flows */
  authorizationEndpoint: string;
  /** Token endpoint URL for exchanging codes and refreshing tokens */
  tokenEndpoint: string;
  /** Scopes required for accessing this resource server */
  scopes: string[];
}

/**
 * Discover OAuth endpoints for an MCP server
 *
 * Follows RFC 8414 (OAuth 2.0 Authorization Server Metadata) and
 * RFC 8707 (Resource Indicators) to discover OAuth configuration.
 *
 * Steps:
 * 1. Fetch /.well-known/oauth-protected-resource from MCP server
 * 2. Retrieve authorization server URL from resource metadata
 * 3. Fetch authorization server metadata
 * 4. Extract and validate OAuth endpoints
 * 5. Verify PKCE S256 support (mandatory for OAuth 2.1)
 *
 * @param baseUrl - MCP server base URL
 * @returns OAuth endpoint information
 * @throws Error if discovery fails or server doesn't support required features
 *
 * @example
 * ```typescript
 * const endpoints = await discoverOAuthEndpoints("https://api.example.com");
 * console.log(endpoints.authorizationEndpoint);
 * console.log(endpoints.tokenEndpoint);
 * ```
 */
export async function discoverOAuthEndpoints(
  baseUrl: string,
): Promise<OAuthEndpoints> {
  // Normalize base URL (remove trailing slash)
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");

  // Step 1: Fetch resource server metadata (RFC 8707)
  const resourceMetadataUrl = `${normalizedBaseUrl}/.well-known/oauth-protected-resource`;
  const resourceResponse = await fetch(resourceMetadataUrl);

  if (!resourceResponse.ok) {
    throw new Error(
      `Failed to fetch resource metadata from ${resourceMetadataUrl}: HTTP ${resourceResponse.status}`,
    );
  }

  const resourceMetadata = (await resourceResponse.json()) as {
    authorization_servers?: string[];
    authorization_server?: string;
    scopes_supported?: string[];
  };

  // Extract authorization server URL
  const authorizationServer =
    resourceMetadata.authorization_servers?.[0] ||
    resourceMetadata.authorization_server;

  if (!authorizationServer) {
    throw new Error(
      "Resource metadata missing authorization_server or authorization_servers field",
    );
  }

  // Extract required scopes
  const scopes: string[] = resourceMetadata.scopes_supported || [];

  // Step 2: Fetch authorization server metadata (RFC 8414)
  const serverMetadataUrl = `${authorizationServer}/.well-known/oauth-authorization-server`;
  const serverResponse = await fetch(serverMetadataUrl);

  if (!serverResponse.ok) {
    throw new Error(
      `Failed to fetch authorization server metadata from ${serverMetadataUrl}: HTTP ${serverResponse.status}`,
    );
  }

  const serverMetadata = (await serverResponse.json()) as {
    authorization_endpoint?: string;
    token_endpoint?: string;
    code_challenge_methods_supported?: string[];
  };

  // Extract endpoints
  const authorizationEndpoint = serverMetadata.authorization_endpoint;
  const tokenEndpoint = serverMetadata.token_endpoint;

  if (!authorizationEndpoint || !tokenEndpoint) {
    throw new Error(
      "Authorization server metadata missing required endpoints (authorization_endpoint, token_endpoint)",
    );
  }

  // Step 3: Verify PKCE S256 support (mandatory for OAuth 2.1)
  const supportedChallengeMethods: string[] =
    serverMetadata.code_challenge_methods_supported || [];

  if (!supportedChallengeMethods.includes("S256")) {
    throw new Error(
      "Authorization server does not support PKCE S256 method (required for OAuth 2.1)",
    );
  }

  return {
    authorizationServer,
    authorizationEndpoint,
    tokenEndpoint,
    scopes,
  };
}
