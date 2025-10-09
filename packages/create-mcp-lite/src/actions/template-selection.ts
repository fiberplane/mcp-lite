import { select } from "@clack/prompts";
import type { Context } from "../context";
import type { Template } from "../types";

export async function promptTemplate(context: Context) {
  const template = await select({
    message: "Which template?",
    options: [
      { value: "bun", label: "Bun (Basic MCP server)" },
      { value: "cloudflare", label: "Cloudflare Workers (MCP server)" },
      { value: "chatgpt-app-sdk", label: "ChatGPT App SDK (Hono + Vite + Interactive Widgets)" },
    ],
    initialValue: "bun",
  });

  if (typeof template === "string") {
    context.template = template as Template;
  }

  return template;
}
