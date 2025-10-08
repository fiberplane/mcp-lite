import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Serve } from "bun";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { Hono } from "hono";
import {
  InMemoryClientRequestAdapter,
  InMemorySessionAdapter,
  McpServer,
  StreamableHttpTransport,
} from "mcp-lite";
import { z } from "zod";

// Default voice ID (Rachel - a pleasant female voice)
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

// Lazy initialization of ElevenLabs client
let elevenLabsClient: ElevenLabsClient | null = null;

function getElevenLabsClient(): ElevenLabsClient {
  if (!elevenLabsClient) {
    if (!process.env.ELEVENLABS_API_KEY) {
      throw new Error(
        "ELEVENLABS_API_KEY environment variable is required. Please set it to use this tool.",
      );
    }
    elevenLabsClient = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY,
    });
  }
  return elevenLabsClient;
}

// Create MCP server with Zod schema adapter
const mcp = new McpServer({
  name: "text-to-podcast-server",
  version: "1.0.0",
  schemaAdapter: (schema) => z.toJSONSchema(schema as z.ZodType),
});

// Define the input schema using Zod
const TextToSpeechSchema = z.object({
  text: z.string().describe("The text to convert to speech"),
  outputFilename: z
    .string()
    .optional()
    .describe(
      "Optional filename for the output audio file (without extension)",
    ),
});

// Schema for elicitation response
const FormatElicitationSchema = z.object({
  isPodcastFormat: z
    .boolean()
    .describe(
      "true for podcast format (dialogue), false for simple text-to-speech",
    ),
});

// Add text-to-speech tool
mcp.tool("text_to_speech", {
  description:
    "Converts text to speech using ElevenLabs AI voices. Supports both simple text-to-speech and podcast dialogue format. Returns both base64-encoded audio and a file path.",
  inputSchema: TextToSpeechSchema,
  handler: async (args, ctx) => {
    // args is automatically typed from the Zod schema
    try {
      let isPodcastFormat = false;

      // Check if client supports elicitation
      if (ctx.client.supports("elicitation")) {
        // Always ask the user which format they want
        const elicitResponse = await ctx.elicit({
          message:
            "Would you like a podcast format (dialogue with multiple voices) or simple text-to-speech output?",
          schema: FormatElicitationSchema,
        });

        // Handle cancellation
        if (elicitResponse.action === "cancel") {
          return {
            content: [
              {
                type: "text",
                text: "Operation cancelled by user.",
              },
            ],
          };
        }

        // Handle decline
        if (elicitResponse.action === "decline") {
          return {
            content: [
              {
                type: "text",
                text: "User declined to choose a format. Operation cancelled.",
              },
            ],
          };
        }

        // Get the user's choice
        isPodcastFormat =
          elicitResponse.action === "accept" &&
          elicitResponse.content?.isPodcastFormat === true;
      }
      // If elicitation is not supported, default to simple text-to-speech

      // Get ElevenLabs client (lazy initialization)
      const elevenlabs = getElevenLabsClient();

      let audioStream: ReadableStream<Uint8Array>;
      let formatDescription: string;

      if (isPodcastFormat) {
        // Use podcast/dialogue format with multiple voices
        // Split text into dialogue parts (simple implementation)
        // In a real implementation, you might want to parse the text more intelligently
        const dialogueParts = args.text
          .split("\n")
          .filter((line) => line.trim().length > 0)
          .map((line, index) => ({
            text: line,
            // Alternate between two voices for dialogue effect
            voiceId:
              index % 2 === 0 ? DEFAULT_VOICE_ID : "pNInz6obpgDQGcFmaJgB", // Second voice (Adam)
          }));

        if (dialogueParts.length === 0) {
          throw new Error("No dialogue parts found in the input text");
        }

        audioStream = await elevenlabs.textToDialogue.convert({
          inputs: dialogueParts,
        });
        formatDescription = "podcast dialogue format";
      } else {
        // Use simple text-to-speech
        audioStream = await elevenlabs.textToSpeech.convert(DEFAULT_VOICE_ID, {
          text: args.text,
          modelId: "eleven_multilingual_v2",
          outputFormat: "mp3_44100_128",
        });
        formatDescription = "text-to-speech";
      }

      // Collect the audio data
      const chunks: Uint8Array[] = [];
      for await (const chunk of audioStream) {
        chunks.push(chunk);
      }

      // Combine chunks into a single buffer
      const audioBuffer = Buffer.concat(chunks);

      // Convert to base64
      const base64Audio = audioBuffer.toString("base64");

      // Create output directory if it doesn't exist
      const outputDir = join(process.cwd(), "output");
      await mkdir(outputDir, { recursive: true });

      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = args.outputFilename
        ? `${args.outputFilename}.mp3`
        : `speech-${timestamp}.mp3`;
      const filePath = join(outputDir, filename);

      // Save to file
      await writeFile(filePath, audioBuffer);

      return {
        content: [
          {
            type: "text",
            text: `Successfully converted text to ${formatDescription}!\n\nFile saved to: ${filePath}\n\nAudio length: ${audioBuffer.length} bytes`,
          },
          {
            type: "audio",
            data: base64Audio,
            mimeType: "audio/mpeg",
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error converting text to speech: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  },
});

// Create HTTP transport with session and client request adapters for elicitation support
const transport = new StreamableHttpTransport({
  sessionAdapter: new InMemorySessionAdapter({
    maxEventBufferSize: 1024,
  }),
  clientRequestAdapter: new InMemoryClientRequestAdapter({
    defaultTimeoutMs: 30000,
  }),
});
const httpHandler = transport.bind(mcp);

// Create Hono app
const app = new Hono();

// Add MCP endpoint
app.all("/mcp", async (c) => {
  const response = await httpHandler(c.req.raw);
  return response;
});

// Root endpoint
app.get("/", (c) => {
  return c.text("Text-to-Podcast MCP Server - MCP endpoint available at /mcp");
});

export default {
  fetch: app.fetch,
  idleTimeout: 30,
} satisfies Serve;
