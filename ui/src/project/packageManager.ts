// 项目包管理器 - 支持本地目录和 ZIP 两种方式

import type {
  ProjectStructure, ProjectPackage, FormIndex, DataIndex,
  DataMetaFile, WorkflowsFile, OutputsFile,
  DesignFile, BehaviorFile, WorkflowFile, OutputFile, SrcTableEntry,
} from './types';
import {
  FORMS_DIR, DATA_DIR, WORKFLOWS_DIR, OUTPUTS_DIR,
  FORM_INDEX_FILE, DATA_INDEX_FILE, WORKFLOWS_FILE, OUTPUTS_FILE, PROJECT_CONFIG_FILE, PROJECT_RELEASE_FILE,
} from './types';

// ── 工具函数 ──────────────────────────────────────

async function readJsonFile<T>(dirHandle: FileSystemDirectoryHandle, path: string): Promise<T | null> {
  try {
    const parts = path.split('/');
    let current = dirHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      current = await current.getDirectoryHandle(parts[i]);
    }
    const fileHandle = await current.getFileHandle(parts[parts.length - 1]);
    const file = await fileHandle.getFile();
    return JSON.parse(await file.text()) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(dirHandle: FileSystemDirectoryHandle, path: string, data: unknown): Promise<void> {
  const parts = path.split('/');
  let current = dirHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    current = await current.getDirectoryHandle(parts[i], { create: true });
  }
  const fileHandle = await current.getFileHandle(parts[parts.length - 1], { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

async function ensureDir(dirHandle: FileSystemDirectoryHandle, ...path: string[]): Promise<FileSystemDirectoryHandle> {
  let current = dirHandle;
  for (const segment of path) {
    current = await current.getDirectoryHandle(segment, { create: true });
  }
  return current;
}

// ── 从 ProjectStructure 导出为项目包 ──────────────────

export async function exportToPackage(
  dirHandle: FileSystemDirectoryHandle,
  project: ProjectStructure,
): Promise<void> {
  // 1. 写入 project.json
  const pkg: ProjectPackage = {
    kind: 'formflow-project',
    formatVersion: 2,
    config: project.config,
    settings: project.settings,
    release: project.release,
  };
  await writeJsonFile(dirHandle, PROJECT_CONFIG_FILE, pkg);
  if (project.release) await writeJsonFile(dirHandle, PROJECT_RELEASE_FILE, project.release);

  // 2. 写入表单实例（含行为）
  const formsDir = await ensureDir(dirHandle, FORMS_DIR);
  const forms = project.forms || [];
  const formIndex: FormIndex = {
    forms: forms.map((f) => ({
      id: f.id,
      name: f.name,
      fileName: `${f.id}.json`,
      behaviorsFileName: `${f.id}.behaviors.json`,
    })),
    defaultFormId: forms[0]?.id,
  };
  await writeJsonFile(formsDir, FORM_INDEX_FILE, formIndex);

  for (const form of forms) {
    await writeJsonFile(formsDir, `${form.id}.json`, form.design);
    await writeJsonFile(formsDir, `${form.id}.behaviors.json`, { behaviors: form.behaviors || [] });
  }

  // 3. 写入数据
  const dataDir = await ensureDir(dirHandle, DATA_DIR);
  const dataIndex: DataIndex = {
    sources: project.srcTable.map((t) => ({
      id: t.id,
      fileName: t.fileName,
      fileType: t.fileType,
      metaFile: `${t.id}.meta.json`,
      behaviorsFile: `${t.id}.behaviors.json`,
      uploadedAt: t.uploadedAt,
    })),
  };
  await writeJsonFile(dataDir, DATA_INDEX_FILE, dataIndex);

  for (const table of project.srcTable) {
    const metaData: DataMetaFile = {
      id: table.id,
      fileName: table.fileName,
      fileSize: table.fileSize,
      fileType: table.fileType,
      uploadedAt: table.uploadedAt,
      dataHash: table.dataHash,
      sheets: table.sheets,
      columnRecords: table.columnRecords,
      rowRecords: table.rowRecords,
    };
    await writeJsonFile(dataDir, `${table.id}.meta.json`, metaData);
    await writeJsonFile(dataDir, `${table.id}.behaviors.json`, {
      sheets: (project.sheetBehaviors || []).filter((entry) => entry.tableId === table.id),
    });
  }

  // 4. 写入全局行为
  await writeJsonFile(dirHandle, 'global-behaviors.json', {
    behaviors: project.globalBehaviors || [],
    exportedAt: new Date().toISOString(),
  });

  // 5. 写入流程
  const workflowsDir = await ensureDir(dirHandle, WORKFLOWS_DIR);
  const workflowsFile: WorkflowsFile = {
    workflows: project.workflows,
    exportedAt: new Date().toISOString(),
  };
  await writeJsonFile(workflowsDir, WORKFLOWS_FILE, workflowsFile);

  const outputsDir = await ensureDir(dirHandle, OUTPUTS_DIR);
  await writeJsonFile(outputsDir, OUTPUTS_FILE, { outputs: project.outputs, exportedAt: new Date().toISOString() } satisfies OutputsFile);
}

// ── 从项目包导入为 ProjectStructure ──────────────────

export async function importFromPackage(
  dirHandle: FileSystemDirectoryHandle,
): Promise<ProjectStructure | null> {
  // 1. 读取 project.json
  const pkg = await readJsonFile<ProjectPackage>(dirHandle, PROJECT_CONFIG_FILE);
  if (pkg?.kind !== 'formflow-project' || pkg.formatVersion !== 2 || !pkg.config) return null;
  const release = await readJsonFile<ProjectStructure['release']>(dirHandle, PROJECT_RELEASE_FILE);

  // 2. 读取表单
  const formIndex = await readJsonFile<FormIndex>(dirHandle, `${FORMS_DIR}/${FORM_INDEX_FILE}`);
  const designs: DesignFile[] = [];
  if (formIndex?.forms) {
    for (const form of formIndex.forms) {
      const design = await readJsonFile<DesignFile>(dirHandle, `${FORMS_DIR}/${form.fileName}`);
      if (design) designs.push(design);
    }
  }

  // 3. 读取数据元数据
  const dataIndex = await readJsonFile<DataIndex>(dirHandle, `${DATA_DIR}/${DATA_INDEX_FILE}`);
  const srcTable: SrcTableEntry[] = [];
  if (dataIndex?.sources) {
    for (const source of dataIndex.sources) {
      const meta = await readJsonFile<DataMetaFile>(dirHandle, `${DATA_DIR}/${source.metaFile}`);
      if (meta) {
        srcTable.push({
          id: meta.id,
          fileName: meta.fileName,
          fileSize: meta.fileSize,
          fileType: meta.fileType as SrcTableEntry['fileType'],
          uploadedAt: meta.uploadedAt,
          dataHash: meta.dataHash,
          sheets: meta.sheets,
          columnRecords: meta.columnRecords,
          rowRecords: meta.rowRecords,
        });
      }
    }
  }
  const sheetBehaviors = (await Promise.all((dataIndex?.sources || []).map(async (source) => {
    if (!source.behaviorsFile) return [];
    const content = await readJsonFile<{ sheets?: ProjectStructure['sheetBehaviors'] }>(dirHandle, `${DATA_DIR}/${source.behaviorsFile}`);
    return content?.sheets || [];
  }))).flat();

  // 4. 读取行为
  const globalBehaviorsFile = await readJsonFile<{ behaviors?: BehaviorFile[] }>(dirHandle, 'global-behaviors.json');
  const behaviors: BehaviorFile[] = globalBehaviorsFile?.behaviors || [];

  // 5. 读取流程
  const workflowsFile = await readJsonFile<WorkflowsFile>(dirHandle, `${WORKFLOWS_DIR}/${WORKFLOWS_FILE}`);
  const workflows: WorkflowFile[] = workflowsFile?.workflows || [];

  const outputsFile = await readJsonFile<OutputsFile>(dirHandle, `${OUTPUTS_DIR}/${OUTPUTS_FILE}`);
  const outputs: OutputFile[] = outputsFile?.outputs || [];

  return {
    config: pkg.config,
    settings: pkg.settings,
    release: release || pkg.release,
    srcTable,
    workflows,
    globalBehaviors: behaviors,
    sheetBehaviors,
    forms: [],
    outputs,
    designs,
    behaviors,
  };
}

// ── ZIP 导出（使用 JSZip）──────────────────────────

export async function exportToZip(project: ProjectStructure): Promise<Blob> {
  // 动态导入 JSZip
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  // 1. project.json
  const pkg: ProjectPackage = {
    kind: 'formflow-project',
    formatVersion: 2,
    config: project.config,
    settings: project.settings,
    release: project.release,
  };
  zip.file(PROJECT_CONFIG_FILE, JSON.stringify(pkg, null, 2));
  if (project.release) zip.file(PROJECT_RELEASE_FILE, JSON.stringify(project.release, null, 2));

  // 2. 表单实例（含行为）
  const forms = project.forms || [];
  const formIndex: FormIndex = {
    forms: forms.map((f) => ({
      id: f.id,
      name: f.name,
      fileName: `${f.id}.json`,
      behaviorsFileName: `${f.id}.behaviors.json`,
    })),
    defaultFormId: forms[0]?.id,
  };
  zip.file(`${FORMS_DIR}/${FORM_INDEX_FILE}`, JSON.stringify(formIndex, null, 2));

  for (const form of forms) {
    zip.file(`${FORMS_DIR}/${form.id}.json`, JSON.stringify(form.design, null, 2));
    zip.file(`${FORMS_DIR}/${form.id}.behaviors.json`, JSON.stringify({ behaviors: form.behaviors || [] }, null, 2));
  }

  // 3. 数据元数据
  const dataIndex: DataIndex = {
    sources: project.srcTable.map((t) => ({
      id: t.id,
      fileName: t.fileName,
      fileType: t.fileType,
      metaFile: `${t.id}.meta.json`,
      behaviorsFile: `${t.id}.behaviors.json`,
      uploadedAt: t.uploadedAt,
    })),
  };
  zip.file(`${DATA_DIR}/${DATA_INDEX_FILE}`, JSON.stringify(dataIndex, null, 2));

  for (const table of project.srcTable) {
    const metaData: DataMetaFile = {
      id: table.id,
      fileName: table.fileName,
      fileSize: table.fileSize,
      fileType: table.fileType,
      uploadedAt: table.uploadedAt,
      dataHash: table.dataHash,
      sheets: table.sheets,
      columnRecords: table.columnRecords,
      rowRecords: table.rowRecords,
    };
    zip.file(`${DATA_DIR}/${table.id}.meta.json`, JSON.stringify(metaData, null, 2));
    zip.file(`${DATA_DIR}/${table.id}.behaviors.json`, JSON.stringify({
      sheets: (project.sheetBehaviors || []).filter((entry) => entry.tableId === table.id),
    }, null, 2));
  }

  // 4. 全局行为
  zip.file('global-behaviors.json', JSON.stringify({
    behaviors: project.globalBehaviors || [],
    exportedAt: new Date().toISOString(),
  }, null, 2));

  // 5. 流程
  const workflowsFile: WorkflowsFile = {
    workflows: project.workflows,
    exportedAt: new Date().toISOString(),
  };
  zip.file(`${WORKFLOWS_DIR}/${WORKFLOWS_FILE}`, JSON.stringify(workflowsFile, null, 2));

  const outputsFile: OutputsFile = { outputs: project.outputs, exportedAt: new Date().toISOString() };
  zip.file(`${OUTPUTS_DIR}/${OUTPUTS_FILE}`, JSON.stringify(outputsFile, null, 2));

  return zip.generateAsync({ type: 'blob' });
}

// ── ZIP 导入 ──────────────────────────────────────

export async function importFromZip(file: File): Promise<ProjectStructure | null> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  // 1. 读取 project.json
  const pkgContent = await zip.file(PROJECT_CONFIG_FILE)?.async('text');
  if (!pkgContent) return null;
  const pkg = JSON.parse(pkgContent) as ProjectPackage;
  if (pkg.kind !== 'formflow-project' || pkg.formatVersion !== 2 || !pkg.config) return null;
  const releaseContent = await zip.file(PROJECT_RELEASE_FILE)?.async('text');
  const release = releaseContent ? JSON.parse(releaseContent) : pkg.release;

  // 2. 读取表单
  const formIndexContent = await zip.file(`${FORMS_DIR}/${FORM_INDEX_FILE}`)?.async('text');
  const formIndex = formIndexContent ? JSON.parse(formIndexContent) as FormIndex : null;
  const designs: DesignFile[] = [];
  if (formIndex?.forms) {
    for (const form of formIndex.forms) {
      const content = await zip.file(`${FORMS_DIR}/${form.fileName}`)?.async('text');
      if (content) designs.push(JSON.parse(content));
    }
  }

  // 3. 读取数据元数据
  const dataIndexContent = await zip.file(`${DATA_DIR}/${DATA_INDEX_FILE}`)?.async('text');
  const dataIndex = dataIndexContent ? JSON.parse(dataIndexContent) as DataIndex : null;
  const srcTable: SrcTableEntry[] = [];
  if (dataIndex?.sources) {
    for (const source of dataIndex.sources) {
      const content = await zip.file(`${DATA_DIR}/${source.metaFile}`)?.async('text');
      if (content) {
        const meta = JSON.parse(content) as DataMetaFile;
        srcTable.push({
          id: meta.id,
          fileName: meta.fileName,
          fileSize: meta.fileSize,
          fileType: meta.fileType as SrcTableEntry['fileType'],
          uploadedAt: meta.uploadedAt,
          dataHash: meta.dataHash,
          sheets: meta.sheets,
          columnRecords: meta.columnRecords,
          rowRecords: meta.rowRecords,
        });
      }
    }
  }
  const sheetBehaviors = (await Promise.all((dataIndex?.sources || []).map(async (source) => {
    if (!source.behaviorsFile) return [];
    const content = await zip.file(`${DATA_DIR}/${source.behaviorsFile}`)?.async('text');
    if (!content) return [];
    const parsed = JSON.parse(content) as { sheets?: ProjectStructure['sheetBehaviors'] };
    return parsed.sheets || [];
  }))).flat();

  // 4. 读取行为
  const behaviorsContent = await zip.file('global-behaviors.json')?.async('text');
  const behaviorsFile = behaviorsContent ? JSON.parse(behaviorsContent) as { behaviors?: BehaviorFile[] } : null;
  const behaviors: BehaviorFile[] = behaviorsFile?.behaviors || [];

  // 5. 读取流程
  const workflowsContent = await zip.file(`${WORKFLOWS_DIR}/${WORKFLOWS_FILE}`)?.async('text');
  const workflowsFile = workflowsContent ? JSON.parse(workflowsContent) as WorkflowsFile : null;
  const workflows: WorkflowFile[] = workflowsFile?.workflows || [];

  const outputsContent = await zip.file(`${OUTPUTS_DIR}/${OUTPUTS_FILE}`)?.async('text');
  const outputsFile = outputsContent ? JSON.parse(outputsContent) as OutputsFile : null;
  const outputs: OutputFile[] = outputsFile?.outputs || [];

  return {
    config: pkg.config,
    settings: pkg.settings,
    release,
    srcTable,
    workflows,
    globalBehaviors: behaviors,
    sheetBehaviors,
    forms: [],
    outputs,
    designs,
    behaviors,
  };
}

// ── 下载 ZIP 文件 ──────────────────────────────────

export async function downloadPackageZip(project: ProjectStructure): Promise<void> {
  const blob = await exportToZip(project);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.config.name || 'formflow'}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── 打开目录选择器 ──────────────────────────────────

export async function openDirectoryPicker(): Promise<FileSystemDirectoryHandle | null> {
  try {
    if ('showDirectoryPicker' in window) {
      const picker = (window as any).showDirectoryPicker;
      if (typeof picker === 'function') {
        return await picker({ mode: 'readwrite' });
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ── 打开 ZIP 文件选择器 ──────────────────────────────

export function openFilePicker(accept: string = '.zip'): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}
