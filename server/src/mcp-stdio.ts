import { startStdioMcpServer } from './mcp-server';
import { isMcpRole, MCP_ROLE_CATALOG } from './services/formflow-tool-registry';

function selectedRole() {
  if (process.argv.includes('--help') || process.argv.includes('-h') || process.argv.includes('--list-roles')) {
    process.stdout.write(`用法: formflow-mcp --role <role>\n角色: ${MCP_ROLE_CATALOG.map((item) => `${item.id} (${item.title})`).join(', ')}\n也可通过 FORMFLOW_MCP_ROLE 指定角色。\n`);
    return undefined;
  }
  const index = process.argv.indexOf('--role');
  const value = index >= 0 ? process.argv[index + 1] : process.env.FORMFLOW_MCP_ROLE;
  if (!isMcpRole(value)) throw new Error(`必须通过 --role 或 FORMFLOW_MCP_ROLE 指定 MCP 角色：${MCP_ROLE_CATALOG.map((item) => item.id).join(', ')}`);
  return value;
}

Promise.resolve().then(() => { const role = selectedRole(); return role ? startStdioMcpServer(role) : undefined; }).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
