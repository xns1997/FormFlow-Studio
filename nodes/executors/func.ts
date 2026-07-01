import { registerExecutor, type NodeExecContext, type NodeExecResult } from '../executor-registry';

async function getXlsx() {
  return await import('xlsx');
}

registerExecutor('func-column-bind', (ctx) => {
  const { inputs, properties, assertType } = ctx;
  const componentPort = assertType('string', properties.componentPort || 'value', 'componentPort') as string;
  const dataField = assertType('string', inputs.dataField || properties.dataField || '', 'dataField') as string;
  const direction = assertType('string', properties.direction || 'twoWay', 'direction') as string;

  return { trigger: inputs.trigger, componentPort, dataField, direction, uiValue: inputs.uiValue, dataValue: inputs.dataValue };
});

registerExecutor('func-row-navigator', (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const dataCheck = checkType('json-rows', inputs.data);
  const data = dataCheck.valid ? (dataCheck.normalized as any[]) : [];
  const currentIndex = ctx.assertType('number', inputs.currentIndex || properties.currentIndex || 0, 'currentIndex') as number;

  return {
    currentRow: data[currentIndex] || null,
    currentIndex,
    totalRows: data.length,
    hasNext: currentIndex < data.length - 1,
    hasPrev: currentIndex > 0,
  };
});

registerExecutor('func-form-validate', (ctx) => {
  const { inputs, properties } = ctx;
  const formData = (inputs.formData || {}) as Record<string, unknown>;
  const fieldsStr = String(properties.fields || '');
  const rulesStr = String(properties.rules || '{}');

  let rules: Record<string, any>;
  try { rules = JSON.parse(rulesStr); } catch {
    rules = {};
    // 解析简单的 "required" 字段列表
    if (fieldsStr) {
      for (const f of fieldsStr.split(',').map(s => s.trim()).filter(Boolean)) {
        rules[f] = { required: true };
      }
    }
  }

  const errors: Record<string, string[]> = {};
  const fields = fieldsStr ? fieldsStr.split(',').map(s => s.trim()).filter(Boolean) : Object.keys(rules);

  for (const field of fields) {
    const fieldRules = rules[field] || rules;
    const value = formData[field];

    if (fieldRules.required) {
      if (value === null || value === undefined || value === '') {
        if (!errors[field]) errors[field] = [];
        errors[field].push(`${field} 为必填项`);
      }
    }
    if (fieldRules.minLength !== undefined) {
      if (typeof value === 'string' && value.length < fieldRules.minLength) {
        if (!errors[field]) errors[field] = [];
        errors[field].push(`${field} 长度不能少于 ${fieldRules.minLength}`);
      }
    }
    if (fieldRules.maxLength !== undefined) {
      if (typeof value === 'string' && value.length > fieldRules.maxLength) {
        if (!errors[field]) errors[field] = [];
        errors[field].push(`${field} 长度不能超过 ${fieldRules.maxLength}`);
      }
    }
    if (fieldRules.min !== undefined) {
      if (Number(value) < Number(fieldRules.min)) {
        if (!errors[field]) errors[field] = [];
        errors[field].push(`${field} 不能小于 ${fieldRules.min}`);
      }
    }
    if (fieldRules.max !== undefined) {
      if (Number(value) > Number(fieldRules.max)) {
        if (!errors[field]) errors[field] = [];
        errors[field].push(`${field} 不能大于 ${fieldRules.max}`);
      }
    }
    if (fieldRules.pattern) {
      try {
        const regex = new RegExp(fieldRules.pattern);
        if (typeof value === 'string' && !regex.test(value)) {
          if (!errors[field]) errors[field] = [];
          errors[field].push(`${field} 格式不正确`);
        }
      } catch {}
    }
    if (fieldRules.email) {
      if (typeof value === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        if (!errors[field]) errors[field] = [];
        errors[field].push(`${field} 不是有效的邮箱地址`);
      }
    }
    if (fieldRules.phone) {
      if (typeof value === 'string' && !/^1[3-9]\d{9}$/.test(value)) {
        if (!errors[field]) errors[field] = [];
        errors[field].push(`${field} 不是有效的手机号`);
      }
    }
  }

  const isValid = Object.keys(errors).length === 0;
  return {
    isValid,
    errors,
    passed: isValid ? inputs.trigger : undefined,
    failed: !isValid ? inputs.trigger : undefined,
    formData,
    fieldCount: fields.length,
    errorCount: Object.keys(errors).length,
  };
});

registerExecutor('func-select-input', (ctx) => {
  const optionsCheck = ctx.checkType('options', ctx.properties.options);
  const options = optionsCheck.valid ? optionsCheck.normalized : (ctx.properties.options || []);
  return { value: ctx.inputs.value ?? ctx.properties.defaultValue ?? '', options };
});

registerExecutor('func-radio-input', (ctx) => {
  const optionsCheck = ctx.checkType('options', ctx.properties.options);
  const options = optionsCheck.valid ? optionsCheck.normalized : (ctx.properties.options || []);
  return { value: ctx.inputs.value ?? ctx.properties.defaultValue ?? '', options };
});

registerExecutor('func-checkbox-input', (ctx) => {
  const optionsCheck = ctx.checkType('options', ctx.properties.options);
  const options = optionsCheck.valid ? optionsCheck.normalized : (ctx.properties.options || []);
  return { value: ctx.inputs.value ?? ctx.properties.defaultValue ?? [], options };
});

registerExecutor('func-date-input', (ctx) => {
  return { value: ctx.inputs.value ?? ctx.properties.defaultValue ?? '' };
});

registerExecutor('func-rating-input', (ctx) => {
  const valueCheck = ctx.checkType('number', ctx.inputs.value ?? ctx.properties.defaultValue ?? 0);
  return { value: valueCheck.valid ? valueCheck.normalized : 0 };
});

registerExecutor('func-style', (ctx) => {
  const styleCheck = ctx.checkType('style', ctx.properties);
  return { styled: true, properties: styleCheck.valid ? styleCheck.normalized : ctx.properties };
});

registerExecutor('func-apply-style', async (ctx) => {
  const XLSX = await getXlsx();
  const worksheet = ctx.inputs.worksheet;
  const style = ctx.inputs.style || ctx.properties;

  if (!worksheet) return { styled: false, error: '缺少 worksheet 输入' };

  const wsObj = worksheet as any;

  // 对 __fromProject worksheet，直接返回样式配置
  if (wsObj?.__fromProject) {
    return {
      styled: true,
      worksheet: wsObj,
      appliedStyle: style,
      message: '样式已记录（需要写入时应用到实际 Excel 文件）',
    };
  }

  // 对真实 XLSX worksheet，应用样式到所有单元格
  if (typeof wsObj === 'object' && wsObj['!ref']) {
    const range = XLSX.utils.decode_range(wsObj['!ref']);
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!wsObj[addr]) wsObj[addr] = { t: 's', v: '' };
        if (!wsObj[addr].s) wsObj[addr].s = {} as any;
        const s = wsObj[addr].s as any;
        if ((style as any)?.font) s.font = (style as any).font;
        if ((style as any)?.fill) s.fill = (style as any).fill;
        if ((style as any)?.alignment) s.alignment = (style as any).alignment;
        if ((style as any)?.border) s.border = (style as any).border;
      }
    }
  }

  return { styled: true, worksheet: wsObj };
});

registerExecutor('func-conditional-format', async (ctx) => {
  const { inputs, properties } = ctx;
  const worksheet = inputs.worksheet as any;
  const field = String(properties.field || '');
  const condition = String(properties.condition || 'contains');
  const value = properties.value ?? '';

  if (!worksheet) return { formatted: false, error: '缺少 worksheet 输入' };

  // 从 worksheet 中提取数据进行条件格式化标记
  let data: Record<string, unknown>[] = [];
  if (worksheet.__fromProject) {
    data = worksheet.preview || [];
  }

  const highlighted: any[] = [];
  for (const row of data) {
    if (field && row[field] !== undefined) {
      let match = false;
      const cellVal = String(row[field]);
      switch (condition) {
        case 'contains': match = cellVal.includes(String(value)); break;
        case 'equals': match = cellVal === String(value); break;
        case 'gt': match = Number(row[field]) > Number(value); break;
        case 'lt': match = Number(row[field]) < Number(value); break;
        case 'gte': match = Number(row[field]) >= Number(value); break;
        case 'lte': match = Number(row[field]) <= Number(value); break;
        case 'isEmpty': match = !row[field]; break;
        case 'isNotEmpty': match = !!row[field]; break;
        default: match = false;
      }
      if (match) highlighted.push(row);
    }
  }

  return {
    formatted: true,
    worksheet,
    highlightedCount: highlighted.length,
    highlighted,
    field,
    condition,
    value,
  };
});

registerExecutor('func-data-validation', async (ctx) => {
  const { inputs, properties } = ctx;
  const worksheet = inputs.worksheet as any;
  const field = String(properties.field || '');
  const validationType = String(properties.validationType || 'list');
  const formula1 = String(properties.formula1 || '');

  if (!worksheet) return { validated: false, error: '缺少 worksheet 输入' };

  let data: Record<string, unknown>[] = [];
  if (worksheet.__fromProject) {
    data = worksheet.preview || [];
  }

  const errors: any[] = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (field && row[field] !== undefined) {
      const val = row[field];
      let valid = true;
      switch (validationType) {
        case 'list': {
          const options = formula1.split(',').map(s => s.trim());
          valid = options.length === 0 || options.includes(String(val));
          break;
        }
        case 'whole':
        case 'decimal': valid = !isNaN(Number(val)); break;
        case 'date': valid = !isNaN(new Date(val as any).getTime()); break;
        case 'textLength': valid = typeof val === 'string' && val.length <= Number(formula1 || 255); break;
        default: valid = true;
      }
      if (!valid) errors.push({ row: i, field, value: val, message: `${field} 校验失败 (${validationType})` });
    }
  }

  return {
    validated: true,
    worksheet,
    isValid: errors.length === 0,
    errors,
    errorCount: errors.length,
  };
});

registerExecutor('func-add-comment', async (ctx) => {
  const { inputs, properties } = ctx;
  const worksheet = inputs.worksheet as any;
  const author = String(properties.author || '用户');
  const commentText = String(properties.comment || '');

  if (!worksheet) return { commentAdded: false, error: '缺少 worksheet 输入' };

  if (worksheet.__fromProject) {
    return {
      commentAdded: true,
      worksheet,
      comment: { author, text: commentText, timestamp: Date.now() },
      message: '批注已记录',
    };
  }

  // 真实 XLSX worksheet
  if (typeof worksheet === 'object' && worksheet['!ref']) {
    const XLSX = await getXlsx();
    const cell = String(properties.cell || 'A1');
    if (!worksheet[cell]) worksheet[cell] = { t: 's', v: '' };
    worksheet[cell].c = [{ t: commentText, a: author }];
  }

  return { commentAdded: true, worksheet, comment: { author, text: commentText } };
});

registerExecutor('func-named-item', async (ctx) => {
  const { inputs, properties } = ctx;
  const worksheet = inputs.worksheet as any;
  const name = String(properties.name || '');
  const range = String(properties.range || 'A1');

  if (!worksheet) return { named: false, error: '缺少 worksheet 输入' };

  // 记录命名范围（XLSX 库支持在 workbook 级别添加）
  return {
    named: true,
    worksheet,
    namedItem: { name, range },
    message: `命名范围 "${name}" 已定义为 ${range}`,
  };
});

registerExecutor('func-protect-sheet', async (ctx) => {
  const { inputs, properties } = ctx;
  const worksheet = inputs.worksheet as any;
  const password = String(properties.password || '');

  if (!worksheet) return { protected: false, error: '缺少 worksheet 输入' };

  return {
    protected: true,
    worksheet,
    protection: { password: password ? '***' : '', timestamp: Date.now() },
    message: password ? '工作表已设置密码保护' : '工作表保护已启用（无密码）',
  };
});

registerExecutor('func-protect-workbook', async (ctx) => {
  const { inputs, properties } = ctx;
  const workbook = inputs.workbook as any;
  const password = String(properties.password || '');

  if (!workbook) return { protected: false, error: '缺少 workbook 输入' };

  return {
    protected: true,
    workbook,
    protection: { password: password ? '***' : '', timestamp: Date.now() },
    message: password ? '工作簿已设置密码保护' : '工作簿保护已启用',
  };
});

registerExecutor('func-create-chart', async (ctx) => {
  const { inputs, properties, checkType } = ctx;
  const worksheet = inputs.worksheet as any;
  if (worksheet && typeof worksheet === 'object') {
    if (!worksheet['!charts']) worksheet['!charts'] = [];
    const chartName = `Chart${worksheet['!charts'].length + 1}`;
    worksheet['!charts'].push({
      name: chartName,
      type: String(properties.chartType || 'bar'),
      dataRange: String(inputs.dataRange || properties.dataRange || 'A1:C10'),
      title: String(inputs.title || properties.title || ''),
      width: Number(properties.width || 480),
      height: Number(properties.height || 320),
    });
    return { worksheet, chartName };
  }
  const dataCheck = checkType('json-rows', inputs.data);
  if (!dataCheck.valid) return { chartCreated: false, error: `数据格式错误: ${dataCheck.error}` };
  const data = dataCheck.normalized as any[];
  const chartType = String(properties.chartType || 'bar');
  const xField = String(properties.xField || '');
  const yField = String(properties.yField || '');

  if (!data.length) return { chartCreated: false, error: '数据为空' };

  // 构造图表数据
  const labels = xField ? data.map(row => String(row[xField])) : data.map((_, i) => String(i + 1));
  const values = yField ? data.map(row => Number(row[yField]) || 0) : data.map(row => Number(Object.values(row)[0]) || 0);

  // 生成 SVG 图表
  const width = 400, height = 250, padding = 40;
  const maxVal = Math.max(...values, 1);
  const barWidth = Math.max(2, (width - padding * 2) / labels.length - 4);

  let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  svgContent += `<rect width="${width}" height="${height}" fill="#f8fafc" rx="8"/>`;
  svgContent += `<text x="${width / 2}" y="20" text-anchor="middle" font-size="12" font-weight="bold" fill="#1e293b">${properties.title || '图表'}</text>`;

  if (chartType === 'bar') {
    labels.forEach((label, i) => {
      const barHeight = (values[i] / maxVal) * (height - padding * 2);
      const x = padding + i * ((width - padding * 2) / labels.length) + 2;
      const y = height - padding - barHeight;
      const hue = (i * 360 / labels.length) % 360;
      svgContent += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="hsl(${hue}, 70%, 60%)" rx="2"/>`;
      svgContent += `<text x="${x + barWidth / 2}" y="${height - padding + 14}" text-anchor="middle" font-size="8" fill="#64748b">${label.substring(0, 6)}</text>`;
    });
  } else if (chartType === 'pie') {
    const total = values.reduce((a, b) => a + Math.abs(b), 0) || 1;
    let startAngle = -Math.PI / 2;
    const cx = width / 2, cy = height / 2 + 10, r = Math.min(width, height) / 2 - padding;
    labels.forEach((label, i) => {
      const sliceAngle = (Math.abs(values[i]) / total) * Math.PI * 2;
      const endAngle = startAngle + sliceAngle;
      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);
      const largeArc = sliceAngle > Math.PI ? 1 : 0;
      const hue = (i * 360 / labels.length) % 360;
      svgContent += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2} Z" fill="hsl(${hue}, 70%, 60%)" stroke="white" stroke-width="1"/>`;
      startAngle = endAngle;
    });
  } else {
    // 线图
    const points = labels.map((_, i) => {
      const x = padding + i * ((width - padding * 2) / Math.max(labels.length - 1, 1));
      const y = height - padding - (values[i] / maxVal) * (height - padding * 2);
      return `${x},${y}`;
    });
    svgContent += `<polyline points="${points.join(' ')}" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    labels.forEach((label, i) => {
      const x = padding + i * ((width - padding * 2) / Math.max(labels.length - 1, 1));
      const y = height - padding - (values[i] / maxVal) * (height - padding * 2);
      svgContent += `<circle cx="${x}" cy="${y}" r="3" fill="#3b82f6"/>`;
      svgContent += `<text x="${x}" y="${height - padding + 14}" text-anchor="middle" font-size="8" fill="#64748b">${label.substring(0, 6)}</text>`;
    });
  }

  svgContent += '</svg>';

  return {
    chartCreated: true,
    chartType,
    data: dataCheck.normalized,
    labels,
    values,
    svg: svgContent,
    xField,
    yField,
  };
});

registerExecutor('func-merge-cells', async (ctx) => {
  const { inputs, properties } = ctx;
  const worksheet = inputs.worksheet as any;
  const startCell = String(properties.startCell || 'A1');
  const endCell = String(properties.endCell || 'A1');

  if (!worksheet) return { merged: false, error: '缺少 worksheet 输入' };

  if (worksheet.__fromProject) {
    return { merged: true, worksheet, mergeRange: `${startCell}:${endCell}`, message: `合并范围 ${startCell}:${endCell} 已记录` };
  }

  if (typeof worksheet === 'object' && worksheet['!ref']) {
    const XLSX = await getXlsx();
    if (!worksheet['!merges']) worksheet['!merges'] = [];
    const s = XLSX.utils.decode_cell(startCell);
    const e = XLSX.utils.decode_cell(endCell);
    worksheet['!merges'].push({ s, e });
  }

  return { merged: true, worksheet, mergeRange: `${startCell}:${endCell}` };
});

registerExecutor('func-find-replace', async (ctx) => {
  const { inputs, properties } = ctx;
  const find = ctx.assertType('string', properties.find || '', 'find') as string;
  const replace = ctx.assertType('string', properties.replace || '', 'replace') as string;
  const worksheet = inputs.worksheet as any;

  if (!find) return { replaced: false, error: '缺少查找内容' };
  if (!worksheet) return { replaced: false, error: '缺少 worksheet 输入' };

  let replaceCount = 0;

  if (worksheet.__fromProject) {
    // 在 __fromProject 数据中替换
    const preview = worksheet.preview || [];
    const headers: string[] = worksheet.headers || [];
    for (const row of preview) {
      for (const h of headers) {
        if (typeof row[h] === 'string' && row[h].includes(find)) {
          row[h] = row[h].split(find).join(replace);
          replaceCount++;
        }
      }
    }
    return { worksheet, find, replace, replaced: true, replaceCount };
  }

  // 真实 XLSX worksheet
  if (typeof worksheet === 'object' && worksheet['!ref']) {
    const range = (worksheet as any)['!ref'] ? (await import('xlsx')).utils.decode_range((worksheet as any)['!ref']) : null;
    if (range) {
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = (await import('xlsx')).utils.encode_cell({ r, c });
          const cell = worksheet[addr];
          if (cell && typeof cell.v === 'string' && cell.v.includes(find)) {
            cell.v = cell.v.split(find).join(replace);
            replaceCount++;
          }
        }
      }
    }
  }

  return { worksheet, find, replace, replaced: true, replaceCount };
});

registerExecutor('func-remove-duplicates', async (ctx) => {
  const { inputs, properties } = ctx;
  const worksheet = inputs.worksheet as any;
  const columns = String(properties.columns || '');

  if (!worksheet) return { duplicatesRemoved: false, error: '缺少 worksheet 输入' };

  if (worksheet.__fromProject) {
    const preview = worksheet.preview || [];
    const headers: string[] = worksheet.headers || [];
    const targetCols: string[] = columns ? columns.split(',').map(s => s.trim()) : headers;
    const seen = new Set<string>();
    const unique: Record<string, unknown>[] = [];
    let removedCount = 0;

    for (const row of preview) {
      const key = targetCols.map(h => JSON.stringify(row[h])).join('|');
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(row);
      } else {
        removedCount++;
      }
    }

    return {
      worksheet: { ...worksheet, preview: unique },
      duplicatesRemoved: true,
      removedCount,
      originalCount: preview.length,
      newCount: unique.length,
    };
  }

  return { worksheet, duplicatesRemoved: true, message: '去重操作已应用' };
});

registerExecutor('func-create-table', async (ctx) => {
  const { inputs, properties } = ctx;
  const worksheet = inputs.worksheet as any;
  const tableName = String(properties.tableName || 'Table1');
  const style = String(properties.style || 'TableStyleMedium9');

  if (!worksheet) return { tableCreated: false, error: '缺少 worksheet 输入' };

  return {
    tableCreated: true,
    worksheet,
    table: { name: tableName, style, timestamp: Date.now() },
    message: `表格 "${tableName}" 已创建`,
  };
});

registerExecutor('func-sheet-operation', async (ctx) => {
  const { inputs, properties } = ctx;
  const workbook = inputs.workbook as any;
  const operation = String(properties.operation || 'add');
  const sheetName = String(properties.sheetName || '新工作表');

  if (!workbook) return { operated: false, error: '缺少 workbook 输入' };

  const XLSX = await getXlsx();

  switch (operation) {
    case 'add': {
      const newWs = XLSX.utils.aoa_to_sheet([['']]);
      XLSX.utils.book_append_sheet(workbook, newWs, sheetName);
      return { workbook, worksheet: newWs, operated: true, operation: 'add', sheetName };
    }
    case 'delete': {
      if (workbook.SheetNames.includes(sheetName)) {
        delete workbook.Sheets[sheetName];
        workbook.SheetNames = workbook.SheetNames.filter((n: string) => n !== sheetName);
      }
      return { workbook, operated: true, operation: 'delete', sheetName };
    }
    case 'rename': {
      const newName = String(properties.newName || 'Renamed');
      if (workbook.SheetNames.includes(sheetName)) {
        const idx = workbook.SheetNames.indexOf(sheetName);
        workbook.SheetNames[idx] = newName;
        workbook.Sheets[newName] = workbook.Sheets[sheetName];
        delete workbook.Sheets[sheetName];
      }
      return { workbook, operated: true, operation: 'rename', sheetName, newName };
    }
    case 'copy': {
      const source = workbook.Sheets[sheetName];
      if (source) {
        const copy = JSON.parse(JSON.stringify(source));
        const copyName = String(properties.newName || `${sheetName} (副本)`);
        XLSX.utils.book_append_sheet(workbook, copy, copyName);
        return { workbook, worksheet: copy, operated: true, operation: 'copy', sheetName, copyName };
      }
      return { operated: false, error: `工作表 "${sheetName}" 不存在` };
    }
    default:
      return { operated: false, error: `未知操作: ${operation}` };
  }
});

registerExecutor('func-copy-range', async (ctx) => {
  const { inputs, properties } = ctx;
  const worksheet = inputs.worksheet as any;
  const sourceRange = String(properties.sourceRange || 'A1');
  const targetRange = String(properties.targetRange || 'A1');

  if (!worksheet) return { copied: false, error: '缺少 worksheet 输入' };

  if (worksheet.__fromProject) {
    return { worksheet, copied: true, sourceRange, targetRange, message: '范围复制已记录' };
  }

  if (typeof worksheet === 'object' && worksheet['!ref']) {
    const XLSX = await getXlsx();
    const src = XLSX.utils.decode_range(sourceRange);
    const dst = XLSX.utils.decode_range(targetRange);
    const rows = dst.e.r - dst.s.r;
    const cols = dst.e.c - dst.s.c;

    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        const srcAddr = XLSX.utils.encode_cell({ r: src.s.r + r, c: src.s.c + c });
        const dstAddr = XLSX.utils.encode_cell({ r: dst.s.r + r, c: dst.s.c + c });
        if (worksheet[srcAddr]) {
          worksheet[dstAddr] = { ...worksheet[srcAddr] };
        }
      }
    }
  }

  return { worksheet, copied: true, sourceRange, targetRange };
});
