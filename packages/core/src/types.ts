import { JSON_RPC_VERSION } from "./constants.js";
import type { UriMatcher } from "./uri-template.js";

export const JSON_RPC_ERROR_CODES = {
  /** Malformed JSON payload. Occurs when the receiver cannot parse an MCP message (e.g., HTTP/WebSocket body is not valid JSON). */
  PARSE_ERROR: -32700,
  /** Structurally invalid JSON-RPC message per MCP Base Protocol (e.g., missing 'jsonrpc'/'method', notification includes 'id', or request id is null). */
  INVALID_REQUEST: -32600,
  /** Unknown method name. Typical MCP cases: calling an unimplemented route (e.g., 'tools/call' when tools capability isn't advertised) or a misspelled method like 'prompts/gett'. */
  METHOD_NOT_FOUND: -32601,
  /** Parameter validation failed. Typical MCP cases: invalid 'name' or arguments in 'tools/call', bad 'uri' in 'resources/read' or 'resources/subscribe', or malformed 'initialize' params. */
  INVALID_PARAMS: -32602,
  /** Unhandled server error. Typical MCP cases: handler/provider throws during 'tools/call', 'prompts/get', 'resources/*', or other internal failures. */
  INTERNAL_ERROR: -32603,
} as const;

export type JsonRpcStandardErrorCode =
  (typeof JSON_RPC_ERROR_CODES)[keyof typeof JSON_RPC_ERROR_CODES];

export type JsonRpcId = string | number | null;

export interface JsonRpcReq {
  jsonrpc: typeof JSON_RPC_VERSION;
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: typeof JSON_RPC_VERSION;
  method: string;
  params?: unknown;
}

export type JsonRpcMessage = JsonRpcReq | JsonRpcNotification;

export interface JsonRpcRes {
  jsonrpc: typeof JSON_RPC_VERSION;
  id: JsonRpcId;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// Error handling callback type (Hono-inspired pattern)
export type OnError = (
  err: unknown,
  ctx: MCPServerContext,
) => JsonRpcError | undefined | Promise<JsonRpcError | undefined>;

export interface InitializeParams {
  protocolVersion: string;
  capabilities?: {
    elicitation?: Record<string, never>;
    [key: string]: unknown;
  };
  clientInfo?: {
    name: string;
    version: string;
  };
}

export interface InitializeResult {
  protocolVersion: string;
  serverInfo: {
    name: string;
    version: string;
  };
  capabilities: {
    tools?: { listChanged?: boolean };
    prompts?: { listChanged?: boolean };
    resources?: { listChanged?: boolean; subscribe?: boolean };
  };
}

export interface MCPServerContext {
  request: JsonRpcMessage;
  requestId: JsonRpcId | undefined;
  response: JsonRpcRes | null;
  env: Record<string, unknown>;
  state: Record<string, unknown>;
  session?: { id: string; protocolVersion: string };
  validate<T>(validator: unknown, input: unknown): T;
}

export type Middleware = (
  ctx: MCPServerContext,
  next: () => Promise<void>,
) => Promise<void> | void;

// Generic handler type for JSON-RPC method implementations
export type MethodHandler = (
  params: unknown,
  ctx: MCPServerContext,
) => Promise<unknown> | unknown;

export function isJsonRpcNotification(
  obj: unknown,
): obj is JsonRpcNotification {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }

  const candidate = obj as Record<string, unknown>;

  // Check jsonrpc field
  if (candidate.jsonrpc !== "2.0") {
    return false;
  }

  // Check method field
  if (typeof candidate.method !== "string") {
    return false;
  }

  // Notification must NOT have an id field
  if ("id" in candidate) {
    return false;
  }

  return true;
}

export function isJsonRpcRequest(obj: unknown): obj is JsonRpcReq {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }

  const candidate = obj as Record<string, unknown>;

  // Check jsonrpc field
  if (candidate.jsonrpc !== "2.0") {
    return false;
  }

  // Check method field
  if (typeof candidate.method !== "string") {
    return false;
  }

  // Request must have an id field
  if (!("id" in candidate)) {
    return false;
  }
  const id = candidate.id;
  if (typeof id !== "string" && typeof id !== "number" && id !== null) {
    return false;
  }

  return true;
}

export function isValidJsonRpcMessage(obj: unknown): obj is JsonRpcMessage {
  return isJsonRpcRequest(obj) || isJsonRpcNotification(obj);
}

export function createJsonRpcResponse(
  id: JsonRpcId,
  result?: unknown,
): JsonRpcRes {
  return {
    jsonrpc: JSON_RPC_VERSION,
    id,
    result,
  };
}

export function createJsonRpcError(
  id: JsonRpcId,
  error: JsonRpcError,
): JsonRpcRes {
  return {
    jsonrpc: JSON_RPC_VERSION,
    id,
    error,
  };
}

export function isInitializeParams(obj: unknown): obj is InitializeParams {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }

  const candidate = obj as Record<string, unknown>;

  // Check required protocolVersion field
  if (
    !("protocolVersion" in candidate) ||
    typeof candidate.protocolVersion !== "string"
  ) {
    return false;
  }

  // Optional capabilities field validation
  if ("capabilities" in candidate && candidate.capabilities !== undefined) {
    if (
      typeof candidate.capabilities !== "object" ||
      candidate.capabilities === null
    ) {
      return false;
    }
  }

  // Optional clientInfo field validation
  if ("clientInfo" in candidate && candidate.clientInfo !== undefined) {
    const clientInfo = candidate.clientInfo;
    if (typeof clientInfo !== "object" || clientInfo === null) {
      return false;
    }
    const clientInfoObj = clientInfo as Record<string, unknown>;
    if (
      !("name" in clientInfoObj) ||
      typeof clientInfoObj.name !== "string" ||
      !("version" in clientInfoObj) ||
      typeof clientInfoObj.version !== "string"
    ) {
      return false;
    }
  }

  return true;
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

// MCP spec types for tools, prompts, and resources

export interface Tool {
  name: string;
  description?: string;
  inputSchema: unknown;
}

export interface Prompt {
  name: string;
  description?: string;
  arguments?: unknown[];
}

export interface PromptArgumentDef {
  name: string;
  description?: string;
  required?: boolean;
}

export interface PromptMetadata {
  name: string;
  title?: string;
  description?: string;
  arguments?: PromptArgumentDef[];
}

export type PromptHandler<TArgs = unknown> = (
  args: TArgs,
  ctx: MCPServerContext,
) => Promise<PromptGetResult> | PromptGetResult;

export interface PromptEntry {
  metadata: PromptMetadata;
  handler: PromptHandler;
  validator?: unknown;
}

export interface Resource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

// Registry/Provider types for consolidated server registries
export interface ResourceProvider {
  list?: (ctx: MCPServerContext) => unknown;
  read?: (uri: string, ctx: MCPServerContext) => unknown;
  subscribe?: (
    uri: string,
    ctx: MCPServerContext,
    onChange: (n: { uri: string }) => void,
  ) => unknown;
}

export interface ToolEntry {
  metadata: Tool;
  handler: MethodHandler;
  validator?: unknown;
}

export interface ResourceEntry {
  metadata: Resource | ResourceTemplate; // Depending on type
  handler: ResourceHandler;
  validators?: ResourceVarValidators;
  matcher?: UriMatcher; // Pre-compiled matcher for templates
  type: "resource" | "resource_template";
}

// Standard Schema V1 interface for supporting schema validators like Zod, Valibot, etc.
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
    ) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>;
    readonly types?: { readonly input: Input; readonly output: Output };
  };
}

export type StandardSchemaResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | {
      readonly issues: ReadonlyArray<{
        readonly message: string;
        readonly path?: ReadonlyArray<PropertyKey>;
      }>;
    };

// Helper to detect standard schema validators
export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  return (
    value !== null &&
    typeof value === "object" &&
    "~standard" in value &&
    typeof (value as Record<string, unknown>)["~standard"] === "object" &&
    (value as { "~standard": { version: number } })["~standard"].version === 1
  );
}

export interface Content {
  type: "text" | "image" | "resource";
  uri?: string;
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface ToolCallParams {
  name: string;
  arguments?: unknown;
}

export interface PromptGetParams {
  name: string;
  arguments?: unknown;
}

export interface ResourceReadParams {
  uri: string;
}

export interface ResourceSubscribeParams {
  uri: string;
}

export interface ToolCallResult {
  content: Content[];
  isError?: boolean;
}

export interface PromptGetResult {
  description?: string;
  messages: unknown[];
}

export interface ResourceReadResult {
  contents: Content[];
}

export interface ListToolsResult {
  tools: Tool[];
}

export interface ListPromptsResult {
  prompts: Prompt[];
}

export interface ListResourcesResult {
  resources: Resource[];
}

export interface ListResourceTemplatesResult {
  resourceTemplates: ResourceTemplate[];
}

export interface ResourceTemplate {
  uriTemplate: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

// New resource system types
export type ResourceVars = Record<string, string>;

export interface ResourceMeta {
  name?: string;
  description?: string;
  mimeType?: string;
}

export type ResourceVarValidators = Record<string, unknown>; // StandardSchema-compatible

export type ResourceHandler = (
  uri: URL,
  vars: ResourceVars,
  ctx: MCPServerContext,
) => Promise<ResourceReadResult>;
