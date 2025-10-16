import { METHODS } from "../constants.js";
import type { Logger } from "../core.js";
import { RpcError } from "../errors.js";
import {
  JSON_RPC_ERROR_CODES,
  createJsonRpcError,
  createJsonRpcResponse,
  type JsonRpcReq,
  type JsonRpcRes,
} from "../types.js";
import type {
  ClientConnectionInfo,
  ElicitHandler,
  ElicitationParams,
  SampleHandler,
  SamplingParams,
} from "./types.js";

/**
 * Client capabilities to advertise to the server
 */
export interface ClientCapabilities {
  elicitation?: Record<string, never>;
  roots?: Record<string, never>;
  sampling?: Record<string, never>;
  [key: string]: unknown;
}

/**
 * Options for creating an MCP client
 */
export interface McpClientOptions {
  /** Client name (included in client info during initialize) */
  name: string;
  /** Client version (included in client info during initialize) */
  version: string;
  /** Optional capabilities to advertise to server */
  capabilities?: ClientCapabilities;
  /** Optional logger for client messages */
  logger?: Logger;
}

/**
 * MCP Client implementation.
 *
 * Provides a framework for building MCP-compliant clients that can connect to
 * MCP servers and call tools, prompts, and resources.
 *
 * @example Basic client setup
 * ```typescript
 * import { McpClient, StreamableHttpClientTransport } from "mcp-lite";
 *
 * // Create client instance
 * const client = new McpClient({
 *   name: "my-client",
 *   version: "1.0.0"
 * });
 *
 * // Create HTTP transport and connect
 * const transport = new StreamableHttpClientTransport();
 * const connect = transport.bind(client);
 * const connection = await connect("http://localhost:3000");
 *
 * // Call a tool
 * const result = await connection.callTool("echo", { message: "Hello!" });
 * ```
 */
export class McpClient {
  public readonly clientInfo: { name: string; version: string };
  public readonly capabilities?: ClientCapabilities;
  private logger: Logger;

  // Handlers for server-initiated requests
  private sampleHandler?: SampleHandler;
  private elicitHandler?: ElicitHandler;

  // Connection info set by transport after initialize
  private connectionInfo?: ClientConnectionInfo;

  /**
   * Create a new MCP client instance.
   *
   * @param options - Client configuration options
   */
  constructor(options: McpClientOptions) {
    this.clientInfo = {
      name: options.name,
      version: options.version,
    };
    this.capabilities = options.capabilities;
    this.logger = options.logger || console;
  }

  /**
   * Register handler for server sampling requests.
   *
   * When the server needs the client to call an LLM, it will send a sampling
   * request that will be handled by this function.
   *
   * @param handler - Sampling handler function
   * @returns This client instance for chaining
   *
   * @example
   * ```typescript
   * client.onSample(async (params, connection) => {
   *   const response = await callLLM(params.messages, params.modelPreferences);
   *   return {
   *     role: "assistant",
   *     content: { type: "text", text: response },
   *     model: "gpt-4",
   *     stopReason: "endTurn"
   *   };
   * });
   * ```
   */
  onSample(handler: SampleHandler): this {
    this.sampleHandler = handler;
    return this;
  }

  /**
   * Register handler for server elicitation requests.
   *
   * When the server needs the client to prompt the user for structured data,
   * it will send an elicitation request that will be handled by this function.
   *
   * @param handler - Elicitation handler function
   * @returns This client instance for chaining
   *
   * @example
   * ```typescript
   * client.onElicit(async (params, connection) => {
   *   const userInput = await promptUser(params.message, params.requestedSchema);
   *   return {
   *     action: "accept",
   *     content: userInput
   *   };
   * });
   * ```
   */
  onElicit(handler: ElicitHandler): this {
    this.elicitHandler = handler;
    return this;
  }

  /**
   * Set connection info after successful initialization.
   * @internal
   */
  _setConnectionInfo(info: ClientConnectionInfo): void {
    this.connectionInfo = info;
  }

  /**
   * Internal dispatcher for server-initiated requests.
   * Called by transport when SSE stream receives a request.
   *
   * @internal
   */
  async _dispatch(message: JsonRpcReq): Promise<JsonRpcRes> {
    const requestId = message.id;

    try {
      let result: unknown;

      switch (message.method) {
        case METHODS.ELICITATION.CREATE:
          if (!this.elicitHandler) {
            throw new RpcError(
              JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND,
              "No elicitation handler registered",
            );
          }
          result = await this.elicitHandler(
            message.params as ElicitationParams,
            this.connectionInfo,
          );
          break;

        case METHODS.SAMPLING.CREATE:
          if (!this.sampleHandler) {
            throw new RpcError(
              JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND,
              "No sampling handler registered",
            );
          }
          result = await this.sampleHandler(
            message.params as SamplingParams,
            this.connectionInfo,
          );
          break;

        default:
          throw new RpcError(
            JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND,
            `Unknown method: ${message.method}`,
          );
      }

      return createJsonRpcResponse(requestId, result);
    } catch (error) {
      // Default error handling
      if (error instanceof RpcError) {
        return createJsonRpcError(requestId, error.toJson());
      }

      return createJsonRpcError(
        requestId,
        new RpcError(
          JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
          error instanceof Error ? error.message : "Unknown error",
        ).toJson(),
      );
    }
  }
}
