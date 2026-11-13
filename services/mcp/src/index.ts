#!/usr/bin/env node
/**
 * Ebbflow MCP server.
 *
 *   node dist/index.js          # stdio (Claude Code / Desktop, other local MCP clients)
 *   node dist/index.js --http   # streamable HTTP on $PORT (default 8788), path /mcp
 *
 * stdout is the MCP channel in stdio mode, so all logging goes to stderr.
 */
import { NearBookSource, NearRpc } from "@ebbflow/solver";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer as createHttpServer } from "node:http";
import { Budget } from "./budget.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";
import { EbbflowTools } from "./tools.js";
import { NearWallet } from "./wallet.js";

const config = loadConfig();
const rpc = new NearRpc(config.rpcUrls);
const source = new NearBookSource(rpc, config.contractId, config.network, 2_000);
const wallet = config.agent ? new NearWallet(config.agent.accountId, config.agent.privateKey, config.rpcUrls[0]!) : undefined;
const tools = new EbbflowTools({ source, chain: rpc, wallet, budget: new Budget(config.limits), config });

const who = wallet ? `agent ${wallet.accountId}` : "read-only (no AGENT_ACCOUNT_ID)";
console.error(`ebbflow mcp → ${config.contractId} (${config.network}), ${who}`);

if (process.argv.includes("--http")) {
  const port = Number(process.env.PORT ?? 8788);
  createHttpServer(async (req, res) => {
    if (req.url !== "/mcp") {
      res.writeHead(req.url === "/health" ? 200 : 404, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: req.url === "/health", mcp: "/mcp" }));
      return;
    }
    // Stateless: a fresh server + transport per request.
    const server = createServer(tools);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  }).listen(port, () => console.error(`listening on http://localhost:${port}/mcp`));
} else {
  await createServer(tools).connect(new StdioServerTransport());
}
