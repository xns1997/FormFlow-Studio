## 节点列表

| 节点 | 类型 | 说明 |
|------|------|------|
| 读取 Excel 并生成字段模型 | scenario | 封装读取工作簿、取 Sheet、转换 JSON、推断字段类型的常用数据接入链路 |
| JSON 表单结果导出 Excel | scenario | 封装 JSON 行数据生成 Sheet、创建工作簿、追加 Sheet、写出文件的导出链路 |
| 追加明细行到 Sheet | scenario | 封装向既有 Sheet 追加 JSON 或二维数组明细，并重新计算输出范围 |
| Sheet 多格式预览 | scenario | 封装 Sheet 到 JSON、CSV、HTML 的预览输出方法 |
| 单元格地址工具包 | scenario | 封装单元格、列、行、范围的编码和解码操作 |

## 使用场景

> [!TIP]
> 场景模板节点适合快速搭建常见的 Excel 处理流程，无需手动连接多个底层节点。

1. **数据导入**：快速读取 Excel 文件并生成字段模型
2. **数据导出**：将表单数据导出为 Excel 文件
3. **数据预览**：将工作表数据转换为 JSON/CSV 格式查看
4. **批量操作**：向现有 Excel 文件追加新数据

## 端口定义

### 读取 Excel 并生成字段模型

**输入端口：**

| 端口名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| file | File / ArrayBuffer | ✅ | Excel 文件对象或二进制数据 |
| sheetName | string | ❌ | 工作表名称，默认取第一个 Sheet |
| headerRow | number | ❌ | 表头行号，默认为 0 |

**输出端口：**

| 端口名 | 类型 | 说明 |
|--------|------|------|
| fields | FieldModel[] | 推断出的字段模型数组 |
| rows | Record<string, unknown>[] | 转换后的 JSON 行数据 |
| sheetNames | string[] | 工作簿中所有 Sheet 名称 |

### JSON 表单结果导出 Excel

**输入端口：**

| 端口名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| rows | Record<string, unknown>[] | ✅ | 要导出的 JSON 行数据 |
| sheetName | string | ❌ | 目标工作表名称，默认 "Sheet1" |
| filename | string | ❌ | 导出文件名，默认 "export.xlsx" |

**输出端口：**

| 端口名 | 类型 | 说明 |
|--------|------|------|
| workbook | Workbook | 生成的工作簿对象 |
| blob | Blob | 可下载的文件 Blob |

## 代码示例

```typescript
// 典型的数据导入流程
const fileSource = nodes.fileSource({ accept: '.xlsx,.xls' });
const scenario = nodes.readExcelAndGenerateFields({
  file: fileSource.outputs.file,
  sheetName: '数据表',
  headerRow: 0,
});

// 使用输出的字段模型
console.log(scenario.outputs.fields);
console.log(scenario.outputs.rows.slice(0, 5));
```

## 连接模式

```flow-preview scenario-read-excel
```

## 注意事项

> [!WARNING]
> 场景模板节点内部封装了多个操作步骤，如果其中某一步失败，整个节点会回滚到初始状态。

- 场景模板节点不可拆解，如需自定义中间步骤，请使用对应的底层节点手动编排
- 读取 Excel 时，文件大小建议不超过 50MB，超大文件可能导致内存不足
- 导出 Excel 时，单个 Sheet 最多支持 1,048,576 行
