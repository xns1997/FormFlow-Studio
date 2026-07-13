export type DbDriver = 'mysql' | 'postgres' | 'mssql';
export type DbConfig = { driver: DbDriver; connectionString: string };
export type DbResult = { rows: Record<string, unknown>[]; rowCount: number; fields?: string[] };

function validate(config: DbConfig) {
  if (!['mysql', 'postgres', 'mssql'].includes(config.driver)) throw new Error(`不支持的数据库驱动: ${config.driver}`);
  if (!config.connectionString) throw new Error('连接字符串不能为空');
}

export async function testConnection(config: DbConfig) {
  validate(config);
  if (config.driver === 'mysql') {
    const mysql = await import('mysql2/promise');
    const connection = await mysql.createConnection(config.connectionString);
    try { await connection.ping(); } finally { await connection.end(); }
  } else if (config.driver === 'postgres') {
    const { Client } = await import('pg');
    const client = new Client({ connectionString: config.connectionString });
    await client.connect();
    try { await client.query('SELECT 1'); } finally { await client.end(); }
  } else {
    const sql = await import('mssql');
    const pool = await sql.connect(config.connectionString);
    try { await pool.request().query('SELECT 1 AS ok'); } finally { await pool.close(); }
  }
  return { ok: true, driver: config.driver };
}

export async function queryDatabase(config: DbConfig, query: string, params: unknown[] = []): Promise<DbResult> {
  validate(config);
  if (!query.trim()) throw new Error('SQL 不能为空');
  if (config.driver === 'mysql') {
    const mysql = await import('mysql2/promise');
    const connection = await mysql.createConnection(config.connectionString);
    try {
      const [result, fields] = await connection.execute(query, params);
      const rows = Array.isArray(result) ? result as Record<string, unknown>[] : [];
      const affected = !Array.isArray(result) && 'affectedRows' in result ? Number(result.affectedRows) : rows.length;
      return { rows, rowCount: affected, fields: fields?.map((field) => field.name) };
    } finally { await connection.end(); }
  }
  if (config.driver === 'postgres') {
    const { Client } = await import('pg');
    const client = new Client({ connectionString: config.connectionString });
    await client.connect();
    try {
      const result = await client.query(query, params);
      return { rows: result.rows, rowCount: result.rowCount || 0, fields: result.fields.map((field: any) => field.name) };
    } finally { await client.end(); }
  }
  const sql = await import('mssql');
  const pool = await sql.connect(config.connectionString);
  try {
    const request = pool.request();
    params.forEach((value, index) => request.input(`p${index}`, value as any));
    const result = await request.query(query);
    return { rows: result.recordset || [], rowCount: result.rowsAffected.reduce((sum, count) => sum + count, 0), fields: result.recordset?.columns ? Object.keys(result.recordset.columns) : [] };
  } finally { await pool.close(); }
}

function identifier(value: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(value)) throw new Error(`无效标识符: ${value}`);
  return value;
}

export async function writeDatabase(config: DbConfig, table: string, rows: Record<string, unknown>[], mode: 'insert' | 'upsert' = 'insert', keys: string[] = []) {
  validate(config);
  identifier(table);
  if (!rows.length) return { rowCount: 0 };
  const columns = Object.keys(rows[0]);
  columns.forEach(identifier);
  if (!columns.length || rows.some((row) => columns.some((column) => !(column in row)))) throw new Error('写入行的字段必须一致');
  keys.forEach(identifier);
  if (mode === 'upsert' && !keys.length) throw new Error('UPSERT 必须配置冲突键');
  const quoted = (name: string) => config.driver === 'mysql' ? `\`${name}\`` : config.driver === 'mssql' ? `[${name}]` : `"${name}"`;
  let affected = 0;
  const batchSize = 500;
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const values = batch.flatMap((row) => columns.map((column) => row[column]));
    const tuples = batch.map((_row, rowIndex) => `(${columns.map((_column, columnIndex) => {
      const index = rowIndex * columns.length + columnIndex;
      return config.driver === 'postgres' ? `$${index + 1}` : config.driver === 'mssql' ? `@p${index}` : '?';
    }).join(', ')})`);
    let statement = `INSERT INTO ${table.split('.').map(quoted).join('.')} (${columns.map(quoted).join(', ')}) VALUES ${tuples.join(', ')}`;
    const mutable = columns.filter((column) => !keys.includes(column));
    if (mode === 'upsert' && config.driver === 'postgres') statement += ` ON CONFLICT (${keys.map(quoted).join(', ')}) DO UPDATE SET ${mutable.map((column) => `${quoted(column)} = EXCLUDED.${quoted(column)}`).join(', ')}`;
    if (mode === 'upsert' && config.driver === 'mysql') statement += ` ON DUPLICATE KEY UPDATE ${mutable.map((column) => `${quoted(column)} = VALUES(${quoted(column)})`).join(', ')}`;
    if (mode === 'upsert' && config.driver === 'mssql') throw new Error('SQL Server UPSERT 请使用 MERGE 查询节点');
    affected += (await queryDatabase(config, statement, values)).rowCount;
  }
  return { rowCount: affected, batches: Math.ceil(rows.length / batchSize) };
}
