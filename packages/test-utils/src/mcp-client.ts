/**
 * MCP client with session management for testing
 */

import type { JsonRpcResponse } from "./index.js";

export interface McpClientOptions {
  baseUrl: string;
  sessionId?: string;
}

export interface McpSession {
  sessionId: string;
  baseUrl: string;
}

/**
 * Open a session GET SSE stream for receiving notifications
 */
export async function openSessionStream(
  baseUrl: string,
  sessionId: string,
  lastEventId?: string,
): Promise<ReadableStream<Uint8Array>> {
  const headers: Record<string, string> = {
    Accept: "text/event-stream",
    "MCP-Protocol-Version": "2025-06-18",
    "MCP-Session-Id": sessionId,
  };

  if (lastEventId) {
    headers["Last-Event-ID"] = lastEventId;
  }

  const response = await fetch(baseUrl, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    throw new Error(
      `Failed to open session stream: ${response.status} ${response.statusText}`,
    );
  }

  if (!response.body) {
    throw new Error("No response body for SSE stream");
  }

  return response.body;
}

/**
 * Open a POST SSE request stream for receiving progress and result
 */
export async function openRequestStream(
  baseUrl: string,
  method: string,
  params: unknown,
  id: string | number,
  sessionId?: string,
): Promise<ReadableStream<Uint8Array>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    "MCP-Protocol-Version": "2025-06-18",
  };

  if (sessionId) {
    headers["MCP-Session-Id"] = sessionId;
  }

  const response = await fetch(baseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to open request stream: ${response.status} ${response.statusText}`,
    );
  }

  if (!response.body) {
    throw new Error("No response body for SSE request stream");
  }

  return response.body;
}

/**
 * Create an MCP client with session management
 */
export function createMcpClient(options: McpClientOptions) {
  const { baseUrl, sessionId } = options;

  return {
    async request(
      method: string,
      params?: unknown,
      id: string | number = Math.random().toString(36).substring(7),
    ): Promise<JsonRpcResponse> {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-06-18",
      };

      if (sessionId) {
        headers["MCP-Session-Id"] = sessionId;
      }

      const response = await fetch(baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          method,
          params,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = (await response.json()) as JsonRpcResponse;

      if (result.error) {
        const error = new Error(
          `JSON-RPC Error ${result.error.code}: ${result.error.message}`,
        ) as Error & {
          code: number;
          data?: unknown;
        };
        error.code = result.error.code;
        error.data = result.error.data;
        throw error;
      }

      return result;
    },

    async openSessionStream(
      lastEventId?: string,
    ): Promise<ReadableStream<Uint8Array>> {
      if (!sessionId) {
        throw new Error("Cannot open session stream without session ID");
      }
      return openSessionStream(baseUrl, sessionId, lastEventId);
    },

    async openRequestStream(
      method: string,
      params: unknown,
      id: string | number,
    ): Promise<ReadableStream<Uint8Array>> {
      return openRequestStream(baseUrl, method, params, id, sessionId);
    },
  };
}

/**
 * Initialize a session and return the session ID
 */
export async function initializeSession(
  baseUrl: string,
  clientInfo: { name: string; version: string },
): Promise<string> {
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2025-06-18",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "init",
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        clientInfo,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to initialize: ${response.status} ${response.statusText}`,
    );
  }

  const sessionId = response.headers.get("MCP-Session-Id");
  if (!sessionId) {
    throw new Error("No session ID returned from initialize");
  }

  const result = (await response.json()) as JsonRpcResponse;
  if (result.error) {
    throw new Error(`Initialize error: ${result.error.message}`);
  }

  return sessionId;
}

/**
 * Close a session
 */
export async function closeSession(
  baseUrl: string,
  sessionId: string,
): Promise<void> {
  const response = await fetch(baseUrl, {
    method: "DELETE",
    headers: {
      "MCP-Session-Id": sessionId,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to close session: ${response.status} ${response.statusText}`,
    );
  }
}
