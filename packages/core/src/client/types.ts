import type { JsonRpcReq, JsonRpcRes } from "../types.js";

/**
 * Connection information provided to handlers for context about the connected server
 */
export interface ClientConnectionInfo {
  serverInfo: { name: string; version: string };
  protocolVersion: string;
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
  connection?: ClientConnectionInfo,
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
  connection?: ClientConnectionInfo,
) => Promise<ElicitationResult> | ElicitationResult;
