import {
  JSON_RPC_VERSION,
  MCP_PROTOCOL_HEADER,
  MCP_SESSION_ID_HEADER,
  METHODS,
  SSE_ACCEPT_HEADER,
  SUPPORTED_MCP_PROTOCOL_VERSIONS,
} from "../constants.js";
import type { Logger } from "../core.js";
import { RpcError } from "../errors.js";
import {
  JSON_RPC_ERROR_CODES,
  createJsonRpcError,
  isJsonRpcRequest,
  type InitializeResult,
  type JsonRpcReq,
  type JsonRpcRes,
  type ListPromptsResult,
  type ListResourcesResult,
  type ListResourceTemplatesResult,
  type ListToolsResult,
  type PromptGetResult,
  type ResourceReadResult,
  type ToolCallResult,
} from "../types.js";
import type { McpClient } from "./client.js";

/**
 * Options for creating a Connection
 */
export interface ConnectionOptions {
  baseUrl: string;
  serverInfo: { name: string; version: string };
  serverCapabilities: InitializeResult["capabilities"];
  sessionId?: string;
  responseSender?: (response: JsonRpcRes) => Promise<void>;
  logger?: Logger;
  headers?: Record<string, string>;
}

/**
 * Connection to an MCP server.
 *
 * Provides methods to interact with the server's tools, prompts, and resources.
 */
export class Connection {
  private baseUrl: string;
  public readonly sessionId?: string;
  public readonly serverInfo: { name: string; version: string };
  public readonly serverCapabilities: InitializeResult["capabilities"];

  // SSE stream management
  private sessionStreamAbortController?: AbortController;
  private responseSender?: (response: JsonRpcRes) => Promise<void>;
  private client?: McpClient;
  private logger?: Logger;
  private customHeaders?: Record<string, string>;

  constructor(options: ConnectionOptions) {
    this.baseUrl = options.baseUrl;
    this.sessionId = options.sessionId;
    this.serverInfo = options.serverInfo;
    this.serverCapabilities = options.serverCapabilities;
    this.responseSender = options.responseSender;
    this.logger = options.logger;
    this.customHeaders = options.headers;
  }

  /**
   * Set the client instance for handling server requests
   * Called by transport after creating connection
   * @internal
   */
  _setClient(client: McpClient): void {
    this.client = client;
  }

  /**
   * Call a tool on the server
   *
   * @param name - Tool name
   * @param args - Tool arguments
   * @returns Tool call result
   */
  async callTool(name: string, args?: unknown): Promise<ToolCallResult> {
    const response = await this._request(METHODS.TOOLS.CALL, {
      name,
      arguments: args,
    });
    return response as ToolCallResult;
  }

  /**
   * List all available tools from the server
   *
   * @returns List of tools
   */
  async listTools(): Promise<ListToolsResult> {
    const response = await this._request(METHODS.TOOLS.LIST);
    return response as ListToolsResult;
  }

  /**
   * List all available prompts from the server
   *
   * @returns List of prompts
   */
  async listPrompts(): Promise<ListPromptsResult> {
    const response = await this._request(METHODS.PROMPTS.LIST);
    return response as ListPromptsResult;
  }

  /**
   * Get a prompt from the server
   *
   * @param name - Prompt name
   * @param args - Prompt arguments
   * @returns Prompt result
   */
  async getPrompt(name: string, args?: unknown): Promise<PromptGetResult> {
    const response = await this._request(METHODS.PROMPTS.GET, {
      name,
      arguments: args,
    });
    return response as PromptGetResult;
  }

  /**
   * List all available resources from the server
   *
   * @returns List of resources
   */
  async listResources(): Promise<ListResourcesResult> {
    const response = await this._request(METHODS.RESOURCES.LIST);
    return response as ListResourcesResult;
  }

  /**
   * List all available resource templates from the server
   *
   * @returns List of resource templates
   */
  async listResourceTemplates(): Promise<ListResourceTemplatesResult> {
    const response = await this._request(METHODS.RESOURCES.TEMPLATES_LIST);
    return response as ListResourceTemplatesResult;
  }

  /**
   * Read a resource from the server
   *
   * @param uri - Resource URI
   * @returns Resource contents
   */
  async readResource(uri: string): Promise<ResourceReadResult> {
    const response = await this._request(METHODS.RESOURCES.READ, { uri });
    return response as ResourceReadResult;
  }

  /**
   * Send a ping to the server
   *
   * @returns Empty response
   */
  async ping(): Promise<Record<string, never>> {
    const response = await this._request(METHODS.PING);
    return response as Record<string, never>;
  }

  /**
   * Internal method to send requests to the server
   *
   * @private
   */
  private async _request(method: string, params?: unknown): Promise<unknown> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "MCP-Protocol-Version": SUPPORTED_MCP_PROTOCOL_VERSIONS.V2025_06_18,
    };

    if (this.sessionId) {
      headers[MCP_SESSION_ID_HEADER] = this.sessionId;
    }

    // Merge custom headers (these override defaults if there are conflicts)
    if (this.customHeaders) {
      Object.assign(headers, this.customHeaders);
    }

    const requestBody: JsonRpcReq = {
      jsonrpc: JSON_RPC_VERSION,
      id: Math.random().toString(36).substring(7),
      method,
      params,
    };

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = (await response.json()) as JsonRpcRes;

    if (result.error) {
      throw new RpcError(
        result.error.code,
        result.error.message,
        result.error.data,
      );
    }

    return result.result;
  }

  /**
   * Open a GET SSE stream to receive server notifications.
   * Only available when using session-based transport.
   *
   * The stream will automatically be processed in the background to handle
   * server-initiated requests (like elicitation and sampling).
   *
   * @param lastEventId - Optional Last-Event-ID for replay from a specific event
   * @throws Error if connection does not have a session ID
   */
  async openSessionStream(lastEventId?: string): Promise<void> {
    if (!this.sessionId) {
      throw new Error("Cannot open session stream without session ID");
    }

    // Close any existing stream
    this.closeSessionStream();

    const headers: Record<string, string> = {
      Accept: SSE_ACCEPT_HEADER,
      [MCP_PROTOCOL_HEADER]: SUPPORTED_MCP_PROTOCOL_VERSIONS.V2025_06_18,
      [MCP_SESSION_ID_HEADER]: this.sessionId,
    };

    if (lastEventId) {
      headers["Last-Event-ID"] = lastEventId;
    }

    // Merge custom headers (these override defaults if there are conflicts)
    if (this.customHeaders) {
      Object.assign(headers, this.customHeaders);
    }

    this.sessionStreamAbortController = new AbortController();

    const response = await fetch(this.baseUrl, {
      method: "GET",
      headers,
      signal: this.sessionStreamAbortController.signal,
    });

    if (!response.ok) {
      throw new Error(
        `Failed to open session stream: ${response.status} ${response.statusText}`,
      );
    }

    if (!response.body) {
      throw new Error("No response body for SSE stream");
    }

    // Process the stream in the background to handle server requests
    this.processSessionStream(response.body);
  }

  /**
   * Process incoming SSE events from the stream
   * @private
   */
  private async processSessionStream(
    stream: ReadableStream<Uint8Array>,
  ): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              // Check if this is a JSON-RPC request (has method and id)
              if (isJsonRpcRequest(data)) {
                await this.handleServerRequest(data);
              }
            } catch (error) {
              this.logger?.error?.("Failed to parse SSE data:", error);
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        this.logger?.error?.("SSE stream error:", error);
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Handle a server-initiated JSON-RPC request
   * @private
   */
  private async handleServerRequest(request: JsonRpcReq): Promise<void> {
    if (!this.client) {
      this.logger?.error?.("Cannot handle server request: no client instance");
      return;
    }

    if (!this.responseSender) {
      this.logger?.error?.("Cannot handle server request: no response sender");
      return;
    }

    try {
      // Dispatch to client handlers
      const response = await this.client._dispatch(request);

      // Send response back to server
      await this.responseSender(response);
    } catch (error) {
      this.logger?.error?.("Error handling server request:", error);

      // Send error response
      const errorResponse = createJsonRpcError(
        request.id,
        new RpcError(
          JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
          error instanceof Error ? error.message : "Unknown error",
        ).toJson(),
      );

      await this.responseSender(errorResponse);
    }
  }

  /**
   * Close the session stream
   */
  closeSessionStream(): void {
    if (this.sessionStreamAbortController) {
      this.sessionStreamAbortController.abort();
      this.sessionStreamAbortController = undefined;
    }
  }

  /**
   * Close the connection and optionally delete the session
   *
   * @param deleteSession - If true, sends a DELETE request to remove the session from the server
   */
  async close(deleteSession = false): Promise<void> {
    this.closeSessionStream();

    if (deleteSession && this.sessionId) {
      // Send DELETE request to close session
      await fetch(this.baseUrl, {
        method: "DELETE",
        headers: {
          [MCP_SESSION_ID_HEADER]: this.sessionId,
        },
      });
    }
  }
}
