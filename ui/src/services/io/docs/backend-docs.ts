import type { BehaviorTopicDocEntry } from './types';

export const backendDocs: BehaviorTopicDocEntry[] = [
  {
    id: 'backend:projects',
    slug: 'api-projects',
    title: '项目管理',
    summary: '项目 CRUD、克隆以及项目内数据行的增删改查',
    sections: [
      {
        title: '端点列表',
        fields: [
          { name: 'GET /api/projects', type: 'GET', description: '列出所有项目' },
          { name: 'POST /api/projects', type: 'POST', description: '创建项目' },
          { name: 'GET /api/projects/:id', type: 'GET', description: '获取单个项目详情' },
          { name: 'PUT /api/projects/:id', type: 'PUT', description: '更新项目' },
          { name: 'DELETE /api/projects/:id', type: 'DELETE', description: '删除项目' },
          { name: 'POST /api/projects/:id/clone', type: 'POST', description: '克隆项目（自动重命名）' },
          { name: 'POST /api/projects/data/query', type: 'POST', description: '分页查询项目内表数据行' },
          { name: 'POST /api/projects/data/add', type: 'POST', description: '向项目表新增一行数据' },
          { name: 'POST /api/projects/data/update', type: 'POST', description: '更新项目表中指定行' },
          { name: 'POST /api/projects/data/delete', type: 'POST', description: '删除项目表中指定行' },
        ],
      },
      {
        title: '数据模型',
        body: '项目对象包含 config（id、name、createdAt、updatedAt）、tables（表定义数组）、workflows（流程数组）、behaviors（行为数组）。数据行操作通过 projectId + tableId + sheetName 定位具体工作表。',
      },
    ],
  },
  {
    id: 'backend:files',
    slug: 'api-files',
    title: '文件管理',
    summary: '文件上传、解析（Excel/JSON/SQLite）、元数据管理与原始文件下载',
    sections: [
      {
        title: '端点列表',
        fields: [
          { name: 'POST /api/files/upload', type: 'POST', description: '上传文件并自动解析，返回文件元数据' },
          { name: 'GET /api/files', type: 'GET', description: '列出所有已上传文件的元数据' },
          { name: 'GET /api/files/:id', type: 'GET', description: '获取指定文件的元数据' },
          { name: 'GET /api/files/:id/raw', type: 'GET', description: '下载上传时保存的原始文件' },
          { name: 'GET /api/files/:id/data', type: 'GET', description: '读取文件解析后的数据' },
          { name: 'DELETE /api/files/:id', type: 'DELETE', description: '删除文件及其关联缓存' },
        ],
      },
      {
        title: '数据模型',
        body: '文件元数据包含 id、originalName、storedName、size、mimeType、fileType、uploadedAt、sheets（每个 sheet 含 name/rowCount/colCount/headers）。支持 Excel（.xlsx/.xls）、JSON、SQLite（.db/.sqlite/.sqlite3）三种格式。',
      },
    ],
  },
  {
    id: 'backend:data',
    slug: 'api-data',
    title: '数据解析与读写',
    summary: '文件数据的解析缓存、分页读取、列信息查询、行级 CRUD 及导出',
    sections: [
      {
        title: '端点列表',
        fields: [
          { name: 'POST /api/data/parse', type: 'POST', description: '解析文件并缓存指定 Sheet 数据' },
          { name: 'GET /api/data/:fileId/:sheetName/rows', type: 'GET', description: '分页获取行数据（page/pageSize）' },
          { name: 'GET /api/data/:fileId/:sheetName/columns', type: 'GET', description: '获取列信息（唯一值、空值统计等）' },
          { name: 'POST /api/data/:fileId/:sheetName/rows', type: 'POST', description: '新增一行数据' },
          { name: 'PUT /api/data/:fileId/:sheetName/rows/:rowIdx', type: 'PUT', description: '更新指定索引的行' },
          { name: 'DELETE /api/data/:fileId/:sheetName/rows/:rowIdx', type: 'DELETE', description: '删除指定索引的行' },
          { name: 'POST /api/data/export', type: 'POST', description: '将数据导出为 Excel 或 CSV 文件' },
        ],
      },
      {
        title: '数据模型',
        body: '缓存数据以 JSON 文件存储，结构为 { fileId, sheetName, headers, rowCount, data[], parsedAt }。列信息包含 name、index、rowCount、uniqueCount、emptyCount、sampleValues。导出支持 xlsx 和 csv 两种格式。',
      },
    ],
  },
  {
    id: 'backend:workflows',
    slug: 'api-workflows',
    title: '流程管理',
    summary: '项目内流程的增删改查',
    sections: [
      {
        title: '端点列表',
        fields: [
          { name: 'GET /api/workflows/:projectId', type: 'GET', description: '获取项目下所有流程' },
          { name: 'POST /api/workflows/:projectId', type: 'POST', description: '创建流程' },
          { name: 'PUT /api/workflows/:projectId/:workflowId', type: 'PUT', description: '更新流程' },
          { name: 'DELETE /api/workflows/:projectId/:workflowId', type: 'DELETE', description: '删除流程' },
        ],
      },
      {
        title: '数据模型',
        body: '流程对象包含 id（wf_ 前缀自动生成）、createdAt、updatedAt 及业务字段。流程数据持久化在项目包内。',
      },
    ],
  },
  {
    id: 'backend:behaviors',
    slug: 'api-behaviors',
    title: '行为管理',
    summary: '项目内行为的增删改查',
    sections: [
      {
        title: '端点列表',
        fields: [
          { name: 'GET /api/behaviors/:projectId', type: 'GET', description: '获取项目下所有行为' },
          { name: 'POST /api/behaviors/:projectId', type: 'POST', description: '创建行为' },
          { name: 'PUT /api/behaviors/:projectId/:behaviorId', type: 'PUT', description: '更新行为' },
          { name: 'DELETE /api/behaviors/:projectId/:behaviorId', type: 'DELETE', description: '删除行为' },
        ],
      },
      {
        title: '数据模型',
        body: '行为对象包含 id（bh_ 前缀自动生成）、createdAt、updatedAt 及业务字段。行为数据持久化在项目包内。',
      },
    ],
  },
  {
    id: 'backend:describe',
    slug: 'api-describe',
    title: '数据描述报告',
    summary: '基于 Python 脚本生成数据描述统计报告，支持缓存',
    sections: [
      {
        title: '端点列表',
        fields: [
          { name: 'GET /api/describe/:fileId', type: 'GET', description: '获取数据描述报告（自动缓存，支持 ?sheet= 参数）' },
          { name: 'GET /api/describe/:fileId/cache', type: 'GET', description: '检查指定文件的缓存状态' },
          { name: 'DELETE /api/describe/:fileId', type: 'DELETE', description: '清除指定文件的描述报告缓存' },
        ],
      },
      {
        title: '数据模型',
        body: '报告以 JSON 缓存于 reports 目录，key 为 fileId 或 fileId_sheetName。底层调用 Python describe.py 脚本分析 Excel 文件。',
      },
    ],
  },
  {
    id: 'backend:configs',
    slug: 'api-configs',
    title: '通用配置',
    summary: '通用 JSON 配置项的增删改查',
    sections: [
      {
        title: '端点列表',
        fields: [
          { name: 'GET /api/configs', type: 'GET', description: '列出所有配置' },
          { name: 'GET /api/configs/:id', type: 'GET', description: '获取指定配置' },
          { name: 'PUT /api/configs/:id', type: 'PUT', description: '保存/更新配置' },
          { name: 'DELETE /api/configs/:id', type: 'DELETE', description: '删除配置' },
        ],
      },
      {
        title: '数据模型',
        body: '配置以独立 JSON 文件存储于 configs 目录，文件名为 {id}.json，包含 id、updatedAt 及业务字段。',
      },
    ],
  },
  {
    id: 'backend:ml',
    slug: 'api-ml',
    title: '机器学习引擎',
    summary: '通过 Python ML 引擎执行机器学习相关命令',
    sections: [
      {
        title: '端点列表',
        fields: [
          { name: 'POST /api/ml/:command', type: 'POST', description: '执行指定 ML 命令（command 为 Python 脚本子命令，body 为参数）' },
        ],
      },
      {
        title: '数据模型',
        body: '所有请求通过 POST /api/ml/:command 统一入口，command 路由到 Python ml_engine.py 的子命令，请求体 JSON 作为参数传入，超时 30 秒。',
      },
    ],
  },
  {
    id: 'backend:history',
    slug: 'api-history',
    title: '历史记录',
    summary: '项目版本快照的创建、查看、恢复与删除',
    sections: [
      {
        title: '端点列表',
        fields: [
          { name: 'GET /api/history/:projectId', type: 'GET', description: '获取项目的版本列表' },
          { name: 'POST /api/history/:projectId', type: 'POST', description: '创建新版本快照（自动递增版本号）' },
          { name: 'GET /api/history/:projectId/:versionId', type: 'GET', description: '获取指定版本详情' },
          { name: 'POST /api/history/:projectId/:versionId/restore', type: 'POST', description: '恢复到指定版本（返回快照数据）' },
          { name: 'DELETE /api/history/:projectId/:versionId', type: 'DELETE', description: '删除指定版本' },
          { name: 'DELETE /api/history/:projectId', type: 'DELETE', description: '清空项目所有版本历史' },
        ],
      },
      {
        title: '数据模型',
        body: '版本对象包含 id（{projectId}_v{N}）、version（版本号）、timestamp、label、snapshot（JSON 字符串）。版本列表按项目维度存储为 {projectId}_versions.json。',
      },
    ],
  },
];
