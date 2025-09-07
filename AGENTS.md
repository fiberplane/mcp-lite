# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Repository Guidelines

## Project Structure & Module Organization
- Root: Bun monorepo with workspaces in `packages/*` and `playground`.
- Core library: `packages/core`
  - Source: `packages/core/src`
  - Tests: `packages/core/tests/integration/*.test.ts`
  - Build scripts: `packages/core/scripts`
- Playground app: `playground/minimal-server.ts` (Hono + MCP HTTP transport)

## Build, Test, and Development Commands
- Install deps: `bun install`
- Build all packages: `bun run build`
- Type-check all: `bun run typecheck`
- Lint/format (Biome): `bun run lint`
- Test all (Bun): `bun test`
- Per-package example: `bun run --filter=core build` (or `cd packages/core && bun run build`)

## Coding Style & Naming Conventions
- Language: TypeScript (ESM). Prefer explicit exports.
- Formatting: enforced by Biome; run `bun run lint` before pushing.
- Files: kebab-case for multi-word files (e.g., `transport-http.ts`).
- Classes: `PascalCase` (e.g., `McpServer`). Functions/vars: `camelCase`.
- Types/interfaces: `PascalCase`; constants `SCREAMING_SNAKE_CASE`.

## Testing Guidelines
- Framework: Bun.
- Location: place tests under `packages/<name>/tests/**` and name as `*.test.ts`.
- Run: `bun test` (all). Run all test files with "foo" or "bar" in the file name `bun test foo bar`. Run all test files, only including tests whose names includes "baz" `bun test --test-name-pattern baz`.
- Write integration tests for public behavior (HTTP transport, JSON-RPC). Favor black-box tests over internals.

## Commit & Pull Request Guidelines
- Commits: concise, imperative subject; scope by package when relevant (e.g., `core: add StreamableHttpTransport validation`).
- PRs: include description, motivation, and any breaking changes. Link issues. Add before/after snippets or curl examples for protocol changes.
- Requirements: green tests, lint clean, typecheck clean. Update docs (`README.md`, examples) when APIs change.

## Architecture Notes
- Core exports live in `packages/core/src`; HTTP entry is `StreamableHttpTransport` bound to an `McpServer`.
- Protocol version and header are defined in `packages/core/src/constants.ts` and enforced for non-initialize requests.
- Main exports from `packages/core/src/index.ts`: `McpServer`, `StreamableHttpTransport`, `RpcError`, type exports for JSON-RPC and MCP protocol.
- Middleware system allows request/response interception (see `Middleware` type in types.ts).
- Schema validation is pluggable via `SchemaAdapter` interface - supports Zod, Valibot, or raw JSON Schema.

## Key Files
- `packages/core/src/core.ts`: Main McpServer implementation with tool/resource/prompt registration
- `packages/core/src/transport-http.ts`: HTTP transport layer for streaming responses
- `packages/core/src/types.ts`: Complete TypeScript type definitions for MCP protocol
- `playground/minimal-server.ts`: Example Hono server implementation with sample tools
