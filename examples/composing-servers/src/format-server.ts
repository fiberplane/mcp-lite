import { McpServer } from "mcp-lite";

// Format server
export const formatServer = new McpServer({ name: "format", version: "1.0.0" })
  .tool("json", {
    description: "Pretty-print JSON with indentation",
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "string" },
        indent: { type: "number" },
      },
      required: ["value"],
    },
    handler: (args: { value: string; indent?: number }) => {
      try {
        const parsed = JSON.parse(args.value);
        const formatted = JSON.stringify(parsed, null, args.indent || 2);
        return { content: [{ type: "text", text: formatted }] };
      } catch {
        throw new Error("Invalid JSON");
      }
    },
  })
  .tool("bytes", {
    description: "Format bytes to human-readable size",
    inputSchema: {
      type: "object",
      properties: {
        bytes: { type: "number" },
      },
      required: ["bytes"],
    },
    handler: (args: { bytes: number }) => {
      const units = ["B", "KB", "MB", "GB", "TB"];
      let size = args.bytes;
      let unitIndex = 0;

      while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
      }

      return {
        content: [
          { type: "text", text: `${size.toFixed(2)} ${units[unitIndex]}` },
        ],
      };
    },
  });
