# 布丁的小窗台

一个可以摸、可以喂、可以拖拽转圈的 3D 桌面小宠物。

在线演示：https://cjr-xc.github.io/pudding-pet/

小狗叫「布丁」，是一只棕色＋白色的哈士奇/阿拉斯加风格 3D 狗：白脸、棕背、立耳，站在木地板上，旁边放着一个蓝色小玩具。**第一次打开它是站着的；点它一下会摸头并切换站姿/趴姿；不点就一直保持当前姿态，不会自己趴下。** 刷新后会回到站姿。名字可以直接点标题改。

## 功能

- **带骨骼动画的 3D 狗**：接入 Quaternius 的 CC0 Husky GLB 模型，自带 Idle、Walk、Gallop、Eating、HitReact、Death、Jump 等 12+ 组骨骼动画，不依赖联网。
- **站姿 / 趴姿由你控制**：首次访问站着；点狗会摸头并切换站姿/趴姿；不点就不会自动改变待机状态；刷新回到站姿。
- **自定义名字**：点标题里的名字即可编辑，最多 8 个字，自动保存到浏览器本地。
- **四种互动**：投喂、摸摸头、一起玩、睡一会儿；点狗会触发 HitReact，投喂会站起来吃，玩球会跑出去捡。
- **完整捡球时间线**：抛球 → 小狗站起来 Gallop 追球 → 低头叼起 → Walk 跑回来 → 放下，再回到你当前的站姿/趴姿，约 6 秒。
- **直接摸狗**：点击 3D 小狗会触发摸头并切换站/趴；按住左右拖动可以让它转一圈；点旁边的蓝色玩具也会触发一起玩。
- **语音指挥**：点麦克风说“站起来、趴下、过来、握手、吃饭、玩球、睡觉、转圈”，会调用对应的 3D 动作；麦克风不可用时可以在下面的输入框里打字执行同样的指令。需要 Chrome/Edge、HTTPS 或 localhost，并允许麦克风权限；语音由浏览器自带识别服务处理，应用不保存音频。
- **状态会衰减**：饱腹、心情、活力三个值会随离线时间下降；心情太低时会切到低头姿态，互动后恢复。
- **会记仇也会原谅**：离开太久再回来，它会说“我在窗边等了你 …”；摸一下或喂一次就能恢复。
- **昼夜变化**：根据系统时间切换白天、黄昏、夜晚的窗户景色，白色窗帘和木地板保持室内感。
- **本地存储**：所有状态存在 localStorage，不需要登录，也不会上传。

## 运行

需要 Node.js 18 或以上。

```bash
cd pudding-pet
npm start
```

打开 http://localhost:4175。

> 页面使用 ES Module 加载 Three.js，必须通过本地服务器打开；直接双击 `index.html` 会被浏览器的模块跨域策略拦住。

## 语音 / 文字指令

点右侧“语音指挥”里的麦克风，允许麦克风权限后说：

| 说 | 动作 |
|---|---|
| 站起来 / 起立 | 切回站姿 Idle_2 |
| 趴下 / 躺下 / 休息 | 切到趴姿 Death 结束帧 |
| 过来 / 靠近 | Walk 走到镜头前 |
| 握手 / 抬爪 | HitReact + 爱心 |
| 吃饭 / 投喂 | Eating + 饭盆 |
| 玩球 / 捡球 | 抛网球、Gallop 追球、叼回 |
| 睡觉 | Death + Zzz |
| 转圈 | 原地转一圈 |
| 跳一下 | Jump_ToIdle |
| 停下 | 取消当前动作并回到待机 |

如果浏览器语音服务不可用（比如没有麦克风、没给权限，或 Chrome 的语音服务在你的网络下不可达），可以在麦克风下面的输入框里直接打字“趴下”“握手”“玩球”，走同一套命令逻辑。

## 项目结构

```
pudding-pet/
├── index.html      # 页面结构：窗台、3D 画布、状态罐、互动按钮、便签
├── styles.css      # 奶油手账风视觉、状态罐、按钮、响应式
├── app.js          # 状态机、离线衰减、Three.js 建模与动画、交互、改名
├── server.js       # 本地静态服务器
├── vendor/
│   ├── three.module.js
│   └── three.core.js
├── package.json
└── README.md
```

## 3D 狗是怎么做的

用的是现成的骨骼动画模型，不是现场用球体拼的：

- **模型**：Quaternius《Ultimate Animated Animal Pack》里的 `Husky.glb`，CC0，带骨骼和 12+ 组动画。
- **加载**：`GLTFLoader` 读取 `assets/husky.glb`；`Box3` 计算包围盒，自动缩放到约 1.55 高，并让脚落在地板上。
- **配色**：模型本身是灰度材质，加载后按材质亮度重新映射为棕色、白色和深色鼻子/眼睛，做成照片里的棕白配色。
- **动画**：`AnimationMixer` 管理 Idle、Death、Gallop、Walk、Eating、Idle_HitReact_Left、Idle_2_HeadLow 等剪辑；切换时用 `crossFadeFrom` 淡入淡出。
- **站姿/趴姿**：用内存里的 `idleMode` 控制。首次进入用 `Idle_2` 站着；点狗时在 `stand` / `lie` 之间切换，趴姿用 `Death` 的结束帧；`idleMode` 不写 localStorage，刷新回到站姿。
- **捡球时间线**：抛球 → Gallop 追球 → Idle_2_HeadLow 低头叼起 → Walk 跑回 → 按当前 `idleMode` 回到站姿或趴姿；球在叼住阶段按狗的朝向和位置贴在嘴边。
- **后备方案**：如果 GLB 加载失败，页面会保留代码里用基础几何体搭的小狗，交互和状态机仍然可用。

## 素材授权

- `assets/husky.glb`：Quaternius, *Ultimate Animated Animal Pack*, **CC0 1.0**，可商用、无需署名。来源：https://quaternius.com/packs/ultimateanimatedanimals.html
- Three.js / GLTFLoader：MIT License。

## 想自己改

### 换配色

模型是灰度材质，在 `loadHusky()` 里按材质亮度重新映射：

```js
const BROWN = 0x6f4a38;
const WHITE = 0xf8f2e8;
const NOSE = 0x3e2c24;
```

改这三个常量就能换狗的颜色。模型高度在 `const scale = 1.55 / (size.y || 1);`。

### 改站姿 / 趴姿

- 默认待机是 `idleMode = "stand"`，刷新一定回到站姿。
- 点狗时 `performAction("pet", { toggleIdle: true })` 会在 `stand` / `lie` 之间切换；“摸摸头”按钮只摸头，不切换。
- 想让它首次就趴着：在 `loadHusky()` 成功后把 `idleMode` 设成 `"lie"`。
- 想记住上次姿态：把 `idleMode` 存进 state/localStorage，并在 `loadHusky()` 里读回来。

### 改动画

`playGltf(name, options)` 负责切换剪辑；可用剪辑名有 Idle、Idle_2、Idle_2_HeadLow、Walk、Gallop、Eating、Idle_HitReact_Left、Jump_ToIdle、Gallop_Jump、Death 等。捡球时间线在 `animate()` 的 `fetchState` 块里。

### 状态衰减

```js
state.fullness = clamp(state.fullness - hours * 1.0);
state.mood = clamp(state.mood - hours * moodRate);
state.energy = clamp(state.energy - hours * 0.5);
```

互动数值在 `performAction()` 里，比如投喂是 `fullness + 30`、摸头是 `mood + 22`。

## 可以写进简历的描述

**布丁的小窗台（3D 互动宠物）｜个人项目｜2026.10**
技术栈：Three.js · GLTFLoader · AnimationMixer · 原生 JavaScript · localStorage

- 接入 Quaternius CC0 Husky 骨骼动画 glTF 模型，用 GLTFLoader + AnimationMixer 管理 Idle / Death / Gallop / Walk / Eating / HitReact 等剪辑，Box3 自动缩放并落地。
- 设计“首次站立、点狗切换站姿/趴姿、不点不自动变”的待机控制，以及“抛球 → 追球 → 叼起 → 跑回 → 放下”的约 6 秒捡球时间线。
- 用 `Raycaster` 实现点击小狗摸头、点击蓝色玩具陪玩、拖拽旋转视角；根据状态与交互切换骨骼动画并做淡入淡出。
- 将灰度模型材质按亮度重映射为棕白配色，用 CanvasTexture 还原木地板、白窗帘和软垫；支持点击标题改名、昼夜切换、本地存储和音效开关。

## 面试怎么讲

1. **为什么做这个**：我想照着家里狗的照片做一个能摸、能喂、能转圈的 3D 版本；先用基础几何体搭过一版，觉得不够真实，后来换成带骨骼的 CC0 Husky 模型。
2. **模型怎么来**：来自 Quaternius 的 Ultimate Animated Animal Pack，CC0 可商用；用 GLTFLoader 载入，Box3 算包围盒后自动缩放到 1.55 高并让脚落地，再把灰度材质按亮度重映射成棕白配色。
3. **动画怎么驱动**：用 AnimationMixer 管理剪辑，Idle_2 是默认站姿，点狗时切到 Death 的结束帧趴下、再点回到 Idle_2；Gallop/Walk 用于追球和跑回，Eating/HitReact 用于投喂和摸头，切换时用 crossFadeFrom 淡入淡出。
4. **交互怎么做**：按钮负责数值变化，`Raycaster` 负责点选小狗和蓝色玩具，`pointerdown/move/up` 负责拖拽旋转；位移小于 6px 视为点击而不是拖拽。
5. **取舍**：模型是低多边形风格，不是照片级毛发，但有真实骨骼和 12+ 组动作；如果追求更写实，可以换成带 PBR 贴图的 Malamute glTF，现有的状态机和捡球时间线可以直接复用。
