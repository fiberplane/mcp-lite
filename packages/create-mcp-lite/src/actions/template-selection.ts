import { select } from "@clack/prompts";
import type { Context } from "../context";
import type { Template } from "../types";

export async function promptTemplate(context: Context) {
  const template = await select({
    message: "Which runtime?",
    options: [
      { value: "bun", label: "Bun" },
      { value: "cloudflare", label: "Cloudflare Workers" },
    ],
    initialValue: "bun",
  });

  if (typeof template === "string") {
    context.template = template as Template;
  }

  return template;
}
