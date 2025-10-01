import { z } from "zod";
import {
  InMemoryClientRequestAdapter,
  InMemorySessionAdapter,
  McpServer,
  StreamableHttpTransport,
} from "../src/index.js";

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
