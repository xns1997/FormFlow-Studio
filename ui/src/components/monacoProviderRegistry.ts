import type { Monaco } from '@monaco-editor/react';

export interface Disposable { dispose(): void; }

interface SharedProviderState {
  disposables: Disposable[];
  count: number;
}

const states = new Map<string, SharedProviderState>();

/**
 * 按语言共享的语言服务注册器（引用计数）。
 *
 * 同一个 Monaco 实例上可能同时挂载多个编辑器（例如属性面板内联编辑器与
 * 脚本工作台），直接按实例注册会让语言级 Provider 叠加、补全重复。这里
 * 首次 acquire 才注册，最后一个 release 时统一清理，保证全屏切换与多实例
 * 并存都安全。
 */
export function acquireLanguageProviders(
  monaco: Monaco,
  key: string,
  register: (monaco: Monaco) => Disposable[],
): Disposable {
  let state = states.get(key);
  if (!state) {
    state = { disposables: register(monaco), count: 0 };
    states.set(key, state);
  }
  state.count += 1;
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      state!.count -= 1;
      if (state!.count <= 0) {
        state!.disposables.forEach((item) => item.dispose());
        state!.disposables = [];
      }
    },
  };
}

/** 测试辅助：清空所有共享注册状态。 */
export function resetSharedLanguageProvidersForTest() {
  for (const state of states.values()) {
    state.disposables.forEach((item) => item.dispose());
    state.disposables = [];
    state.count = 0;
  }
  states.clear();
}
