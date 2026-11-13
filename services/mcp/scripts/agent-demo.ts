/**
 * Drives the Ebbflow MCP server over stdio exactly as an AI agent would:
 * list_markets → get_liquidity → get_quote → simulate_route → execute_swap → get_agent_balance.
 *
 *   AGENT_ACCOUNT_ID=you-agent.testnet pnpm --filter @ebbflow/mcp demo [base_amount]
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const size = process.argv[2] ?? "0.5";
const server = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [server],
  env: { ...(process.env as Record<string, string>) },
  stderr: "inherit",
});
const client = new Client({ name: "ebbflow-agent-demo", version: "0.1.0" });
await client.connect(transport);

async function call(name: string, args: Record<string, unknown> = {}) {
  const r = await client.callTool({ name, arguments: args });
  const text = (r.content as { text: string }[])[0]?.text ?? "";
  console.log(`\n▶ ${name} ${JSON.stringify(args)}\n${r.isError ? "ERROR " : ""}${text.split("\n\n")[0]}`);
  if (r.isError) process.exit(1);
  return JSON.parse(text.slice(text.indexOf("\n\n") + 2)) as Record<string, unknown>;
}

await call("list_markets");
await call("get_liquidity", { market_id: 0, levels: 5 });
await call("get_agent_balance");
const trade = { market_id: 0, side: "buy_base", base_amount: size, slippage_bps: 50 };
await call("get_quote", trade);
await call("compare_liquidity", { market_id: 0, side: "buy_base", base_amount: size });
await call("simulate_route", trade);
const result = await call("execute_swap", trade);
console.log(JSON.stringify(result, null, 2));
await call("get_agent_balance");
await client.close();
