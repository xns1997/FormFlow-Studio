#!/usr/bin/env python3
"""为所有 schema.json 添加 keywords 字段"""
import json
import os
import glob

NODES_DIR = os.path.join(os.path.dirname(__file__), '..', 'nodes')

# 关键词映射规则
KEYWORD_MAP = {
    # 通用节点
    'generic-file-picker': ['文件', '上传', '选择', 'file', 'upload', 'pick'],
    'generic-worksheet-select': ['工作表', 'sheet', '选择', 'worksheet', 'select'],
    'generic-range-select': ['区域', '范围', '选择', 'range', 'select', 'area'],
    'generic-variable-input': ['变量', '输入', 'variable', 'input'],
    'generic-text-input': ['文本', '输入', 'string', 'text', 'input'],
    'generic-number-input': ['数字', '输入', 'number', 'input'],
    'generic-boolean-switch': ['布尔', '开关', 'boolean', 'switch', 'toggle'],
    'generic-output-display': ['输出', '显示', 'output', 'display'],
    
    # 导出节点
    'generic-export-excel': ['导出', 'excel', 'xlsx', '下载', 'export', 'download'],
    'generic-export-csv': ['导出', 'csv', '下载', 'export', 'download'],
    'generic-export-json': ['导出', 'json', '下载', 'export', 'download'],
    'generic-export-html': ['导出', 'html', '下载', 'export', 'download'],
    'generic-display-table': ['表格', '显示', '分页', 'table', 'display', 'paginated'],
    'generic-display-stats': ['统计', '信息', 'stats', 'statistics', 'info'],
    
    # 聚合节点
    'generic-merge': ['合并', 'join', '关联', 'merge', 'inner', 'left', 'right', 'outer'],
    'generic-append': ['追加', '合并', '堆叠', 'union', 'append', 'concat'],
    'generic-group-by': ['分组', '聚合', 'group', 'aggregate', 'sum', 'avg', 'count'],
    'generic-pivot': ['透视', '行转列', 'pivot', 'cross', 'table'],
    'generic-unpivot': ['逆透视', '列转行', 'unpivot', 'melt', 'long'],
    'generic-compare': ['比较', '差异', 'compare', 'diff', 'match'],
    'generic-sample': ['采样', '随机', 'sample', 'random'],
    
    # 清洗节点
    'generic-type-cast': ['类型', '转换', 'cast', 'convert', 'type'],
    'generic-handle-missing': ['空值', '缺失', '填充', 'missing', 'null', 'fill', 'na'],
    'generic-string-manip': ['字符串', '处理', 'string', 'manipulation', 'trim', 'upper', 'lower'],
    'generic-date-time': ['日期', '时间', 'date', 'time', 'add', 'extract'],
    'generic-regex-extract': ['正则', '提取', 'regex', 'extract', 'pattern', 'match'],
    'generic-rename-columns': ['重命名', '字段', 'rename', 'columns'],
    'generic-flatten': ['展平', '嵌套', 'flatten', 'nested', 'json'],
    'generic-hash': ['哈希', '加密', 'hash', 'md5', 'sha'],
    'generic-encode': ['编码', '解码', 'encode', 'decode', 'base64', 'url'],
    
    # 校验节点
    'generic-validate-json': ['校验', 'json', 'validate', 'schema'],
    'generic-validate-xml': ['校验', 'xml', 'validate', 'xsd'],
    'generic-validate-csv': ['校验', 'csv', 'validate'],
    'generic-unique-check': ['唯一', '检查', 'unique', 'check', 'duplicate'],
    'generic-range-check': ['范围', '检查', 'range', 'check', 'bound'],
    
    # 集成节点
    'generic-database-query': ['数据库', '查询', 'sql', 'database', 'query'],
    'generic-websocket': ['websocket', '实时', '通信', 'realtime'],
    'generic-pdf-report': ['pdf', '报告', 'report'],
    'generic-email-send': ['邮件', '发送', 'email', 'send', 'smtp'],
    
    # ML 预处理
    'ml-normalize': ['归一化', '标准化', 'min-max', 'normalize', 'scaling'],
    'ml-standardize': ['标准化', 'z-score', 'standardize', 'zscore'],
    'ml-onehot-encode': ['独热', '编码', 'onehot', 'one-hot', 'dummy', 'encoding'],
    'ml-label-encode': ['标签', '编码', 'label', 'encoding', 'factorize'],
    'ml-pca': ['降维', '主成分', 'pca', 'dimensionality', 'reduction'],
    'ml-feature-select': ['特征', '选择', 'feature', 'selection', 'variance'],
    
    # ML 分析
    'ml-descriptive-stats': ['描述', '统计', 'describe', 'stats', 'mean', 'median'],
    'ml-correlation': ['相关', '系数', '矩阵', 'correlation', 'matrix', 'pearson'],
    'ml-linear-regression': ['线性', '回归', 'linear', 'regression', 'predict'],
    'ml-hypothesis-test': ['假设', '检验', 't检验', '卡方', 'hypothesis', 'test', 'p-value'],
    'ml-time-series': ['时间', '序列', '趋势', 'time', 'series', 'trend', 'moving'],
    
    # ML 挖掘
    'ml-kmeans': ['聚类', 'kmeans', 'k-means', 'cluster', 'unsupervised'],
    'ml-knn': ['分类', '近邻', 'knn', 'k-nearest', 'neighbor', 'classify'],
    'ml-decision-tree': ['决策', '树', 'decision', 'tree', 'classify'],
    'ml-random-forest': ['随机', '森林', 'random', 'forest', 'ensemble'],
    'ml-naive-bayes': ['朴素', '贝叶斯', 'naive', 'bayes', 'probability'],
    'ml-svm': ['支持向量', 'svm', 'support', 'vector', 'kernel'],
    'ml-anomaly-detect': ['异常', '检测', '离群', 'anomaly', 'outlier', 'isolation'],
}

# 行为节点关键词
BEHAVIOR_KEYWORDS = {
    'behavior-on-form-load': ['表单', '加载', 'form', 'load', 'init'],
    'behavior-on-field-change': ['字段', '变化', '监听', 'field', 'change', 'watch'],
    'behavior-on-submit': ['提交', 'submit'],
    'behavior-on-validate': ['校验', 'validate'],
    'behavior-on-button-click': ['按钮', '点击', 'button', 'click'],
    'behavior-on-row-load': ['行', '加载', 'row', 'load'],
    'behavior-condition': ['条件', '判断', 'condition', 'if', 'switch'],
    'behavior-set-value': ['赋值', '设置', 'set', 'value', 'assign'],
    'behavior-set-visible': ['显示', '隐藏', 'visible', 'show', 'hide'],
    'behavior-set-disabled': ['禁用', '启用', 'disabled', 'enable'],
    'behavior-set-required': ['必填', 'required'],
    'behavior-calculate': ['计算', '表达式', 'calculate', 'expression'],
    'behavior-show-message': ['消息', '提示', 'message', 'toast', 'alert'],
    'behavior-validate': ['校验', 'validate', 'check'],
    'behavior-submit': ['提交', 'submit'],
    'behavior-api-request': ['api', '请求', 'http', 'request', 'fetch'],
    'behavior-js-script': ['脚本', 'javascript', 'script', 'code'],
    'behavior-loop': ['循环', '遍历', 'loop', 'iterate', 'each'],
    'behavior-data-query': ['查询', '数据', 'query', 'data', 'filter'],
    'behavior-switch-tab': ['切换', '标签', 'tab', 'switch'],
    'behavior-refresh-data': ['刷新', '数据', 'refresh', 'reload'],
    'behavior-log': ['日志', '记录', 'log', 'debug'],
    'behavior-delay': ['延时', '延迟', 'delay', 'wait', 'sleep'],
    'behavior-clear-field': ['清空', '字段', 'clear', 'reset'],
    'behavior-stop': ['停止', '终止', 'stop', 'abort', 'halt'],
    'behavior-filter-data': ['筛选', '过滤', 'filter', 'where'],
    'behavior-sort-data': ['排序', 'sort', 'order'],
    'behavior-set-default': ['默认', '值', 'default'],
}

# Func 节点关键词
FUNC_KEYWORDS = {
    'func-range-select': ['区域', '选择', 'range', 'select'],
    'func-column-bind': ['绑定', '字段', 'column', 'bind', 'field'],
    'func-row-navigator': ['导航', '行', 'row', 'navigate', 'prev', 'next'],
    'func-form-validate': ['表单', '校验', 'form', 'validate'],
    'func-form-submit': ['表单', '提交', 'form', 'submit'],
    'func-select-input': ['下拉', '选择', 'select', 'dropdown'],
    'func-radio-input': ['单选', 'radio'],
    'func-checkbox-input': ['多选', '复选', 'checkbox'],
    'func-date-input': ['日期', '选择', 'date', 'picker'],
    'func-switch-input': ['开关', '切换', 'switch', 'toggle'],
    'func-rating-input': ['评分', '星级', 'rating', 'star'],
    'func-style': ['样式', '格式', 'style', 'format'],
    'func-apply-style': ['应用', '样式', 'apply', 'style'],
    'func-conditional-format': ['条件', '格式', 'conditional', 'format'],
    'func-data-validation': ['数据', '校验', 'validation'],
    'func-add-comment': ['批注', '注释', 'comment', 'note'],
    'func-named-item': ['命名', '项', 'named', 'item'],
    'func-protect-sheet': ['保护', '工作表', 'protect', 'sheet'],
    'func-protect-workbook': ['保护', '工作簿', 'protect', 'workbook'],
    'func-create-chart': ['图表', '创建', 'chart', 'create'],
    'func-merge-cells': ['合并', '单元格', 'merge', 'cell'],
    'func-find-replace': ['查找', '替换', 'find', 'replace'],
    'func-remove-duplicates': ['去重', '重复', 'remove', 'duplicate'],
    'func-create-table': ['创建', '表格', 'create', 'table'],
    'func-sort-table': ['排序', '表格', 'sort', 'table'],
    'func-filter-table': ['筛选', '表格', 'filter', 'table'],
    'func-export-sheet': ['导出', '工作表', 'export', 'sheet'],
    'func-copy-range': ['复制', '区域', 'copy', 'range'],
    'func-sheet-operation': ['工作表', '操作', 'sheet', 'operation'],
    'func-modify-range': ['修改', '区域', 'modify', 'range'],
}

def add_keywords_to_schema(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        schema = json.load(f)
    
    node_id = schema.get('id', '')
    
    # 如果已有 keywords，跳过
    if 'keywords' in schema:
        return False
    
    # 从映射中获取关键词
    keywords = KEYWORD_MAP.get(node_id, [])
    if not keywords:
        keywords = BEHAVIOR_KEYWORDS.get(node_id, [])
    if not keywords:
        keywords = FUNC_KEYWORDS.get(node_id, [])
    
    # 如果没有映射，从 label 和 description 自动生成
    if not keywords:
        label = schema.get('label', '')
        desc = schema.get('description', '')
        # 提取中文和英文关键词
        import re
        cn_words = re.findall(r'[\u4e00-\u9fff]+', label + desc)
        en_words = re.findall(r'[a-zA-Z]+', label + desc.lower())
        keywords = list(set(cn_words + en_words))[:8]
    
    schema['keywords'] = keywords
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(schema, f, ensure_ascii=False, indent=2)
    
    return True

def main():
    count = 0
    for filepath in glob.glob(os.path.join(NODES_DIR, '*', 'schema.json')):
        if add_keywords_to_schema(filepath):
            count += 1
    print(f'已为 {count} 个节点添加 keywords')

if __name__ == '__main__':
    main()
