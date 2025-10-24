import {
  JSON_RPC_VERSION,
  MCP_PROTOCOL_HEADER,
  MCP_SESSION_ID_HEADER,
  SUPPORTED_MCP_PROTOCOL_VERSIONS,
} from "../constants.js";
import { RpcError } from "../errors.js";
import type { InitializeResult, JsonRpcRes } from "../types.js";
import type { McpClient } from "./client.js";
import { Connection } from "./connection.js";
import type { OAuthAdapter } from "./oauth-adapter.js";
import type { OAuthProvider } from "./oauth-provider.js";
import type { ClientSessionAdapter } from "./session-adapter.js";

/**
 * OAuth configuration for authenticated MCP servers
 */
export interface OAuthConfig {
  /** OAuth client ID */
  clientId: string;
  /** OAuth redirect URI for authorization callback */
  redirectUri: string;
  /**
   * Callback invoked when user authorization is required.
   * Implementation should redirect user to the authorization URL.
   * After user authorizes, call completeAuthorizationFlow() with the code and state.
   */
  onAuthorizationRequired: (authorizationUrl: string) => void;
}

/**
 * OAuth flow state stored during authorization
 */
interface PendingAuthState {
  codeVerifier: string;
  state: string;
  tokenEndpoint: string;
}

/**
 * Options for creating an HTTP client transport
 */
export interface StreamableHttpClientTransportOptions {
  /**
   * Optional session adapter for persisting session state.
   * If provided, the transport will enable session-based mode.
   */
  sessionAdapter?: ClientSessionAdapter;

  /**
   * Optional OAuth adapter for token storage.
   * Required if connecting to OAuth-protected MCP servers.
   */
  oauthAdapter?: OAuthAdapter;

  /**
   * Optional OAuth provider for handling OAuth flows.
   * Required if connecting to OAuth-protected MCP servers.
   */
  oauthProvider?: OAuthProvider;

  /**
   * Optional OAuth configuration.
   * Required if connecting to OAuth-protected MCP servers.
   */
  oauthConfig?: OAuthConfig;
}

/**
 * HTTP transport for MCP clients.
 *
 * Handles initialization and request/response communication with MCP servers
 * over HTTP.
 *
 * @example
 * ```typescript
 * const client = new McpClient({ name: "my-client", version: "1.0.0" });
 * const transport = new StreamableHttpClientTransport();
 * const connect = transport.bind(client);
 * const connection = await connect("http://localhost:3000");
 * ```
 */
export class StreamableHttpClientTransport {
  private client?: McpClient;
  private sessionAdapter?: ClientSessionAdapter;
  private oauthAdapter?: OAuthAdapter;
  private oauthProvider?: OAuthProvider;
  private oauthConfig?: OAuthConfig;
  private pendingAuthFlows = new Map<string, PendingAuthState>();

  constructor(options?: StreamableHttpClientTransportOptions) {
    this.sessionAdapter = options?.sessionAdapter;
    this.oauthAdapter = options?.oauthAdapter;
    this.oauthProvider = options?.oauthProvider;
    this.oauthConfig = options?.oauthConfig;

    // Validate OAuth configuration consistency
    if (this.oauthAdapter || this.oauthProvider || this.oauthConfig) {
      if (!this.oauthAdapter || !this.oauthProvider || !this.oauthConfig) {
        throw new Error(
          "OAuth configuration incomplete: oauthAdapter, oauthProvider, and oauthConfig must all be provided together",
        );
      }
    }
  }

  /**
   * Bind the transport to a client instance.
   *
   * @param client - The MCP client instance
   * @returns A connect function that initializes connections to servers
   */
  bind(client: McpClient): (baseUrl: string) => Promise<Connection> {
    this.client = client;

    return async (baseUrl: string) => {
      if (!this.client) {
        throw new Error("Transport not bound to a client");
      }

      // Try to get existing valid token if OAuth is configured
      const accessToken = await this.ensureValidToken(baseUrl);

      // Send initialize request
      const initRequest = {
        jsonrpc: JSON_RPC_VERSION,
        id: "init",
        method: "initialize",
        params: {
          protocolVersion: SUPPORTED_MCP_PROTOCOL_VERSIONS.V2025_06_18,
          clientInfo: this.client.clientInfo,
          capabilities: this.client.capabilities || {},
        },
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        [MCP_PROTOCOL_HEADER]: SUPPORTED_MCP_PROTOCOL_VERSIONS.V2025_06_18,
      };

      // Add Authorization header if we have a token
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      const response = await fetch(baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(initRequest),
      });

      // Handle 401 Unauthorized - start OAuth flow
      if (response.status === 401 && this.oauthAdapter && this.oauthProvider && this.oauthConfig) {
        await this.handleAuthenticationRequired(baseUrl);
        throw new Error(
          "Authentication required. Authorization flow started. Please complete authorization and retry connection.",
        );
      }

      if (!response.ok) {
        throw new Error(
          `Failed to initialize: HTTP ${response.status} ${response.statusText}`,
        );
      }

      const result = (await response.json()) as JsonRpcRes;

      if (result.error) {
        throw new RpcError(
          result.error.code,
          result.error.message,
          result.error.data,
        );
      }

      const initResult = result.result as InitializeResult;

      // Get session ID from header if session adapter is configured
      const sessionId = this.sessionAdapter
        ? response.headers.get(MCP_SESSION_ID_HEADER) || undefined
        : undefined;

      // Store session data if we have an adapter and session ID
      if (sessionId && this.sessionAdapter) {
        await this.sessionAdapter.create(sessionId, {
          sessionId,
          protocolVersion: SUPPORTED_MCP_PROTOCOL_VERSIONS.V2025_06_18,
          serverInfo: initResult.serverInfo,
          serverCapabilities: initResult.capabilities,
          createdAt: Date.now(),
        });
      }

      // Set connection info on client after successful initialization
      this.client._setConnectionInfo({
        serverInfo: initResult.serverInfo,
        protocolVersion: SUPPORTED_MCP_PROTOCOL_VERSIONS.V2025_06_18,
      });

      // Create connection with server info and capabilities
      const connection = new Connection({
        baseUrl,
        serverInfo: initResult.serverInfo,
        serverCapabilities: initResult.capabilities,
        sessionId,
        responseSender: sessionId
          ? this.createResponseSender(baseUrl, sessionId)
          : undefined,
      });

      // Set client instance for handling server requests
      connection._setClient(this.client);

      return connection;
    };
  }

  /**
   * Complete an OAuth authorization flow after user has authorized
   *
   * Call this method after the user is redirected back from the OAuth server
   * with an authorization code and state parameter.
   *
   * @param baseUrl - MCP server base URL (must match the one used in initialization)
   * @param code - Authorization code from OAuth callback
   * @param state - State parameter from OAuth callback
   *
   * @example
   * ```typescript
   * // After user is redirected to your redirect_uri with ?code=...&state=...
   * await transport.completeAuthorizationFlow(
   *   "https://api.example.com",
   *   code,
   *   state
   * );
   * ```
   */
  async completeAuthorizationFlow(
    baseUrl: string,
    code: string,
    state: string,
  ): Promise<void> {
    if (!this.oauthAdapter || !this.oauthProvider || !this.oauthConfig) {
      throw new Error("OAuth not configured for this transport");
    }

    // Retrieve and validate pending auth state
    const pendingAuth = this.pendingAuthFlows.get(baseUrl);
    if (!pendingAuth) {
      throw new Error(
        "No pending authorization flow found for this server. Authorization may have expired or already been completed.",
      );
    }

    // Validate state parameter (CSRF protection)
    if (pendingAuth.state !== state) {
      this.pendingAuthFlows.delete(baseUrl);
      throw new Error("State parameter mismatch. Possible CSRF attack.");
    }

    // Exchange authorization code for tokens
    const tokens = await this.oauthProvider.exchangeCodeForTokens({
      tokenEndpoint: pendingAuth.tokenEndpoint,
      code,
      codeVerifier: pendingAuth.codeVerifier,
      clientId: this.oauthConfig.clientId,
      redirectUri: this.oauthConfig.redirectUri,
      resource: baseUrl,
    });

    // Store tokens
    await this.oauthAdapter.storeTokens(baseUrl, tokens);

    // Clean up pending auth state
    this.pendingAuthFlows.delete(baseUrl);
  }

  /**
   * Ensure a valid access token exists for the given resource server.
   * Automatically refreshes the token if it's expired.
   *
   * @param resource - Resource server URL (MCP server base URL)
   * @returns Valid access token, or undefined if no token exists or OAuth not configured
   * @private
   */
  private async ensureValidToken(
    resource: string,
  ): Promise<string | undefined> {
    if (!this.oauthAdapter || !this.oauthProvider || !this.oauthConfig) {
      return undefined;
    }

    // Check if we have a valid token
    const hasValid = await this.oauthAdapter.hasValidToken(resource);
    if (hasValid) {
      const tokens = await this.oauthAdapter.getTokens(resource);
      return tokens?.accessToken;
    }

    // Try to refresh if we have a refresh token
    const tokens = await this.oauthAdapter.getTokens(resource);
    if (tokens?.refreshToken) {
      // Token exists but expired - try to refresh
      const pendingAuth = this.pendingAuthFlows.get(resource);
      if (!pendingAuth) {
        // No token endpoint available - can't refresh
        return undefined;
      }

      const newTokens = await this.oauthProvider.refreshAccessToken({
        tokenEndpoint: pendingAuth.tokenEndpoint,
        refreshToken: tokens.refreshToken,
        clientId: this.oauthConfig.clientId,
        resource,
      });

      await this.oauthAdapter.storeTokens(resource, newTokens);
      return newTokens.accessToken;
    }

    return undefined;
  }

  /**
   * Handle authentication required (401) response by starting OAuth flow
   *
   * @param baseUrl - MCP server base URL
   * @private
   */
  private async handleAuthenticationRequired(baseUrl: string): Promise<void> {
    if (!this.oauthAdapter || !this.oauthProvider || !this.oauthConfig) {
      throw new Error("OAuth not configured for this transport");
    }

    // Import discovery function dynamically to avoid circular dependency
    const { discoverOAuthEndpoints } = await import("./oauth-discovery.js");

    // Discover OAuth endpoints
    const endpoints = await discoverOAuthEndpoints(baseUrl);

    // Start authorization flow
    const flowResult = await this.oauthProvider.startAuthorizationFlow({
      authorizationEndpoint: endpoints.authorizationEndpoint,
      clientId: this.oauthConfig.clientId,
      redirectUri: this.oauthConfig.redirectUri,
      scopes: endpoints.scopes,
      resource: baseUrl,
    });

    // Store pending auth state for later validation
    this.pendingAuthFlows.set(baseUrl, {
      codeVerifier: flowResult.codeVerifier,
      state: flowResult.state,
      tokenEndpoint: endpoints.tokenEndpoint,
    });

    // Notify application to redirect user
    this.oauthConfig.onAuthorizationRequired(flowResult.authorizationUrl);
  }

  /**
   * Create a function that sends JSON-RPC responses back to the server
   * @private
   */
  private createResponseSender(
    baseUrl: string,
    sessionId: string,
  ): (response: JsonRpcRes) => Promise<void> {
    return async (response: JsonRpcRes) => {
      await fetch(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [MCP_PROTOCOL_HEADER]: SUPPORTED_MCP_PROTOCOL_VERSIONS.V2025_06_18,
          [MCP_SESSION_ID_HEADER]: sessionId,
        },
        body: JSON.stringify(response),
      });
    };
  }
}
