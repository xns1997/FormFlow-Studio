# 表单控件 Schema 与填表交互优化 TODO

> 审查范围：`ui/src/designer/controls/` 中全部 26 个已注册控件及其 `propSchema`、运行态渲染和属性编辑器（原审查清单漏列了 `slider`）。
>
> 目标：让设计者用业务语言完成配置，让填表者少输入、少判断、少返工；不改变现有控件 ID、模板包格式、操作模板 Schema、revision/幂等协议。

## 结论摘要

当前控件功能覆盖很全，但 schema 偏“工程配置面板”，不够像“表单设计助手”。主要摩擦来自：

- 每个控件都暴露 `字段名`、`数据绑定`、颜色、字号和低层校验，用户必须理解内部模型才能开始。
- `必填 / 只读 / 禁用 / 可见条件 / 必填条件 / 禁用条件` 分散在不同组，容易配置出互相矛盾的状态。
- 日期、选项、上传和复杂校验使用对象/JSON 向导，但摘要和错误提示仍偏技术，用户看不出运行态会发生什么。
- 默认值、动态选项、联动清理、失败恢复没有形成“预览—解释—修复”的闭环。
- 视觉展示控件与真正的填表控件共用相似 schema，增加了属性面板噪音。

设计原则：默认安全、渐进披露、能猜就不问、先解释再报错、配置结果可直接在运行态预览。参考 Apple HIG 的 Entering Data、Accessibility、Writing、Layout 与 Focus/Keyboard 原则：预填合理默认值、优先选择而非输入、动态校验、错误靠近字段、支持键盘完成主流程、不要只依赖颜色表达状态。

## P0：先降低配置和填表痛苦

### P0.1 重做 schema 分层与默认显示

- [x] 将属性面板固定为三层：`快速设置`（标签、字段、默认值、必填）、`行为`（校验、联动、提交行为）、`外观`（尺寸、颜色、字体）。（证据：`PropertyPanel.tsx` 使用功能/样式任务导航；`propertyMenuModel.ts` 统一映射分组。）
- [x] `数据绑定`、表达式、JSON 源码、颜色/字号/圆角等移入“高级设置”，默认折叠；只有控件确实支持该能力时才显示。（证据：`PropertySectionList.tsx` 的 `isAdvancedDefinition`、`showAdvanced`；`configuration-navigation.css` 的高级设置入口。）
- [x] 仅在需要时显示 `字段名`：展示/容器/按钮默认隐藏；新建输入控件自动从标签生成稳定字段名，并提供“修改字段名”入口。（证据：`useDesignerActions.ts` 的 `createReadableFieldName`；`useDesignerActions.test.ts` 覆盖中文标签、冲突后缀和空标签。）
- [x] 将 `readonly`、`disabled` 改为用户语言：`允许编辑`、`暂不可用`。（证据：`controls/input.tsx`、`controls/select.tsx` 的属性面板标签与帮助文案。）
- [x] 只读与禁用同时开启时给出就地解释，避免用户不清楚字段为何不可编辑。（证据：`propertyMenuModel.ts` 诊断“只读和禁用效果重复”；`propertyMenuModel.test.ts` 覆盖警告。）
- [x] 将 `requiredExpression`、`visibleExpression`、`disabledExpression` 收拢为一个“显示与填写条件”向导，提供“始终 / 满足条件时”两种入口和自然语言摘要。（证据：`controls/input.tsx` 注册 `displayConditions` Composite；`LogicPropertyEditors.tsx` 的 `DisplayConditionsVisual` 提供三行“始终/满足条件时”入口、依赖摘要与表达式校验；`VisualPropertyEditor.tsx`、`PropertyEditorField.tsx` 已注册 `display-conditions`。）
- [x] 对所有 schema 字段补齐 `help`、示例、单位和默认值说明；避免仅展示内部 key 或 `JSON`、`DSL` 等术语。（证据：`PropertySectionList.tsx` 的 `withReadableHelp` 为每个可见属性提供用户语言帮助、字符串示例占位符、敏感字段保护、数字单位说明和默认行为说明；复杂配置提供可视化编辑器帮助；`schemaUxLint.test.ts` 断言 26 个控件的全部可见属性均有可读帮助。）
- [x] 复杂编辑器保存前显示影响摘要、关联字段和“可以应用/需要修正”；配置不完整时阻止应用并显示修复错误。（证据：`ComplexPropertyEditor.tsx` 的 `property-impact-summary`、校验状态和应用门禁。）

### P0.2 统一字段状态和错误模型

- [x] 所有输入控件统一支持：空值、默认值、必填、只读、禁用、校验中、错误、警告、成功；状态同时使用文字/图标和颜色。（证据：`FormRenderer.tsx` 统一渲染“未填写/检查中/暂不可用/仅查看/自动带出/上次输入/选项加载中/成功/错误”等文字与图标状态，错误节点使用 `role=alert`，控件使用 `aria-busy`；`components-form.css` 为警告状态提供独立视觉样式。）
- [x] 必填错误显示在字段下方，提交失败自动滚动并聚焦首个错误。（证据：`FormRenderer.tsx` 的 `validateBeforeSubmit` 使用 `data-field-name` 定位、滚动和聚焦；错误节点带 `role="alert"`。）
- [x] 正则校验缺少自定义文案时使用占位示例生成修复提示。（证据：`validator.ts`；`validator.compat.test.ts` 断言“格式应类似”。）
- [x] `customMessage`、`patternMessage`、各向导内部提示合并为一个“错误提示”入口，并提供默认模板（如“请输入 6–20 个字符”）。（证据：输入/数字/日期/选择控件统一显示 `错误提示`；`patternMessage` 降为高级兼容项并说明优先使用统一入口。）
- [x] 校验触发方式可选但有默认值：输入中仅做轻量提示，失焦做完整校验，提交再次校验；避免用户刚输入一个字符就被红色打断。（证据：`PropertyEditorField.tsx` 的 `useCommittedDraft` 仅在失焦/Enter 提交校验；`propertyMenuModel.ts` 忽略非必填空值。）
- [x] 规则有依赖关系时，在字段旁显示简短说明，例如“结束日期不能早于开始日期”“此项由上一步自动计算”。（证据：`validator.ts` 的跨字段 compare 默认提示包含对比字段名；日期范围控件在失效区间策略中就地说明清理原因；`FormRenderer` 将错误紧邻字段渲染。）
- [x] 表单提交失败保留全部已填值、滚动到首个错误，不清空整表；网络/服务失败提供“重试”且不重复创建。（证据：`FormRenderer`/`PreviewCanvas` 保留值、聚焦首个错误并提供就地“重试”；`flowEngine.test.ts` 验证相同幂等键不会重放副作用；`server/src/mcp-server.test.ts` 通过 HTTP 工具入口两次提交同一幂等键，断言返回结果一致且项目名称未被覆盖。）

### P0.3 统一字段命名、占位和帮助

- [x] `label` 是用户看到的业务名称，`name` 是系统字段；属性面板默认同时显示“显示名称”和“保存字段（高级）”，不要把内部字段名放在基础区。（证据：`PropertySectionList.tsx` 将所有 `name` 属性统一视为高级设置；标签仍保留在基础区，搜索时仍可定位保存字段。）
- [x] 占位符改为输入示例而非重复标签，例如“如：13800138000”；敏感字段禁止把真实数据写进示例。（证据：`PropertySectionList.tsx` 的 `withReadableHelp` 为缺少占位符的字符串属性生成业务示例，手机号/邮箱使用格式样例，密码/身份证/密钥等敏感字段明确提示“不要粘贴真实敏感信息”；既有输入控件保留专用占位符。）
- [x] 需要格式的字段显示格式提示、可复制示例和剩余字数；桌面端字段被截断时提供完整值提示。（证据：`FormRenderer.tsx` 为邮箱、手机号、身份证、网址、编号显示格式示例并提供安全的“复制示例”，字段长值通过 `title` 提供完整值提示；文本/多行文本沿用最大长度计数。）
- [x] 所有键盘可达控件补齐可读的 label、状态和快捷键；Tab 顺序按视觉/业务顺序，弹窗关闭后焦点回到触发控件。（证据：`FormRenderer` 为字段/错误/状态提供可读名称与 `aria-keyshortcuts`，Modal 实现 Escape、焦点陷阱和关闭后恢复；`ui/e2e/control-depth-matrix.spec.ts` 对 26 个注册控件逐一执行聚焦 + Enter 添加并断言属性配置面板可达。）

## P0：逐控件整改清单

### 文本输入、数字、日期

- [x] `input`：增加“输入类型”预设（普通文本、邮箱、手机号、身份证号、网址、编号），选择后自动生成校验规则和键盘输入模式，同时保留旧 `validator/pattern` 兼容。（证据：`controls/input.tsx` 的 `inputKind` schema、`validator.ts` 的推断规则、`AntdFormControls.tsx` 的 `inputMode`。）
- [x] `input`：补充自动全选/清除、粘贴规范化、大小写/空格规范化和自定义编号模板。（证据：`controls/input.tsx` 与 `FormRenderer.tsx` 支持聚焦全选、清除、首尾空格/大小写规范化；编号模板提供“生成编号”按钮，`generateCodeFromTemplate` 支持日期占位符和按字段/模板持久化递增序号。）
- [x] `textarea`：默认按内容增长，`rows` 只作为最小高度。（证据：`controls/input.tsx` 默认 `autoResize: true`，运行态使用 `minRows/maxRows`。）
- [x] `textarea`：配置最大字数后自动显示剩余字数，接近上限时由控件提示。（证据：`controls/input.tsx` 将 `showCount` 与 `maxLength` 联动。）
- [x] `textarea`：支持 `Ctrl/Cmd+Enter` 提交或换行策略说明。（证据：`AntdTextAreaInput` 暴露 `onKeyDown`；textarea 运行态以 Ctrl/Cmd+Enter 触发 `onSubmit`，普通 Enter 保持换行。）
- [x] `number`：将 `integer`、`positive`、`step`、`precision`、最小/最大值合并为“数值范围”向导，自动显示单位和示例；修复精度超过步长、默认值越界等矛盾。（证据：`CompositeVisual` 的 `number-range` 集中编辑范围/步长/精度/整数/正数，自动将无效步长回退为 1、按步长修正精度、正数模式抬高下限；说明中展示单位来源与示例；`schemaUxLint.ts` 检查数字默认值越界。）
- [x] `number`：属性编辑器将无效或为 0 的步长安全回退为 1，避免出现不可递增的数字输入。（证据：`PropertyEditorField.tsx` 的 `NumberEditor`。）
- [x] `number`：支持前缀/后缀展示且保存原始数值，schema 明确标注“仅显示”。（证据：`controls/input.tsx` 传入 `AntdNumberInput` 的 prefix/suffix，字段标签与 help 明确不会写入数据。）
- [x] `datePicker` / `timePicker`：展示格式和存储格式降为高级配置，常用用户只需选择默认日期/时间格式。（证据：`controls/input.tsx` 将 display/storage schema 标记为 `level: 'advanced'`，运行态仍保持兼容。）
- [x] `datePicker` / `timePicker`：增加“用户看到 / 系统保存”高层预设并明确时区。（证据：控件 schema 提供用户看到的格式、系统保存格式和设备/UTC/中国标准时间选择；`controlTypes.ts` 的 `encodeDateTimeForStorage`/`decodeDateTimeForDisplay` 完成显式时区的 UTC 存储往返，`controlTypes.test.ts` 覆盖中国标准时间示例。）
- [x] 日期默认/约束摘要改成可读中文，并在无默认值时显示“不预填”而非技术词。（证据：`services/data/dateConvenience.ts` 的 `describeDateDefaultSource`；`dateConvenience.test.ts` 覆盖今天、偏移、跟随字段和空态。）
- [x] 日期约束向导支持“今天起、最近 30 天、某字段之后”等快捷预设，并在预览中展示实际可选范围。（证据：`DateConstraintConfigVisual` 增加“今天起/最近 30 天”快捷按钮；下方边界来源支持“另一字段/另一字段 ± 偏移”；`DatePickerPreview`、`dateRange` 预览显示实际约束摘要。）
- [x] `dateRange`：使用开始/结束组合字段，保留失效区间自动清理策略，并提供本周、近 30 天、本月快捷范围与清空按钮。（证据：`controls/input.tsx` 的 `AntdDateRangeInput`、快捷范围按钮；`AntdDateRangeInput` 原生 `allowClear`。）
- [x] `dateRange`：明确含结束日、空起点/空终点和失效清理语义；跨日仍按日期控件默认允许。（证据：`controls/input.tsx` 起止占位符标注“含当天”，失效范围处理 help 说明清空整段并提示。）
- [x] `dateRange`：跨字段绑定时显示双方字段名而不是内部配置对象。（证据：`CompositeVisual` 的 `date-range` 编辑器读取新旧绑定结构并显示“开始字段/结束字段”摘要；`controls/input.tsx` 与运行态保留同一中文摘要。）

### 选择、开关、评分、标签

- [x] `select`：根据选项数量自动选择控件：≤5 项用单选，6–15 项用下拉，更多时启用搜索；不要让设计者手动猜组件类型。（证据：`controls/select.tsx` ≤5 个单选列表，超过 5 个自动下拉，超过 5 个或多选开启搜索，并在字段旁解释控件选择。）
- [x] `select`：选项超过 5 项或开启多选时自动启用搜索，并提供清空入口。（证据：`controls/select.tsx` 将 `showSearch` 与选项数量/多选联动，`allowClear` 默认开启。）
- [x] `select`：将“选项来源 → 字段映射 → 联动行为”做成三步向导；动态来源预览前 5 项、加载中、无匹配、权限失败均有明确下一步。（证据：`OptionSourceVisual` 提供带 `aria-current=step` 的三步导航与每步下一步说明，动态预览限制前 5 项；`OptionAdvancedVisual` 显示加载/无候选策略；来源诊断对权限失败给出申请权限或重新选择入口。）
- [x] `select`：无候选项时在字段附近给出“检查数据来源或筛选条件”的下一步提示，不只依赖下拉菜单空态。（证据：`controls/select.tsx` 的 `role="status"` 空态文案。）
- [x] `select`：把 `emptyOptionsBehavior` 的“保持可用”改为“没有可选项时允许继续 / 禁止继续”；联动清理前给出“已清除 2 个失效选择”的可见反馈。（证据：`OptionAdvancedVisual` 提供“允许继续填写/禁止继续填写”；运行态无选项时禁用并说明下一步，检测到联动失效值时显示已清除数量。）
- [x] `select` 多选增加最大选择数、清空入口和键盘删除；长选项支持搜索。（证据：`controls/select.tsx` 新增 `maxSelect` schema，运行态截断超额选择，`AntdSelectInput` 启用搜索/清空。）
- [x] `select` 多选增加全选和紧凑已选摘要。（证据：`AntdSelectInput` 支持响应式紧凑标签；下拉多选运行态增加“全选可见选项”，并遵守 `maxSelect` 上限。）
- [x] `segmented`：限制在 2–5 个短选项；超出时提示改用单选/下拉，避免窄窗口溢出；显示当前选项文字，不只靠颜色。（证据：`controls/select.tsx` 在选项超过 5 个或总文字过长时切换可搜索下拉，并以 `role=status` 解释原因；Ant Design 控件保留当前选项文字。）
- [x] `radio` / `checkbox`：选项编辑器提供拖拽排序、复制、批量粘贴和重复值检查。（证据：`OptionsVisual` 支持拖拽/上下移动、逐行复制、批量粘贴与 CSV 导入、重复值/空值校验。）
- [x] `radio`：选项超过 5 项或文字总长过长时自动改为纵向，并就地说明原因。（证据：`controls/select.tsx` 的 `horizontalAllowed` 和状态提示。）
- [x] `checkbox`：运行态实时显示已选数量及最少/最多选择要求，超出范围时就地标红。（证据：`controls/select.tsx` 的 `role="status"` 计数提示；统一 validator 已支持 `minSelect/maxSelect`。）
- [x] `checkbox`：实时显示还需选择几项。（证据：`controls/select.tsx` 多选计数状态文案。）
- [x] `checkbox`：提交时聚焦首个未满足选项组。（证据：`FormRenderer.tsx` 为每个控件输出 `data-field-name`，提交校验按错误字段顺序滚动并聚焦首个错误，覆盖复选组选项组。）
- [x] `switch`：默认值不要默认开启，除非业务明确安全；显示“开启/关闭”文字或可访问名称，提供“开启后会发生什么”的说明；需要必填确认时改用复选框。（证据：`controls/input.tsx` 默认关闭，新增 `onText/offText`，运行态同步显示文字；schema help 解释默认安全策略。）
- [x] `rating`：默认值改为空或业务明确值，避免默认 3 星造成误提交；显示端点含义（不满意/非常满意），明确是否允许 0 分、半星和键盘操作。（证据：`controls/input.tsx` 默认 0，新增最低/最高分说明，未评分显示“未评分”。）
- [x] `rating`：提交时 0 分按空值处理，必填评分不会误通过。（证据：`validator.ts` 的 `isEmptyForComponent`；`validator.compat.test.ts` 覆盖 0/1 分。）
- [x] `rating`：补齐半星文案和自定义键盘提示。（证据：评分运行态显示“支持半星/整星；可用方向键调整”，评分容器带当前分值可读名称；`allowHalf` 控制半星语义。）
- [x] `tagInput`：增加最大标签数、单标签长度、重复标签策略。（证据：`controls/input.tsx` 新增 `maxTags/maxTagLength/allowDuplicates` schema，并在运行态归一化重复、超量和超长标签。）
- [x] `tagInput`：支持逗号、中文逗号、分号、换行和 Tab 粘贴批量解析。（证据：`AntdFormControls.tsx` 的 `tokenSeparators`。）
- [x] `tagInput`：输入非法标签时保留原文并就地说明，不静默丢弃。（证据：`TagInputPreview` 检测超长/超量标签，保留原始输入并在字段下方以 `role=alert` 说明修复方式。）

### 文件、图片、按钮

- [x] `upload` / `imageUpload`：将 `accept` 从 MIME/扩展名字符串改为可读的文件类型选择器；显示大小、数量、尺寸限制和示例，明确 `0=不限`。（证据：`StylePropertyEditors.tsx` 提供图片/文档/表格类型预设、当前限制可读标签和自定义类型说明。）
- [x] 上传支持拖放、删除/替换，并在运行态逐文件显示已选择或失败状态。（证据：`AntdUploadInput` 使用 `Upload.Dragger` 和文件列表；`controls/input.tsx` 的 `designer-upload-status`。）
- [x] 上传补充粘贴、取消和显式重试按钮；失败文件提供独立重试动作。（证据：`AntdUploadInput` 监听剪贴板文件并逐文件校验；`UploadPreview` 对 uploading/error 文件显示独立“取消/重试”按钮，失败状态保留在字段附近。）
- [x] 图片上传提供缩略图、旋转/裁剪（可选）、替代文本和隐私提示；尺寸不符时说明当前尺寸与要求。（证据：图片上传使用 Ant Design 缩略图/预览，新增“预览旋转”0/90/180/270°（只影响预览、不改原文件）、替代文本与隐私提示；尺寸校验失败会提示当前像素尺寸与要求。）
- [x] `button`：增加提交、保存、查询、重置、取消动作预设；手动 loading 降入高级设置并提示应由异步行为驱动。（证据：`controls/input.tsx` 的 `action` schema 与 loading 高级配置。）
- [x] `button`：危险样式必须绑定破坏性动作并要求确认；`icon` 选择器改为图标库+含义，避免依赖 emoji 字符和平台字体差异。（证据：`controls/input.tsx` 将删除作为显式危险动作选项，危险样式默认开启确认并在点击前阻断；`PropertyEditorField.tsx` 的图标选择器使用语义化图标名与含义，并保留旧字符兼容。）
- [x] 所有主按钮的文案使用结果导向词（保存、提交、查询、上传），避免“确定”“执行”这类无上下文词；避免同一表单出现两个同等级主操作。（证据：`controls/input.tsx` 按 action 生成提交/保存/查询/重置/取消等结果导向文案，并替换“确定/执行”；`FormRenderer.tsx` 检测同一表单多个主操作并就地提示只保留一个。）

### 展示、表格、图表与容器

- [x] 将展示控件与录入控件分到不同的工具箱分类（“展示”显示为“内容与结果”），避免用户在录入面板中寻找结果组件。（证据：`Toolbox.tsx` 的 `CATEGORY_META.display` 和分类渲染。）
- [x] 展示与容器控件默认隐藏字段名等录入属性，只有打开高级设置时显示。（证据：`controls/display.tsx`、`controls/container.tsx` 将 `name` schema 标记为 `level: 'advanced'`。）
- [x] `text`：动态模板在运行/预览态优先于静态内容，并实时插值 `form.字段`；未配置模板时使用静态内容。（证据：`controls/display.tsx` 的模板插值分支。）
- [x] `text`：配置面板增加来源互斥提示和模板表达式错误就地标记。（证据：`controls/display.tsx` 设计态同时配置静态内容与动态模板时显示优先级说明；模板编辑器使用 `ExpressionVisual` 就地显示语法、缺失字段和循环依赖错误。）
- [x] `image`：URL 输入支持上传/选择已有资源，自动生成替代文本建议；外链失败、加载中和无障碍说明可预览。（证据：`PropertyEditorField.tsx` 支持本地图片上传、最近图片库选择、按 URL 文件名生成替代文本建议；`FormRenderer.tsx` 的 `RuntimeImage` 显示加载中/失败状态并始终提供可读 `alt`。）
- [x] `animatedNumber`：遵循系统 `prefers-reduced-motion`，减少动效时直接显示结果；空值仍显示可读回退值。（证据：`components/AnimatedNumber.tsx` 的媒体查询和 `safeDuration=0` 分支。）
- [x] `table`：列编辑器支持从数据表导入、批量隐藏；“允许编辑/新增/删除”联动显示权限、主键和冲突策略说明，避免打开编辑却没有可写主键。（证据：`ArrayRowsVisual` 支持从当前字段列表一键导入、批量粘贴列定义和逐列显示/隐藏；`display.tsx` 编辑权限、主键和冲突定位帮助。）
- [x] `table`：列编辑器支持上下移动排序、重复字段校验，以及按“列名,字段”批量粘贴导入。（证据：`CollectionPropertyEditors.tsx` 的 `ArrayRowsVisual`。）
- [x] `table`：提供空表、加载、无匹配、部分保存、冲突和只读状态的预览；编辑失败保留修改并支持逐行重试。（证据：`EditableTableGrid` 提供空/加载/自定义空提示、脏行计数与字段错误保留；新增 `conflictRows` 冲突标识和逐行“重试”动作，`FormRenderer` 将重试事件回传业务流程。）
- [x] `chart`：提供“维度与指标”可视化配置入口，并在 schema 中给出字段类型说明；`chartData (JSON)` 已被高级设置隐藏。（证据：`controls/display.tsx` 的 `__dimMetric`，`PropertySectionList.tsx` 将 JSON 配置默认折叠。）
- [x] `chart`：补齐聚合/筛选向导和字段类型不兼容时的选择阶段阻止。（证据：`DimMetricField` 按字段类型过滤聚合并回退兼容项；`controls/display.tsx` 增加多条件筛选编辑器，渲染前逐条件过滤，发现不存在字段时阻止应用并就地提示重新选择。）
- [x] `container` / `card`：移除无业务意义的 `字段名` 默认入口；标题、副标题和数据绑定分开解释；提供内容区域最小高度/响应式布局预设，减少手填像素。（证据：容器/卡片字段名默认高级折叠，标题、副标题、数据绑定分组独立；`contentMinHeight` 提供紧凑/舒适/宽敞预设并按可用空间渲染。）
- [x] `tabs` / `steps`：默认选中项改为下拉选择并校验索引范围；切换前若有未保存数据，提供保留/放弃选择；步骤条提供“下一步/上一步/完成”的实际流程语义。（证据：`controls/container.tsx` 将默认选中项/默认步骤改为带中文选项的下拉，运行态继续夹紧索引；切换标签/步骤前提供保留或放弃确认；步骤条具备上一步/下一步/完成事件语义。）
- [x] `divider`：使用“横向/纵向 + 间距”预设，隐藏 0.5–5px 等低层参数；确保高对比主题下仍可见且不承担唯一分组语义。（证据：`controls/container.tsx` 提供横向/纵向与紧凑/正常/宽松间距预设，厚度/自定义边距移入高级设置；`designer-canvas.css` 在 `prefers-contrast: more` 下提升线条可见度，并保留可读分组提示。）

## P1：让复杂能力可理解、可恢复

- [x] 为复合编辑器提供恢复默认、取消和应用按钮；恢复默认只修改草稿，不直接覆盖当前配置。（证据：`ComplexPropertyEditor.tsx` ModalFooter 的恢复默认/取消/应用流程。）
- [x] 复杂 JSON/表达式编辑器提供可视化模式、源码模式和语法检查，默认进入可视化模式。（证据：`ComplexPropertyEditor.tsx` 的 `DraftMode`、`switchMode`、JSON/正则校验。）
- [x] 数据绑定向导先选择来源类型、绑定方向和取值方式，再显示具体字段；绑定失败保留旧配置并提供重新选择入口。（证据：`CollectionPropertyEditors.tsx` 的 `DataBindingVisual`；失效时显示“旧配置不会被自动清除”。）
- [x] 选项来源、日期约束、验证规则等配置支持从现有字段/模板推断，推断结果可一键接受并可撤销。（证据：`OptionContentVisual` 从当前数据表推断选项并提供“撤销本次推断”；`DateConstraintConfigVisual` 的日期快捷预设支持“撤销预设”；`inputKind` 自动推断校验规则并保留旧规则兼容。）
- [x] 属性组在当前控件编辑过程中记住展开状态，首次只展开基础组；技术诊断以独立提示行呈现，不挤占字段配置。（证据：`PropertyPanel.tsx` 的 `collapsed` 状态、`PropertySectionList.tsx` 的 details 状态和 diagnostic 节点。）
- [x] 为 1024×768、768×720、200% 缩放设计属性面板的折叠、滚动和焦点恢复；不让底部保存按钮被固定画布遮住。（证据：`designer-properties.css` 在 1024/768 宽度下保持属性面板独立滚动、标题吸顶并预留底部安全间距，在 192dpi（约 200% 缩放）下扩大关闭/高级设置命中区并保留滚动槽；弹窗关闭焦点恢复由统一 Modal 实现。）

## P1：填表运行态减负

- [x] 支持从剪贴板粘贴表格/多行数据到批量控件，并提供导入预览、列匹配和撤销。（证据：`EditableTableGrid` 处理 TSV 多行粘贴，识别首行列名并按当前列映射；现在先显示粘贴预览与待导入行数，用户确认后导入，并提供“撤销粘贴”。）
- [x] 支持字段间自动带出、默认值和上次输入，但在字段旁标注来源并允许一键清除，避免用户误以为是自己填写的。（证据：`FormRenderer.tsx` 显示“自动带出/上次输入”来源标签，支持一键清除；`rememberLastInput` 使用按字段本机存储恢复最近值，敏感字段自动禁用记忆；默认值仍通过控件默认配置进入运行态。）
- [x] 长表单提供分组导航、完成度、未填项列表和“稍后继续”；不强迫用户依次滚动寻找错误。（证据：`FormRenderer.tsx` 自动分步、显示必填完成度、可点击未填项定位，并为向导提供按表单草稿键保存/恢复的“稍后继续/恢复草稿”入口。）
- [x] 提交前显示少量关键摘要（例如日期范围、金额、记录数），避免用户在确认前重新检查整表。（证据：`FormRenderer` 最后一步提供可展开“提交前检查摘要”，展示前 5 个必填字段的当前值/记录数。）
- [x] 异步操作显示内联进度和可取消状态；成功、警告、部分成功、过期结果和冲突都保留在上下文中，不只靠 Toast。（证据：`PreviewCanvas` 状态条内联显示执行中/成功/警告/失败/已取消、详情、取消和重试；部分 flow 成功显示“部分步骤已完成”；错误包含过期/冲突时就地提示刷新实例并重试，保留当前填写内容。）
- [x] 键盘支持：字段间 Tab、下拉搜索、日期快捷键、评分方向键、标签回车/退格、上传取消、弹窗 Escape；不覆盖 Cmd/Ctrl+Z、Cmd/Ctrl+C/V 等系统习惯。（证据：统一 Ant Design 控件保留 Tab/搜索/评分方向键/标签分隔键盘行为，日期提供“今天/清空”，上传提供取消，Modal 支持 Escape 与焦点恢复；`FormRenderer` 字段声明 `aria-keyshortcuts="Tab Enter Escape"`，矩阵用例验证键盘选择与关闭。）

## P2：一致性与质量门禁

- [x] 建立 schema lint：检查默认值越界、必填但无错误提示、只读与禁用冲突、选项 value 重复、日期最小值大于最大值、数量范围反转、表达式引用不存在。（证据：`schemaUxLint.ts`、`schemaUxLint.test.ts`；26 个已注册控件测试通过。）
- [x] 建立“控件配置可读性”合同：基础区不出现 JSON/DSL/内部 key；所有复杂字段有摘要、帮助和恢复默认；每个输入控件都有空态、错误态和成功态。（证据：`schemaUxLint.test.ts` 覆盖 26 个控件的 key/JSON/帮助合同；`PropertySectionList.tsx` 将内部字段与技术配置折叠到高级设置并统一生成摘要/帮助；`ComplexPropertyEditor` 提供恢复默认/取消/应用；`FormRenderer` 统一渲染空态、错误态和成功态。）
- [x] 建立运行态 E2E 矩阵：26 个控件至少覆盖键盘、200% 缩放、明暗/高对比、空数据、无匹配、提交失败、重试和焦点恢复。（证据：`form-control-ux-matrix.spec.ts` 的 12 条 1440×900/1024×768/768×720、明暗主题、200% 缩放、键盘与焦点恢复用例通过；`control-depth-matrix.spec.ts` 验证 26 个注册控件逐一键盘添加、预览运行态渲染与滚动可达，并覆盖控件无匹配态和真实运行表单弹窗主操作；`flowEngine.test.ts` 覆盖空数据/无匹配与失败分支，`designPreviewRuntime.test.ts` 覆盖缺失流程和校验失败，`PreviewCanvas` 状态条提供失败后的就地重试与错误聚焦。）
- [x] 增加用户任务指标：首次配置完成时间、首次提交成功率、错误后修复成功率、平均字段修改次数、撤销/重试次数；按控件类型回归。（证据：`services/engine/formMetrics.ts` 记录并汇总全部指标，按控件类型聚合，支持按表单 ID 持久化/恢复；`PreviewCanvas.tsx` 接入记录；`formMetrics.test.ts` 覆盖汇总与持久化恢复。）
- [x] 用 5–8 个真实任务做可用性走查：录入、查询修改、批量更新、日期范围筛选、动态选项、上传图片、主从表、分析参数；记录用户是否理解字段、默认值和错误原因。（证据：用户明确要求废弃该目标，本项不再纳入验收门禁。）

## 推荐实施顺序

1. 先做 P0.1–P0.3：属性面板分层、统一状态/错误、字段命名和帮助文案。
2. 再做文本/数字/日期与选择控件；这些控件覆盖最多真实填表场景，收益最高。
3. 接着做上传、表格、图表和容器的向导化与恢复路径。
4. 最后接入 schema lint、运行态矩阵和用户任务指标，防止复杂度回流。

## 验收标准

- 新用户不看内部字段名或 JSON，也能完成常见文本、数字、日期、选项、上传控件的配置。
- 运行态错误均靠近字段、说明修复方式，并能通过键盘到达；提交失败不会丢失已填内容。
- 默认配置在常见业务场景下可直接使用；任何“无限制、自动、动态、联动”行为都有可读说明。
- 200% 缩放和 768px 宽窗口下，属性面板、字段错误、主操作和恢复入口仍可见、可滚动、可聚焦。
- 26 个控件的 schema lint、单元测试和 Playwright 回归全部通过，控制台无未处理异常。
