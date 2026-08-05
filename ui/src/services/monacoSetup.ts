/**
 * Monaco 本地装配：让 @monaco-editor/react 使用仓库内打包的 monaco-editor 与 Vite worker，
 * 不再依赖 cdn.jsdelivr.net 的远程脚本。CDN 被拦截/离线时，远程 worker 加载失败会让编辑器
 * 处于无 model 状态，触发 “Cannot read properties of null (reading 'getFullModelRange')”。
 */
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

type MonacoWorkerConstructor = new () => Worker;

(globalThis as unknown as { MonacoEnvironment?: monaco.Environment }).MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    const workers: Record<string, MonacoWorkerConstructor> = {
      json: jsonWorker,
      typescript: tsWorker,
      javascript: tsWorker,
      css: cssWorker,
      scss: cssWorker,
      less: cssWorker,
      html: htmlWorker,
      handlebars: htmlWorker,
      razor: htmlWorker,
    };
    const WorkerCtor = workers[label] || editorWorker;
    return new WorkerCtor();
  },
};

loader.config({ monaco });
