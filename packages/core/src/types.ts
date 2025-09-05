import type { StandardSchemaV1 } from "@standard-schema/spec";
import { JSON_RPC_VERSION } from "./constants.js";
import type { UriMatcher } from "./uri-template.js";

export const JSON_RPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
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

  if (candidate.jsonrpc !== "2.0") {
    return false;
  }

  if (typeof candidate.method !== "string") {
    return false;
  }
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

  if (candidate.jsonrpc !== "2.0") {
    return false;
  }

  if (typeof candidate.method !== "string") {
    return false;
  }
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

  if (
    !("protocolVersion" in candidate) ||
    typeof candidate.protocolVersion !== "string"
  ) {
    return false;
  }

  if ("capabilities" in candidate && candidate.capabilities !== undefined) {
    if (
      typeof candidate.capabilities !== "object" ||
      candidate.capabilities === null
    ) {
      return false;
    }
  }

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
  _meta?: { [key: string]: unknown };
  annotations?: Annotations;
}

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
  metadata: Resource | ResourceTemplate;
  handler: ResourceHandler;
  validators?: ResourceVarValidators;
  matcher?: UriMatcher;
  type: "resource" | "resource_template";
}

export type InferInput<T> = T extends StandardSchemaV1<unknown, unknown>
  ? StandardSchemaV1.InferInput<T>
  : unknown;

export type SchemaAdapter = (schema: StandardSchemaV1) => JsonSchema;
export type JsonSchema = unknown;

export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  return (
    value !== null &&
    typeof value === "object" &&
    "~standard" in value &&
    typeof (value as Record<string, unknown>)["~standard"] === "object" &&
    (value as { "~standard": { version: number } })["~standard"].version === 1
  );
}

export type Role = "user" | "assistant" | "system";

export interface Annotations {
  audience?: Role[];
  lastModified?: string;
  priority?: number;
}

export type TextResourceContents = {
  _meta?: { [key: string]: unknown };
  uri: string;
  type: "text";
  text: string;
  mimeType?: string;
};

export type BlobResourceContents = {
  _meta?: { [key: string]: unknown };
  uri: string;
  blob: string;
  mimeType?: string;
};

export type ResourceContents = TextResourceContents | BlobResourceContents;

interface MetaAnnotated {
  _meta?: { [key: string]: unknown };
  annotations?: Annotations;
}

interface TextContent extends MetaAnnotated {
  type: "text";
  text: string;
}

interface ImageContent extends MetaAnnotated {
  type: "image";
  data: string;
  mimeType: string;
}

interface AudioContent extends MetaAnnotated {
  type: "audio";
  data: string;
  mimeType: string;
}

interface ResourceLink extends MetaAnnotated {
  type: "resource";
  uri: string;
}

interface EmbeddedResource extends MetaAnnotated {
  type: "resource";
  resource: ResourceContents;
}

export type Content =
  | TextContent
  | ImageContent
  | AudioContent
  | ResourceLink
  | EmbeddedResource;

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
  contents: ResourceContents[];
  _meta?: { [key: string]: unknown };
}

export interface ListToolsResult {
  tools: Tool[];
}

export interface ListPromptsResult {
  prompts: Prompt[];
}

export interface ListResourcesResult {
  resources: Resource[];
  _meta?: { [key: string]: unknown };
}

export interface ListResourceTemplatesResult {
  resourceTemplates: ResourceTemplate[];
  _meta?: { [key: string]: unknown };
}

export interface ResourceTemplate {
  uriTemplate: string;
  name?: string;
  description?: string;
  mimeType?: string;
  _meta?: { [key: string]: unknown };
  annotations?: Annotations;
}

export type ResourceVars = Record<string, string>;

export interface ResourceMeta {
  name?: string;
  description?: string;
  mimeType?: string;
  _meta?: { [key: string]: unknown };
  annotations?: Annotations;
}

export type ResourceVarValidators = Record<string, unknown>;

export type ResourceHandler = (
  uri: URL,
  vars: ResourceVars,
  ctx: MCPServerContext,
) => Promise<ResourceReadResult>;
