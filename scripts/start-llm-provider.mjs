import { accessSync, constants, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { delimiter, resolve } from 'node:path';
import process from 'node:process';

const repositoryRoot = resolve(import.meta.dirname, '..');
const configuredPython = process.env.LLM_PROVIDER_PYTHON || process.env.PYTHON_EXECUTABLE;
const localCandidates = [
  resolve(repositoryRoot, 'llm-provider/.venv/bin/python'),
  resolve(repositoryRoot, '.venv-provider/bin/python'),
];

function executable(path) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

const python = configuredPython || localCandidates.find(executable) || 'python3';
const configuredDirectHosts = (process.env.LLM_PROVIDER_NO_PROXY_HOSTS || 'token-plan-cn.xiaomimimo.com').split(',').map((item) => item.trim()).filter(Boolean);
const noProxy = [...new Set([
  ...(process.env.NO_PROXY || '').split(','),
  ...(process.env.no_proxy || '').split(','),
  ...configuredDirectHosts,
].map((item) => item.trim()).filter(Boolean))].join(',');
const env = {
  ...process.env,
  PYTHONPATH: [resolve(repositoryRoot, 'llm-provider'), process.env.PYTHONPATH].filter(Boolean).join(delimiter),
  LLM_PROVIDER_GRPC_HOST: process.env.LLM_PROVIDER_GRPC_HOST || '127.0.0.1',
  LLM_PROVIDER_HTTP_HOST: process.env.LLM_PROVIDER_HTTP_HOST || '127.0.0.1',
  NO_PROXY: noProxy,
  no_proxy: noProxy,
};

if (configuredPython && configuredPython.includes('/') && !existsSync(configuredPython)) {
  console.error(`[llm-provider] 找不到配置的 Python：${configuredPython}`);
  process.exit(1);
}

console.log(`[llm-provider] 使用 ${python}，HTTP 127.0.0.1:${env.LLM_PROVIDER_HTTP_PORT || '5001'}，gRPC 127.0.0.1:${env.LLM_PROVIDER_GRPC_PORT || '50051'}`);
const child = spawn(python, ['-m', 'src'], { cwd: repositoryRoot, env, stdio: 'inherit' });

child.on('error', (error) => {
  console.error(`[llm-provider] 启动失败：${error.message}`);
  console.error('[llm-provider] 请运行：python3 -m venv llm-provider/.venv && llm-provider/.venv/bin/pip install -r llm-provider/requirements.txt');
  process.exit(1);
});

let shutdownSignal;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    shutdownSignal = signal;
    child.kill(signal);
  });
}

child.on('exit', (code) => {
  process.exit(code ?? (shutdownSignal ? 0 : 1));
});
