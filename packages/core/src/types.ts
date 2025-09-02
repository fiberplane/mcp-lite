import { JSON_RPC_VERSION } from "./constants.js";

// Standard JSON-RPC and MCP-adjacent error codes
// Includes JSON-RPC 2.0 + commonly adopted extensions (inspired by LSP)
export const JSON_RPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Server error range (-32099 to -32000) – we expose a few well-known ones
  SERVER_ERROR: -32000,
  UNKNOWN_ERROR_CODE: -32001, // Non-standard, used by LSP
  SERVER_NOT_INITIALIZED: -32002, // Non-standard, used by LSP
  // Extended, widely used in cancellation-aware protocols
  REQUEST_CANCELLED: -32800, // Non-standard, used by LSP
  CONTENT_MODIFIED: -32801, // Non-standard, used by LSP
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
  request: JsonRpcReq;
  requestId: JsonRpcId;
  env: Record<string, unknown>;
  state: { cancel?: AbortSignal };
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

export function isValidJsonRpcRequest(obj: unknown): obj is JsonRpcReq {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }

  const candidate = obj as Record<string, unknown>;

  // Check jsonrpc field
  if (!("jsonrpc" in candidate) || candidate.jsonrpc !== "2.0") {
    return false;
  }

  // Check method field
  if (!("method" in candidate) || typeof candidate.method !== "string") {
    return false;
  }

  // Check id field
  if (!("id" in candidate)) {
    return false;
  }
  const id = candidate.id;
  if (typeof id !== "string" && typeof id !== "number" && id !== null) {
    return false;
  }

  return true;
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

export interface PromptEntry {
  metadata: Prompt;
  handler: MethodHandler;
}

export interface ResourceEntry {
  metadata: Resource;
  provider: ResourceProvider;
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
