import { z } from "zod";
import {
  InMemoryClientRequestAdapter,
  InMemorySessionAdapter,
  MCP_SESSION_ID_HEADER,
  McpServer,
  StreamableHttpTransport,
} from "../src/index.js";
import type { ClientCapabilities } from "../src/types.js";

type InitializeBuilderOptions = {
  capabilities: Partial<Record<ClientCapabilities, string | object>>;
  protocolVersion?: string;
};

export function buildInitializeRequest(options?: InitializeBuilderOptions) {
  const initializeRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      clientInfo: { name: "test-client", version: "1.0.0" },
      protocolVersion: options?.protocolVersion ?? "2025-06-18",
      capabilities: options?.capabilities,
    },
  };

  return new Request("http://localhost:3000/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(initializeRequest),
  });
}

export function buildRequest(
  body: unknown,
  sessionId: string,
  protocolVersion = "2025-06-18",
) {
  return new Request("http://localhost:3000/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [MCP_SESSION_ID_HEADER]: sessionId,
      "MCP-Protocol-Version": protocolVersion,
    },
    body: JSON.stringify(body),
  });
}

export function createStatefulTestServer() {
  const server = new McpServer({
    name: "stateful-test-server",
    version: "1.0.0",
    schemaAdapter: (s) => z.toJSONSchema(s as z.ZodType),
  });

  const clientRequestAdapter = new InMemoryClientRequestAdapter();
  const sessionAdapter = new InMemorySessionAdapter({
    maxEventBufferSize: 1024,
  });

  const transport = new StreamableHttpTransport({
    clientRequestAdapter,
    sessionAdapter,
  });

  const handler = transport.bind(server);

  return { server, handler };
}
