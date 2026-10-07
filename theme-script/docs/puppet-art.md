# 数据库木偶白：素材制作说明

用户指定《元祖！バンドリちゃん》的少女乐队 Q版喜剧画风，要求数据库专用的白和轻量玩笑互动；随后明确要求更可爱、去掉肢体上的黄色圆点。视觉参考在[作品官方站](https://anime.bang-dream.com/bandorichan/)核对，角色是《No Game No Life》的白。本素材由内置图像生成工具绘制，没有打包官方动画截图。

肩膀、手肘、手腕及膝盖均为连续的圆润肢体，没有黄色机械圆点。木偶感通过拖起、晃动和探头表现。黄蝴蝶结与金色眼睛保留为角色特征。

最终素材：`assets/shiro-puppet-sheet.png`，1536×1024 RGBA，3列×2行，每格512×512。SHA256：`c7fa57669435e2b7f19da51125e20a345a6f284a95213d231601ac5316f077a5`。透明像素1004598；六格实色区域均完整留在各自格内，最小边距50像素。

六格顺序为待机、眨眼、得意吐槽、被戳惊讶、被拎起、缩边探头。主题通过 CSS 取格，未用程序重画、裁切或拼接原插画。

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
