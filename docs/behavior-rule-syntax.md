# FormFlow 规则语法 Reference

> 规则编辑器与规则语法智能体共用本文档及同一个编译器作为权威语义。智能体的建议必须通过确定性 lint 和用户确认，模型输出不作为语法判定依据。

本文定义 FormFlow Behavior Rule DSL 1.0 的唯一规范语法和运行语义。规则源码属于表单：每个表单默认有一份独立的空白规则代码，应用后编译为该表单控件上的 `linkageRules`，不执行任意 JavaScript。

## 1. 基本约定

- 一行一条规则；空行忽略。
- `#` 开始行注释；引号内的 `#` 是普通字符。
- 字段写为 `$字段`，也接受 `$form.字段`。
- 控件写为 `@控件ID`。编辑器可按标签补全，但保存时建议使用稳定 ID。
- 字符串使用双引号或单引号；数字、`true`、`false`、`null` 直接书写。
- 动作统一使用函数调用形式；一行多个动作以 `;` 分隔。逗号只分隔函数参数。

## 2. Grammar

```ebnf
program          = { blank | comment | statement, newline } ;
statement        = when-rule | else-rule | change-rule | compute-rule | lifecycle-rule ;

when-rule        = "when", field-ref, operator, value, "->", action-list ;
else-rule        = "else", "->", action-list ;
change-rule      = "on", "change", "(", field-ref, ")", "->", action-list ;
compute-rule     = "compute", field-ref, "=", expression, "watch", "(", field-list, ")" ;
lifecycle-rule   = ("on load" | "before submit" | "on submit"), "->", action-list ;

action-list      = action, { ";", action } ;
action           = identifier, "(", [ argument, { ",", argument } ], ")" ;
field-list       = field-ref, { ",", field-ref } ;
field-ref        = "$", identifier | "$form.", identifier ;
component-ref    = "@", identifier ;
comment          = "#", { any-character } ;
```

`expression` 使用 FormFlow 安全属性表达式，只能访问声明的字段和值，不开放 JavaScript 全局对象。

## 3. 触发器

| 语法 | 语义 |
| --- | --- |
| `when $字段 <条件> <值> -> ...` | 该字段变化且条件成立时执行。 |
| `else -> ...` | 必须紧跟 `when`；使用上一条件的严格反向条件。 |
| `on change($字段) -> ...` | 字段变化时无条件执行。 |
| `compute $目标 = <表达式> watch($字段, ...)` | 任一监听字段变化时重算目标字段。 |
| `on load -> ...` | 表单加载时执行。 |
| `before submit -> ...` | 提交前执行。 |
| `on submit -> ...` | 提交事件发生时执行；不得在其中再次提交。 |

## 4. 条件运算符

| 运算符 | 语义 | `else` 反向 |
| --- | --- | --- |
| `==` / `!=` | 相等 / 不相等 | `!=` / `==` |
| `>` / `<=` | 大于 / 小于等于 | `<=` / `>` |
| `<` / `>=` | 小于 / 大于等于 | `>=` / `<` |
| `contains` / `not contains` | 包含 / 不包含 | 互为反向 |
| `starts with` / `not starts with` | 以文本开头 / 不以文本开头 | 互为反向 |
| `ends with` / `not ends with` | 以文本结尾 / 不以文本结尾 | 互为反向 |
| `is empty` / `is not empty` | 空 / 非空 | 互为反向 |

空值包括 `null`、`undefined`、空字符串和空数组。文本运算会把输入和值转换为字符串。

## 5. 动作 Reference

| 动作 | 语义 |
| --- | --- |
| `show(@控件, ...)` / `hide(@控件, ...)` | 显示 / 隐藏控件。 |
| `enable(@控件, ...)` / `disable(@控件, ...)` | 启用 / 禁用控件。 |
| `require($字段, ...)` / `optional($字段, ...)` | 设置 / 取消必填。 |
| `clear($字段, ...)` | 清空字段。 |
| `set($字段, 表达式)` | 用安全表达式设置字段值。 |
| `message("内容", info)` | 显示消息；级别为 `info`、`success`、`warning` 或 `error`。 |
| `run("流程ID")` | 运行指定流程；`run()` 运行当前配置流程。流程输出自动回写同名字段。 |
| `options($目标, "表ID", "筛选字段", 筛选值)` | 按条件刷新目标字段选项。 |

规则 DSL 不提供 `save()` / `submit()` 动作。提交由表单自身发起；如提交阶段需要执行配置流程，使用 `run()`。这可避免 `on submit` 中递归提交的歧义。

## 6. 示例

```text
# 条件分支
when $部门 == "技术部" -> show(@tech-stack); require($技术栈)
else -> hide(@tech-stack); clear($技术栈)

# 计算字段
compute $合计 = $数量 * $单价 watch($数量, $单价)

# 级联选项
on change($省份) -> options($城市, "city_table", "省份", $省份)

# 生命周期和流程
on load -> set($状态, "草稿")
before submit -> require($姓名, $手机号); message("正在校验", info)
on submit -> run("save_employee"); message("提交完成", success)
```

## 7. Suggestion、Highlight 与 Lint

Suggestion 根据光标上下文过滤：规则起始位置只提示触发器；条件位置提示字段和运算符；动作参数位置只提示对应的字段、控件、表或流程。Highlight 区分触发关键字、动作函数、`$` 字段、`@` 控件、运算符、消息级别、字符串和注释。

Lint 诊断有稳定编号：

| 编号范围 | 含义 |
| --- | --- |
| `FFR000–099` | 无法编译的语法或参数错误。 |
| `FFR100–199` | 兼容旧语法的迁移警告。 |
| `FFR200–299` | 字段、控件、数据表或流程引用错误。 |
| `FFR300–399` | 可能循环或递归的行为语义。 |

错误会阻止“应用到当前表单”；警告显示迁移建议，但不阻止应用。

## 8. 旧语法迁移

| 旧写法 | 规范写法 |
| --- | --- |
| `otherwise -> hide 技术栈` | `else -> hide(@tech-stack)` |
| `show 技术栈, require 技术栈` | `show(@tech-stack); require($技术栈)` |
| `on 省份 change -> ...` | `on change($省份) -> ...` |
| `compute 合计 = ... on change(数量)` | `compute $合计 = ... watch($数量)` |
| `set 状态 = "草稿"` | `set($状态, "草稿")` |
| `run workflow_id` | `run("workflow_id")` |
| `save` / `submit` | 由表单提交；需运行配置流程时写 `run()`。 |

编译器会继续读取上述旧格式并给出 `FFR1xx` 警告，便于逐步迁移；新建模板和补全只生成 1.0 规范格式。
