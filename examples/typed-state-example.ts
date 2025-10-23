/**
 * Example demonstrating typed state in mcp-lite
 * 
 * This example shows how to use the new generic state typing feature
 * to get type-safe access to your custom state in handlers and middleware.
 */

import { McpServer } from "../packages/core/src/index.js";

// Define your custom state interface
interface MyAppState {
  userId?: string;
  startTime: number;
  requestCount: number;
  rateLimited: boolean;
}

// Create a server with typed state
const server = new McpServer<{ State: MyAppState }>({
  name: "typed-state-example",
  version: "1.0.0",
});

// Middleware with typed state access
server.use(async (ctx, next) => {
  const startTime = Date.now();
  
  // All these properties are typed!
  ctx.state.startTime = startTime;
  ctx.state.requestCount = (ctx.state.requestCount || 0) + 1;
  ctx.state.rateLimited = false;
  
  // TypeScript will error if you try to assign wrong types:
  // ctx.state.startTime = "not a number"; // ❌ Type error!
  
  await next();
  
  const duration = Date.now() - ctx.state.startTime;
  console.log(`Request completed in ${duration}ms`);
});

// Authentication middleware
server.use(async (ctx, next) => {
  // Type-safe state access
  ctx.state.userId = "user-123"; // ✅ Typed as string | undefined
  
  await next();
});

// Tool with typed state access
server.tool("getUserInfo", {
  description: "Get information about the current user",
  handler: (_, ctx) => {
    // All state properties are typed and autocompleted!
    return {
      content: [{
        type: "text",
        text: `User: ${ctx.state.userId}, Request #${ctx.state.requestCount}`
      }]
    };
  }
});

// For comparison: server without custom state uses default Record<string, unknown>
const defaultServer = new McpServer({
  name: "default-state-server",
  version: "1.0.0",
});

defaultServer.use(async (ctx, next) => {
  // With default typing, any property is allowed but not type-checked
  ctx.state.foo = "bar";
  ctx.state.anything = 123;
  await next();
});

console.log("✅ Typed state example - types are enforced at compile time!");

