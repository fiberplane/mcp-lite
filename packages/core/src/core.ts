import { SUPPORTED_MCP_PROTOCOL_VERSION } from "./constants.js";
import { RpcError } from "./errors.js";
import type {
  InitializeResult,
  JsonRpcId,
  JsonRpcMessage,
  JsonRpcReq,
  JsonRpcRes,
  ListPromptsResult,
  ListResourcesResult,
  ListToolsResult,
  MCPServerContext,
  MethodHandler,
  Middleware,
  OnError,
  PromptEntry,
  PromptGetResult,
  ResourceEntry,
  ResourceReadResult,
  StandardSchemaV1,
  Tool,
  ToolCallResult,
  ToolEntry,
} from "./types.js";
import {
  createJsonRpcError,
  createJsonRpcResponse,
  isInitializeParams,
  isJsonRpcNotification,
  isStandardSchema,
  isValidJsonRpcMessage,
  JSON_RPC_ERROR_CODES,
} from "./types.js";

// Helper functions for schema normalization and request processing

/**
 * Resolves tool input schema, normalizing Standard Schema validators
 * for MCP compliance while preserving validators for runtime use.
 */
function resolveToolSchema(inputSchema?: unknown): {
  mcpInputSchema: unknown;
  validator?: unknown;
} {
  if (!inputSchema) return { mcpInputSchema: { type: "object" } };
  if (isStandardSchema(inputSchema)) {
    return { mcpInputSchema: { type: "object" }, validator: inputSchema };
  }
  return { mcpInputSchema: inputSchema };
}

/**
 * Creates a validation function for the MCPServerContext.
 * Supports Standard Schema V1 validators and legacy validator interface.
 */
function createValidationFunction<T>(validator: unknown, input: unknown): T {
  if (isStandardSchema(validator)) {
    const result = validator["~standard"].validate(input);
    if (result instanceof Promise) {
      throw new RpcError(
        JSON_RPC_ERROR_CODES.INVALID_PARAMS,
        "Async validation not supported in this context",
      );
    }
    if ("issues" in result && result.issues?.length) {
      const messages = result.issues.map((i) => i.message).join(", ");
      throw new RpcError(
        JSON_RPC_ERROR_CODES.INVALID_PARAMS,
        `Validation failed: ${messages}`,
      );
    }
    return (result as { value: T }).value;
  }

  if (validator && typeof validator === "object" && "validate" in validator) {
    const validatorObj = validator as {
      validate(input: unknown): {
        ok: boolean;
        data?: unknown;
        issues?: unknown[];
      };
    };
    const result = validatorObj.validate(input);
    if (result?.ok && result.data !== undefined) {
      return result.data as T;
    }
    throw new RpcError(
      JSON_RPC_ERROR_CODES.INVALID_PARAMS,
      "Validation failed",
    );
  }

  throw new RpcError(JSON_RPC_ERROR_CODES.INVALID_PARAMS, "Invalid validator");
}

/**
 * Creates an MCPServerContext with validation support.
 */
function createContext(
  message: JsonRpcMessage,
  requestId: JsonRpcId | undefined,
): MCPServerContext {
  return {
    request: message,
    requestId,
    response: null,
    env: {},
    state: {},
    validate: <T>(validator: unknown, input: unknown): T =>
      createValidationFunction<T>(validator, input),
  };
}

/**
 * Runs middleware chain with the provided tail handler.
 */
async function runMiddlewares(
  middlewares: Middleware[],
  ctx: MCPServerContext,
  tail: () => Promise<void>,
): Promise<void> {
  const dispatch = async (i: number): Promise<void> => {
    if (i < middlewares.length) {
      const middleware = middlewares[i];
      if (middleware) {
        await middleware(ctx, () => dispatch(i + 1));
      } else {
        await dispatch(i + 1);
      }
    } else {
      await tail();
    }
  };
  await dispatch(0);
}

/**
 * Converts errors to appropriate JSON-RPC responses.
 * Returns null for notifications (which should never produce responses).
 */
function errorToResponse(
  err: unknown,
  requestId: JsonRpcId | undefined,
): JsonRpcRes | null {
  // Notifications never produce responses
  if (requestId === undefined) return null;

  if (err instanceof RpcError) {
    return createJsonRpcError(requestId, err.toJson());
  }
  const errorData =
    err instanceof Error ? { message: err.message, stack: err.stack } : err;
  return createJsonRpcError(
    requestId,
    new RpcError(
      JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
      "Internal error",
      errorData,
    ).toJson(),
  );
}

export interface McpServerOptions {
  name: string;
  version: string;
}

/**
 * MCP (Model Context Protocol) Server implementation.
 *
 * Provides a framework for building MCP-compliant servers that can expose tools, prompts,
 * and resources to MCP clients. The server handles JSON-RPC 2.0 communication and protocol
 * negotiation according to the MCP specification.
 *
 * @example Basic server setup
 * ```typescript
 * import { McpServer, StreamableHttpTransport } from "mcp-mcp-mcp";
 *
 * // Create server instance
 * const server = new McpServer({
 *   name: "my-server",
 *   version: "1.0.0"
 * });
 *
 * // Add a tool
 * server.tool("echo", {
 *   description: "Echoes the input message",
 *   inputSchema: {
 *     type: "object",
 *     properties: {
 *       message: { type: "string" }
 *     },
 *     required: ["message"]
 *   },
 *   handler: (args: { message: string }) => ({
 *     content: [{ type: "text", text: args.message }]
 *   })
 * });
 *
 * // Create HTTP transport and bind server
 * const transport = new StreamableHttpTransport();
 * const httpHandler = transport.bind(server);
 *
 * // Use with your HTTP framework
 * app.post("/mcp", async (req) => {
 *   const response = await httpHandler(req);
 *   return response;
 * });
 * ```
 *
 * @example Using middleware
 * ```typescript
 * server.use(async (ctx, next) => {
 *   console.log("Request:", ctx.request.method);
 *   await next();
 *   console.log("Response:", ctx.response?.result);
 * });
 * ```
 *
 * @example Tool with Standard Schema validation (Zod, Valibot, etc.)
 * ```typescript
 * import { z } from "zod";
 *
 * const inputSchema = z.object({
 *   value: z.number()
 * });
 *
 * server.tool("double", {
 *   description: "Doubles a number",
 *   inputSchema, // Standard Schema validator
 *   handler: (args: { value: number }) => ({
 *     content: [{ type: "text", text: String(args.value * 2) }]
 *   })
 * });
 * ```
 *
 * @example Error handling
 * ```typescript
 * server.onError((error, ctx) => {
 *   console.error("Error in request:", ctx.requestId, error);
 *   return {
 *     code: -32000,
 *     message: "Custom error message",
 *     data: { requestId: ctx.requestId }
 *   };
 * });
 * ```
 *
 * ## Core Features
 *
 * ### Tools
 * Tools are functions that can be called by MCP clients. They must return content in the
 * `ToolCallResult` format with a `content` array.
 *
 * ### Input Validation
 * - **JSON Schema**: Standard JSON Schema objects for validation
 * - **Standard Schema**: Support for Zod, Valibot, and other Standard Schema validators
 * - **No Schema**: Basic object validation when no schema provided
 *
 * ### Middleware Support
 * Middleware functions run before request handlers and can modify context, add logging,
 * implement authentication, etc.
 *
 * ### Transport Agnostic
 * The server core is transport-agnostic. Use `StreamableHttpTransport` for HTTP/REST
 * or implement custom transports for WebSockets, stdio, etc.
 *
 * ### Protocol Compliance
 * - Full MCP specification compliance
 * - JSON-RPC 2.0 protocol support
 * - Protocol version negotiation
 * - Proper error codes and messages
 *
 * @see {@link StreamableHttpTransport} For HTTP transport implementation
 * @see {@link Middleware} For middleware function signature
 * @see {@link ToolCallResult} For tool return value format
 * @see {@link MCPServerContext} For request context interface
 */
export class McpServer {
  private methods: Record<string, MethodHandler> = {};
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: supressing for now
  private initialized = false;
  private serverInfo: { name: string; version: string };
  private middlewares: Middleware[] = [];
  private capabilities: InitializeResult["capabilities"] = {};
  private onErrorHandler?: OnError;

  // Consolidated registries for MCP spec compliance
  private tools = new Map<string, ToolEntry>();
  private prompts = new Map<string, PromptEntry>();
  private resources = new Map<string, ResourceEntry>();

  /**
   * Create a new MCP server instance.
   *
   * @param options - Server configuration options
   * @param options.name - Server name (included in server info)
   * @param options.version - Server version (included in server info)
   *
   * @example
   * ```typescript
   * const server = new McpServer({
   *   name: "my-awesome-server",
   *   version: "1.2.3"
   * });
   * ```
   */
  constructor(options: McpServerOptions) {
    this.serverInfo = {
      name: options.name,
      version: options.version,
    };

    // Register core MCP methods
    this.methods = {
      initialize: this.handleInitialize.bind(this),
      ping: this.handlePing.bind(this),
      "tools/list": this.handleToolsList.bind(this),
      "tools/call": this.handleToolsCall.bind(this),
      // Prompts
      "prompts/list": this.handlePromptsList.bind(this),
      "prompts/get": this.handlePromptsGet.bind(this),
      // Resources
      "resources/list": this.handleResourcesList.bind(this),
      "resources/read": this.handleResourcesRead.bind(this),
      "resources/subscribe": this.handleResourcesSubscribe.bind(this),
      // Notifications (client → server)
      "notifications/cancelled": this.handleNotificationCancelled.bind(this),
      "notifications/initialized":
        this.handleNotificationInitialized.bind(this),
      "notifications/progress": this.handleNotificationProgress.bind(this),
      "notifications/roots/list_changed":
        this.handleNotificationRootsListChanged.bind(this),
      // Logging
      "logging/setLevel": this.handleLoggingSetLevel.bind(this),
      // Stubs for yet-unimplemented endpoints
      "resources/unsubscribe": this.handleNotImplemented.bind(this),
      "resources/templates/list": this.handleNotImplemented.bind(this),
      "completion/complete": this.handleNotImplemented.bind(this),
    };
  }

  /**
   * Add middleware to the server request pipeline.
   *
   * Middleware functions execute in the order they are added, before the actual
   * request handler. They can modify the context, implement authentication,
   * add logging, etc.
   *
   * @param middleware - Middleware function to add
   * @returns This server instance for chaining
   *
   * @example
   * ```typescript
   * server.use(async (ctx, next) => {
   *   console.log(`Received ${ctx.request.method} request`);
   *   ctx.state.startTime = Date.now();
   *   await next();
   *   console.log(`Request took ${Date.now() - ctx.state.startTime}ms`);
   *   if (ctx.response?.result) {
   *     console.log("Tool executed successfully:", ctx.response.result);
   *   }
   * });
   * ```
   */
  use(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Set a custom error handler for the server.
   *
   * The error handler receives all unhandled errors and can return custom
   * JSON-RPC error responses or return undefined to use default error handling.
   *
   * @param handler - Error handler function
   * @returns This server instance for chaining
   *
   * @example
   * ```typescript
   * server.onError((error, ctx) => {
   *   if (error instanceof AuthError) {
   *     return {
   *       code: -32001,
   *       message: "Authentication required",
   *       data: { requestId: ctx.requestId }
   *     };
   *   }
   *   // Return undefined for default error handling
   * });
   * ```
   */
  onError(handler: OnError): this {
    this.onErrorHandler = handler;
    return this;
  }

  /**
   * Register a tool that clients can call.
   *
   * Tools are functions exposed to MCP clients. They receive validated arguments
   * and must return content in the ToolCallResult format.
   *
   * @template TArgs - Type of the tool's input arguments
   * @param name - Unique tool name
   * @param def - Tool definition with schema, description, and handler
   * @returns This server instance for chaining
   *
   * @example With JSON Schema
   * ```typescript
   * server.tool("calculateSum", {
   *   description: "Calculates the sum of two numbers",
   *   inputSchema: {
   *     type: "object",
   *     properties: {
   *       a: { type: "number" },
   *       b: { type: "number" }
   *     },
   *     required: ["a", "b"]
   *   },
   *   handler: (args: { a: number; b: number }) => ({
   *     content: [{ type: "text", text: String(args.a + args.b) }]
   *   })
   * });
   * ```
   *
   * @example With Standard Schema (Zod)
   * ```typescript
   * import { z } from "zod";
   *
   * const schema = z.object({
   *   message: z.string(),
   *   count: z.number().optional()
   * });
   *
   * server.tool("repeat", {
   *   description: "Repeats a message",
   *   inputSchema: schema,
   *   handler: (args: { message: string; count?: number }) => ({
   *     content: [{
   *       type: "text",
   *       text: args.message.repeat(args.count || 1)
   *     }]
   *   })
   * });
   * ```
   *
   * @example Without schema
   * ```typescript
   * server.tool("ping", {
   *   description: "Simple ping tool",
   *   handler: () => ({
   *     content: [{ type: "text", text: "pong" }]
   *   })
   * });
   * ```
   */
  tool<TArgs = unknown>(
    name: string,
    def: {
      description?: string;
      inputSchema?: unknown | StandardSchemaV1<TArgs>;
      handler: (
        args: TArgs,
        ctx: MCPServerContext,
      ) => Promise<ToolCallResult> | ToolCallResult;
    },
  ): this {
    // Enable tools capability with listChanged flag
    if (!this.capabilities.tools) {
      this.capabilities.tools = { listChanged: true };
    }

    const { mcpInputSchema, validator } = resolveToolSchema(def.inputSchema);

    // Store tool metadata
    const metadata: Tool = {
      name,
      inputSchema: mcpInputSchema,
    };
    if (def.description) {
      metadata.description = def.description;
    }

    // Store consolidated tool entry
    const entry: ToolEntry = {
      metadata,
      handler: def.handler as MethodHandler,
      validator,
    };
    this.tools.set(name, entry);
    return this;
  }

  async _dispatch(message: unknown): Promise<JsonRpcRes | null> {
    // Early validation - if it's not a valid JSON-RPC message, return error
    if (!isValidJsonRpcMessage(message)) {
      return createJsonRpcError(
        null,
        new RpcError(
          JSON_RPC_ERROR_CODES.INVALID_REQUEST,
          "Invalid JSON-RPC 2.0 message format",
        ).toJson(),
      );
    }

    const isNotification = isJsonRpcNotification(message);
    const requestId = isNotification ? undefined : (message as JsonRpcReq).id;
    const ctx = createContext(message, requestId);

    const method = (message as JsonRpcMessage).method;
    const handler = this.methods[method];

    // Handler function that runs as the tail of the middleware chain
    const tail = async (): Promise<void> => {
      if (!handler) {
        if (requestId === undefined) {
          return;
        }
        ctx.response = createJsonRpcError(
          requestId,
          new RpcError(
            JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND,
            "Method not found",
            method ? { method } : undefined,
          ).toJson(),
        );
        return;
      }

      const result = await handler((message as JsonRpcMessage).params, ctx);
      if (requestId !== undefined) {
        // Only create response for requests, not notifications
        ctx.response = createJsonRpcResponse(requestId, result);
      }
    };

    try {
      await runMiddlewares(this.middlewares, ctx, tail);

      if (requestId === undefined) {
        // For notifications, always return null (no response)
        return null;
      }

      if (!ctx.response) {
        // Middleware short-circuited without setting a response for request
        return createJsonRpcError(
          requestId,
          new RpcError(
            JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
            "No response generated",
          ).toJson(),
        );
      }
      return ctx.response;
    } catch (error) {
      // Handle notifications: return null for errors
      if (requestId === undefined) {
        return null;
      }

      // Try custom error handler first
      if (this.onErrorHandler) {
        try {
          const customError = await this.onErrorHandler(error, ctx);
          if (customError) {
            return createJsonRpcError(requestId, customError);
          }
        } catch (_handlerError) {
          // onError handler threw, continue with default error handling
        }
      }

      // Default error handling
      return errorToResponse(error, requestId);
    }
  }

  // MCP spec-compliant method handlers
  private async handleToolsList(
    _params: unknown,
    _ctx: MCPServerContext,
  ): Promise<ListToolsResult> {
    return {
      tools: Array.from(this.tools.values()).map((t) => t.metadata),
    };
  }

  private async handleToolsCall(
    params: unknown,
    ctx: MCPServerContext,
  ): Promise<ToolCallResult> {
    // Validate params structure
    if (typeof params !== "object" || params === null) {
      throw new RpcError(
        JSON_RPC_ERROR_CODES.INVALID_PARAMS,
        "tools/call requires an object with name and arguments",
      );
    }

    const callParams = params as Record<string, unknown>;

    if (typeof callParams.name !== "string") {
      throw new RpcError(
        JSON_RPC_ERROR_CODES.INVALID_PARAMS,
        "tools/call requires a string 'name' field",
      );
    }

    const toolName = callParams.name;
    const entry = this.tools.get(toolName);

    if (!entry) {
      throw new RpcError(
        JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND,
        "Method not found",
        { method: toolName },
      );
    }

    // Validate arguments if a validator is stored
    let validatedArgs = callParams.arguments;
    if (entry.validator) {
      validatedArgs = ctx.validate(entry.validator, callParams.arguments);
    }

    // Call the tool handler with the validated arguments
    const result = await entry.handler(validatedArgs, ctx);
    return result as ToolCallResult;
  }

  private async handlePromptsList(
    _params: unknown,
    _ctx: MCPServerContext,
  ): Promise<ListPromptsResult> {
    return {
      prompts: Array.from(this.prompts.values()).map((p) => p.metadata),
    };
  }

  private async handlePromptsGet(
    params: unknown,
    ctx: MCPServerContext,
  ): Promise<PromptGetResult> {
    // Validate params structure
    if (typeof params !== "object" || params === null) {
      throw new RpcError(
        JSON_RPC_ERROR_CODES.INVALID_PARAMS,
        "prompts/get requires an object with name and arguments",
      );
    }

    const getParams = params as Record<string, unknown>;

    if (typeof getParams.name !== "string") {
      throw new RpcError(
        JSON_RPC_ERROR_CODES.INVALID_PARAMS,
        "prompts/get requires a string 'name' field",
      );
    }

    const promptName = getParams.name;
    const entry = this.prompts.get(promptName);

    if (!entry) {
      throw new RpcError(
        JSON_RPC_ERROR_CODES.INVALID_PARAMS,
        "Invalid prompt name",
        { name: promptName },
      );
    }

    // Call the prompt handler with the arguments
    const result = await entry.handler(getParams.arguments, ctx);
    return result as PromptGetResult;
  }

  private async handleResourcesList(
    _params: unknown,
    _ctx: MCPServerContext,
  ): Promise<ListResourcesResult> {
    return {
      resources: Array.from(this.resources.values()).map((r) => r.metadata),
    };
  }

  private async handleResourcesRead(
    params: unknown,
    ctx: MCPServerContext,
  ): Promise<ResourceReadResult> {
    // Validate params structure
    if (typeof params !== "object" || params === null) {
      throw new RpcError(
        JSON_RPC_ERROR_CODES.INVALID_PARAMS,
        "resources/read requires an object with uri",
      );
    }

    const readParams = params as Record<string, unknown>;

    if (typeof readParams.uri !== "string") {
      throw new RpcError(
        JSON_RPC_ERROR_CODES.INVALID_PARAMS,
        "resources/read requires a string 'uri' field",
      );
    }

    const uri = readParams.uri;

    // Extract resource name from URI (resource://name format)
    const match = uri.match(/^resource:\/\/(.+)$/);
    if (!match) {
      throw new RpcError(
        JSON_RPC_ERROR_CODES.INVALID_PARAMS,
        "Invalid resource URI format. Expected: resource://<name>",
      );
    }

    const resourceName = match[1];
    if (!resourceName) {
      throw new RpcError(
        JSON_RPC_ERROR_CODES.INVALID_PARAMS,
        "Invalid resource URI format. Expected: resource://<name>",
      );
    }

    const entry = this.resources.get(resourceName);
    const provider = entry?.provider;

    if (!provider || !provider.read) {
      throw new RpcError(
        JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND,
        "Method not found",
        { method: `resources/read for ${resourceName}` },
      );
    }

    // Call the resource read handler
    const result = await provider.read(uri, ctx);
    return result as ResourceReadResult;
  }

  private async handleResourcesSubscribe(
    params: unknown,
    ctx: MCPServerContext,
  ): Promise<unknown> {
    // Validate params structure
    if (typeof params !== "object" || params === null) {
      throw new RpcError(
        JSON_RPC_ERROR_CODES.INVALID_PARAMS,
        "resources/subscribe requires an object with uri",
      );
    }

    const subscribeParams = params as Record<string, unknown>;

    if (typeof subscribeParams.uri !== "string") {
      throw new RpcError(
        JSON_RPC_ERROR_CODES.INVALID_PARAMS,
        "resources/subscribe requires a string 'uri' field",
      );
    }

    const uri = subscribeParams.uri;

    // Extract resource name from URI (resource://name format)
    const match = uri.match(/^resource:\/\/(.+)$/);
    if (!match) {
      throw new RpcError(
        JSON_RPC_ERROR_CODES.INVALID_PARAMS,
        "Invalid resource URI format. Expected: resource://<name>",
      );
    }

    const resourceName = match[1];
    if (!resourceName) {
      throw new RpcError(
        JSON_RPC_ERROR_CODES.INVALID_PARAMS,
        "Invalid resource URI format. Expected: resource://<name>",
      );
    }

    const entry = this.resources.get(resourceName);
    const provider = entry?.provider;

    if (!provider || !provider.subscribe) {
      throw new RpcError(
        JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND,
        "Method not found",
        { method: `resources/subscribe for ${resourceName}` },
      );
    }

    const onChange = (_n: { uri: string }) => {
      // Handle subscription notification - in real implementation would send notification to client
      // FIXME: connect to transport-level notification emitter when available
    };

    // Call the resource subscribe handler
    return await provider.subscribe(uri, ctx, onChange);
  }

  private async handleInitialize(
    params: unknown,
    _ctx: MCPServerContext,
  ): Promise<InitializeResult> {
    // For HTTP transport, allow re-initialization since each request is stateless
    // In persistent connection transports (WebSocket/stdio), this would need session management

    // Use type guard for proper validation
    if (!isInitializeParams(params)) {
      throw new RpcError(
        JSON_RPC_ERROR_CODES.INVALID_PARAMS,
        "Invalid initialize parameters",
      );
    }

    const initParams = params;

    // Check protocol version compatibility
    if (initParams.protocolVersion !== SUPPORTED_MCP_PROTOCOL_VERSION) {
      throw new RpcError(
        -32000, // Custom application error for protocol version mismatch
        `Unsupported protocol version. Server supports: ${SUPPORTED_MCP_PROTOCOL_VERSION}, client requested: ${initParams.protocolVersion}`,
        {
          supportedVersion: SUPPORTED_MCP_PROTOCOL_VERSION,
          requestedVersion: initParams.protocolVersion,
        },
      );
    }

    this.initialized = true;

    return {
      protocolVersion: SUPPORTED_MCP_PROTOCOL_VERSION,
      serverInfo: this.serverInfo,
      capabilities: this.capabilities,
    };
  }

  private async handlePing(): Promise<Record<string, never>> {
    return {};
  }

  // --- Notification handlers (no-ops for now) ---
  private async handleNotificationCancelled(
    params: unknown,
    _ctx: MCPServerContext,
  ): Promise<Record<string, never>> {
    if (typeof params === "object" && params !== null) {
      const _p = params as Record<string, unknown>;
      const _id = (_p.requestId ?? _p.id) as unknown;
      const _reason = _p.reason as unknown;
      // Handle cancelled notification
    }
    return {};
  }

  private async handleNotificationInitialized(
    _params: unknown,
    _ctx: MCPServerContext,
  ): Promise<Record<string, never>> {
    return {};
  }

  private async handleNotificationProgress(
    params: unknown,
    _ctx: MCPServerContext,
  ): Promise<Record<string, never>> {
    if (typeof params === "object" && params !== null) {
      const _p = params as Record<string, unknown>;
      // Handle progress notification
    }
    return {};
  }

  private async handleNotificationRootsListChanged(
    _params: unknown,
    _ctx: MCPServerContext,
  ): Promise<Record<string, never>> {
    return {};
  }

  private async handleLoggingSetLevel(
    _params: unknown,
    _ctx: MCPServerContext,
  ): Promise<Record<string, never>> {
    // Expected shape: { level: string }
    // NOTE: handle this
    return {};
  }

  private async handleNotImplemented(
    _params: unknown,
    ctx: MCPServerContext,
  ): Promise<never> {
    throw new RpcError(JSON_RPC_ERROR_CODES.INTERNAL_ERROR, "Not implemented", {
      method: ctx.request.method,
    });
  }
}
