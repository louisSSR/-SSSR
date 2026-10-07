# 执行与来源记录

- 交付模式：component，只输出酒馆助手单脚本 JSON，不改角色卡、不导出整卡或世界书。
- 运行面：酒馆助手未沙盒化脚本 iframe；可见样式和桥明确挂载到 `window.parent.document` / `window.parent`。不向 iframe 自己的文档写主题。
- 导入字段依据：酒馆助手 4.8.18 `src/type/scripts.ts` 与项目 `@types/function/script.d.ts`。单对象 `type:'script'`；`button`、`data`、`export_with` 完整保留。原生导入器可能重建 ID 并强制 `enabled:false`，因此用户须在导入后手动启用。
- 按钮依据：`@types/iframe/script.d.ts` 的 `getButtonEvent(name)`；`@types/iframe/event.d.ts` 的 `eventOn(event,listener)`、`eventRemoveListener(event,listener)`。4.8.18 的返回 stop 在包装监听器路径可能不命中原映射，所以清理同时使用原监听器显式撤销，不调用全局清事件函数。
- 启动：jQuery ready；排队前注册 pagehide 取消标记，脚本在 ready 前停用不能复活。启动后由运行实例拥有并清理 pagehide、父页面事件、renderer 与桥。
- 状态：只在当前实例内存中保存 enabled/status/error，不写任何持久变量或宿主设置。停用或重载不留下外观开关状态。
- 主题 renderer 继承已验收的数据库完整主题与手机 CSS；增加仅用于组件交付的 `embeddedPng` 分支。仅接受 8 MiB 以内、带 PNG 签名的 Base64 PNG URL；原同来源目录分支保持不变。
- 图片：复用此前 image_gen 生成的 Q 版白同人 PNG，不是官方素材。构建时将原始 PNG 完整内嵌，运行时不发图片网络请求。

父页面所有权键为 `Symbol.for('shiro-database-theme:helper-script-owner')`，重复启用脚本先清理旧脚本实例；旧 iframe 随后关闭不能删除新实例。兼容商店的外观桥仍为 `shiro-database-theme:appearance-v1`，增加 `provider:'helper-script'` 标记。商店服务与两个事件名沿用 1.2.0 契约。

检测到旧独立主题扩展或旧商店内置主题时，脚本提示用户先停用旧主题；不调用旧扩展 dispose、不覆盖其服务。如果旧扩展在脚本之后被用户启用，脚本只撤回自己的挂载并进入等待状态，保留新扩展。

自动测试覆盖父／子窗口分离、内嵌图片、pagehide、同主题副本重载、两个加载顺序、单独关闭商店、旧主题冲突与恢复、后启用扩展接管、ready取消、按钮原监听器清理、输出语法与哈希。真实导入／启停／手机交互由隔离宿主 QA 单独记录。
