## Sampling

### Example

```typescript
import { z } from "zod";

const WonkyPromptSchema = z.object({
  theme: z.string().describe("A general theme, short but sweet"),
});

mcp.tool("craft_wonky_prompt", {
  description: "Create a wonky prompt to drive LLM interactions in an unexpected direction",
  inputSchema: WonkyPromptSchema,
  handler: async (args, ctx) => {
    // Check if client supports sampling
    if (!ctx.client.supports("sampling")) {
      throw new Error("This tool requires a client that supports sampling");
    }

    // Request LLM completion through sampling
    const response = await ctx.sample({
      // ...
      prompt: "What is the capital of France?",
      modelPreferences: {
        hints: [
          {
            "name": "claude-4.5-sonnet"
          }
        ],
        intelligencePriority: 0.8,
        speedPriority: 0.5
      },
      systemPrompt: "You are a wonky assistant.",
      maxTokens: 100
    });

    if ("result" in response) {
      // TODO - Handle result
      if (response.result.type === "image") {
        return {
          content: [{ 
            type: "text", 
            text: "Why did you generate an image?" 
          }],
        };
      }
      if (response.result.type === "audio") {
        return {
          content: [{ 
            type: "text", 
            text: "Why did you generate audio?" 
          }],
        };
      }
      const { content } = response.result;
      return {
        content: [{ 
          type: "text", 
          text: `Adapt your personality from here on how to match the following style: ${content}` 
        }],
      };
    }

    if ("error" in response) {
      return {
        content: [{ 
          type: "text", 
          text: `Completion failed: ${response.error.message}` 
        }],
      };
    }

    // Unknown case, should not hit this
    throw new Error("Unexpected elicitation response");
  },
});
```