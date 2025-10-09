# Text-to-Speech MCP Server

A simple MCP server that converts text to speech using ElevenLabs AI voices.

## Features

- Converts text to natural-sounding speech using ElevenLabs' multilingual AI voices
- Interactive voice selection via MCP elicitation with easy numbered choices (default: Rachel voice)
- Returns audio as proper MCP `audio` content type with MIME type `audio/mpeg`
- Saves audio to a local file for easy access
- Supports custom filenames for output audio files
- Server-side input validation using Zod for type safety and automatic error handling

## Prerequisites

You need an ElevenLabs API key. Get one at [https://elevenlabs.io](https://elevenlabs.io).

## Setup

```bash
# Install dependencies
bun install

# Configure environment
cp .env.example .env
# then edit .env and set ELEVENLABS_API_KEY

# Start the server
bun start
```

The MCP server runs on `http://localhost:3000/mcp`, and you can inspect it at that endpoint with the MCP inspector:

```bash
bunx @modelcontextprotocol/inspector
```

## Usage

The server provides a `text_to_speech` tool that accepts:

- `text` (required): The text to convert to speech
- `outputFilename` (optional): Custom filename for the output audio file (without extension)

### Flow with MCP Inspector

1. Start the inspector and connect to the server:

   ```bash
   bunx @modelcontextprotocol/inspector
   ```

2. Invoke the `text_to_speech` tool with your desired text (and optional output filename). For example:

   ```json
   {
     "text": "Hello! Welcome to this AI-powered narration demo.",
     "outputFilename": "welcome-message"
   }
   ```

3. If elicitation is supported, the inspector will first ask:

   > The default voice is Rachel. Would you like to pick a different ElevenLabs voice?

   - Reply `false` (or cancel the dialog) to stick with the default Rachel voice.
   - Reply `true` to see the available voices. The tool will fetch the voice list and display it with numbered options.

4. If you chose to select a different voice, you'll see a numbered list like:

   ```
   1. Rachel (ID: 21m00Tcm4TlvDq8ikWAM) - Preview: https://...
   2. Drew (ID: 29vD33N1CtxCmqQRPOHJ) - Preview: https://...
   3. Clyde (ID: 2EiwWnXFnvU5JabPnv8n) - Preview: https://...
   ...
   ```

   Simply reply with the **number** (e.g., `1`, `2`, `3`) or the full **voice ID** if you prefer.

5. Once a voice is confirmed, the tool will:
   - Generate speech from your text using the selected voice and the multilingual v2 model
   - Save the audio to `./output/welcome-message.mp3` (or a timestamped filename if none was provided)
   - Return MCP content containing both a confirmation message and the `audio/mpeg` payload

## Output

Audio files are saved to the `./output` directory. If no filename is specified, files are named with timestamps like `speech-2025-10-02T10-30-00.mp3`.
