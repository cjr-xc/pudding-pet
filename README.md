# 布丁的小窗台

一个可以摸、可以喂、可以拖拽转圈的 3D 桌面小宠物。

在线演示：https://cjr-xc.github.io/pudding-pet/

小狗叫「布丁」，住在窗台边。它会随着时间慢慢变饿、变累、变想你；你回来投喂、摸头、陪它玩，它就会重新精神起来。名字可以直接点标题改。

## 功能

- **3D 小狗**：用 Three.js 的球体、圆环、管状体现场搭出来的低多边形小狗，不依赖外部模型文件，离线也能加载。
- **自定义名字**：点标题里的名字即可编辑，最多 8 个字，自动保存到浏览器本地。
- **四种互动**：投喂、摸摸头、一起玩、睡一会儿；每种都有不同的 3D 动作、表情和音效。
- **直接摸狗**：点击 3D 小狗会触发摸头；按住左右拖动可以让它转一圈。
- **状态会衰减**：饱腹、心情、活力三个值会随离线时间下降；心情太低时小狗会耷拉耳朵、掉眼泪，互动后会重新振作。
- **会记仇也会原谅**：离开太久再回来，它会说“我在窗边等了你 …”；摸一下或喂一次就能恢复。
- **昼夜变化**：根据系统时间切换白天、黄昏、夜晚的窗户景色。
- **本地存储**：所有状态存在 localStorage，不需要登录，也不会上传。

## 运行

需要 Node.js 18 或以上。

```bash
cd pudding-pet
npm start
```

打开 http://localhost:4175。

> 页面使用 ES Module 加载 Three.js，必须通过本地服务器打开；直接双击 `index.html` 会被浏览器的模块跨域策略拦住。

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

## 3D 小狗是怎么搭的

没有用现成的 glTF 模型，而是用 Three.js 的基础几何体组合：

- 身体、头、口鼻、眼睛、腮红、爪子：不同缩放的 `SphereGeometry`
- 耳朵：`SphereGeometry` 拉长成耳片，外层奶油色、内层粉色
- 尾巴：`CatmullRomCurve3` + `TubeGeometry` 做一条弯曲的尾巴
- 项圈：`TorusGeometry`
- 蝴蝶结：两个压扁的球 + 一个金色小球
- 饭盆：`CylinderGeometry` + `TorusGeometry` + 小饼干球
- 小球：`SphereGeometry` + 白色半圆环

动画循环里根据场景状态（`is-wilted`、`is-petting`、`is-eating`、`is-playing`、`is-sleeping`、`is-low`）实时调整耳朵角度、头部倾斜、眼睛开合、尾巴摆动、嘴巴开合、饭盆/小球显隐。

交互用 `Raycaster` 判断是否点中了小狗；拖动时改变 `dogGroup.rotation.y`，松手时如果位移很小就当作“摸头”。

## 想自己改

在 `app.js` 顶部找到颜色常量：

```js
const CREAM = 0xf6e1c4;
const EAR = 0xe9b99a;
const PINK = 0xf2a9a0;
const MINT = 0xb9d8c2;
```

改这些值就能换小狗和坐垫的配色。

状态衰减在 `applyOfflineDecay()`：

```js
state.fullness = clamp(state.fullness - hours * 1.0);
state.mood = clamp(state.mood - hours * moodRate);
state.energy = clamp(state.energy - hours * 0.5);
```

互动数值在 `performAction()` 里，比如投喂是 `fullness + 30`、摸头是 `mood + 22`。

## 可以写进简历的描述

**布丁的小窗台（3D 互动宠物）｜个人项目｜2026.10**
技术栈：Three.js · 原生 JavaScript · Node.js · localStorage

- 用 Three.js 基础几何体程序化搭建低多边形 3D 小狗，包含头、身体、耳朵、尾巴、项圈、蝴蝶结等部件，不依赖外部模型文件。
- 设计“饱腹 / 心情 / 活力”状态机与离线衰减：离开越久小狗越蔫，投喂、摸头、陪玩、睡觉会恢复不同数值。
- 用 `Raycaster` 实现点击小狗摸头、拖拽旋转视角；根据状态实时驱动耳朵下垂、眼睛开合、尾巴摆动、嘴巴开合等动画。
- 支持点击标题改名、昼夜天空切换、本地存储和音效开关；3D 加载失败时给出降级提示。

## 面试怎么讲

1. **为什么做这个**：市面上的宠物养成要么纯 2D，要么需要下载模型；我想试试用代码直接搭一个能摸、能转的 3D 小狗。
2. **模型怎么来**：没有外部美术资源，全部用 Three.js 的球体、圆环、管状体组合，颜色和比例都是代码里的常量，方便改。
3. **状态怎么驱动动画**：状态机把“饿 / 蔫 / 开心 / 睡觉 / 吃饭 / 玩球”映射成场景 CSS 类，Three.js 的动画循环读取这些类，平滑插值耳朵、头、眼睛、尾巴的角度。
4. **交互怎么做**：按钮负责数值变化，`Raycaster` 负责点选小狗，`pointerdown/move/up` 负责拖拽旋转；位移小于 6px 视为点击而不是拖拽。
5. **取舍**：没有做骨骼动画和真实毛发，因为目标是“可爱、能跑、能改”，低多边形 + 柔和材质更适合这个场景，也更容易在普通笔记本上稳定 60fps。
