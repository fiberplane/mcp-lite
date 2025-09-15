import { beforeEach, describe, expect, it } from "bun:test";
import type { AuthInfo } from "../../src/auth.js";
import { McpServer, StreamableHttpTransport } from "../../src/index.js";
import type { MCPServerContext } from "../../src/types.js";

// Type for JSON-RPC response
interface JsonRpcResponse {
  jsonrpc: string;
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// Reusable initialize request payload
const INIT_REQUEST_BODY = {
  jsonrpc: "2.0",
  id: "init",
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    clientInfo: { name: "test-client", version: "1.0.0" },
  },
} as const;

// Utility function to create initialize request
function createInitializationRequest(): Request {
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2025-06-18",
    },
    body: JSON.stringify(INIT_REQUEST_BODY),
  });
}

describe("AuthInfo Integration", () => {
  let server: McpServer;
  let transport: StreamableHttpTransport;

  const mockAuthInfo: AuthInfo = {
    token: "test-token-123",
    scopes: ["read", "write"],
    expiresAt: Date.now() / 1000 + 3600, // 1 hour from now
    extra: { userId: "user-123", provider: "test" },
  };

  beforeEach(() => {
    server = new McpServer({
      name: "test-server",
      version: "1.0.0",
    });
    transport = new StreamableHttpTransport();
  });

  describe("Tool handler authInfo access", () => {
    it("should pass authInfo to tool handlers when provided", async () => {
      let capturedAuthInfo: AuthInfo | undefined;
      let capturedContext: MCPServerContext | undefined;

      server.tool("auth-test", {
        description: "Test tool that captures authInfo",
        handler: (_args, ctx) => {
          capturedAuthInfo = ctx.authInfo;
          capturedContext = ctx;
          return {
            content: [{ type: "text", text: "auth-test-response" }],
          };
        },
      });

      const handler = transport.bind(server);

      // Initialize the server first
      const initRequest = createInitializationRequest();

      await handler(initRequest, { authInfo: mockAuthInfo });

      // Call the tool with authInfo
      const toolRequest = new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "tool-call",
          method: "tools/call",
          params: {
            name: "auth-test",
            arguments: {},
          },
        }),
      });

      const response = await handler(toolRequest, { authInfo: mockAuthInfo });
      expect(response.ok).toBe(true);

      const result = (await response.json()) as JsonRpcResponse;
      expect(result.error).toBeUndefined();
      expect(result.result).toEqual({
        content: [{ type: "text", text: "auth-test-response" }],
      });

      // Verify authInfo was passed correctly
      expect(capturedAuthInfo).toEqual(mockAuthInfo);
      expect(capturedContext?.authInfo).toEqual(mockAuthInfo);
    });

    it("should work normally when authInfo is not provided", async () => {
      let capturedAuthInfo: AuthInfo | undefined;

      server.tool("no-auth-test", {
        description: "Test tool without authInfo",
        handler: (_args, ctx) => {
          capturedAuthInfo = ctx.authInfo;
          return {
            content: [{ type: "text", text: "no-auth-response" }],
          };
        },
      });

      const handler = transport.bind(server);

      // Initialize without authInfo
      const initRequest = createInitializationRequest();

      await handler(initRequest);

      // Call tool without authInfo
      const toolRequest = new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "tool-call",
          method: "tools/call",
          params: {
            name: "no-auth-test",
            arguments: {},
          },
        }),
      });

      const response = await handler(toolRequest);
      expect(response.ok).toBe(true);

      const result = (await response.json()) as JsonRpcResponse;
      expect(result.error).toBeUndefined();
      expect(result.result).toEqual({
        content: [{ type: "text", text: "no-auth-response" }],
      });

      // Verify authInfo is undefined when not provided
      expect(capturedAuthInfo).toBeUndefined();
    });
  });

  describe("Middleware authInfo access", () => {
    it("should pass authInfo to middleware when provided", async () => {
      const middlewareLog: Array<{
        phase: string;
        authInfo?: AuthInfo;
        hasAuthInfo: boolean;
      }> = [];

      // Add middleware that captures authInfo
      server.use(async (ctx, next) => {
        middlewareLog.push({
          phase: "before",
          authInfo: ctx.authInfo,
          hasAuthInfo: !!ctx.authInfo,
        });

        await next();

        middlewareLog.push({
          phase: "after",
          authInfo: ctx.authInfo,
          hasAuthInfo: !!ctx.authInfo,
        });
      });

      server.tool("middleware-test", {
        description: "Test tool for middleware authInfo",
        handler: () => ({
          content: [{ type: "text", text: "middleware-test-response" }],
        }),
      });

      const handler = transport.bind(server);

      // Initialize with authInfo
      const initRequest = createInitializationRequest();

      await handler(initRequest, { authInfo: mockAuthInfo });

      // Clear log after initialization
      middlewareLog.length = 0;

      // Call tool with authInfo
      const toolRequest = new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "tool-call",
          method: "tools/call",
          params: {
            name: "middleware-test",
            arguments: {},
          },
        }),
      });

      const response = await handler(toolRequest, { authInfo: mockAuthInfo });
      expect(response.ok).toBe(true);

      // Verify middleware received authInfo
      expect(middlewareLog).toHaveLength(2);
      expect(middlewareLog[0]).toEqual({
        phase: "before",
        authInfo: mockAuthInfo,
        hasAuthInfo: true,
      });
      expect(middlewareLog[1]).toEqual({
        phase: "after",
        authInfo: mockAuthInfo,
        hasAuthInfo: true,
      });
    });

    it("should work in middleware when authInfo is not provided", async () => {
      const middlewareLog: Array<{
        phase: string;
        authInfo?: AuthInfo;
        hasAuthInfo: boolean;
      }> = [];

      server.use(async (ctx, next) => {
        middlewareLog.push({
          phase: "before",
          authInfo: ctx.authInfo,
          hasAuthInfo: !!ctx.authInfo,
        });

        await next();

        middlewareLog.push({
          phase: "after",
          authInfo: ctx.authInfo,
          hasAuthInfo: !!ctx.authInfo,
        });
      });

      server.tool("no-middleware-auth-test", {
        description: "Test tool for middleware without authInfo",
        handler: () => ({
          content: [{ type: "text", text: "no-middleware-auth-response" }],
        }),
      });

      const handler = transport.bind(server);

      // Initialize without authInfo
      const initRequest = createInitializationRequest();

      await handler(initRequest);

      // Clear log after initialization
      middlewareLog.length = 0;

      // Call tool without authInfo
      const toolRequest = new Request("http://localhost/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": "2025-06-18",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "tool-call",
          method: "tools/call",
          params: {
            name: "no-middleware-auth-test",
            arguments: {},
          },
        }),
      });

      const response = await handler(toolRequest);
      expect(response.ok).toBe(true);

      // Verify middleware received no authInfo
      expect(middlewareLog).toHaveLength(2);
      expect(middlewareLog[0]).toEqual({
        phase: "before",
        authInfo: undefined,
        hasAuthInfo: false,
      });
      expect(middlewareLog[1]).toEqual({
        phase: "after",
        authInfo: undefined,
        hasAuthInfo: false,
      });
    });
  });

  describe("Direct server dispatch with authInfo", () => {
    it("should pass authInfo through _dispatch method", async () => {
      let capturedAuthInfo: AuthInfo | undefined;

      server.tool("direct-auth-test", {
        description: "Test tool for direct dispatch with authInfo",
        handler: (_args, ctx) => {
          capturedAuthInfo = ctx.authInfo;
          return {
            content: [{ type: "text", text: "direct-auth-response" }],
          };
        },
      });

      // Use _dispatch directly with authInfo
      const result = await server._dispatch(
        {
          jsonrpc: "2.0",
          id: "direct-call",
          method: "tools/call",
          params: {
            name: "direct-auth-test",
            arguments: {},
          },
        },
        { authInfo: mockAuthInfo },
      );

      expect(result?.error).toBeUndefined();
      expect(result?.result).toEqual({
        content: [{ type: "text", text: "direct-auth-response" }],
      });

      // Verify authInfo was passed correctly
      expect(capturedAuthInfo).toEqual(mockAuthInfo);
    });

    it("should work with _dispatch when authInfo is not provided", async () => {
      let capturedAuthInfo: AuthInfo | undefined;

      server.tool("direct-no-auth-test", {
        description: "Test tool for direct dispatch without authInfo",
        handler: (_args, ctx) => {
          capturedAuthInfo = ctx.authInfo;
          return {
            content: [{ type: "text", text: "direct-no-auth-response" }],
          };
        },
      });

      // Use _dispatch without authInfo
      const result = await server._dispatch({
        jsonrpc: "2.0",
        id: "direct-call",
        method: "tools/call",
        params: {
          name: "direct-no-auth-test",
          arguments: {},
        },
      });

      expect(result?.error).toBeUndefined();
      expect(result?.result).toEqual({
        content: [{ type: "text", text: "direct-no-auth-response" }],
      });

      // Verify authInfo is undefined
      expect(capturedAuthInfo).toBeUndefined();
    });
  });

  describe("AuthInfo data integrity", () => {
    it("should preserve all authInfo fields correctly", async () => {
      let capturedAuthInfo: AuthInfo | undefined;

      const complexAuthInfo: AuthInfo = {
        token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test",
        scopes: ["read:user", "write:repo", "admin:org"],
        expiresAt: 1234567890,
        extra: {
          userId: "user-456",
          provider: "oauth2",
          refreshToken: "refresh-123",
          metadata: {
            roles: ["admin", "user"],
            permissions: { canRead: true, canWrite: true },
          },
        },
      };

      server.tool("complex-auth-test", {
        description: "Test tool for complex authInfo",
        handler: (_args, ctx) => {
          capturedAuthInfo = ctx.authInfo;
          return {
            content: [{ type: "text", text: "complex-auth-response" }],
          };
        },
      });

      const result = await server._dispatch(
        {
          jsonrpc: "2.0",
          id: "complex-call",
          method: "tools/call",
          params: {
            name: "complex-auth-test",
            arguments: {},
          },
        },
        { authInfo: complexAuthInfo },
      );

      expect(result?.error).toBeUndefined();

      // Verify all fields are preserved correctly
      expect(capturedAuthInfo).toEqual(complexAuthInfo);
      expect(capturedAuthInfo?.token).toBe(complexAuthInfo.token);
      expect(capturedAuthInfo?.scopes).toEqual(complexAuthInfo.scopes);
      // @ts-expect-error - expiresAt is optional
      expect(capturedAuthInfo?.expiresAt).toBe(complexAuthInfo.expiresAt);
      // @ts-expect-error - extra is optional
      expect(capturedAuthInfo?.extra).toEqual(complexAuthInfo.extra);
    });
  });

  describe("Context authInfo consistency", () => {
    it("should maintain authInfo consistency across request lifecycle", async () => {
      const capturedAuthInfos: AuthInfo[] = [];

      // Middleware that captures authInfo at different phases
      server.use(async (ctx, next) => {
        if (ctx.authInfo) {
          capturedAuthInfos.push({ ...ctx.authInfo });
        }
        await next();
        if (ctx.authInfo) {
          capturedAuthInfos.push({ ...ctx.authInfo });
        }
      });

      server.tool("consistency-test", {
        description: "Test authInfo consistency",
        handler: (_args, ctx) => {
          if (ctx.authInfo) {
            capturedAuthInfos.push({ ...ctx.authInfo });
          }
          return {
            content: [{ type: "text", text: "consistency-response" }],
          };
        },
      });

      await server._dispatch(
        {
          jsonrpc: "2.0",
          id: "consistency-call",
          method: "tools/call",
          params: {
            name: "consistency-test",
            arguments: {},
          },
        },
        { authInfo: mockAuthInfo },
      );

      // Should have captured authInfo three times (middleware before, handler, middleware after)
      expect(capturedAuthInfos).toHaveLength(3);

      // All should be identical
      capturedAuthInfos.forEach((authInfo) => {
        expect(authInfo).toEqual(mockAuthInfo);
      });
    });
  });
});
