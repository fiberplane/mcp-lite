/**
 * Dynamic Client Registration for OAuth 2.0 (RFC 7591)
 */

/**
 * Client credentials returned from Dynamic Client Registration
 */
export interface ClientCredentials {
  /** OAuth client identifier */
  clientId: string;
  /** Client secret (optional for public clients using PKCE) */
  clientSecret?: string;
  /** Registration access token for updating client metadata */
  registrationAccessToken?: string;
  /** Registration client URI for updating/deleting client */
  registrationClientUri?: string;
}

/**
 * Client metadata for Dynamic Client Registration
 */
export interface ClientMetadata {
  /** Human-readable client name */
  clientName: string;
  /** Redirect URIs for OAuth callbacks */
  redirectUris: string[];
  /** Grant types supported */
  grantTypes?: string[];
  /** Token endpoint authentication method */
  tokenEndpointAuthMethod?: string;
  /** Scopes to request */
  scope?: string;
}

/**
 * Register a new OAuth client dynamically per RFC 7591
 *
 * @param registrationEndpoint - Client registration endpoint URL
 * @param metadata - Client metadata to register
 * @returns Client credentials including client_id
 * @throws Error if registration fails
 *
 * @example
 * ```typescript
 * const credentials = await registerOAuthClient(
 *   "https://auth.example.com/register",
 *   {
 *     clientName: "MCP Client",
 *     redirectUris: ["http://localhost:3000/callback"],
 *   }
 * );
 * console.log(credentials.clientId);
 * ```
 */
export async function registerOAuthClient(
  registrationEndpoint: string,
  metadata: ClientMetadata,
): Promise<ClientCredentials> {
  // Prepare registration request per RFC 7591
  const registrationRequest = {
    client_name: metadata.clientName,
    redirect_uris: metadata.redirectUris,
    grant_types: metadata.grantTypes || ["authorization_code", "refresh_token"],
    token_endpoint_auth_method: metadata.tokenEndpointAuthMethod || "none",
    ...(metadata.scope && { scope: metadata.scope }),
  };

  const response = await fetch(registrationEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(registrationRequest),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Dynamic Client Registration failed: HTTP ${response.status} - ${errorBody}`,
    );
  }

  const registrationResponse = (await response.json()) as {
    client_id: string;
    client_secret?: string;
    registration_access_token?: string;
    registration_client_uri?: string;
  };

  if (!registrationResponse.client_id) {
    throw new Error(
      "Dynamic Client Registration response missing client_id field",
    );
  }

  return {
    clientId: registrationResponse.client_id,
    clientSecret: registrationResponse.client_secret,
    registrationAccessToken: registrationResponse.registration_access_token,
    registrationClientUri: registrationResponse.registration_client_uri,
  };
}
