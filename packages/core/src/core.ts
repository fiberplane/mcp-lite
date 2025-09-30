import type { StandardSchemaV1 } from "@standard-schema/spec";
import { METHODS, SUPPORTED_MCP_PROTOCOL_VERSION } from "./constants.js";
import {
  type CreateContextOptions,
  createContext,
  getProgressToken,
} from "./context.js";
import { RpcError } from "./errors.js";
import type {
  InferOutput,
  InitializeResult,
  JsonRpcMessage,
  JsonRpcNotification,
  JsonRpcReq,
  JsonRpcRes,
  ListPromptsResult,
  ListResourcesResult,
  ListResourceTemplatesResult,
  ListToolsResult,
  MCPServerContext,
  MethodHandler,
  Middleware,
  OnError,
  PromptArgumentDef,
  PromptEntry,
  PromptGetResult,
  PromptHandler,
  PromptMetadata,
  Resource,
  ResourceEntry,
  ResourceHandler,
  ResourceMeta,
  ResourceReadResult,
  ResourceTemplate,
  ResourceVarValidators,
  SchemaAdapter,
  Tool,
  ToolCallResult,
  ToolEntry,
} from "./types.js";
import {
  createJsonRpcError,
  createJsonRpcResponse,
  isInitializeParams,
  isJsonRpcNotification,
  JSON_RPC_ERROR_CODES,
} from "./types.js";
import { compileUriTemplate } from "./uri-template.js";
import { errorToResponse, isObject, isString } from "./utils.js";
import { extractArgumentsFromSchema, resolveToolSchema } from "./validation.js";

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
 * Logger interface for MCP server internal logging.
 * Defaults to console if not provided.
 */
export interface Logger {
  error(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

export interface McpServerOptions {
  name: string;
  version: string;
  /**
   * A function that converts a StandardSchema to a JSON Schema
   *
   * In practice, you will need to coerce the `schema` parameter of this function to the correct type for the library you are using,
   * in order to pass it to a helper that handles converting to JSON Schema.
   *
   * @example Using Zod
   * ```typescript
   * import { z } from "zod";
   *
   * const server = new McpServer({
   *   // ...
   *   schemaAdapter: (schema) => z.toJSONSchema(schema as z.ZodType),
   * });
   * ```
   */
  schemaAdapter?: SchemaAdapter;
  /**
   * Logger for internal server messages.
   * Defaults to console if not provided.
   *
   * @example Using a custom logger
   * ```typescript
   * const server = new McpServer({
   *   name: "my-server",
   *   version: "1.0.0",
   *   logger: {
   *     error: (msg, ...args) => myLogger.error(msg, ...args),
   *     warn: (msg, ...args) => myLogger.warn(msg, ...args),
   *     info: (msg, ...args) => myLogger.info(msg, ...args),
   *     debug: (msg, ...args) => myLogger.debug(msg, ...args),
   *   }
   * });
   * ```
   *
   * @example Disabling logs
   * ```typescript
   * const server = new McpServer({
   *   name: "my-server",
   *   version: "1.0.0",
   *   logger: {
   *     error: () => {},
   *     warn: () => {},
   *     info: () => {},
   *     debug: () => {},
   *   }
   * });
   * ```
   */
  logger?: Logger;
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
 * import { McpServer, StreamableHttpTransport } from "mcp-lite";
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
  private initialized = false;
  private serverInfo: { name: string; version: string };
  private middlewares: Middleware[] = [];
  private capabilities: InitializeResult["capabilities"] = {};
  private onErrorHandler?: OnError;
  private schemaAdapter?: SchemaAdapter;
  private logger: Logger;

  private tools = new Map<string, ToolEntry>();
  private prompts = new Map<string, PromptEntry>();
  private resources = new Map<string, ResourceEntry>();

  private notificationSender?: (
    sessionId: string | undefined,
    notification: { method: string; params?: unknown },
    options?: { relatedRequestId?: string },
  ) => Promise<void> | void;

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
    this.schemaAdapter = options.schemaAdapter;
    this.logger = options.logger || console;

    this.methods = {
      [METHODS.INITIALIZE]: this.handleInitialize.bind(this),
      [METHODS.PING]: this.handlePing.bind(this),
      [METHODS.TOOLS.LIST]: this.handleToolsList.bind(this),
      [METHODS.TOOLS.CALL]: this.handleToolsCall.bind(this),
      [METHODS.PROMPTS.LIST]: this.handlePromptsList.bind(this),
      [METHODS.PROMPTS.GET]: this.handlePromptsGet.bind(this),
      [METHODS.RESOURCES.LIST]: this.handleResourcesList.bind(this),
      [METHODS.RESOURCES.TEMPLATES_LIST]:
        this.handleResourceTemplatesList.bind(this),
      [METHODS.RESOURCES.READ]: this.handleResourcesRead.bind(this),
      [METHODS.RESOURCES.SUBSCRIBE]: this.handleNotImplemented.bind(this),
      [METHODS.NOTIFICATIONS.CANCELLED]:
        this.handleNotificationCancelled.bind(this),
      [METHODS.NOTIFICATIONS.INITIALIZED]:
        this.handleNotificationInitialized.bind(this),
      [METHODS.NOTIFICATIONS.PROGRESS]:
        this.handleNotificationProgress.bind(this),
      [METHODS.NOTIFICATIONS.ROOTS.LIST_CHANGED]:
        this.handleNotificationRootsListChanged.bind(this),
      [METHODS.LOGGING.SET_LEVEL]: this.handleLoggingSetLevel.bind(this),
      [METHODS.RESOURCES.UNSUBSCRIBE]: this.handleNotImplemented.bind(this),
      [METHODS.COMPLETION.COMPLETE]: this.handleNotImplemented.bind(this),
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
  // Overload for StandardSchemaV1 with automatic type inference
  tool<S extends StandardSchemaV1<unknown, unknown>>(
    name: string,
    def: {
      description?: string;
      inputSchema: S;
      handler: (
        args: InferOutput<S>,
        ctx: MCPServerContext,
      ) => Promise<ToolCallResult> | ToolCallResult;
    },
  ): this;

  // Overload for JSON Schema or no schema (requires manual typing)
  tool<TArgs = unknown>(
    name: string,
    def: {
      description?: string;
      inputSchema?: unknown;
      handler: (
        args: TArgs,
        ctx: MCPServerContext,
      ) => Promise<ToolCallResult> | ToolCallResult;
    },
  ): this;

  // Implementation
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
    if (!this.capabilities.tools) {
      this.capabilities.tools = { listChanged: true };
    }

    const { mcpInputSchema, validator } = resolveToolSchema(
      def.inputSchema,
      this.schemaAdapter,
    );

    const metadata: Tool = {
      name,
      inputSchema: mcpInputSchema,
    };
    if (def.description) {
      metadata.description = def.description;
    }

    const entry: ToolEntry = {
      metadata,
      // TODO - We could avoid this cast if MethodHandler had a generic type for `params` that defaulted to unknown, but here we could pass TArgs
      handler: def.handler as MethodHandler,
      validator,
    };
    this.tools.set(name, entry);
    if (this.initialized) {
      this.notificationSender?.(undefined, {
        method: METHODS.NOTIFICATIONS.TOOLS.LIST_CHANGED,
      });
    }
    return this;
  }

  /**
   * Register a resource that clients can list and read.
   *
   * Resources are URI-identified content that can be static or template-based.
   * Templates support parameter extraction using Hono-style syntax.
   *
   * @param template - URI template string (e.g. "file://config.json" or "github://repos/{owner}/{repo}")
   * @param meta - Resource metadata for listing
   * @param handler - Function that returns resource content
   * @returns This server instance for chaining
   *
   * @example Static resource
   * ```typescript
   * server.resource(
   *   "file://config.json",
   *   { description: "App configuration", mimeType: "application/json" },
   *   async (uri) => ({
   *     contents: [{ uri: uri.href, text: JSON.stringify(config) }]
   *   })
   * );
   * ```
   *
   * @example Template resource
   * ```typescript
   * server.resource(
   *   "github://repos/{owner}/{repo}",
   *   { description: "GitHub repository" },
   *   async (uri, { owner, repo }) => ({
   *     contents: [{ uri: uri.href, text: await fetchRepo(owner, repo) }]
   *   })
   * );
   * ```
   */
  resource(
    template: string,
    meta: ResourceMeta,
    handler: ResourceHandler,
  ): this;

  /**
   * Register a resource with parameter validation.
   *
   * @param template - URI template string with variables
   * @param meta - Resource metadata for listing
   * @param validators - Parameter validators (StandardSchema-compatible)
   * @param handler - Function that returns resource content
   * @returns This server instance for chaining
   *
   * @example With validation
   * ```typescript
   * server.resource(
   *   "api://users/{userId}",
   *   { description: "User by ID" },
   *   { userId: z.string().regex(/^\d+$/) },
   *   async (uri, { userId }) => ({
   *     contents: [{ uri: uri.href, text: JSON.stringify(await getUser(userId)) }]
   *   })
   * );
   * ```
   */
  resource(
    template: string,
    meta: ResourceMeta,
    validators: ResourceVarValidators,
    handler: ResourceHandler,
  ): this;

  resource(
    template: string,
    meta: ResourceMeta,
    validatorsOrHandler: ResourceVarValidators | ResourceHandler,
    handler?: ResourceHandler,
  ): this {
    if (!this.capabilities.resources) {
      this.capabilities.resources = { listChanged: true };
    }

    const actualHandler = handler || (validatorsOrHandler as ResourceHandler);
    const validators = handler
      ? (validatorsOrHandler as ResourceVarValidators)
      : undefined;

    const isStatic = !template.includes("{");
    const type = isStatic ? "resource" : "resource_template";

    const matcher = isStatic ? undefined : compileUriTemplate(template);

    const metadata = isStatic
      ? {
          uri: template,
          ...meta,
        }
      : {
          uriTemplate: template,
          ...meta,
        };

    const entry: ResourceEntry = {
      metadata,
      handler: actualHandler,
      validators,
      matcher,
      type,
    };

    this.resources.set(template, entry);
    if (this.initialized) {
      this.notificationSender?.(undefined, {
        method: METHODS.NOTIFICATIONS.RESOURCES.LIST_CHANGED,
      });
    }
    return this;
  }

  /**
   * Register a prompt that clients can invoke.
   *
   * Prompts are templates that generate messages for LLM conversations.
   * They can accept arguments and return a structured set of messages.
   *
   * @template TArgs - Type of the prompt's input arguments
   * @param name - Unique prompt name
   * @param def - Prompt definition with schema, description, and handler
   * @returns This server instance for chaining
   *
   * @example Basic prompt
   * ```typescript
   * server.prompt("greet", {
   *   description: "Generate a greeting message",
   *   handler: () => ({
   *     messages: [{
   *       role: "user",
   *       content: { type: "text", text: "Hello, how are you?" }
   *     }]
   *   })
   * });
   * ```
   *
   * @example Prompt with arguments and schema
   * ```typescript
   * server.prompt("summarize", {
   *   description: "Create a summary prompt",
   *   arguments: z.object({
   *     text: z.string(),
   *     length: z.enum(["short", "medium", "long"]).optional()
   *   }),
   *   handler: (args: { text: string; length?: string }) => ({
   *     description: "Summarization prompt",
   *     messages: [{
   *       role: "user",
   *       content: {
   *         type: "text",
   *         text: `Please summarize this text in ${args.length || "medium"} length:\n\n${args.text}`
   *       }
   *     }]
   *   })
   * });
   * ```
   */
  prompt<TArgs = unknown>(
    name: string,
    def: {
      title?: string;
      description?: string;
      arguments?: unknown | StandardSchemaV1<TArgs>;
      inputSchema?: unknown | StandardSchemaV1<TArgs>;
      handler: PromptHandler<TArgs>;
    },
  ): this {
    if (!this.capabilities.prompts) {
      this.capabilities.prompts = { listChanged: true };
    }

    let validator: unknown;
    let argumentDefs: PromptArgumentDef[] | undefined;

    if (def.arguments) {
      if (Array.isArray(def.arguments)) {
        argumentDefs = def.arguments as PromptArgumentDef[];
      } else {
        const { mcpInputSchema, validator: schemaValidator } =
          resolveToolSchema(def.arguments, this.schemaAdapter);
        validator = schemaValidator;
        argumentDefs = extractArgumentsFromSchema(mcpInputSchema);
      }
    } else if (def.inputSchema) {
      const { mcpInputSchema, validator: schemaValidator } = resolveToolSchema(
        def.inputSchema,
        this.schemaAdapter,
      );
      validator = schemaValidator;
      argumentDefs = extractArgumentsFromSchema(mcpInputSchema);
    }

    const metadata: PromptMetadata = {
      name,
      title: def.title,
      description: def.description,
    };

    if (argumentDefs && argumentDefs.length > 0) {
      metadata.arguments = argumentDefs;
    }

    const entry: PromptEntry = {
      metadata,
      handler: def.handler as PromptHandler,
      validator,
    };

    this.prompts.set(name, entry);

    if (this.initialized) {
      // Passing undefined here means the notification only gets broadcast to sessions
      this.notificationSender?.(undefined, {
        method: METHODS.NOTIFICATIONS.PROMPTS.LIST_CHANGED,
      });
    }

    return this;
  }

  /**
   * Mount a child server into this parent server for composition.
   *
   * Enables modular server design by composing multiple McpServer instances.
   * Uses keep-first semantics: first registered tool/prompt/resource wins,
   * later duplicates are silently skipped.
   *
   * @param child - Child server to mount (flat, no namespacing)
   * @returns This server instance for chaining
   *
   * @see {@link Logger} For configuring logging to track duplicate warnings
   * @see {@link Middleware} For middleware composition behavior
   *
   * @example Flat mounting (no namespacing)
   * ```typescript
   * const git = new McpServer({ name: 'git', version: '1.0.0' })
   *   .tool('clone', { handler: cloneHandler });
   *
   * const app = new McpServer({ name: 'app', version: '1.0.0' })
   *   .group(git);  // tools/list shows 'clone'
   * ```
   *
   * @example Complete example
   * See examples/groups-composition for a full working example with multiple
   * child servers, middleware composition, and real-world patterns.
   */
  group(child: McpServer): this;

  /**
   * Mount a child server with namespaced tools and prompts.
   *
   * @param prefix - Namespace prefix (e.g., 'git' makes 'clone' → 'git/clone')
   * @param child - Child server to mount
   * @returns This server instance for chaining
   *
   * @see {@link Logger} For configuring logging to track duplicate warnings
   * @see {@link Middleware} For middleware composition behavior
   *
   * @example Prefix namespacing
   * ```typescript
   * const git = new McpServer({ name: 'git', version: '1.0.0' })
   *   .tool('clone', { handler: cloneHandler });
   *
   * const app = new McpServer({ name: 'app', version: '1.0.0' })
   *   .group('git', git);  // tools/list shows 'git/clone'
   * ```
   *
   * @example Complete example
   * See examples/groups-composition for a full working example with multiple
   * child servers, middleware composition, and real-world patterns.
   */
  group(prefix: string, child: McpServer): this;

  /**
   * Mount a child server with flexible namespacing options.
   *
   * @param options - Namespacing configuration
   * @param child - Child server to mount
   * @returns This server instance for chaining
   *
   * @see {@link Logger} For configuring logging to track duplicate warnings
   * @see {@link Middleware} For middleware composition behavior
   *
   * @example Suffix namespacing
   * ```typescript
   * const claude = new McpServer({ name: 'claude', version: '1.0.0' })
   *   .tool('generateText', { handler: claudeHandler });
   *
   * const app = new McpServer({ name: 'app', version: '1.0.0' })
   *   .group({ suffix: 'claude' }, claude);  // tools/list shows 'generateText_claude'
   * ```
   *
   * @example Both prefix and suffix
   * ```typescript
   * .group({ prefix: 'ai', suffix: 'v2' }, server);  // 'ai/generateText_v2'
   * ```
   */
  group(options: { prefix?: string; suffix?: string }, child: McpServer): this;

  group(
    prefixOrOptionsOrChild: string | { prefix?: string; suffix?: string } | McpServer,
    child?: McpServer,
  ): this {
    let prefix = "";
    let suffix = "";
    let childServer: McpServer;

    if (typeof prefixOrOptionsOrChild === "string") {
      // .group("prefix", child)
      prefix = prefixOrOptionsOrChild;
      childServer = child as McpServer;
    } else if (prefixOrOptionsOrChild instanceof McpServer) {
      // .group(child)
      childServer = prefixOrOptionsOrChild;
    } else {
      // .group({ prefix?, suffix? }, child)
      prefix = prefixOrOptionsOrChild.prefix || "";
      suffix = prefixOrOptionsOrChild.suffix || "";
      childServer = child as McpServer;
    }

    this.mountChild(prefix, suffix, childServer);
    return this;
  }

  /**
   * Export registries snapshot for child server mounting.
   * Used internally by .group() to compose servers.
   * @internal
   */
  protected _exportRegistries(): {
    tools: Array<{ name: string; entry: ToolEntry }>;
    prompts: Array<{ name: string; entry: PromptEntry }>;
    resources: Array<{ template: string; entry: ResourceEntry }>;
  } {
    return {
      tools: Array.from(this.tools.entries()).map(([name, entry]) => ({
        name,
        entry,
      })),
      prompts: Array.from(this.prompts.entries()).map(([name, entry]) => ({
        name,
        entry,
      })),
      resources: Array.from(this.resources.entries()).map(
        ([template, entry]) => ({ template, entry }),
      ),
    };
  }

  /**
   * Export middlewares snapshot for child server mounting.
   * Used internally by .group() to compose middleware chains.
   * @internal
   */
  protected _exportMiddlewares(): Middleware[] {
    return [...this.middlewares];
  }

  /**
   * Wrap a tool or prompt handler with child middlewares for composition.
   * Ensures child middlewares run around the handler while parent middlewares
   * run around the entire wrapped handler.
   * @internal
   */
  private wrapWithMiddlewares(
    mws: Middleware[],
    handler: MethodHandler,
  ): MethodHandler {
    return async (params, ctx) => {
      let result: unknown;
      let handlerCalled = false;

      await runMiddlewares(mws, ctx, async () => {
        result = await handler(params, ctx);
        handlerCalled = true;
      });

      if (!handlerCalled) {
        this.logger.error(
          "[mcp-lite] Handler was not executed. A middleware in the child server's middleware chain did not call next(). This is a server configuration issue.",
        );
        throw new RpcError(
          JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
          "Internal server error",
        );
      }

      return result;
    };
  }

  /**
   * Wrap a resource handler with child middlewares for composition.
   * Ensures child middlewares run around the handler while parent middlewares
   * run around the entire wrapped handler.
   * @internal
   */
  private wrapResourceHandler(
    mws: Middleware[],
    handler: ResourceHandler,
  ): ResourceHandler {
    return async (uri, vars, ctx) => {
      let result: ResourceReadResult | undefined;
      let handlerCalled = false;

      await runMiddlewares(mws, ctx, async () => {
        result = await handler(uri, vars, ctx);
        handlerCalled = true;
      });

      if (!handlerCalled) {
        this.logger.error(
          "[mcp-lite] Resource handler was not executed. A middleware in the child server's middleware chain did not call next(). This is a server configuration issue.",
        );
        throw new RpcError(
          JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
          "Internal server error",
        );
      }

      if (!result) {
        this.logger.error(
          "[mcp-lite] Resource handler returned no result. This is a server implementation issue.",
        );
        throw new RpcError(
          JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
          "Internal server error",
        );
      }

      return result;
    };
  }

  /**
   * Mount a child server into this parent server.
   * Implements keep-first semantics: first registered tool/prompt/resource wins,
   * duplicates are silently skipped.
   * @internal
   */
  private mountChild(prefix: string, suffix: string, child: McpServer): void {
    const qualify = (n: string) => {
      let qualified = n;
      if (prefix) qualified = `${prefix}/${qualified}`;
      if (suffix) qualified = `${qualified}_${suffix}`;
      return qualified;
    };
    const regs = child._exportRegistries();
    const childMWs = child._exportMiddlewares();
    let addedTools = 0;
    let addedPrompts = 0;
    let addedResources = 0;

    for (const { name, entry } of regs.tools) {
      const qualifiedName = qualify(name);
      if (!this.tools.has(qualifiedName)) {
        const wrappedHandler =
          childMWs.length > 0
            ? this.wrapWithMiddlewares(childMWs, entry.handler)
            : entry.handler;

        const wrappedEntry: ToolEntry = {
          metadata: { ...entry.metadata, name: qualifiedName },
          handler: wrappedHandler,
          validator: entry.validator,
        };

        this.tools.set(qualifiedName, wrappedEntry);
        addedTools++;
      } else {
        this.logger.warn(
          `[mcp-lite] Tool '${qualifiedName}' already exists, skipping duplicate from child server. ` +
            `This follows keep-first semantics where the first registered tool wins.`,
        );
      }
    }

    for (const { name, entry } of regs.prompts) {
      const qualifiedName = qualify(name);
      if (!this.prompts.has(qualifiedName)) {
        const wrappedHandler =
          childMWs.length > 0
            ? (this.wrapWithMiddlewares(
                childMWs,
                entry.handler as MethodHandler,
              ) as PromptHandler)
            : entry.handler;

        const wrappedEntry: PromptEntry = {
          metadata: { ...entry.metadata, name: qualifiedName },
          handler: wrappedHandler,
          validator: entry.validator,
        };

        this.prompts.set(qualifiedName, wrappedEntry);
        addedPrompts++;
      } else {
        this.logger.warn(
          `[mcp-lite] Prompt '${qualifiedName}' already exists, skipping duplicate from child server. ` +
            `This follows keep-first semantics where the first registered prompt wins.`,
        );
      }
    }

    for (const { template, entry } of regs.resources) {
      if (!this.resources.has(template)) {
        const wrappedHandler =
          childMWs.length > 0
            ? this.wrapResourceHandler(childMWs, entry.handler)
            : entry.handler;

        const wrappedEntry: ResourceEntry = {
          ...entry,
          handler: wrappedHandler,
        };

        this.resources.set(template, wrappedEntry);
        addedResources++;
      } else {
        this.logger.warn(
          `[mcp-lite] Resource '${template}' already exists, skipping duplicate from child server. ` +
            `This follows keep-first semantics where the first registered resource wins.`,
        );
      }
    }

    if (addedTools > 0 && !this.capabilities.tools) {
      this.capabilities.tools = { listChanged: true };
    }
    if (addedPrompts > 0 && !this.capabilities.prompts) {
      this.capabilities.prompts = { listChanged: true };
    }
    if (addedResources > 0 && !this.capabilities.resources) {
      this.capabilities.resources = { listChanged: true };
    }

    if (this.initialized) {
      if (addedTools > 0) {
        this.notificationSender?.(undefined, {
          method: METHODS.NOTIFICATIONS.TOOLS.LIST_CHANGED,
        });
      }
      if (addedPrompts > 0) {
        this.notificationSender?.(undefined, {
          method: METHODS.NOTIFICATIONS.PROMPTS.LIST_CHANGED,
        });
      }
      if (addedResources > 0) {
        this.notificationSender?.(undefined, {
          method: METHODS.NOTIFICATIONS.RESOURCES.LIST_CHANGED,
        });
      }
    }
  }

  /**
   * Set the notification sender for streaming notifications.
   * This is called by the transport to wire up notification delivery.
   */
  _setNotificationSender(
    sender: (
      sessionId: string | undefined,
      notification: { method: string; params?: unknown },
      options?: { relatedRequestId?: string },
    ) => Promise<void> | void,
  ): void {
    this.notificationSender = sender;
  }

  async _dispatch(
    message: JsonRpcReq | JsonRpcNotification,
    contextOptions: CreateContextOptions = {},
  ): Promise<JsonRpcRes | null> {
    const isNotification = isJsonRpcNotification(message);
    const requestId = isNotification ? undefined : (message as JsonRpcReq).id;

    const progressToken = getProgressToken(message as JsonRpcMessage);

    const sessionId = contextOptions.sessionId;
    const progressSender =
      sessionId && this.notificationSender && progressToken
        ? (update: unknown) =>
            this.notificationSender?.(
              sessionId,
              {
                method: METHODS.NOTIFICATIONS.PROGRESS,
                params: {
                  progressToken,
                  ...(update as Record<string, unknown>),
                },
              },
              { relatedRequestId: requestId ?? undefined },
            )
        : undefined;

    const ctx = createContext(message as JsonRpcMessage, requestId, {
      sessionId,
      progressToken,
      progressSender,
      authInfo: contextOptions.authInfo,
    });

    const method = (message as JsonRpcMessage).method;
    const handler = this.methods[method];

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

      const result = await handler(message.params, ctx);
      if (requestId !== undefined) {
        ctx.response = createJsonRpcResponse(requestId, result);
      }
    };

    try {
      await runMiddlewares(this.middlewares, ctx, tail);

      if (requestId === undefined) {
        return null;
      }

      if (!ctx.response) {
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
      if (requestId === undefined) {
        return null;
      }

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

      return errorToResponse(error, requestId);
    }
  }

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
    if (!isObject(params)) {
      throw new RpcError(
        JSON_RPC_ERROR_CODES.INVALID_PARAMS,
        "tools/call requires an object with name and arguments",
      );
    }

    const callParams = params as Record<string, unknown>;

    if (!isString(callParams.name)) {
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

    let validatedArgs = callParams.arguments;
    if (entry.validator) {
      validatedArgs = ctx.validate(entry.validator, callParams.arguments);
    }

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
    if (!isObject(params)) {
      throw new RpcError(
        JSON_RPC_ERROR_CODES.INVALID_PARAMS,
        "prompts/get requires an object with name and arguments",
      );
    }

    const getParams = params as Record<string, unknown>;

    if (!isString(getParams.name)) {
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

    let validatedArgs = getParams.arguments || {};
    if (entry.validator) {
      validatedArgs = ctx.validate(entry.validator, getParams.arguments);
    }

    const result = await entry.handler(validatedArgs, ctx);
    return result as PromptGetResult;
  }

  private async handleResourcesList(
    _params: unknown,
    _ctx: MCPServerContext,
  ): Promise<ListResourcesResult> {
    const resources = Array.from(this.resources.values())
      .filter((entry) => entry.type === "resource")
      .map((entry) => entry.metadata as Resource);

    return { resources };
  }

  private async handleResourceTemplatesList(
    _params: unknown,
    _ctx: MCPServerContext,
  ): Promise<ListResourceTemplatesResult> {
    const resourceTemplates = Array.from(this.resources.values())
      .filter((entry) => entry.type === "resource_template")
      .map((entry) => entry.metadata as ResourceTemplate);

    return { resourceTemplates };
  }

  private async handleResourcesRead(
    params: unknown,
    ctx: MCPServerContext,
  ): Promise<ResourceReadResult> {
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

    let matchedEntry: ResourceEntry | null = null;
    let vars: Record<string, string> = {};

    const directEntry = this.resources.get(uri);
    if (directEntry?.type === "resource") {
      matchedEntry = directEntry;
    }

    if (!matchedEntry) {
      for (const entry of this.resources.values()) {
        if (entry.type === "resource_template" && entry.matcher) {
          const matchResult = entry.matcher.match(uri);
          if (matchResult !== null) {
            matchedEntry = entry;
            vars = matchResult;
            break;
          }
        }
      }
    }

    if (!matchedEntry) {
      throw new RpcError(
        JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND,
        "Method not found",
        { uri },
      );
    }

    let validatedVars = vars;
    if (matchedEntry.validators) {
      validatedVars = {};
      for (const [key, validator] of Object.entries(matchedEntry.validators)) {
        if (key in vars) {
          try {
            validatedVars[key] = ctx.validate(validator, vars[key]);
          } catch (validationError) {
            throw new RpcError(
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              `Validation failed for parameter '${key}': ${validationError instanceof Error ? validationError.message : String(validationError)}`,
            );
          }
        }
      }
      for (const [key, value] of Object.entries(vars)) {
        if (!(key in matchedEntry.validators)) {
          validatedVars[key] = value;
        }
      }
    }

    try {
      const url = { href: uri } as URL;
      const result = await matchedEntry.handler(url, validatedVars, ctx);
      return result;
    } catch (error) {
      if (error instanceof RpcError) {
        throw error;
      }
      throw new RpcError(
        JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
        "Internal error",
        error instanceof Error ? { message: error.message } : error,
      );
    }
  }

  private async handleInitialize(
    params: unknown,
    _ctx: MCPServerContext,
  ): Promise<InitializeResult> {
    if (!isInitializeParams(params)) {
      throw new RpcError(
        JSON_RPC_ERROR_CODES.INVALID_PARAMS,
        "Invalid initialize parameters",
      );
    }

    const initParams = params;

    if (initParams.protocolVersion !== SUPPORTED_MCP_PROTOCOL_VERSION) {
      throw new RpcError(
        -32000,
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

  private async handleNotificationCancelled(
    _params: unknown,
    _ctx: MCPServerContext,
  ): Promise<Record<string, never>> {
    return {};
  }

  private async handleNotificationInitialized(
    _params: unknown,
    _ctx: MCPServerContext,
  ): Promise<Record<string, never>> {
    return {};
  }

  private async handleNotificationProgress(
    _params: unknown,
    _ctx: MCPServerContext,
  ): Promise<Record<string, never>> {
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
