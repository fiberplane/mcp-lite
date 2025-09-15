/**
 * Optional in-process server harness for testing
 */

import {
  InMemoryEventStore,
  McpServer,
  StreamableHttpTransport,
} from "mcp-lite";
import type { TestServer } from "./index.js";

export interface TestHarnessOptions {
  /** Fixed session ID generator for deterministic testing */
  sessionId?: string;
  /** Event store instance */
  eventStore?: InMemoryEventStore;
  /** Port for server (defaults to 0 for random) */
  port?: number;
}

/**
 * Create an in-process test harness with a real HTTP server and transport
 */
export async function createTestHarness(
  server: McpServer,
  options: TestHarnessOptions = {},
): Promise<TestServer> {
  const { sessionId, eventStore, port = 0 } = options;

  const transportOptions: ConstructorParameters<
    typeof StreamableHttpTransport
  >[0] = {};

  if (sessionId !== undefined) {
    // Session-based transport
    transportOptions.generateSessionId = () => sessionId;
    transportOptions.eventStore = eventStore || new InMemoryEventStore();
  } else if (eventStore !== undefined) {
    // Session-based with random IDs
    transportOptions.generateSessionId = () => crypto.randomUUID();
    transportOptions.eventStore = eventStore;
  }
  // If neither sessionId nor eventStore are provided, create stateless transport

  const transport = new StreamableHttpTransport(transportOptions);

  const handler = transport.bind(server);

  // Create Bun server
  const bunServer = Bun.serve({
    port,
    fetch: handler,
  });

  const url = `http://localhost:${bunServer.port}`;

  return {
    url,
    stop: async () => {
      bunServer.stop();
    },
  };
}
