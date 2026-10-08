# 数据库木偶白：素材制作说明

用户指定《元祖！バンドリちゃん》的少女乐队 Q版喜剧画风，要求数据库专用的白和轻量玩笑互动；随后明确要求更可爱、去掉肢体上的黄色圆点。视觉参考在[作品官方站](https://anime.bang-dream.com/bandorichan/)核对，角色是《No Game No Life》的白。本素材由内置图像生成工具绘制，没有打包官方动画截图。

肩膀、手肘、手腕及膝盖均为连续的圆润肢体，没有黄色机械圆点。木偶感通过拖起、晃动和探头表现。黄蝴蝶结与金色眼睛保留为角色特征。

最终素材：`assets/shiro-puppet-sheet.png`，1536×1024 RGBA，3列×2行，每格512×512。SHA256：`c7fa57669435e2b7f19da51125e20a345a6f284a95213d231601ac5316f077a5`。透明像素1004598；六格实色区域均完整留在各自格内，最小边距50像素。

六格顺序为待机、眨眼、得意吐槽、被戳惊讶、被拎起、缩边探头。主题通过 CSS 取格，未用程序重画、裁切或拼接原插画。

1.3.0 保留整张六态图集及其六个完整身像；展开态和侧栏继续使用它。收起态新增 `assets/shiro-peek-head-hands.png`，只包含正向头部、头发和双手，四边都保持 upright，不把完整人物横转成探头。运行时读取原生尺寸，向屏幕内展开，保留 4px 探头运动余量；完整身像外框 inset 4px。原生持久拖动坐标含义不变。

新探头于 2026-10-08 使用内置 `image_gen`，以当前六态 PNG 作为人物与画风参考生成独立单张。输出为 1312×1199 RGBA，1,151,610 bytes；alpha 范围 0..255，非透明区域边界 `[55,19,1252,1124]`。SHA256：`d258cf48e77a003fe3a59a77ce88c85695ba9ddd05d0ffd904e96fe5b0d3de55`。工具生成的 PNG 原样复制进项目，未经程序裁切、重画或图片编辑；原六态 PNG 没有更改。两张素材均由现有 webpack PNG inline 规则内嵌，收起探头不是整张图集缩放。

### 独立探头生成提示词

```text
Use case: identity-preserve. Reference image is ONLY a character/style reference, a six-pose sheet; do not reproduce the sheet. Create ONE standalone upright front-facing Shiro puppet peek sprite: only her head, flowing pastel white/lavender hair with cyan and pink tips, orange-red eyes, and two small hands gripping an invisible lower ledge at either side of her cheeks. Same character and pastel outlined chibi puppet style as reference, inspired by early BanG Dream girl-band anime art. No full body, no torso below hands, no legs, no tilted or sideways head, no props, no text. Single subject centered, compact head plus two hands silhouette, generous small transparent margin. Actual transparent PNG background.
```

工具与透明度检查只证明生成来源和资产格式。造型是否符合用户期望仍由用户目测确认；手机独立夹具与旧版本真实宿主验收都不能代替 1.3.0 的新构建和真实宿主复验。

## 生成提示词

采用内置 image_gen 编辑模式，没有 CLI/API 回退。最终两轮提示词的主要约束：

1. 在独立六态图集上保留白紫长发、蓝粉发梢、红金眼睛、紫色水手服和黄蝴蝶结、深色不透明裤袜；彻底移除肩肘膝腕的圆形机械关节，袖子、皮肤和裤袜改为连续形状。圆脸、柔和腮红、短肢体、小手及俏皮表情；参考少女乐队 Q版喜剧的大头小身和清楚的动画轮廓。
2. 仅修正生产留白：1536×1024、3×2格，每格角色完整显示头发和鞋，四周真实透明；保留六态顺序、造型和无机械关节点要求。待机与眨眼尽量保持同样位置和尺度。

最初候选曾按“木偶”字面绘出圆形关节，用户不接受；该候选保存在本地历史证据中，未作为当前发布素材。商店坐姿 PNG 只作为早期角色身份参考，数据库当前图集为独立绘制。

画风相似程度仍需用户目测；生成工具和自动检查不代替用户对造型的接受。

## 完整重绘提示词

```text
Use case: precise-object-edit.
Asset: a transparent production chibi sprite sheet, exactly 1536x1024, three columns and two rows of 512x512 cells.
Input image 1 is the edit target. Redraw these six Shiro sprites to be distinctly cuter while preserving her recognizable white/lavender long hair, blue/pink hair tips, cowlick, red-gold eyes, purple sailor outfit, small yellow bow, opaque dark tights and brown shoes.
Primary correction: remove EVERY visible yellow/tan circular mechanical joint at shoulders, elbows, knees and wrists. Sleeves, skin and tights must be smooth continuous rounded shapes. NO brass rivets, wood circles, joint buttons, hinge marks or dots on any limb. Yellow remains only in the little costume bow and golden irises. Cute rounded small hands, short limbs, soft round face, gentle rosy cheeks, tiny expressive mouths and comedic chibi expressions inspired by the super-deformed BanG Dream girls-band comedy aesthetic.
Keep pose order: top-left idle, top-middle same exact idle body/hair silhouette and position but eyes closed (blink), top-right mischievous smug hand-to-chin joke; bottom-left startled hands raised, bottom-middle lifted/dangling with floppy arms and feet, bottom-right tilted shy peeking with hands near face. Puppet feeling comes from dangling body pose, not exposed mechanical parts.
The idle and blink cells must register pixel-for-pixel in position and scale except eyelids. All six full bodies and hair entirely inside their own cell with at least 24px transparent padding; no crop, no overlap, no grid lines, no captions, no logo, no props. Keep the clean dark cartoon outline, flat cel color, cute readable faces at 64px. Real fully transparent alpha background, no cast background glow, shadow, gradient or matte.
```

## 最终留白提示词

```text
Use case: precise-object-edit. Input image is the exact edit target, a cute six-pose Shiro sheet. Make ONLY a production layout correction: preserve the exact adorable character design, all six poses, expressions, smooth continuous limbs with NO mechanical circles, colors, and line style. Canvas exactly 1536x1024 RGBA with 3 columns x 2 rows of 512x512 square cells, no drawn grid. Uniformly shrink EVERY character to fit within a centered 400x400 region of its own 512x512 cell, leaving at least 40 pixels genuinely transparent on all four sides of EACH sprite. Entire hair cowlick and shoes must remain fully visible. Idle and blink should have identical body/hair position and dimensions, differ only in eyelids. Do not move any character to a different cell. No overlap across cell borders. Keep all six complete sprites. No visible yellow or tan shoulder/elbow/knee/wrist circles, no mechanical joints. Real alpha transparency throughout background including margins, no gradients, no shadows, no glows, no gray/black matte. This is layout/padding correction ONLY.
```
