import type { JsonRpcReq, JsonRpcRes } from "../types.js";

/**
 * Client context passed through middleware chain for server-initiated requests.
 * This mirrors MCPServerContext but for client-side handling.
 */
export interface MCPClientContext {
  request: JsonRpcReq;
  requestId: string | number;
  response: JsonRpcRes | null;
  env: Record<string, unknown>;
  state: Record<string, unknown>;
  connection?: {
    serverInfo: { name: string; version: string };
    protocolVersion: string;
  };
}

/**
 * Client middleware function signature.
 * Middleware runs when the server sends requests to the client (e.g., sampling, elicitation).
 */
export type ClientMiddleware = (
  ctx: MCPClientContext,
  next: () => Promise<void>,
) => Promise<void> | void;

/**
 * Options for creating a client context
 */
export interface CreateClientContextOptions {
  connection?: {
    serverInfo: { name: string; version: string };
    protocolVersion: string;
  };
}

/**
 * Sampling request parameters sent from server to client
 */
export interface SamplingParams {
  messages: unknown[];
  modelPreferences?: {
    hints?: Array<{ name?: string }>;
    costPriority?: number;
    speedPriority?: number;
    intelligencePriority?: number;
  };
  systemPrompt?: string;
  includeContext?: "none" | "thisServer" | "allServers";
  maxTokens: number;
  temperature?: number;
  stopSequences?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Sampling result returned from client to server
 */
export interface SamplingResult {
  role: "assistant";
  content: {
    type: "text";
    text: string;
  };
  model: string;
  stopReason?: "endTurn" | "stopSequence" | "maxTokens" | string;
}

/**
 * Handler function for sampling requests from server
 */
export type SampleHandler = (
  params: SamplingParams,
  ctx: MCPClientContext,
) => Promise<SamplingResult> | SamplingResult;

/**
 * Elicitation request parameters sent from server to client
 */
export interface ElicitationParams {
  message: string;
  requestedSchema: unknown; // JSON Schema
}

/**
 * Elicitation result returned from client to server
 */
export interface ElicitationResult {
  action: "accept" | "decline" | "cancel";
  content?: Record<string, unknown>; // Present on "accept"
}

/**
 * Handler function for elicitation requests from server
 */
export type ElicitHandler = (
  params: ElicitationParams,
  ctx: MCPClientContext,
) => Promise<ElicitationResult> | ElicitationResult;
