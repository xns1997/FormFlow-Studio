```mermaid
flowchart TD
  A["检查角色工具发现"] --> B["核对租户与用户上下文"]
  B --> C["检查幂等键与 revision"]
  C --> D["补传确认令牌"]
```
