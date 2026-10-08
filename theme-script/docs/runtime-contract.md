# 执行与来源记录

- 交付模式：component，只输出酒馆助手单脚本 JSON，不改角色卡、不导出整卡或世界书。
- 运行面：酒馆助手未沙盒化脚本 iframe；可见样式和桥明确挂载到 `window.parent.document` / `window.parent`。不向 iframe 自己的文档写主题。
- 导入字段依据：酒馆助手 4.8.18 `src/type/scripts.ts` 与项目 `@types/function/script.d.ts`。单对象 `type:'script'`；`button`、`data`、`export_with` 完整保留。导入器可能重建 ID，开关状态也可能因导入路径不同而变化；先停用全部旧白主题，再确认名称含“木偶白 1.2.1”的新脚本已启用，若关闭再打开，不假定必然默认关闭。
- 按钮依据：`@types/iframe/script.d.ts` 的 `getButtonEvent(name)`；`@types/iframe/event.d.ts` 的 `eventOn(event,listener)`、`eventRemoveListener(event,listener)`。4.8.18 的返回 stop 在包装监听器路径可能不命中原映射，所以清理同时使用原监听器显式撤销，不调用全局清事件函数。
- 启动：jQuery ready；排队前注册 pagehide 取消标记，脚本在 ready 前停用不能复活。启动后由运行实例拥有并清理 pagehide、父页面事件、renderer 与桥。
- 状态：只在当前实例内存中保存 enabled/status/error，不写任何持久变量或宿主设置。停用或重载不留下外观开关状态。
- 主题 renderer 保留数据库完整主题与手机布局；`embeddedPng` 仅接受 8 MiB 以内、带 PNG 签名的 Base64 PNG URL。同来源目录分支指向独立 `shiro-puppet-sheet.png`。
- 图片：1.1.0 使用单独生成的数据库木偶白同人素材，参考用户确认的 BanG Dream 元祖迷你动画的平涂迷你动画方向，不是官方素材；不再复用商店 PNG。完整原图是 1536×1024 RGBA、3 列 2 行，每格 512 方形；顺序 idle／blink／smug／poke／carried／peek。原始 PNG 完整内嵌，运行时不发图片网络请求；每个自有 span 直接设置完整 URL 的 background-image，并使用 300% 200% 的背景尺寸选择单格，避免大 CSS 变量失效与整张 sheet 缩进头像。
- 木偶互动：`puppet.ts` 只维护 transient UI 状态。侧栏头像与按钮触发五句本地台词轮换，3 秒冷却，4 秒淡出，默认无周期台词。1.1.1 安静开关停止玩笑，并通过 renderer 拥有的临时 root 标记同步停止页眉、侧栏和桌宠眨眼；晚挂界面继承本次运行状态，清除装饰时移除 root 标记，不写宿主设置。原生 pet body／peek 添加自有 overlay span，原 img src 与姿态始终保留。peek 只读镜像原 img 的方形展示几何；1.2.1 将带自有 span 的 peek 父层扩为同尺寸正方形，向视口内展开并留 4px 动画余量，避免完整人物沿用原生半身裁框。原生根节点及 img 的 inline 位置和尺寸不写入，样式停用即恢复。pointer 监听只旁听，不 preventDefault、不抢 capture；tap、超过 6px 的拖动及取消分别反应。缩边使用 peek 表情；旋转／失焦取消旧手势。所有 span、监听与超时在原 renderer clear／dispose 路径清理，重复实例不会遗留互动。
- 玩笑不调用模型、不读取行数据、不写聊天／数据库／变量。台词由 textContent 显示，不使用原生通知管理器；真实警告与操作通知内容不替换，也不根据点击保存宣称保存成功。减少动态效果时停止装饰运动。

父页面所有权键为 `Symbol.for('shiro-database-theme:helper-script-owner')`，重复启用脚本先清理旧脚本实例；旧 iframe 随后关闭不能删除新实例。兼容商店的外观桥仍为 `shiro-database-theme:appearance-v1`，增加 `provider:'helper-script'` 标记。商店服务与两个事件名沿用 1.2.0 契约。

不要同时启用多个版本的白主题。原生导入可生成新的脚本 ID，旧副本若随后启动仍可能接管外观；验收必须按整个白主题系列检查各作用域的启用副本，并在冷重载后核对实际运行版本。只统计新版全名出现一次，不能证明旧版已停用。

1.2.0 可选消费商店 1.3.1 的 `shiro-butterfly-shop:ui-v1` 只读分页／订阅服务，将四类真实业务记录挂在数据库内容区的正常文档流中，不进入原生私有 store。每个 renderer 只有一条订阅，侧栏／内容重挂不会重复订阅；切换身份通知或读取拒绝即清旧资料，读序号阻止迟到结果。停用主题、商店服务替换、未知布局或 dispose 清理自有订阅、面板和事件；模型与聊天注入继续只由商店原有流程拥有。详情见[四表消费契约](memory-view-contract.md)。

检测到旧独立主题扩展或旧商店内置主题时，脚本提示用户先停用旧主题；不调用旧扩展 dispose、不覆盖其服务。如果旧扩展在脚本之后被用户启用，脚本只撤回自己的挂载并进入等待状态，保留新扩展。

自动测试覆盖父／子窗口分离、内嵌图片、pagehide、同主题副本重载、两个加载顺序、单独关闭商店、旧主题冲突与恢复、后启用扩展接管、ready取消、按钮原监听器清理、输出语法与哈希。真实导入／启停／手机交互由隔离宿主 QA 单独记录。
