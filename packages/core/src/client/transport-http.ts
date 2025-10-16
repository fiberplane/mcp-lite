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
import type { ClientSessionAdapter } from "./session-adapter.js";

/**
 * Options for creating an HTTP client transport
 */
export interface StreamableHttpClientTransportOptions {
  /**
   * Optional session adapter for persisting session state.
   * If provided, the transport will enable session-based mode.
   */
  sessionAdapter?: ClientSessionAdapter;
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

  constructor(options?: StreamableHttpClientTransportOptions) {
    this.sessionAdapter = options?.sessionAdapter;
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

      const response = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [MCP_PROTOCOL_HEADER]: SUPPORTED_MCP_PROTOCOL_VERSIONS.V2025_06_18,
        },
        body: JSON.stringify(initRequest),
      });

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
