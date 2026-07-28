import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { PYTHON_EXECUTABLE, pythonServicePath, serverDataPath } from '../config/paths';
import XLSX from 'xlsx';
import { listProjectPackages, readProjectPackage } from '../services/project-package-store';
import { fullSourceRows, projectRevision } from '../services/project-authoring';
import { getStagedUpload } from '../services/upload-staging';

const router = Router();
const REPORTS_DIR = serverDataPath('cache', 'reports');
if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

const PYTHON = PYTHON_EXECUTABLE;
const DESCRIBE_SCRIPT = pythonServicePath('src', 'describe.py');

type ProjectSheetSource = {
  projectId: string;
  project: Record<string, any>;
  table: Record<string, any>;
  sheet: Record<string, any>;
};

function safeFileSegment(value: string) {
  return value.replace(/[^\w\u4e00-\u9fa5.-]+/g, '_');
}

function getCacheKey(fileId: string, sheetName?: string, projectId?: string, revision?: string) {
  const base = projectId ? `${projectId}__${fileId}` : fileId;
  const sheet = sheetName ? `${base}_${sheetName}` : base;
  return revision ? `${sheet}__${revision.slice(0, 16)}` : sheet;
}

function findProjectSheetSource(tableId: string, sheetName?: string, preferredProjectId?: string): ProjectSheetSource | null {
  const candidateProjectIds = preferredProjectId
    ? [preferredProjectId]
    : listProjectPackages().map((project) => String(project.id));

  for (const projectId of candidateProjectIds) {
    const project = readProjectPackage(projectId);
    if (!project) continue;
    const table = (project.srcTable || []).find((entry: Record<string, any>) => entry.id === tableId);
    if (!table) continue;
    const sheet = sheetName
      ? (table.sheets || []).find((entry: Record<string, any>) => entry.name === sheetName)
      : table.sheets?.[0];
    if (!sheet) continue;
    return { projectId, project, table, sheet };
  }

  return null;
}

function createTempCsvForProjectSheet(cacheKey: string, rows: Record<string, unknown>[], sheet: Record<string, any>) {
  const headers = Array.isArray(sheet.headers) ? sheet.headers : [];
  const normalizedRows = rows.map((row: Record<string, unknown>) => {
    const normalized: Record<string, unknown> = {};
    headers.forEach((header) => { normalized[header] = row?.[header] ?? ''; });
    return normalized;
  });
  const worksheet = XLSX.utils.json_to_sheet(normalizedRows, { header: headers });
  const csvContent = XLSX.utils.sheet_to_csv(worksheet);
  const tempPath = join(REPORTS_DIR, `${safeFileSegment(cacheKey)}.__describe__.csv`);
  writeFileSync(tempPath, csvContent);
  return tempPath;
}

// GET /api/describe/:fileId - 获取数据描述报告（带缓存）
router.get('/:fileId', (req, res) => {
  try {
    const { fileId } = req.params;
    const projectId = req.query.projectId as string || undefined;
    const sheetName = req.query.sheet as string || undefined;
    const projectSheetSource = findProjectSheetSource(fileId, sheetName, projectId);
    const revision = projectSheetSource ? projectRevision(projectSheetSource.project) : undefined;
    const cacheKey = getCacheKey(fileId, sheetName, projectId, revision);
    const reportPath = join(REPORTS_DIR, `${cacheKey}.json`);

    if (existsSync(reportPath)) {
      const cached = JSON.parse(readFileSync(reportPath, 'utf-8'));
      return res.json(cached);
    }

    let sourceFilePath: string | null = null;
    let cleanupPath: string | null = null;
    let resolvedSheetName = sheetName;
    let displayFileName = fileId;

    const staged = getStagedUpload(fileId);
    if (staged) {
      sourceFilePath = staged.path;
      displayFileName = staged.originalName;
    } else {
      if (!projectSheetSource) {
        return res.status(404).json({ error: '文件不存在', detail: `ID: ${fileId}${projectId ? `, 项目: ${projectId}` : ''}` });
      }
      resolvedSheetName = String(projectSheetSource.sheet.name || sheetName || '');
      displayFileName = String(projectSheetSource.table.fileName || projectSheetSource.table.id || fileId);
      cleanupPath = createTempCsvForProjectSheet(
        getCacheKey(fileId, resolvedSheetName, projectSheetSource.projectId, revision),
        fullSourceRows(projectSheetSource.project, projectSheetSource.table, projectSheetSource.sheet),
        projectSheetSource.sheet,
      );
      sourceFilePath = cleanupPath;
    }

    try {
      const sheetArg = sourceFilePath.endsWith('.csv') ? '' : resolvedSheetName ? ` "${resolvedSheetName}"` : '';
      const cmd = `"${PYTHON}" "${DESCRIBE_SCRIPT}" "${sourceFilePath}"${sheetArg}`;
      const output = execSync(cmd, { timeout: 30000, encoding: 'utf-8' });
      const report = JSON.parse(output);
      report.fileName = displayFileName;
      report.sheetName = resolvedSheetName || report.sheetName || null;
      writeFileSync(reportPath, JSON.stringify(report, null, 2));
      res.json(report);
    } catch (err: any) {
      console.error('[describe]', err.message);
      res.status(500).json({ error: '数据分析失败', detail: err.message });
    } finally {
      if (cleanupPath && existsSync(cleanupPath)) unlinkSync(cleanupPath);
    }
  } catch (e) {
    console.error('[describe]', e);
    res.status(500).json({ error: '描述请求失败', detail: String(e) });
  }
});

// GET /api/describe/:fileId/cache - 检查缓存状态
router.get('/:fileId/cache', (req, res) => {
  try {
    const { fileId } = req.params;
    const projectId = req.query.projectId as string || undefined;
    const sheetName = req.query.sheet as string || undefined;
    const source = findProjectSheetSource(fileId, sheetName, projectId);
    const cacheKey = getCacheKey(fileId, sheetName, projectId, source ? projectRevision(source.project) : undefined);
    const reportPath = join(REPORTS_DIR, `${cacheKey}.json`);
    res.json({ cached: existsSync(reportPath), cacheKey });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// DELETE /api/describe/:fileId - 清除缓存
router.delete('/:fileId', (req, res) => {
  try {
    const { fileId } = req.params;
    const projectId = req.query.projectId as string || undefined;
    const sheetName = req.query.sheet as string || undefined;
    const prefix = getCacheKey(fileId, sheetName, projectId);
    const files = readdirSync(REPORTS_DIR).filter((f) => f.startsWith(prefix));
    for (const f of files) {
      const path = join(REPORTS_DIR, f);
      if (existsSync(path)) unlinkSync(path);
    }
    res.json({ success: true, deleted: files.length });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export { router as describeRouter };
