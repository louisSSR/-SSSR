# 数据库内实时四表 · 1.2.0

主题独立安装仍可用；有商店 1.3.1 的公开服务才显示四表入口。入口和面板属于主题自己的 DOM，原数据库持久表格、配置、输入和保存动作不改。面板在已识别工作台／编辑器内容区的正常文档流中，内部限高滚动；原生导入四表 JSON 是独立快照，不与商店双向写入。

服务位置是父页面 `Symbol.for('shiro-butterfly-shop:ui-v1')`，`version:1`。原 `open('memory'|'quests')` 与 `shiro-butterfly-shop:availability` 事件保持兼容。

- `readMemorySnapshot({query,offsets,limit})`：异步返回 `null` 或版本 1 的四表页。主题每页请求 50 条，四个 key 是 `impressions / accounts / inventory / ripples`，搜索最长 200 字符并作用于完整四表。`scope` 的 origin／handle／chat／account 均为字符串，chat 是原始序列化身份，不解析它；revision 是安全整数，updatedAt 为 UTC ISO。每表含 key／title／columns／total／offset／limit／rows／recordIds，文本及记录 ID 以 textContent 展示。
- `subscribeMemorySnapshots(callback)`：返回只清理本订阅的函数，不立即回调。通知只有 `{chat,account,revision}` 或 `null`，不传历史行。主题打开面板主动读取；消费、购买与任务提交通知触发重读。聊天／本源变化或 null 先清空行、旧 scope 和搜索；同源同本源更新保留用户尚未提交的搜索草稿。
- `exportCompleteMemory()`：只在用户点击“导出完整四表”时调用，下载当前完整原生 JSON，不是 AI 摘要、可恢复账本备份或数据库私有写入。

读序号、来源对象身份与通知 scope 共同拦住过期读取；低于最新通知的版本或错误来源不能显示。账户／聊天／登录切换期间服务拒绝也清空旧行。停用主题、来源替换、未知结构与卸载清理本订阅与全部自有面板监听，迟到 Promise 和旧按钮不能恢复面板。

完整导出 Promise 拒绝时显示“导出未完成，旧资料已清空；请确认聊天、本源和连接，再刷新重试。”，不把所有失败归因为账户切换，也不宣称文件已保存；重新读取当前四表后可再次导出。

视图只读已提交的本源业务记录，不调用商店 open/inject 来取四表，不额外调用模型、不写聊天或 Token 设置。原生完整四表导入、商店扩展和主题脚本继续分别安装／更新。
