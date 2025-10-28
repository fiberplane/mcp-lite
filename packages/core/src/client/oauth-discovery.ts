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
 * Helper function to validate and return OAuth endpoints
 */
function validateAndReturnEndpoints(
  authorizationServer: string,
  authorizationEndpoint: string,
  tokenEndpoint: string,
  codeChallenges: string[],
  scopes: string[],
): OAuthEndpoints {
  if (!authorizationEndpoint || !tokenEndpoint) {
    throw new Error(
      "Authorization server metadata missing required endpoints (authorization_endpoint, token_endpoint)",
    );
  }

  if (!codeChallenges.includes("S256")) {
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

/**
 * Discover OAuth endpoints for an MCP server
 *
 * Follows RFC 8414 (OAuth 2.0 Authorization Server Metadata) and
 * RFC 8707 (Resource Indicators) to discover OAuth configuration.
 *
 * Per RFC 8707 Section 3, .well-known endpoints MUST be at the origin,
 * not sub-paths. For example, if the MCP endpoint is at
 * https://example.com/mcp, discovery uses https://example.com/.well-known/oauth-protected-resource
 *
 * Steps:
 * 1. Extract origin from baseUrl
 * 2. Fetch /.well-known/oauth-protected-resource from origin
 * 3. If origin discovery fails, try fetching the MCP endpoint to get WWW-Authenticate header with as_uri
 * 4. Retrieve authorization server URL from resource metadata or as_uri
 * 5. Fetch authorization server metadata
 * 6. Extract and validate OAuth endpoints
 * 7. Verify PKCE S256 support (mandatory for OAuth 2.1)
 *
 * @param baseUrl - MCP server base URL
 * @returns OAuth endpoint information
 * @throws Error if discovery fails or server doesn't support required features
 *
 * @example
 * ```typescript
 * const endpoints = await discoverOAuthEndpoints("https://api.example.com/mcp");
 * console.log(endpoints.authorizationEndpoint);
 * console.log(endpoints.tokenEndpoint);
 * ```
 */
export async function discoverOAuthEndpoints(
  baseUrl: string,
): Promise<OAuthEndpoints> {
  // Extract origin for RFC 8707 compliant discovery
  const url = new URL(baseUrl);
  const origin = url.origin;

  // Step 1: Fetch resource server metadata (RFC 8707)
  // Per RFC 8707, .well-known endpoints MUST be at the origin, not sub-paths
  const resourceMetadataUrl = `${origin}/.well-known/oauth-protected-resource`;
  const resourceResponse = await fetch(resourceMetadataUrl);

  // Step 1.5: If origin discovery fails, try the actual endpoint to get WWW-Authenticate
  if (!resourceResponse.ok) {
    // Make a request to the actual MCP endpoint to get auth headers
    const endpointResponse = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "discovery",
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          clientInfo: { name: "discovery", version: "1.0.0" },
          capabilities: {},
        },
      }),
    });

    // Check for WWW-Authenticate header with as_uri
    const wwwAuth = endpointResponse.headers.get("www-authenticate");
    if (wwwAuth && endpointResponse.status === 401) {
      const asUriMatch = wwwAuth.match(/as_uri="([^"]+)"/);
      if (asUriMatch?.[1]) {
        const authServerMetadataUrl = asUriMatch[1];
        // Skip resource metadata, go directly to authorization server
        const serverResponse = await fetch(authServerMetadataUrl);

        if (!serverResponse.ok) {
          throw new Error(
            `Failed to fetch authorization server metadata from ${authServerMetadataUrl}: HTTP ${serverResponse.status}`,
          );
        }

        const serverMetadata = (await serverResponse.json()) as {
          authorization_endpoint?: string;
          token_endpoint?: string;
          code_challenge_methods_supported?: string[];
          issuer?: string;
        };

        // Extract issuer as authorization server
        const authorizationServer = serverMetadata.issuer || origin;

        return validateAndReturnEndpoints(
          authorizationServer,
          serverMetadata.authorization_endpoint ?? "",
          serverMetadata.token_endpoint ?? "",
          serverMetadata.code_challenge_methods_supported || [],
          [], // scopes from resource metadata not available
        );
      }
    }

    // If still no success, throw original error
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
  const authorizationEndpoint = serverMetadata.authorization_endpoint ?? "";
  const tokenEndpoint = serverMetadata.token_endpoint ?? "";
  const supportedChallengeMethods: string[] =
    serverMetadata.code_challenge_methods_supported || [];

  return validateAndReturnEndpoints(
    authorizationServer,
    authorizationEndpoint,
    tokenEndpoint,
    supportedChallengeMethods,
    scopes,
  );
}
