### Testing strategy: high-signal, flow-first, transport-real

Goal: Fewer but more informative tests that validate real client-observable behavior across HTTP + SSE, sessions, and persistence, with minimal mocking. Center tests on complete component flows (transport + core + store) instead of internal shapes.

---

## Principles

- Use real transports and servers in tests; avoid mocks by default.
- Prefer black-box assertions on wire behavior (HTTP status, JSON-RPC envelopes, SSE frames, replay ordering).
- Keep tests deterministic: inject fixed session IDs; use short, synchronous progress loops; avoid timers.
- Small, composable helpers in one place (`@internal/test-utils`) reused by core and examples.
- Consolidate overlapping tests; each suite should demonstrate one complete flow end-to-end.

---

## Target test layout (end state)

packages/core/tests/integration/
- http-session-sse.test.ts
  - Initialize → open session `GET` SSE → call tool with `_meta.progressToken` → receive ordered `notifications/progress` → receive final response on session stream (when eventStore is present) → reconnect with `Last-Event-ID` to replay remaining events → `DELETE` to tear down.

- http-request-sse.test.ts
  - Initialize → `POST` with `Accept: text/event-stream` and request `id` → receive progress + result on the same stream → verify event IDs are "0" (not persisted) → ensure these do not replay on session stream.

- sessions-lifecycle.test.ts
  - Reject non-initialize without valid session (400 + JSON-RPC error envelope).
  - `DELETE` closes session stream and all request streams; subsequent writes are no-ops; new requests rejected until re-init.

- concurrency-isolation.test.ts
  - Two simultaneous requests with distinct progress tokens.
  - Each per-request stream receives only its own events; session stream aggregates/persists (if configured); no cross-talk.

- security-headers.test.ts
  - `allowedHosts` and `allowedOrigins` happy/sad paths.

- protocol-negotiation.test.ts
  - Table-driven: header present/absent/mismatch vs initialize params; transport-level 400 for non-initialize mismatches; initialize errors via core (-32000) when params wrong.

- resources-flow.test.ts (merge current resource tests)
  - Static/templates listing and reading, precedence, parameter validation failures; assert wire results only.

- schema-adapter-flow.test.ts (merge schemaAdapter + standard-schema)
  - One happy path (JSON Schema exposed, validation succeeds) and one failure path (validation error surfaces as -32602 with message/data).

- prompts-flow.test.ts
  - prompts/list includes argument metadata; prompts/get runs without/with args; validation errors surface as -32602.

- middleware-flow.test.ts (slim)
  - One spec that proves `await next()` ordering and post-response access.

examples/*/tests/
- Keep one or two sanity E2E specs per example (already present). Optionally add a minimal SSE sanity spec using shared helpers.

---

## Suites to retire or refactor (current → target)

- progress.test.ts → Fold into http-session-sse.test.ts and http-request-sse.test.ts; stop intercepting `_setNotificationSender`; read actual SSE.
- notification.test.ts → Keep only the JSON-RPC-notification acceptance (202); move routing/behavior to SSE suites.
- e2e.test.ts → Split across protocol-negotiation.test.ts and middleware-flow.test.ts (retain only unique coverage).
- standard-schema.test.ts + schemaAdapter.test.ts → Consolidate into schema-adapter-flow.test.ts with one happy and one failing path.
- resources.test.ts → Rename to resources-flow.test.ts; keep precedence/validation/error cases; drop internal-shape assertions.

---

## Shared helpers to add in @internal/test-utils

New utilities (imported by both core and examples):

- sse.ts
  - `async function* readSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<{ id: string; data: unknown } | unknown>`
    - Parse `id:` and `data:` lines; yield parsed JSON from `data:`; include `id` when present.
  - `async function openSessionStream(baseUrl: string, sessionId: string, headers?: HeadersInit): Promise<Response>`
  - `async function openRequestStream(baseUrl: string, sessionId: string, body: unknown, headers?: HeadersInit): Promise<Response>`

- mcp-client.ts
  - `createMcpClient(baseUrl: string)` returns an object with:
    - `initialize(params)` → captures `MCP-Session` header.
    - `request(method, params, { id, progressToken }?)` → auto-injects session header and `_meta.progressToken`.

- harness.ts (optional, for in-process servers without module import)
  - `createMcpHarness({ mcp, transportOptions })` → starts Hono app bound to `StreamableHttpTransport`, returns `{ url, stop }`.

Example `readSse` implementation:

```ts
export async function* readSse(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const lines = chunk.split("\n");
        const idLine = lines.find((l) => l.startsWith("id:"));
        const dataLine = lines.find((l) => l.startsWith("data:"));
        if (dataLine) {
          const json = JSON.parse(dataLine.slice(5).trim());
          if (idLine) {
            yield { id: idLine.slice(3).trim(), data: json };
          } else {
            yield json;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
```

---

## Migration plan (phased)

Phase 0: Utilities
- Add `sse.ts`, `mcp-client.ts` (and optional `harness.ts`) to `@internal/test-utils`.
- Ensure `createExampleServer` remains for example packages.

Phase 1: Session SSE happy path
- Create `http-session-sse.test.ts` using `InMemoryEventStore` and fixed `generateSessionId: () => "sess-1"`.
- Refactor `progress.test.ts` to rely on `readSse` instead of notification interception; then remove the old file.

Phase 2: Per-request SSE
- Add `http-request-sse.test.ts` to cover ephemeral events (`id: "0"`), sequencing, and non-replay on session stream.
- Drop overlapping notification tests.

Phase 3: Replay & ordering
- Extend session SSE suite to reconnect with `Last-Event-ID` and assert exact replay (no duplicates, ordered, tail only).

Phase 4: Lifecycle & security
- Add `sessions-lifecycle.test.ts` and `security-headers.test.ts`.

Phase 5: Protocol & consolidation
- Add `protocol-negotiation.test.ts` (table-driven matrix).
- Consolidate schema/prompt/resource tests into the new flow suites and delete superseded files.

Phase 6: CI polish
- Run `bun test` with modest concurrency if streams flap; keep tests < 5s total when possible.
- Gate flaky throughput tests behind `CI` env if needed.

---

## Extensibility (as new features land)

- New endpoints (e.g., subscriptions):
  - Add one session SSE flow spec and one request SSE flow spec exercising success + failure + teardown.
  - Update `protocol-negotiation.test.ts` if headers/versions evolve.

- New transports (e.g., WebSocket):
  - Mirror the same suite structure under `tests/integration-ws/` with the same helper surface (e.g., `readWsEvents`).

- Stores beyond `InMemoryEventStore`:
  - Add store-specific replay and durability specs behind a store-guard (skip if not available at test time).

- Performance guardrails:
  - Add one “burst” test (e.g., 100 progress events) ensuring linear time and no hangs; keep time-bounded.

- Error translation:
  - Keep a single shared test that verifies `RpcError` vs generic `Error` envelope differences; include `onError` override path.

---

## Acceptance criteria (definition of done)

- All notification/progress assertions are made via real SSE streams (no notification sender interception).
- Request-scoped SSE events never appear in session replay; session events replay in order and only when `eventStore` is present.
- Non-initialize without session is rejected consistently; `DELETE` reliably tears down all streams.
- `allowedHosts`/`allowedOrigins` are enforced.
- Protocol header/params matrix is covered with clear pass/fail expectations.
- Examples use `@internal/test-utils` client; optional SSE sanity kept small.
- Total test count reduced; each remaining suite validates a complete flow.

---

## Quick reference: helper APIs

```ts
// Client
const client = createMcpClient(baseUrl);
const init = await client.initialize({ protocolVersion: "2025-06-18", clientInfo: { name: "x", version: "y" } });
const res = await client.request("tools/call", { name: "echo", arguments: { message: "hi" } });

// Session stream
const sessionRes = await openSessionStream(baseUrl, client.sessionId);
for await (const evt of readSse(sessionRes.body!)) {
  // evt is { id, data } or data
}

// Per-request stream
const req = { jsonrpc: "2.0", id: "42", method: "tools/call", params: { _meta: { progressToken: "abc" }, name: "longTask", arguments: { count: 3 } } };
const requestRes = await openRequestStream(baseUrl, client.sessionId, req);
for await (const evt of readSse(requestRes.body!)) { /* assert event IDs === "0" */ }
```

This plan yields a compact, maintainable suite that reflects real client behavior and scales as new features arrive.


