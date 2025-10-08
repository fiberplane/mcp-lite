import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { McpServer } from "mcp-lite";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_VOICE_NAME = "Rachel";

let elevenLabsClient: ElevenLabsClient | null = null;

function getElevenLabsClient() {
  if (elevenLabsClient) {
    return elevenLabsClient;
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error(
      "ELEVENLABS_API_KEY environment variable is required. Please set it to use this tool.",
    );
  }

  elevenLabsClient = new ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY,
  });
  return elevenLabsClient;
}

const TextToSpeechSchema = z.object({
  text: z.string().describe("The text to convert to speech"),
  outputFilename: z
    .string()
    .optional()
    .describe(
      "Optional filename for the output audio file (without extension)",
    ),
});

const VoicePreferenceSchema = z.object({
  chooseVoice: z
    .boolean()
    .describe(
      "Set to true if you'd like to pick a specific ElevenLabs voice for the narration.",
    ),
});

const VoiceSelectionSchema = z.object({
  voiceId: z
    .string()
    .min(1)
    .describe("Provide the ElevenLabs voice ID you want to use from the list."),
});

export const mcp = new McpServer({
  name: "text-to-speech-server",
  version: "1.0.0",
  schemaAdapter: (schema) => z.toJSONSchema(schema as z.ZodType),
});

mcp.tool("text_to_speech", {
  description:
    "Converts text to speech using ElevenLabs AI voices. Lets you optionally pick a specific voice. Returns both base64-encoded audio and a file path.",
  inputSchema: TextToSpeechSchema,
  handler: async (args, ctx) => {
    try {
      const elevenlabs = getElevenLabsClient();

      let selectedVoiceId = DEFAULT_VOICE_ID;
      let selectedVoiceName: string | undefined = DEFAULT_VOICE_NAME;

      if (ctx.client.supports("elicitation")) {
        const preferenceResponse = await ctx.elicit({
          message: `The default voice is ${DEFAULT_VOICE_NAME}. Would you like to pick a different ElevenLabs voice?`,
          schema: VoicePreferenceSchema,
        });

        if (preferenceResponse.action === "cancel") {
          return {
            content: [
              {
                type: "text",
                text: "Operation cancelled by user.",
              },
            ],
          };
        }

        const wantsCustomVoice =
          preferenceResponse.action === "accept" &&
          preferenceResponse.content?.chooseVoice === true;

        if (wantsCustomVoice) {
          let availableVoices: Array<{
            name?: string;
            voiceId: string;
            previewUrl?: string;
          }> = [];

          try {
            const voicesResponse = await elevenlabs.voices.getAll();
            availableVoices = voicesResponse.voices ?? [];
          } catch (voiceError) {
            const message =
              voiceError instanceof Error
                ? voiceError.message
                : String(voiceError);
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to load voices from ElevenLabs: ${message}`,
                },
              ],
              isError: true,
            };
          }

          if (availableVoices.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: "No voices are currently available from ElevenLabs. Please try again later.",
                },
              ],
              isError: true,
            };
          }

          const voiceOptions = availableVoices
            .map((voice, index) => {
              const displayName = voice.name ?? voice.voiceId;
              const preview = voice.previewUrl
                ? ` - Preview: ${voice.previewUrl}`
                : "";
              return `${index + 1}. ${displayName} (ID: ${voice.voiceId})${preview}`;
            })
            .join("\n");

          const selectionResponse = await ctx.elicit({
            message: `Here are the available ElevenLabs voices:\n${voiceOptions}\n\nPlease reply with the voice ID you'd like to use.`,
            schema: VoiceSelectionSchema,
          });

          if (selectionResponse.action === "cancel") {
            return {
              content: [
                {
                  type: "text",
                  text: "Operation cancelled by user.",
                },
              ],
            };
          }

          if (
            selectionResponse.action === "accept" &&
            selectionResponse.content?.voiceId
          ) {
            const chosenVoice = availableVoices.find(
              (voice) => voice.voiceId === selectionResponse.content?.voiceId,
            );

            if (!chosenVoice) {
              return {
                content: [
                  {
                    type: "text",
                    text: "The specified voice ID was not found in the available options.",
                  },
                ],
                isError: true,
              };
            }

            selectedVoiceId = chosenVoice.voiceId;
            selectedVoiceName = chosenVoice.name ?? chosenVoice.voiceId;
          }
        }
      }

      const audioStream = await elevenlabs.textToSpeech.convert(
        selectedVoiceId,
        {
          text: args.text,
          modelId: "eleven_multilingual_v2",
          outputFormat: "mp3_44100_128",
        },
      );

      const chunks: Uint8Array[] = [];
      for await (const chunk of audioStream) {
        chunks.push(chunk);
      }

      const audioBuffer = Buffer.concat(chunks);
      const base64Audio = audioBuffer.toString("base64");

      const outputDir = join(process.cwd(), "output");
      await mkdir(outputDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = args.outputFilename
        ? `${args.outputFilename}.mp3`
        : `speech-${timestamp}.mp3`;
      const filePath = join(outputDir, filename);

      await writeFile(filePath, audioBuffer);

      const voiceDescription = selectedVoiceName
        ? `${selectedVoiceName} (${selectedVoiceId})`
        : selectedVoiceId;

      return {
        content: [
          {
            type: "text",
            text: `Successfully converted text to speech using voice ${voiceDescription}!\n\nFile saved to: ${filePath}\n\nAudio length: ${audioBuffer.length} bytes`,
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
