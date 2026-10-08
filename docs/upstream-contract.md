# 数据库适配与原生主题契约

> 历史契约：下文记录早期六表投影、原生配色与兼容分叉实验，已被商店2.0.0的原生四表设计替代。当前安装使用未修改官方数据库、独立白主题1.3.0脚本和四表v2空模板，无需安装下文的兼容数据库。当前权威说明为[README](../README.md)、[分别更新契约](database-update-contract.md)、[四表安装](four-tables-install.md)和[2.0.0验收](acceptance-v2.0.0.md)。固定上游源码引用及旧实验原文仅作为历史资料保留。

本插件基于用户指定的 [AlbusKen/shujuku](https://github.com/AlbusKen/shujuku)；已核固定源码为 `1a5ffdb3ef8817452c370c6cfef7cac86683d7cc`，其 `manifest.json` 显示 **龙血玄黄·数据库 1.2.5**。`package.json` 的开发包版本仍为 1.0.0，不能用它代替插件版本。上游插件版和酒馆助手脚本版在该源码中共用 `AutoCardUpdaterAPI`，宿主窗口发现方式不同。本适配器运行在 SillyTavern 扩展主窗口，不扫描任意 iframe。

这是一份源码契约与隔离验证记录。它不代表已在用户酒馆安装、调用收费模型、修改聊天或完成人工验收。

## 三份可导入资产

| 文件 | 使用入口 | 内容 |
|---|---|---|
| `database/shiro-v2-theme.json` | 数据库右上角齿轮「外观」→「导入主题」 | 当前 V2 数据库本体原生主题。冰白底、虹彩紫强调、冷蓝辅色。 |
| `database/shiro-legacy-theme.json` | 旧版数据库的主题导入入口 | 旧版 `formatVersion:1` 兼容主题；当前 V2 不接受此格式。 |
| `database/butterfly-tables.json` | 数据库原生模板导入；安装兼容修正版后可由商店按钮安全合并 | 六张空表，不携带示例余额、假交易或用户数据。 |

兼容修正版中推荐通过商店按钮启用表格，因为按钮保留当前已有的表与记录，并检查同名冲突。标准原版没有安全聊天写回协议，商店禁用自动写回。直接使用数据库原生导入时，应将本文件作为新预设保存；切换当前模板前确认原有表的保留方案。

V2 主题格式是 `kind:"acu-v2-theme"`、`version:1` 和 `theme` 对象。`theme` 内含 `id`、`name`、`colorScheme`、完整 23 个 `tokens`。此版本禁止 token 中出现 URL、CSS 声明分隔符或任意 CSS，不能将旧版 `customCSS` 塞进 V2 主题。本体配色由上游原生导入保存和应用；白的角色视觉用于商店界面，不用私有 Pinia 全局或直接修改数据库的 localStorage 冒充原生主题安装。

已核源码：[V2 类型](https://github.com/AlbusKen/shujuku/blob/1a5ffdb3ef8817452c370c6cfef7cac86683d7cc/src/presentation-v2/theme/theme-types.ts)、[V2 主题导入与保存](https://github.com/AlbusKen/shujuku/blob/1a5ffdb3ef8817452c370c6cfef7cac86683d7cc/src/presentation-v2/stores/theme-store.ts)、[原生菜单入口](https://github.com/AlbusKen/shujuku/blob/1a5ffdb3ef8817452c370c6cfef7cac86683d7cc/src/presentation-v2/App.vue)、[旧版类型](https://github.com/AlbusKen/shujuku/blob/1a5ffdb3ef8817452c370c6cfef7cac86683d7cc/src/presentation/theme/theme-types.ts)。

## 唯一账本与六表

金额与权益只由商店本源账本持有。数据库是可重试的记录投影；标准原版使用导出文件，兼容修正版支持安全写回。数据库，禁止数据库填表模型反向增加余额、扣点、补发物品或修改永久价格。即使数据库不可用或某次同步中断，购买交易与本源账本仍以商店的持久化结果为准。

| 表 | 内容 |
|---|---|
| 蝴蝶·因果总览 | 当前世界、同一本源账户、精确余额、累计收入与消费、账本版本。 |
| 蝴蝶·因果与余波 | 已成立事件、因果证据、初次/深化/关联、独立变化标记、已结算部分与未成立追踪。 |
| 蝴蝶·恒量计功参照 | 固定影响规格与永久收益参照。 |
| 蝴蝶·永久商品报价 | 完整八项效果规格、固定报价、别名、旧版报价与新增规格。 |
| 蝴蝶·交易回执 | 幂等交易ID、收支前后余额、购买/使用/移交、原始 `WJWK-settle` 回执。 |
| 蝴蝶·长期所得 | 能力与资产、购买来源、取得/剩余/已用/已移交数量、完整跨界效果。 |

每张表第一列为上游维护的 `row_id`，第一行是表头。业务稳定身份单独保存在「记录ID」，采用本源账户、表类别、事件或交易ID组合；不得将当前数组行号视为永久身份。金额保持十进制字符串，不转换为浮点数。不同本源账户可在同一聊天表中并存；同步不覆盖其他账户或用户手工行。

模板结构为 `mate` 加 `sheet_*`；每张表包含匹配的 `uid`、名称、二维 `content`、完整 `sourceData`、`updateConfig`、`exportConfig`、`orderNo`。所有字段均有明确英文 SQL 列映射，稳定业务键声明为 UNIQUE。模板默认不写入世界书，避免自动扩大上下文注入。

已核源码：[表结构](https://github.com/AlbusKen/shujuku/blob/1a5ffdb3ef8817452c370c6cfef7cac86683d7cc/src/shared/models/table-data.ts)、[原生模板校验器](https://github.com/AlbusKen/shujuku/blob/1a5ffdb3ef8817452c370c6cfef7cac86683d7cc/src/service/template/template-import-validator.ts)。

## 公开 API

`src/database.ts` 的 `discoverDatabaseApi()` 只探测当前窗口的 `AutoCardUpdaterAPI`。未知版本先检查方法存在；没有接口时显示不可用，不猜测私有存储字段。

| 接口 | 固定源码中的契约 |
|---|---|
| `exportTableAsJson()` | 同步返回当前活动对象或空对象。适配器立即深拷贝，不修改原引用。 |
| `getTableTemplate({scope:'chat'})` | 当前聊天模板，必要时可能回退全局模板；适配器额外保留运行时已存在的表。 |
| `importTemplateFromData(data,options)` | 模板对象或 JSON；默认 `scope:'global'` 仅保存预设。原生导入使用明确 scope；商店自动启用改用本地兼容补丁的聊天绑定协议。 |
| `insertRow({tableName,data})` | 列名映射至值，成功返回新数据行位置，失败返回 -1。原版无显式聊天身份参数，本适配器禁止调用。 |
| `updateRow({tableName,rowIndex,data})` | rowIndex=1 是第一条数据；成功 true，失败 false。原版无显式聊天身份参数，本适配器禁止调用。 |
| `registerTableUpdateCallback(callback)` | 回调为 `(data,meta)`；`meta.persisted:false` 明确表示尚未持久化。 |
| `unregisterTableUpdateCallback(callback)` | 需传同一个函数引用。 |
| `callAI(messages,{presetName,maxTokens})` | 非空消息数组；返回 `Promise<string|null>`。不存在的预设可能抛错。复用数据库 API 配置，不复制密钥。 |
| `getStoryContext(maxTurns)` | 最近若干 AI 正文的字符串；它不是完整世界书，也不等同于准确世界识别结果。 |

`callAI` 不允许外部传入 URL、API key、model、temperature、stream、headers 等配置字段。适配器仅转交预设名和回复长度。回复只作为数据解析，严格接收完整 JSON 或单个 JSON 代码围栏，不执行代码、不截取任意局部 JSON 冒充成功。

本适配器不调用 `importTableAsJson`，因为其默认语义是覆盖当前全部表；也不设置 `skipChatSave`，因为该选项会造成仅运行时变更。不调用内部 `_notifyTableUpdate`。SQL 批次接口同样不接受入口聊天身份，本适配器不调用。

已核源码：[API 注册](https://github.com/AlbusKen/shujuku/blob/1a5ffdb3ef8817452c370c6cfef7cac86683d7cc/src/presentation/bootstrap/api-registry.ts)、[模板接口](https://github.com/AlbusKen/shujuku/blob/1a5ffdb3ef8817452c370c6cfef7cac86683d7cc/src/presentation/bootstrap/api-groups/template-preset-api.ts)、[CRUD](https://github.com/AlbusKen/shujuku/blob/1a5ffdb3ef8817452c370c6cfef7cac86683d7cc/src/presentation/bootstrap/api-groups/table-crud-api.ts)、[回调](https://github.com/AlbusKen/shujuku/blob/1a5ffdb3ef8817452c370c6cfef7cac86683d7cc/src/presentation/bootstrap/api-groups/callback-api.ts)、[AI 接口](https://github.com/AlbusKen/shujuku/blob/1a5ffdb3ef8817452c370c6cfef7cac86683d7cc/src/presentation/bootstrap/api-groups/worldbook-ai-api.ts)。

## 为什么需要独立兼容补丁

原版 `insertRow` / `updateRow` 首个 `await prepareTableMutationTarget_ACU()` 结束后才重新读取当前表。单次调用期间切换 A→B，调用前后的检查无法阻止上游在 B 找到同名表并写入。SQL 接口也没有透传 `chatKey`。另外，SillyTavern 1.18.0 的 `context.saveChat` 映射至 `saveChatConditional`，在等待保存忙碌状态以后才选择当前聊天，并吞掉保存异常；它不构成绑定 A 的可确认保存。

商店现在**从不调用原版 CRUD、SQL 或全量 JSON 导入作为自动写回后备**。只读、模型调用、六表文件导出与原生主题仍可使用原版。`createLedgerTableExport(ledger)` 输出仅含六表的原生 JSON，内容来自已提交账本。导入该数据文件可能切换当前模板，应在备份或专用聊天中使用原生导入流程。

交付的兼容修正版基于固定提交，标识为 **1.2.5-shiro.1**，协议是 `acu-chat-bound-projection/1`。它不是上游官方发布版本。补丁只新增一个公开 API 分组、一个绑定保存 helper、导出原生基线读取函数，并为原生模板提交增加绑定保存回调与错误回滚时的聊天复检。

| 新接口 | 契约 |
|---|---|
| `getChatBoundProjectionContext()` | 同步返回 `protocol`、`patchVersion`、不透明 `chatIdentity` 和 `ready`。 |
| `applyChatBoundProjection({protocol,expectedChatIdentity,template,rows?})` | `template` 为完整六张空表；`rows` 是以模板逻辑键分组、以中文表头为字段的字符串记录。返回 `success`、`saved`、`runtimeReady`、`added/inserted/updated/unchanged`。 |

调用入口在第一个 await 前捕获聊天首消息对象、身份、隔离域、保存目的地与请求副本。读取原生 replay 基线后再次确认；按「记录ID」合并，仅对发生变化的蝴蝶表创建 introduction/rebase 提交。已有原生重建 UID 按唯一名称、列结构、来源标识重新绑定。其他表、其他账户与未知行保留；保持既有 row_id，新行使用当前表中未占用的正整数。

真正持久化走原生 `commitCurrentFloorTemplateChanges_ACU` 的校验、事务 revision 与聊天屏障。兼容回调在该事务已生成 frame、guide、scope 后立即序列化 A 的完整聊天与元数据，再通过固定 A 的单聊/群聊保存接口发送并回读逐字核对。不会调用 `saveChatConditional`，不会 force 覆盖完整性冲突。保存过程中切到 B，所有请求仍指向 A；失败回滚前确认身份，避免把 A 的旧 metadata 回滚到 B；提交后也不把 A 的运行时快照发布到 B。

`enableButterflyTables` 由明确按钮调用；`syncButterflyLedger` 只使用已核协议与精确补丁版本。单个桥实例串行提交；相同内容不制造写入。数据库投影不是钱包，失败不回滚或改变本源账本。当前聊天切换、保存未确认、重载失败都会明确报错并允许重新读取后重试。

SillyTavern 保存端点没有基于 revision 的服务器 CAS；其他宿主扩展若同时绕过数据库事务保存整个聊天，仍可能产生后写覆盖。本桥没有宣称与任意第三方写者组成分布式原子事务。账本自身的原子交易由商店独立持久层负责。
## 验证

运行 `node database/build-and-verify.cjs <固定上游目录> <pinyin-pro入口>` 重新生成三份资产并执行：

- 上游原生 `validateImportedTemplateObject_ACU`、展示名翻译风险检测和六张表 DDL/表头检查。
- 上游真实 Pinia V2 theme store 的导入、导出往返、同ID重导入、拒绝旧主题格式和 URL token；存储使用隔离内存，不接触用户酒馆。
- 全部普通文本颜色在四种主要底色上的对比度 ≥4.5；最低为 4.775。
- `node --test database/adapter.test.cjs` 检查不覆盖未知表、幂等、整批失败重试、原版拒绝危险回退、原生UID重建、错误聊天/重复ID/虚假保存返回拒绝、精确金额、受限 AI 参数与严格 JSON。

上游依赖仅在验证目录读取 `pinyin-pro@3.28.2`，没有安装上游插件、启动其入口或调用收费API。隔离加载仅将上游日志函数替换为空函数，模板、DDL、拼音、主题解析和 Pinia store逻辑保持原样。完整结果与读取源码哈希在 `database/upstream-validation.json`；旧主题按固定格式生成，尚未执行真实 FileReader 导入或浏览器样式应用。

仓库此提交的顶层未附 LICENSE，package.json 也未声明许可证。独立适配器、主题、模板与原创兼容补丁分别交付；上游源码和构建修正版用于用户授权的本地兼容验证，不能由此宣称上游代码获得了新的再分发许可证。完整 pnpm-store、node_modules 与下载缓存不应放入使用包。

兼容源码与测试位于独立 `artifacts/shiro-butterfly-shop-20261006/patched-shujuku`。未改固定 reference 或生产酒馆。依赖按上游 pnpm-lock 使用 pnpm 11.2.2 冻结安装并禁用安装脚本；原上游 npm lock 与 package.json 不一致，未擅自升级依赖修复。

`database/host-smoke.mjs` 提供已打开隔离 Playwright page 上的真实宿主辅助：`importNativeShiroTheme` 通过可见原生 file input 导入并验证 CSS token；`importNativeButterflyTemplate` 通过表格模板原生文件入口；`verifyActualProjection` 调用公开安全协议、检查其他表不变与重复提交无新写入。它们不连接生产页面、不绕过确认、不注入私有 Pinia store，也不自动调用模型。
## Q版白与补丁复现

白主题原生侧栏装饰位于 `presentation-v2/components/Sidebar.vue`，只在 `custom:shiro-butterfly` 激活时显示。桌面 Q版白占正常文流、图高 128px；手机抽屉改为 48px 小图。切换其他主题即卸载，不盖住表格，不向主题 token 放 URL。

本任务生成的 PNG 位于 `database/patch-assets/shiro-chibi.png`。在固定提交的独立源码副本执行 `git apply --ignore-whitespace shujuku-compatibility.patch`，再将该 PNG 复制到 `src/presentation-v2/assets/shiro-butterfly/shiro-chibi.png`。`patch-receipt.json` 记录源文件与图片 SHA-256，补丁已对固定 reference 执行无写入的 `git apply --check`。

构建需上游冻结的 pnpm-lock，设置 `ACU_BUILD_VERSION=1.2.5-shiro.1` 后执行 `node scripts/run-rollup.mjs extension`。产物为 `dist/extension/index.js`、`manifest.json`、`sql-wasm.wasm`。修正版应在独立酒馆/备份后替换原数据库副本，不能将原版和修正版同时启用为两个数据库实例。
