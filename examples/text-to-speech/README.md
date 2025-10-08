# Text-to-Podcast MCP Server

A simple MCP server that converts text to speech using ElevenLabs AI voices.

## Features

- Converts text to natural-sounding speech using ElevenLabs' multilingual AI voices
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

# Set your ElevenLabs API key
export ELEVENLABS_API_KEY="your_api_key_here"

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

### Example with MCP Inspector

```json
{
  "text": "Hello! Welcome to this AI-powered podcast.",
  "outputFilename": "welcome-message"
}
```

The tool will:
1. Generate speech from your text using ElevenLabs
2. Save the audio to `./output/welcome-message.mp3`
3. Return the audio as MCP `audio` content with MIME type `audio/mpeg`

## Output

Audio files are saved to the `./output` directory. If no filename is specified, files are named with timestamps like `speech-2025-10-02T10-30-00.mp3`.
