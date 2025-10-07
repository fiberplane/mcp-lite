import { select } from "@clack/prompts";
import type { Context } from "../context";
import type { Template } from "../types";

export async function promptTemplate(context: Context) {
  const template = await select({
    message: "Which runtime?",
    options: [
      { value: "bun", label: "Bun (for local development)" },
      {
        value: "cloudflare",
        label: "Cloudflare Workers (for edge deployment)",
      },
    ],
    initialValue: "bun",
  });

  if (typeof template === "string") {
    context.template = template as Template;
  }

  return template;
}
