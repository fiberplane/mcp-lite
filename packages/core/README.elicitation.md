# Elicitation with MCP-lite

To implement elicitation, the server + transport must be configured with two adapters:

- SessionAdapter
- ClientRequestAdapter

The session adapter makes it possible to correlate requests from the same client. The client request adapter enables the server to pause mid-response, await information from the client, then proceed. This can be particularly tricky in a serverless environment.

## Examples

### Cloudflare KV Adapter

For distributed deployments where multiple worker instances might handle different parts of the same session, implement a custom `ClientRequestAdapter` using persistent storage and polling.

This distributed adapter works by:
1. **Storing request metadata in KV** - Only serializable data
2. **Keeping local promise handlers** - In the instance that created the request
3. **Polling for responses** - Each instance polls KV to see if responses arrived
4. **Cross-instance coordination** - Any instance can resolve/reject requests by updating KV
5. **Automatic cleanup** - Handles timeouts and cleans up both local state and KV entries

The code for this is in [the examples folder](../../examples/cloudflare-worker-kv-r2/src/mcp/client-request-adapter.ts).