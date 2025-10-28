import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { type Server, serve } from "bun";
import {
  discoverOAuthEndpoints,
  InMemoryOAuthAdapter,
  McpClient,
  type OAuthConfig,
  StandardOAuthProvider,
  StreamableHttpClientTransport,
} from "../../src/index.js";

describe("MCP Client - OAuth Integration", () => {
  let oauthServer: Server;
  let mcpServer: Server;
  let oauthServerUrl: string;
  let mcpServerUrl: string;
  let authorizationCallbackUrl: string | null = null;

  // Mock OAuth token response
  const mockTokenResponse = {
    access_token: "mock_access_token_12345",
    refresh_token: "mock_refresh_token_67890",
    expires_in: 3600,
    scope: "mcp:access",
    token_type: "Bearer",
  };

  beforeEach(async () => {
    // Create OAuth authorization server
    oauthServer = serve({
      port: 0, // random port
      async fetch(request) {
        const url = new URL(request.url);

        // OAuth discovery endpoint (RFC 8414)
        if (url.pathname === "/.well-known/oauth-authorization-server") {
          return new Response(
            JSON.stringify({
              issuer: oauthServerUrl,
              authorization_endpoint: `${oauthServerUrl}/authorize`,
              token_endpoint: `${oauthServerUrl}/token`,
              code_challenge_methods_supported: ["S256"],
              grant_types_supported: ["authorization_code", "refresh_token"],
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }

        // Token endpoint
        if (url.pathname === "/token" && request.method === "POST") {
          const body = await request.text();
          const params = new URLSearchParams(body);
          const grantType = params.get("grant_type");

          if (grantType === "authorization_code") {
            // Verify PKCE parameters
            const codeVerifier = params.get("code_verifier");
            const resource = params.get("resource");

            if (!codeVerifier) {
              return new Response(
                JSON.stringify({ error: "missing_code_verifier" }),
                {
                  status: 400,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }

            if (!resource) {
              return new Response(
                JSON.stringify({ error: "missing_resource" }),
                {
                  status: 400,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }

            return new Response(JSON.stringify(mockTokenResponse), {
              headers: { "Content-Type": "application/json" },
            });
          }

          if (grantType === "refresh_token") {
            const refreshToken = params.get("refresh_token");
            const resource = params.get("resource");

            if (!refreshToken) {
              return new Response(
                JSON.stringify({ error: "missing_refresh_token" }),
                {
                  status: 400,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }

            if (!resource) {
              return new Response(
                JSON.stringify({ error: "missing_resource" }),
                {
                  status: 400,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }

            // Return new tokens with updated expiry
            return new Response(
              JSON.stringify({
                ...mockTokenResponse,
                access_token: "refreshed_access_token",
              }),
              { headers: { "Content-Type": "application/json" } },
            );
          }

          return new Response(
            JSON.stringify({ error: "unsupported_grant_type" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        return new Response("Not Found", { status: 404 });
      },
    });

    oauthServerUrl = `http://localhost:${oauthServer.port}`;

    // Create OAuth-protected MCP server
    mcpServer = serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);

        // Resource server discovery endpoint (RFC 8707)
        if (url.pathname === "/.well-known/oauth-protected-resource") {
          return new Response(
            JSON.stringify({
              resource: mcpServerUrl,
              authorization_servers: [oauthServerUrl],
              scopes_supported: ["mcp:access"],
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }

        // Check authorization header
        const authHeader = request.headers.get("Authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return new Response("Unauthorized", {
            status: 401,
            headers: { "WWW-Authenticate": 'Bearer realm="MCP Server"' },
          });
        }

        // MCP initialize endpoint
        if (request.method === "POST") {
          const body = await request.json();
          if (body.method === "initialize") {
            return new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id: body.id,
                result: {
                  protocolVersion: "2025-06-18",
                  serverInfo: { name: "oauth-test-server", version: "1.0.0" },
                  capabilities: { tools: {} },
                },
              }),
              { headers: { "Content-Type": "application/json" } },
            );
          }
        }

        return new Response("Not Found", { status: 404 });
      },
    });

    mcpServerUrl = `http://localhost:${mcpServer.port}`;
  });

  afterEach(() => {
    oauthServer?.stop();
    mcpServer?.stop();
    authorizationCallbackUrl = null;
  });

  it("should discover OAuth endpoints from MCP server", async () => {
    const endpoints = await discoverOAuthEndpoints(mcpServerUrl);

    expect(endpoints.authorizationServer).toBe(oauthServerUrl);
    expect(endpoints.authorizationEndpoint).toBe(`${oauthServerUrl}/authorize`);
    expect(endpoints.tokenEndpoint).toBe(`${oauthServerUrl}/token`);
    expect(endpoints.scopes).toEqual(["mcp:access"]);
  });

  it("should start OAuth authorization flow with correct parameters", async () => {
    const provider = new StandardOAuthProvider();
    const endpoints = await discoverOAuthEndpoints(mcpServerUrl);

    const result = await provider.startAuthorizationFlow({
      authorizationEndpoint: endpoints.authorizationEndpoint,
      clientId: "test-client-id",
      redirectUri: "http://localhost:3000/callback",
      scopes: endpoints.scopes,
      resource: mcpServerUrl,
    });

    expect(result.authorizationUrl).toContain(endpoints.authorizationEndpoint);
    expect(result.authorizationUrl).toContain("client_id=test-client-id");
    expect(result.authorizationUrl).toContain("redirect_uri=");
    expect(result.authorizationUrl).toContain("code_challenge=");
    expect(result.authorizationUrl).toContain("code_challenge_method=S256");
    expect(result.authorizationUrl).toContain(
      `resource=${encodeURIComponent(mcpServerUrl)}`,
    );
    expect(result.authorizationUrl).toContain("scope=mcp%3Aaccess");
    expect(result.codeVerifier).toHaveLength(43);
    expect(result.state).toBeTruthy();
  });

  it("should exchange authorization code for tokens with PKCE", async () => {
    const provider = new StandardOAuthProvider();
    const endpoints = await discoverOAuthEndpoints(mcpServerUrl);

    const flowResult = await provider.startAuthorizationFlow({
      authorizationEndpoint: endpoints.authorizationEndpoint,
      clientId: "test-client-id",
      redirectUri: "http://localhost:3000/callback",
      scopes: endpoints.scopes,
      resource: mcpServerUrl,
    });

    const tokens = await provider.exchangeCodeForTokens({
      tokenEndpoint: endpoints.tokenEndpoint,
      code: "mock_authorization_code",
      codeVerifier: flowResult.codeVerifier,
      clientId: "test-client-id",
      redirectUri: "http://localhost:3000/callback",
      resource: mcpServerUrl,
    });

    expect(tokens.accessToken).toBe("mock_access_token_12345");
    expect(tokens.refreshToken).toBe("mock_refresh_token_67890");
    expect(tokens.tokenType).toBe("Bearer");
    expect(tokens.scopes).toEqual(["mcp:access"]);
    expect(tokens.expiresAt).toBeGreaterThan(Date.now() / 1000);
  });

  it("should refresh expired tokens", async () => {
    const provider = new StandardOAuthProvider();
    const endpoints = await discoverOAuthEndpoints(mcpServerUrl);

    const newTokens = await provider.refreshAccessToken({
      tokenEndpoint: endpoints.tokenEndpoint,
      refreshToken: "mock_refresh_token_67890",
      clientId: "test-client-id",
      resource: mcpServerUrl,
    });

    expect(newTokens.accessToken).toBe("refreshed_access_token");
    expect(newTokens.tokenType).toBe("Bearer");
  });

  it("should handle 401 response and start OAuth flow", async () => {
    const adapter = new InMemoryOAuthAdapter();
    const provider = new StandardOAuthProvider();

    const onAuthorizationRequired = mock((url: string) => {
      authorizationCallbackUrl = url;
    });

    const oauthConfig: OAuthConfig = {
      clientId: "test-client-id",
      redirectUri: "http://localhost:3000/callback",
      onAuthorizationRequired,
    };

    const client = new McpClient({
      name: "oauth-test-client",
      version: "1.0.0",
    });

    const transport = new StreamableHttpClientTransport({
      oauthAdapter: adapter,
      oauthProvider: provider,
      oauthConfig,
    });

    const connect = transport.bind(client);

    // First connection attempt should fail with 401 and start OAuth flow
    await expect(connect(mcpServerUrl)).rejects.toThrow(
      "Authentication required",
    );

    // Verify authorization callback was invoked
    expect(onAuthorizationRequired).toHaveBeenCalledTimes(1);
    expect(authorizationCallbackUrl).toContain(`${oauthServerUrl}/authorize`);
    expect(authorizationCallbackUrl).toContain("client_id=test-client-id");
  });

  it("should complete authorization flow and store tokens", async () => {
    const adapter = new InMemoryOAuthAdapter();
    const provider = new StandardOAuthProvider();

    let capturedAuthUrl: string | null = null;

    const oauthConfig: OAuthConfig = {
      clientId: "test-client-id",
      redirectUri: "http://localhost:3000/callback",
      onAuthorizationRequired: (url: string) => {
        capturedAuthUrl = url;
      },
    };

    const client = new McpClient({
      name: "oauth-test-client",
      version: "1.0.0",
    });

    const transport = new StreamableHttpClientTransport({
      oauthAdapter: adapter,
      oauthProvider: provider,
      oauthConfig,
    });

    const connect = transport.bind(client);

    // Start OAuth flow
    await expect(connect(mcpServerUrl)).rejects.toThrow();

    // Extract state from authorization URL
    const authUrl = new URL(capturedAuthUrl!);
    const state = authUrl.searchParams.get("state")!;

    // Complete authorization flow
    await transport.completeAuthorizationFlow(
      mcpServerUrl,
      "mock_authorization_code",
      state,
    );

    // Verify tokens were stored
    const tokens = await adapter.getTokens(mcpServerUrl);
    expect(tokens).toBeDefined();
    expect(tokens?.accessToken).toBe("mock_access_token_12345");
    expect(tokens?.refreshToken).toBe("mock_refresh_token_67890");
  });

  it("should reject authorization flow with invalid state", async () => {
    const adapter = new InMemoryOAuthAdapter();
    const provider = new StandardOAuthProvider();

    const oauthConfig: OAuthConfig = {
      clientId: "test-client-id",
      redirectUri: "http://localhost:3000/callback",
      onAuthorizationRequired: () => {},
    };

    const client = new McpClient({
      name: "oauth-test-client",
      version: "1.0.0",
    });

    const transport = new StreamableHttpClientTransport({
      oauthAdapter: adapter,
      oauthProvider: provider,
      oauthConfig,
    });

    const connect = transport.bind(client);

    // Start OAuth flow
    await expect(connect(mcpServerUrl)).rejects.toThrow();

    // Try to complete with wrong state
    await expect(
      transport.completeAuthorizationFlow(
        mcpServerUrl,
        "mock_authorization_code",
        "wrong_state_value",
      ),
    ).rejects.toThrow("State parameter mismatch");
  });

  it("should successfully connect with valid OAuth tokens", async () => {
    const adapter = new InMemoryOAuthAdapter();
    const provider = new StandardOAuthProvider();

    let capturedAuthUrl: string | null = null;

    const oauthConfig: OAuthConfig = {
      clientId: "test-client-id",
      redirectUri: "http://localhost:3000/callback",
      onAuthorizationRequired: (url: string) => {
        capturedAuthUrl = url;
      },
    };

    const client = new McpClient({
      name: "oauth-test-client",
      version: "1.0.0",
    });

    const transport = new StreamableHttpClientTransport({
      oauthAdapter: adapter,
      oauthProvider: provider,
      oauthConfig,
    });

    const connect = transport.bind(client);

    // Start OAuth flow
    await expect(connect(mcpServerUrl)).rejects.toThrow();

    // Complete authorization
    const authUrl = new URL(capturedAuthUrl!);
    const state = authUrl.searchParams.get("state")!;
    await transport.completeAuthorizationFlow(
      mcpServerUrl,
      "mock_authorization_code",
      state,
    );

    // Now connection should succeed with stored token
    const connection = await connect(mcpServerUrl);
    expect(connection.serverInfo.name).toBe("oauth-test-server");
  });

  it("should support multiple MCP servers with different tokens", async () => {
    // Create second OAuth-protected MCP server
    const mcpServer2 = serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/.well-known/oauth-protected-resource") {
          return new Response(
            JSON.stringify({
              resource: `http://localhost:${mcpServer2.port}`,
              authorization_servers: [oauthServerUrl],
              scopes_supported: ["mcp:access"],
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }

        const authHeader = request.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }

        if (request.method === "POST") {
          const body = await request.json();
          if (body.method === "initialize") {
            return new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id: body.id,
                result: {
                  protocolVersion: "2025-06-18",
                  serverInfo: { name: "oauth-test-server-2", version: "1.0.0" },
                  capabilities: { tools: {} },
                },
              }),
              { headers: { "Content-Type": "application/json" } },
            );
          }
        }

        return new Response("Not Found", { status: 404 });
      },
    });

    const mcpServer2Url = `http://localhost:${mcpServer2.port}`;

    const adapter = new InMemoryOAuthAdapter();
    const provider = new StandardOAuthProvider();

    // Store tokens for first server
    await adapter.storeTokens(mcpServerUrl, {
      accessToken: "token_for_server_1",
      tokenType: "Bearer",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      scopes: ["mcp:access"],
    });

    // Store tokens for second server
    await adapter.storeTokens(mcpServer2Url, {
      accessToken: "token_for_server_2",
      tokenType: "Bearer",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      scopes: ["mcp:access"],
    });

    // Verify tokens are stored separately
    const tokens1 = await adapter.getTokens(mcpServerUrl);
    const tokens2 = await adapter.getTokens(mcpServer2Url);

    expect(tokens1?.accessToken).toBe("token_for_server_1");
    expect(tokens2?.accessToken).toBe("token_for_server_2");
    expect(tokens1?.accessToken).not.toBe(tokens2?.accessToken);

    mcpServer2.stop();
  });

  it("should validate that token has not expired with buffer", () => {
    const adapter = new InMemoryOAuthAdapter();
    const now = Math.floor(Date.now() / 1000);

    // Store token that expires in 10 minutes
    adapter.storeTokens(mcpServerUrl, {
      accessToken: "valid_token",
      tokenType: "Bearer",
      expiresAt: now + 600, // 10 minutes from now
      scopes: ["mcp:access"],
    });

    expect(adapter.hasValidToken(mcpServerUrl)).toBe(true);

    // Store token that expires in 2 minutes (within 5-minute buffer)
    adapter.storeTokens(mcpServerUrl, {
      accessToken: "expiring_soon_token",
      tokenType: "Bearer",
      expiresAt: now + 120, // 2 minutes from now
      scopes: ["mcp:access"],
    });

    expect(adapter.hasValidToken(mcpServerUrl)).toBe(false);
  });

  it("should throw error if OAuth config is incomplete", () => {
    const adapter = new InMemoryOAuthAdapter();

    // Missing provider and config
    expect(() => {
      new StreamableHttpClientTransport({
        oauthAdapter: adapter,
      });
    }).toThrow("OAuth configuration incomplete");

    // Missing adapter and config
    expect(() => {
      new StreamableHttpClientTransport({
        oauthProvider: new StandardOAuthProvider(),
      });
    }).toThrow("OAuth configuration incomplete");
  });

  it("should use origin for discovery when baseUrl has a path (RFC 8707)", async () => {
    // Create a server that handles both /mcp endpoint and origin-based discovery
    const serverWithPath = serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);

        // Discovery MUST be at origin, not at /mcp/.well-known/...
        if (url.pathname === "/.well-known/oauth-protected-resource") {
          return new Response(
            JSON.stringify({
              resource: `http://localhost:${serverWithPath.port}/mcp`,
              authorization_servers: [oauthServerUrl],
              scopes_supported: ["mcp:access"],
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        }

        // This should NOT be called for discovery
        if (url.pathname === "/mcp/.well-known/oauth-protected-resource") {
          return new Response("Wrong path - should use origin", {
            status: 404,
          });
        }

        return new Response("Not Found", { status: 404 });
      },
    });

    const serverWithPathUrl = `http://localhost:${serverWithPath.port}/mcp`;

    const endpoints = await discoverOAuthEndpoints(serverWithPathUrl);

    expect(endpoints.authorizationServer).toBe(oauthServerUrl);
    expect(endpoints.authorizationEndpoint).toBe(`${oauthServerUrl}/authorize`);
    expect(endpoints.tokenEndpoint).toBe(`${oauthServerUrl}/token`);

    serverWithPath.stop();
  });

  it("should fallback to WWW-Authenticate header when origin discovery fails", async () => {
    // Create a server that doesn't have origin-based discovery
    // but provides as_uri in WWW-Authenticate header
    const serverWithoutDiscovery = serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url);

        // No resource metadata at origin
        if (url.pathname === "/.well-known/oauth-protected-resource") {
          return new Response("Not Found", { status: 404 });
        }

        // MCP endpoint returns 401 with WWW-Authenticate header
        if (url.pathname === "/mcp" && request.method === "POST") {
          return new Response("Unauthorized", {
            status: 401,
            headers: {
              "WWW-Authenticate": `Bearer realm="MCP Server", as_uri="${oauthServerUrl}/.well-known/oauth-authorization-server"`,
            },
          });
        }

        return new Response("Not Found", { status: 404 });
      },
    });

    const serverWithoutDiscoveryUrl = `http://localhost:${serverWithoutDiscovery.port}/mcp`;

    const endpoints = await discoverOAuthEndpoints(serverWithoutDiscoveryUrl);

    expect(endpoints.authorizationServer).toBe(oauthServerUrl);
    expect(endpoints.authorizationEndpoint).toBe(`${oauthServerUrl}/authorize`);
    expect(endpoints.tokenEndpoint).toBe(`${oauthServerUrl}/token`);
    expect(endpoints.scopes).toEqual([]); // No scopes from resource metadata

    serverWithoutDiscovery.stop();
  });

  it("should fail gracefully when neither discovery method works", async () => {
    // Create a server that has no discovery mechanism
    const serverWithNoDiscovery = serve({
      port: 0,
      async fetch(_request) {
        return new Response("Not Found", { status: 404 });
      },
    });

    const serverWithNoDiscoveryUrl = `http://localhost:${serverWithNoDiscovery.port}/mcp`;

    await expect(
      discoverOAuthEndpoints(serverWithNoDiscoveryUrl),
    ).rejects.toThrow("Failed to fetch resource metadata");

    serverWithNoDiscovery.stop();
  });
});
