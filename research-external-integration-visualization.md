# 外部集成与可视化报告节点调研

## 数据来源
- Apache NiFi 2.10: 300+ processors, 完整组件目录 nifi.apache.org/components
- n8n: 1905 integrations, n8n.io/integrations
- Node-RED: flows.nodered.org 社区节点库
- KNIME: 数据分析平台节点库

---

## 一、数据库连接器（当前完全缺失）

| 节点名称 | 功能描述 | 输入 | 输出 |
|---------|---------|------|------|
| SQL查询 | 连接数据库执行SELECT语句，返回结果集 | 连接配置+SQL语句 | 数据表格 |
| SQL执行 | 执行INSERT/UPDATE/DELETE/DDL等写操作 | 连接配置+SQL语句 | 影响行数+状态 |
| 数据库表读取 | 按表名读取整表，支持分页和增量同步 | 连接配置+表名+可选筛选条件 | 数据表格 |
| 数据库表写入 | 批量写入目标表，支持Upsert模式 | 数据表格+连接配置+表名 | 写入结果统计 |
| 数据库连接配置 | 管理MySQL/PostgreSQL/SQLServer/SQLite/Oracle连接池 | 驱动+地址+端口+认证信息 | 连接对象 |
| 列出数据库表 | 获取数据库中所有表名和结构 | 连接配置 | 表名列表+Schema |

参考实现:
- NiFi: ExecuteSQL, PutSQL, QueryDatabaseTable, PutDatabaseRecord, ListDatabaseTables, GenerateTableFetch
- n8n: Postgres, MySQL, Microsoft SQL, SQLite, MongoDB, Supabase, Airtable 节点

---

## 二、消息队列（当前完全缺失）

| 节点名称 | 功能描述 | 输入 | 输出 |
|---------|---------|------|------|
| Kafka消费者 | 订阅Kafka topic消费消息，支持消费者组 | Broker地址+Topic+GroupID | 消息流 |
| Kafka生产者 | 向Kafka topic发送消息 | 消息内容+Broker+Topic | 发送确认 |
| MQTT订阅 | 订阅MQTT broker接收IoT/设备消息 | Broker地址+Topic+QoS | 消息 |
| MQTT发布 | 向MQTT broker发布消息 | 消息+Broker+Topic | 发送状态 |
| RabbitMQ消费 | 从RabbitMQ队列消费消息(AMQP) | 连接+Queue+Exchange | 消息 |
| RabbitMQ发布 | 向RabbitMQ交换机发布消息 | 消息+连接+Exchange+RoutingKey | 发送状态 |
| Redis发布/订阅 | Redis Pub/Sub消息收发 | 连接配置+Channel | 消息 |
| WebSocket客户端 | 连接WebSocket服务端收发消息 | URL+协议 | 双向消息流 |

参考实现:
- NiFi: ConsumeKafka/PublishKafka, ConsumeMQTT/PublishMQTT, ConsumeAMQP/PublishAMQP, ConsumeJMS/PublishJMS, ConnectWebSocket/ListenWebSocket/PutWebSocket
- n8n: Kafka, MQTT Trigger, Redis, WebSocket 节点

---

## 三、云存储与文件服务（当前完全缺失）

| 节点名称 | 功能描述 | 输入 | 输出 |
|---------|---------|------|------|
| S3存储操作 | AWS S3对象的上传/下载/列出/删除 | Bucket+Key+凭证 | 文件/列表 |
| 阿里云OSS操作 | 阿里云OSS对象操作 | Bucket+Key+凭证 | 文件/列表 |
| Azure Blob操作 | Azure Blob Storage读写 | Container+Blob+凭证 | 文件/列表 |
| Google Drive操作 | Google Drive文件读写和管理 | 凭证+文件夹 | 文件/列表 |
| FTP/SFTP操作 | FTP/SFTP文件传输和目录管理 | 服务器+认证+路径 | 文件/状态 |
| SharePoint操作 | 读写SharePoint文档库 | 站点+认证 | 文件/列表 |

参考实现:
- NiFi: PutS3Object/FetchS3Object/ListS3, PutGCSObject/FetchGCSObject, PutAzureBlobStorage, PutSFTP/GetSFTP, FetchFTP
- n8n: AWS S3, Google Drive, Nextcloud, OneDrive, Dropbox

---

## 四、Webhook与HTTP服务（当前仅API请求，缺Webhook接收）

| 节点名称 | 功能描述 | 输入 | 输出 |
|---------|---------|------|------|
| Webhook接收 | 监听HTTP请求作为流程触发器 | 端口+路径+方法 | 请求数据 |
| Webhook响应 | 向调用方返回HTTP响应 | 状态码+响应体+Header | HTTP响应 |
| GraphQL请求 | 执行GraphQL查询/变更 | Endpoint+Query+变量 | 响应数据 |
| OAuth2认证 | 获取和管理OAuth2令牌 | ClientID+Secret+TokenURL | Access Token |
| HTTP监听器 | 作为HTTP服务端接收请求 | 端口+路由 | 请求数据 |

参考实现:
- NiFi: HandleHttpRequest/HandleHttpResponse, ListenHTTP, InvokeHTTP
- n8n: Webhook节点(含响应), HTTP Request, GraphQL

---

## 五、第三方服务集成（当前完全缺失）

| 节点名称 | 功能描述 | 输入 | 输出 |
|---------|---------|------|------|
| 邮件发送(SMTP) | 通过SMTP发送邮件，支持附件 | 收件人+主题+正文+附件 | 发送状态 |
| 邮件接收(IMAP) | 通过IMAP收取邮件 | 服务器+认证+筛选条件 | 邮件列表 |
| Slack通知 | 发送消息到Slack频道 | Webhook+消息内容 | 发送状态 |
| 钉钉通知 | 发送消息到钉钉群 | Webhook+消息内容 | 发送状态 |
| 企业微信通知 | 发送消息到企业微信群 | Webhook+消息内容 | 发送状态 |
| 飞书通知 | 发送消息到飞书群 | Webhook+消息内容 | 发送状态 |
| 短信发送 | 通过SMS网关发送短信 | 手机号+内容 | 发送状态 |
| Elasticsearch操作 | ES文档的索引/搜索/删除 | 连接+索引+查询 | 搜索结果 |
| Redis操作 | Redis键值读写操作 | 连接+Key+Value | 值/状态 |

参考实现:
- NiFi: PutEmail/ConsumeIMAP/ConsumePOP3, PublishSlack/ConsumeSlack, PutElasticsearchJson/SearchElasticsearch, PutRedisHashRecord
- n8n: Gmail/Outlook/SendGrid, Slack/Discord/Telegram, Elasticsearch, Redis

---

## 六、数据可视化节点（当前完全缺失）

| 节点名称 | 功能描述 | 输入 | 输出 |
|---------|---------|------|------|
| 折线图 | 绘制时间序列/趋势折线图 | 数据+X轴字段+Y轴字段 | 图表(图片/HTML) |
| 柱状图 | 绘制分类对比柱状图 | 数据+分类字段+值字段 | 图表 |
| 饼图/环形图 | 绘制占比分布图 | 数据+分类字段+值字段 | 图表 |
| 散点图 | 绘制两变量相关性图 | 数据+X字段+Y字段 | 图表 |
| 面积图 | 绘制堆叠/层叠面积图 | 数据+X字段+Y字段组 | 图表 |
| 仪表盘/KPI卡片 | 显示关键指标数值和趋势 | 指标值+目标值+标签 | 图表组件 |
| 热力图 | 绘制矩阵热力图(如相关性矩阵) | 矩阵数据 | 图表 |
| 直方图 | 绘制数据分布直方图 | 数据+分箱数 | 图表 |
| 箱线图 | 显示数据分布和异常值 | 数据+分组字段+值字段 | 图表 |
| 地图可视化 | 在地图上展示地理数据 | 经纬度+指标值 | 地图图表 |

参考实现: KNIME的JavaScript Charting nodes, n8n无内置图表节点(通过代码节点+Chart.js)

---

## 七、报告与输出节点（当前仅有Excel/CSV/JSON/HTML导出）

| 节点名称 | 功能描述 | 输入 | 输出 |
|---------|---------|------|------|
| PDF报告生成 | 将数据/图表组装为PDF报告 | 数据+图表+模板 | PDF文件 |
| Word文档生成 | 生成Word文档(合同/报告模板填充) | 模板+数据 | DOCX文件 |
| PPT生成 | 生成PowerPoint演示文稿 | 模板+数据+图表 | PPT文件 |
| HTML报告 | 生成带样式的HTML交互式报告 | 数据+图表+CSS模板 | HTML文件 |
| 邮件报告 | 生成报告并通过邮件发送 | 数据+收件人+报告模板 | 发送状态 |
| 定时报告 | 按计划自动生成并分发报告 | 调度配置+报告模板 | 执行记录 |

参考实现:
- NiFi: PutEmail(邮件发送), 各种输出processor
- n8n: Send Email, Gmail, Microsoft Outlook节点

---

## 八、数据质量与监控节点（当前仅有基础校验）

| 节点名称 | 功能描述 | 输入 | 输出 |
|---------|---------|------|------|
| 数据概况统计 | 生成数据集的描述性统计(summary) | 数据表格 | 统计报告 |
| 数据质量报告 | 检查空值率/唯一性/类型一致性 | 数据表格 | 质量报告 |
| 异常值检测 | 基于统计方法标记异常值 | 数据+字段+阈值 | 标记后的数据 |
| 数据对比/差异 | 比较两个数据集的差异 | 数据集A+B | 差异报告 |
| 执行日志记录 | 记录流程执行详情用于审计 | 执行事件 | 日志存储 |
| 告警通知 | 当数据异常时发送告警 | 条件+通知渠道 | 告警消息 |

参考实现:
- NiFi: ValidateRecord/ValidateJson/ValidateXml, MonitorActivity, LogAttribute, Notify
- n8n: 无内置数据质量节点，通常用Code节点实现

---

## 总结：按优先级排序的缺失节点

### P0 - 核心缺失（构成完备系统必须）
1. SQL查询/执行 - 数据库是最常见的外部数据源
2. Webhook接收 - 缺少被动触发机制
3. 邮件发送 - 通知的基本手段
4. 数据库连接配置 - 所有数据库操作的前提

### P1 - 重要缺失（提升实用性）
5. 消息队列(Kafka/MQTT/RabbitMQ) - 实时数据管道
6. 云存储(S3/OSS/Blob) - 现代数据架构标配
7. 图表可视化(折线/柱状/饼图) - 数据展示核心需求
8. PDF报告生成 - 企业报告输出刚需
9. 数据质量检查 - 数据治理基础能力

### P2 - 增强缺失（扩展场景覆盖）
10. 即时通讯通知(钉钉/企微/飞书/Slack) - 国内场景必需
11. GraphQL请求 - 现代API集成
12. OAuth2认证管理 - 安全集成必备
13. Elasticsearch操作 - 日志搜索分析
14. Redis操作 - 缓存和高速数据交换
15. FTP/SFTP - 遗留系统对接
