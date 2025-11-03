import type { Tool, ToolCallResult } from "../../types.js";

/**
 * Adapter interface for converting MCP tools to SDK-specific tool formats.
 *
 * This allows MCP clients to easily integrate with various AI SDKs (Vercel AI SDK,
 * Anthropic SDK, etc.) by providing adapters that convert MCP tool formats.
 *
 * @template TSDKTool - The SDK-specific tool type
 *
 * @example Vercel AI SDK adapter
 * ```typescript
 * const vercelAdapter: ToolAdapter<CoreTool> = {
 *   toSDK: (mcpTool) => ({
 *     type: "function",
 *     function: {
 *       name: mcpTool.name,
 *       description: mcpTool.description,
 *       parameters: mcpTool.inputSchema
 *     }
 *   }),
 *   resultToSDK: (mcpResult) => ({
 *     toolCallId: "...",
 *     toolName: "...",
 *     result: mcpResult.content[0].text
 *   })
 * };
 * ```
 */
export interface ToolAdapter<TSDKTool = unknown> {
  /**
   * Convert an MCP tool definition to SDK-specific format
   *
   * @param mcpTool - MCP tool metadata
   * @returns SDK-specific tool definition
   */
  toSDK(mcpTool: Tool): TSDKTool;

  /**
   * Convert an MCP tool call result to SDK-specific format
   *
   * @param mcpResult - MCP tool call result
   * @returns SDK-specific result format
   */
  resultToSDK(mcpResult: ToolCallResult): unknown;
}
