import * as THREE from "./vendor/three.module.js";

(() => {
  "use strict";

  const STORAGE_KEY = "pudding-pet-v1";
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const ACTION_CLASSES = ["is-eating", "is-petting", "is-playing", "is-sleeping"];

  const el = (id) => document.getElementById(id);
  const room = el("scene");
  const speech = el("speech");
  const canvas = el("dogCanvas");
  const fallback = el("webglFallback");

  let audioCtx = null;
  let speechTimer = null;
  let toastTimer = null;
  let lastActionAt = 0;
  let currentAwayMs = 0;
  const actionTimers = {};

  let renderer = null;
  let world = null;
  let camera = null;
  let dogGroup = null;
  let headGroup = null;
  let leftEar = null;
  let rightEar = null;
  let tailGroup = null;
  let tear = null;
  let smile = null;
  let frown = null;
  let mouthOpen = null;
  let tongue = null;
  let bowlGroup = null;
  let ballGroup = null;
  const eyeGroups = [];
  const happyEyes = [];
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const startedAt = performance.now();
  let targetRotation = 0;
  let pointerDown = false;
  let pointerLastX = 0;
  let pointerMoved = 0;

  const CREAM = 0xf6e1c4;
  const LIGHT = 0xfff4e6;
  const EAR = 0xe9b99a;
  const INNER_EAR = 0xf5c9c3;
  const COCOA = 0x5b463c;
  const DARK = 0x4b382f;
  const PINK = 0xf2a9a0;
  const MINT = 0xb9d8c2;
  const BUTTER = 0xf7d98b;

  function clamp(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, value));
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function localDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function freshState() {
    const now = Date.now();
    return {
      name: "布丁",
      fullness: 78,
      mood: 84,
      energy: 88,
      lastSeen: now,
      lastInteraction: now,
      counts: { feed: 0, pet: 0, play: 0, sleep: 0 },
      countsDate: localDateKey(),
      sound: true,
      createdAt: now,
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { state: freshState(), isNew: true };
      const parsed = JSON.parse(raw);
      return { state: { ...freshState(), ...parsed }, isNew: false };
    } catch {
      return { state: freshState(), isNew: true };
    }
  }

  const loaded = loadState();
  let state = loaded.state;
  let isNew = loaded.isNew;

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* 本地存储不可用时，当前页面仍然可用 */
    }
  }

  function formatDuration(ms) {
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${Math.max(1, minutes)} 分钟`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours < 24) return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
    return `${Math.floor(hours / 24)} 天`;
  }

  function applyOfflineDecay() {
    const now = Date.now();
    const elapsed = Math.max(0, now - (state.lastSeen || now));
    currentAwayMs = elapsed;

    if (elapsed > 3 * 60 * 1000) {
      const hours = elapsed / HOUR;
      const moodRate = hours > 12 ? 1.2 : 0.7;
      state.fullness = clamp(state.fullness - hours * 1.0);
      state.mood = clamp(state.mood - hours * moodRate);
      state.energy = clamp(state.energy - hours * 0.5);
    }

    state.lastSeen = now;

    if (state.countsDate !== localDateKey()) {
      state.counts = { feed: 0, pet: 0, play: 0, sleep: 0 };
      state.countsDate = localDateKey();
    }

    save();
  }

  function getMood() {
    const avg = (state.fullness + state.mood + state.energy) / 3;
    if (state.mood < 24) {
      return { key: "wilted", label: "想你了", hint: "在窗边等你很久了", className: "is-wilted" };
    }
    if (avg >= 75) {
      return { key: "happy", label: "元气满满", hint: "尾巴摇得像小风扇", className: "is-happy" };
    }
    if (avg >= 50) {
      return { key: "content", label: "软乎乎的", hint: "想被摸摸头", className: "is-content" };
    }
    return { key: "low", label: "有点没精神", hint: "需要一点照顾", className: "is-content" };
  }

  function defaultSpeech() {
    if (getMood().key === "wilted") {
      return pick(["有点蔫…可以摸摸我吗？", "我在这里等你，不着急。", "今天也想被你想起。"]);
    }
    if (state.energy < 25) return "好困呀，想靠着你睡一会儿。";
    if (state.fullness < 30) return "肚子在咕咕叫…";
    if (state.mood < 45) return "今天有点安静，想听你说话。";
    return pick([
      "今天也最喜欢你啦。",
      "窗外的云像棉花糖。",
      "再摸一下下嘛。",
      "我在这里陪着你。",
      "你忙你的，我就在旁边。",
    ]);
  }

  function setSpeech(text, hold = 3600) {
    speech.textContent = text;
    speech.classList.remove("pop");
    void speech.offsetWidth;
    speech.classList.add("pop");
    clearTimeout(speechTimer);
    speechTimer = setTimeout(() => {
      speech.textContent = defaultSpeech();
    }, hold);
  }

  function renderStats() {
    el("fill-fullness").style.height = `${state.fullness}%`;
    el("fill-mood").style.height = `${state.mood}%`;
    el("fill-energy").style.height = `${state.energy}%`;
    el("val-fullness").textContent = String(Math.round(state.fullness));
    el("val-mood").textContent = String(Math.round(state.mood));
    el("val-energy").textContent = String(Math.round(state.energy));
  }

  function renderMood() {
    const wasWilted = room.classList.contains("is-wilted");
    const mood = getMood();
    room.classList.remove("is-wilted", "is-happy", "is-content");
    room.classList.add(mood.className);
    room.classList.toggle("is-low", mood.key === "low");
    const moodLabel = el("moodLabel");
    moodLabel.textContent = mood.label;
    moodLabel.className = mood.key;
    el("statusHint").textContent = mood.hint;

    if (wasWilted && mood.className !== "is-wilted") {
      room.classList.add("is-reviving");
      setTimeout(() => room.classList.remove("is-reviving"), 760);
    }
  }

  function renderNote() {
    const c = state.counts;
    const parts = [];
    if (c.pet) parts.push(`被摸了 ${c.pet} 次`);
    if (c.feed) parts.push(`吃了 ${c.feed} 块小饼干`);
    if (c.play) parts.push(`一起玩了 ${c.play} 次球`);
    if (c.sleep) parts.push(`睡了 ${c.sleep} 个小觉`);
    el("dailyNote").textContent = parts.length
      ? `今天${parts.join("，")}。`
      : "今天还什么都没做，先摸摸头吧。";
  }

  function renderSound() {
    const button = el("soundBtn");
    button.classList.toggle("is-muted", !state.sound);
    button.setAttribute("aria-pressed", String(state.sound));
    button.setAttribute("aria-label", state.sound ? "关闭声音" : "开启声音");
    const symbol = button.querySelector(".sound-on");
    if (symbol) symbol.textContent = state.sound ? "♪" : "×";
  }

  function updateAwayNote() {
    let text = "今天也在一起。";
    if (currentAwayMs > DAY) {
      text = `你离开了 ${formatDuration(currentAwayMs)}，${state.name}有点想你。`;
    } else if (currentAwayMs > 2 * HOUR) {
      text = `你去忙了 ${formatDuration(currentAwayMs)}，${state.name}在窗边等你。`;
    }
    el("awayNote").textContent = text;
  }

  function renderDateAndTime() {
    const now = new Date();
    const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    el("dateChip").textContent = `${now.getMonth() + 1} 月 ${now.getDate()} 日 · ${weekdays[now.getDay()]}`;

    const hour = now.getHours();
    document.body.classList.remove("time-day", "time-dusk", "time-night");
    if (hour >= 6 && hour < 17) {
      document.body.classList.add("time-day");
    } else if (hour >= 17 && hour < 20) {
      document.body.classList.add("time-dusk");
    } else {
      document.body.classList.add("time-night");
    }
  }

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 6) return "这么晚还没睡呀…";
    if (hour < 12) return "早上好呀，今天也慢慢来。";
    if (hour < 18) return "下午好呀，要不要一起发会儿呆？";
    return "晚上好呀，今天辛苦啦。";
  }

  function render() {
    renderStats();
    renderMood();
    renderNote();
    renderSound();
    updateAwayNote();
  }

  function applyName(name, speak = false) {
    const next = String(name || "").trim().slice(0, 8) || state.name || "布丁";
    state.name = next;
    el("petName").textContent = next;
    document.title = `${next}的小窗台`;
    document.querySelector(".status-head h2").textContent = `${next}的状态`;
    document.querySelector(".actions-card h2").textContent = `陪陪${next}`;
    document.querySelector(".note-sign").textContent = `—— ${next}留`;
    const dragTipName = el("dragTipName");
    if (dragTipName) dragTipName.textContent = next;
    save();
    if (speak) setSpeech(`${next}，这个名字真好听。`, 3200);
  }

  function selectNameContents() {
    const node = el("petName");
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function clearActionClasses() {
    ACTION_CLASSES.forEach((name) => {
      room.classList.remove(name);
      clearTimeout(actionTimers[name]);
    });
  }

  function setActionClass(name, duration) {
    clearActionClasses();
    room.classList.add(name);
    actionTimers[name] = setTimeout(() => {
      room.classList.remove(name);
      if (name === "is-sleeping") {
        setSpeech("睡醒啦，精神多了。", 2800);
        spawnParticles("sparkle", 6, 50, 42);
        soundWake();
      }
    }, duration);
  }

  function spawnParticles(type, count = 8, originX = 50, originY = 44) {
    const container = el("particles");
    for (let i = 0; i < count; i += 1) {
      const particle = document.createElement("span");
      particle.className = `particle ${type}`;
      if (type === "heart") particle.textContent = pick(["♥", "♡"]);
      if (type === "sparkle") particle.textContent = pick(["✦", "✧", "⋆"]);
      particle.style.left = `${originX + (Math.random() - 0.5) * 26}%`;
      particle.style.top = `${originY + (Math.random() - 0.5) * 14}%`;
      particle.style.setProperty("--dx", `${(Math.random() - 0.5) * 90}px`);
      particle.style.setProperty("--rot", `${(Math.random() - 0.5) * 70}deg`);
      particle.style.animationDelay = `${Math.random() * 0.14}s`;
      container.appendChild(particle);
      setTimeout(() => particle.remove(), 1500);
    }
  }

  function ensureAudio() {
    if (!state.sound) return null;
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function tone(freq, duration, type = "sine", gain = 0.035, delay = 0) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const volume = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = freq;
    const start = ctx.currentTime + delay;
    volume.gain.setValueAtTime(0.0001, start);
    volume.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(volume).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  function soundFeed() {
    tone(680, 0.09, "sine", 0.04);
    tone(520, 0.12, "sine", 0.03, 0.1);
  }

  function soundPet() {
    tone(880, 0.16, "sine", 0.03);
    tone(1046, 0.18, "sine", 0.018, 0.09);
  }

  function soundPlay() {
    tone(520, 0.08, "triangle", 0.035);
    tone(780, 0.12, "triangle", 0.028, 0.09);
  }

  function soundSleep() {
    tone(392, 0.35, "sine", 0.02);
    tone(330, 0.4, "sine", 0.014, 0.14);
  }

  function soundWake() {
    tone(523, 0.1, "sine", 0.025);
    tone(659, 0.14, "sine", 0.02, 0.1);
  }

  function toast(message) {
    const node = el("toast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove("show"), 2200);
  }

  function resetCountsIfNeeded() {
    if (state.countsDate !== localDateKey()) {
      state.counts = { feed: 0, pet: 0, play: 0, sleep: 0 };
      state.countsDate = localDateKey();
    }
  }

  function performAction(action) {
    const now = Date.now();
    if (now - lastActionAt < 180) return;
    lastActionAt = now;
    ensureAudio();
    resetCountsIfNeeded();
    const wasWilted = room.classList.contains("is-wilted");
    currentAwayMs = 0;

    if (action === "feed") {
      if (state.fullness >= 96) {
        state.mood = clamp(state.mood + 4);
        setSpeech("吃不下啦，但谢谢你陪我。", 3200);
        setActionClass("is-petting", 1200);
        spawnParticles("heart", 4, 50, 40);
        soundPet();
      } else {
        state.fullness = clamp(state.fullness + 30);
        state.mood = clamp(state.mood + 8);
        state.energy = clamp(state.energy + 3);
        state.counts.feed += 1;
        setSpeech(pick(["咔嚓咔嚓！小饼干最好吃了。", "谢谢！我会好好吃完的。", "这个味道，喜欢！"]), 3200);
        setActionClass("is-eating", 1800);
        spawnParticles("crumb", 8, 50, 72);
        soundFeed();
      }
    } else if (action === "pet") {
      const before = state.mood;
      state.mood = clamp(state.mood + 22);
      state.energy = clamp(state.energy + 4);
      state.counts.pet += 1;
      setSpeech(
        before >= 95
          ? "已经开心得冒泡啦。"
          : pick(["呼噜呼噜…再摸一下。", "最喜欢你的手了。", "唔…好舒服。", "我在这里，哪儿也不去。"]),
        3200
      );
      setActionClass("is-petting", 1600);
      spawnParticles("heart", 9, 50, 38);
      soundPet();
    } else if (action === "play") {
      if (state.energy < 15) {
        setSpeech("有点累啦，先睡一会儿好不好？", 3200);
      } else {
        state.mood = clamp(state.mood + 18);
        state.energy = clamp(state.energy - 8);
        state.fullness = clamp(state.fullness - 5);
        state.counts.play += 1;
        setSpeech(pick(["再扔一次！这次我一定接住。", "小球小球，飞起来啦！", "你扔得真好，再来一次。"]), 3200);
        setActionClass("is-playing", 1400);
        spawnParticles("sparkle", 7, 50, 44);
        soundPlay();
      }
    } else if (action === "sleep") {
      if (state.energy >= 85) {
        setSpeech("还不困呢，想再陪你一会儿。", 3200);
      } else {
        state.energy = clamp(state.energy + 35);
        state.mood = clamp(state.mood + 5);
        state.counts.sleep += 1;
        setSpeech("呼…睡一小会儿。", 2600);
        setActionClass("is-sleeping", 3000);
        soundSleep();
      }
    }

    state.lastInteraction = now;
    state.lastSeen = now;
    if (wasWilted) state.mood = clamp(state.mood + 10);
    save();
    render();
  }

  function toggleSound() {
    state.sound = !state.sound;
    save();
    renderSound();
    if (state.sound) {
      tone(660, 0.1, "sine", 0.03);
      toast("声音已打开");
    } else {
      toast("声音已关闭");
    }
  }

  function resetPet() {
    const name = state.name;
    if (!confirm("重新养一只？状态会回到最初，今天的记录也会清空。")) return;
    localStorage.removeItem(STORAGE_KEY);
    state = freshState();
    state.name = name;
    isNew = true;
    currentAwayMs = 0;
    clearActionClasses();
    save();
    applyName(name, false);
    render();
    setSpeech(`你好呀，我是${name}。以后请多关照。`, 5200);
    toast("重新开始啦");
  }

  function decayLive(minutes) {
    state.fullness = clamp(state.fullness - minutes * 0.02);
    state.mood = clamp(state.mood - minutes * 0.015);
    state.energy = clamp(state.energy - minutes * 0.01);
  }

  function handleReturn() {
    const now = Date.now();
    const elapsed = Math.max(0, now - state.lastSeen);
    currentAwayMs = elapsed;
    if (elapsed > 5 * 60 * 1000) {
      const hours = elapsed / HOUR;
      state.fullness = clamp(state.fullness - hours * 1.0);
      state.mood = clamp(state.mood - hours * (hours > 12 ? 1.2 : 0.7));
      state.energy = clamp(state.energy - hours * 0.5);
      setSpeech(`你回来啦…我在窗边等了你 ${formatDuration(elapsed)}。`, 5200);
    }
    state.lastSeen = now;
    save();
    render();
  }

  /* ---------- Three.js ---------- */

  function material(color, options = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.88,
      metalness: 0,
      ...options,
    });
  }

  function addSphere(parent, radius, color, position, scale = [1, 1, 1], options = {}) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 24), material(color, options));
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function buildDog() {
    const body = addSphere(dogGroup, 0.8, CREAM, [0, 0.8, 0], [1.05, 1.0, 0.9]);
    addSphere(dogGroup, 0.52, LIGHT, [0, 0.7, 0.6], [1.0, 1.15, 0.3]);

    headGroup = new THREE.Group();
    headGroup.position.set(0, 1.55, 0.08);
    dogGroup.add(headGroup);
    addSphere(headGroup, 0.75, CREAM, [0, 0, 0], [1.05, 1.0, 0.95]);

    addSphere(headGroup, 0.28, LIGHT, [0, -0.17, 0.56], [1.3, 0.9, 0.85]);
    addSphere(headGroup, 0.1, DARK, [0, -0.09, 0.82], [1.2, 0.85, 0.8]);

    [-1, 1].forEach((side, index) => {
      const eye = new THREE.Group();
      eye.position.set(side * 0.27, 0.13, 0.66);
      addSphere(eye, 0.1, DARK, [0, 0, 0]);
      addSphere(eye, 0.032, 0xffffff, [-0.03, 0.035, 0.075], [1, 1, 0.5]);
      headGroup.add(eye);
      eyeGroups.push(eye);

      const happy = new THREE.Mesh(
        new THREE.TorusGeometry(0.09, 0.022, 8, 16, Math.PI),
        material(DARK)
      );
      happy.position.set(side * 0.27, 0.13, 0.72);
      happy.rotation.z = Math.PI;
      happy.visible = false;
      headGroup.add(happy);
      happyEyes.push(happy);
    });

    [-1, 1].forEach((side) => {
      addSphere(
        headGroup,
        0.14,
        PINK,
        [side * 0.48, -0.12, 0.55],
        [1.2, 0.8, 0.25],
        { transparent: true, opacity: 0.72 }
      );
    });

    smile = new THREE.Mesh(
      new THREE.TorusGeometry(0.11, 0.022, 8, 16, Math.PI),
      material(DARK)
    );
    smile.position.set(0, -0.27, 0.84);
    smile.rotation.z = Math.PI;
    headGroup.add(smile);

    frown = new THREE.Mesh(
      new THREE.TorusGeometry(0.11, 0.022, 8, 16, Math.PI),
      material(DARK)
    );
    frown.position.set(0, -0.27, 0.84);
    frown.visible = false;
    headGroup.add(frown);

    mouthOpen = addSphere(headGroup, 0.09, DARK, [0, -0.27, 0.82], [1.2, 1, 0.55]);
    mouthOpen.visible = false;
    tongue = addSphere(headGroup, 0.05, PINK, [0, -0.3, 0.86], [1.3, 0.7, 0.6]);
    tongue.visible = false;

    tear = addSphere(
      headGroup,
      0.035,
      0x9fcbe0,
      [-0.24, -0.02, 0.72],
      [1, 1.3, 1],
      { transparent: true, opacity: 0.92 }
    );
    tear.visible = false;

    function buildEar(side) {
      const ear = new THREE.Group();
      ear.position.set(side * 0.66, 0.28, 0.24);
      addSphere(ear, 0.3, EAR, [0, -0.32, 0], [0.6, 1.15, 0.42]);
      addSphere(ear, 0.2, INNER_EAR, [0, -0.34, 0.1], [0.5, 0.9, 0.22], {
        transparent: true,
        opacity: 0.85,
      });
      headGroup.add(ear);
      return ear;
    }

    leftEar = buildEar(-1);
    rightEar = buildEar(1);
    leftEar.rotation.z = -0.12;
    rightEar.rotation.z = 0.12;

    const bow = new THREE.Group();
    bow.position.set(0.54, 0.46, 0.44);
    headGroup.add(bow);
    const bowLeft = addSphere(bow, 0.12, PINK, [-0.1, 0, 0], [1.2, 0.7, 0.5]);
    bowLeft.rotation.z = 0.5;
    const bowRight = addSphere(bow, 0.12, PINK, [0.1, 0, 0], [1.2, 0.7, 0.5]);
    bowRight.rotation.z = -0.5;
    addSphere(bow, 0.065, BUTTER, [0, 0, 0.02]);

    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.06, 10, 32),
      material(MINT)
    );
    collar.position.set(0, 1.12, 0.05);
    collar.rotation.x = Math.PI / 2;
    collar.castShadow = true;
    dogGroup.add(collar);
    addSphere(dogGroup, 0.08, BUTTER, [0, 1.02, 0.52], [1, 1.2, 0.7]);

    [-1, 1].forEach((side) => {
      addSphere(dogGroup, 0.22, CREAM, [side * 0.32, 0.2, 0.6], [1.1, 0.7, 1.3]);
    });

    tailGroup = new THREE.Group();
    tailGroup.position.set(0.52, 0.55, -0.45);
    dogGroup.add(tailGroup);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.25, 0.02, -0.12),
      new THREE.Vector3(0.4, 0.25, -0.22),
      new THREE.Vector3(0.3, 0.5, -0.08),
    ]);
    const tail = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 20, 0.08, 8, false),
      material(CREAM)
    );
    tail.castShadow = true;
    tailGroup.add(tail);
    addSphere(tailGroup, 0.09, LIGHT, [0.3, 0.5, -0.08]);

    [
      [-0.08, 0.79, 0.04],
      [0.02, 0.83, 0.02],
      [0.12, 0.79, 0.06],
    ].forEach(([x, y, z], index) => {
      addSphere(headGroup, 0.07 - index * 0.008, CREAM, [x, y, z]);
    });

    return body;
  }

  function buildCushion() {
    const cushion = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.35, 0.26, 48),
      material(MINT)
    );
    cushion.position.y = 0.13;
    cushion.receiveShadow = true;
    world.add(cushion);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(1.2, 0.06, 12, 48),
      material(0xa7c9b3)
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.26;
    rim.castShadow = true;
    rim.receiveShadow = true;
    world.add(rim);

    const shadowPlane = new THREE.Mesh(
      new THREE.CircleGeometry(1.9, 32),
      new THREE.ShadowMaterial({ opacity: 0.18 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.295;
    shadowPlane.receiveShadow = true;
    world.add(shadowPlane);
  }

  function buildProps() {
    bowlGroup = new THREE.Group();
    bowlGroup.position.set(0, 0.38, 1.05);
    bowlGroup.visible = false;
    world.add(bowlGroup);
    const bowlBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.24, 0.22, 24),
      material(PINK)
    );
    bowlBody.castShadow = true;
    bowlGroup.add(bowlBody);
    const bowlRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.035, 8, 24),
      material(0xe88fa0)
    );
    bowlRim.rotation.x = Math.PI / 2;
    bowlRim.position.y = 0.11;
    bowlGroup.add(bowlRim);
    [
      [-0.12, 0.16, 0.05],
      [0.08, 0.17, -0.03],
      [0.18, 0.16, 0.08],
    ].forEach(([x, y, z]) => addSphere(bowlGroup, 0.055, EAR, [x, y, z]));

    ballGroup = new THREE.Group();
    ballGroup.position.set(1.2, 0.7, 0.9);
    ballGroup.visible = false;
    world.add(ballGroup);
    addSphere(ballGroup, 0.18, BUTTER, [0, 0, 0]);
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.18, 0.014, 6, 24, Math.PI),
      material(0xfffdf7)
    );
    band.rotation.y = Math.PI / 2;
    ballGroup.add(band);
  }

  function resizeRenderer() {
    if (!renderer || !camera) return;
    const rect = el("petStage").getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const narrow = width / height < 0.95;
    camera.position.set(0, narrow ? 2.9 : 2.6, narrow ? 8.9 : 7.2);
    camera.lookAt(0, 1.25, 0);
    camera.updateProjectionMatrix();
  }

  function hitDog(event) {
    const rect = canvas.getBoundingClientRect();
    pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);
    return raycaster.intersectObjects(dogGroup.children, true).length > 0;
  }

  function animate() {
    if (!renderer) return;
    requestAnimationFrame(animate);
    const t = (performance.now() - startedAt) / 1000;
    const wilted = room.classList.contains("is-wilted");
    const petting = room.classList.contains("is-petting");
    const eating = room.classList.contains("is-eating");
    const playing = room.classList.contains("is-playing");
    const sleeping = room.classList.contains("is-sleeping");
    const low = room.classList.contains("is-low");
    const happy = petting || sleeping;

    const breath = Math.sin(t * 2.2) * 0.02;
    dogGroup.position.y = 0.3 + (sleeping ? -0.02 : breath * 0.5);
    const idleTurn = Math.sin(t * 0.45) * 0.04;
    dogGroup.rotation.y += (targetRotation + idleTurn - dogGroup.rotation.y) * 0.06;

    let headZ = Math.sin(t * 0.8) * 0.015;
    let headY = 1.55;
    if (petting) {
      headZ = Math.sin(t * 8) * 0.06;
      headY = 1.52;
    }
    if (sleeping) {
      headZ = -0.12;
      headY = 1.47;
    }
    if (wilted && !happy) {
      headZ = -0.08;
      headY = 1.47;
    }
    if (low && !happy && !wilted) {
      headZ = -0.04;
      headY = 1.51;
    }
    headGroup.rotation.z += (headZ - headGroup.rotation.z) * 0.12;
    headGroup.position.y += (headY - headGroup.position.y) * 0.12;

    const droop = wilted && !happy ? 0.85 : low && !happy ? 0.3 : petting ? 0.02 : 0.12;
    const wobble = Math.sin(t * 1.5) * 0.03;
    leftEar.rotation.z += (-droop - wobble - leftEar.rotation.z) * 0.12;
    rightEar.rotation.z += (droop + wobble - rightEar.rotation.z) * 0.12;

    const wagSpeed = playing || petting ? 14 : wilted ? 1.5 : 3.2;
    const wagAmp = playing || petting ? 0.55 : wilted ? 0.06 : 0.28;
    tailGroup.rotation.y = Math.sin(t * wagSpeed) * wagAmp;
    tailGroup.rotation.x = wilted && !happy ? -0.5 : 0.1;

    const blink = t % 5.7 > 5.56 ? 0.12 : 1;
    eyeGroups.forEach((eye, index) => {
      let scaleY = blink;
      if (happy) scaleY = 0.18;
      if (wilted && !happy) scaleY = 0.32;
      if (low && !happy && !wilted) scaleY = 0.65;
      eye.scale.y += (scaleY - eye.scale.y) * 0.32;
      eye.rotation.z += ((wilted && !happy ? (index === 0 ? 0.22 : -0.22) : 0) - eye.rotation.z) * 0.2;
      eye.visible = !happy;
    });
    happyEyes.forEach((eye) => {
      eye.visible = happy;
    });

    tear.visible = wilted && !happy;
    tear.position.y = -0.02 - (Math.sin(t * 2) * 0.5 + 0.5) * 0.1;

    smile.visible = (!wilted || happy) && !eating;
    frown.visible = wilted && !happy && !eating;
    mouthOpen.visible = eating;
    tongue.visible = eating;
    if (eating) {
      mouthOpen.scale.y = 1 + Math.sin(t * 16) * 0.08;
      mouthOpen.scale.x = 1.2 + Math.sin(t * 16) * 0.06;
    }

    bowlGroup.visible = eating;
    if (eating) bowlGroup.position.y = 0.38 + Math.sin(t * 10) * 0.01;

    ballGroup.visible = playing;
    if (playing) {
      const p = (t % 1.35) / 1.35;
      ballGroup.position.x = 1.2 - p * 2.4;
      ballGroup.position.y = 0.7 + Math.abs(Math.sin(p * Math.PI)) * 0.7;
      ballGroup.rotation.z = p * Math.PI * 2;
    }

    if (playing) dogGroup.position.y += Math.abs(Math.sin(t * 10)) * 0.06;
    if (petting) dogGroup.rotation.z = Math.sin(t * 8) * 0.018;
    else dogGroup.rotation.z *= 0.9;

    const reviving = room.classList.contains("is-reviving");
    const targetScale = reviving ? 1 + Math.sin(t * 22) * 0.02 : 1;
    dogGroup.scale.x += (targetScale - dogGroup.scale.x) * 0.2;
    dogGroup.scale.y += (targetScale - dogGroup.scale.y) * 0.2;
    dogGroup.scale.z += (targetScale - dogGroup.scale.z) * 0.2;

    renderer.render(world, camera);
  }

  function initThree() {
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      renderer.setClearColor(0x000000, 0);

      world = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
      camera.position.set(0, 2.6, 7.2);
      camera.lookAt(0, 1.25, 0);

      world.add(new THREE.HemisphereLight(0xfff6e8, 0xbfa58f, 1.55));
      const key = new THREE.DirectionalLight(0xfff2dd, 2.4);
      key.position.set(4, 8, 6);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.near = 1;
      key.shadow.camera.far = 20;
      key.shadow.camera.left = -5;
      key.shadow.camera.right = 5;
      key.shadow.camera.top = 5;
      key.shadow.camera.bottom = -5;
      key.shadow.bias = -0.001;
      world.add(key);
      const fill = new THREE.DirectionalLight(0xdfe8ff, 0.7);
      fill.position.set(-5, 3, 4);
      world.add(fill);

      dogGroup = new THREE.Group();
      dogGroup.position.set(0, 0.3, 0);
      world.add(dogGroup);
      buildDog();
      buildCushion();
      buildProps();

      resizeRenderer();
      if (window.ResizeObserver) new ResizeObserver(resizeRenderer).observe(el("petStage"));
      else window.addEventListener("resize", resizeRenderer);

      animate();
      return true;
    } catch (error) {
      console.error(error);
      fallback.classList.remove("hidden");
      return false;
    }
  }

  function bindThreeEvents() {
    canvas.addEventListener("pointerdown", (event) => {
      pointerDown = true;
      pointerLastX = event.clientX;
      pointerMoved = 0;
      canvas.style.cursor = "grabbing";
      try {
        if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
      } catch {
        /* 某些浏览器对合成事件不支持 pointer capture */
      }
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!pointerDown) {
        canvas.style.cursor = hitDog(event) ? "pointer" : "grab";
        return;
      }
      const dx = event.clientX - pointerLastX;
      pointerLastX = event.clientX;
      pointerMoved += Math.abs(dx);
      targetRotation = clamp(targetRotation + dx * 0.006, -0.9, 0.9);
    });

    canvas.addEventListener("pointerup", (event) => {
      const wasClick = pointerMoved < 6;
      pointerDown = false;
      canvas.style.cursor = "grab";
      if (canvas.releasePointerCapture) {
        try {
          canvas.releasePointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
      }
      if (wasClick && hitDog(event)) performAction("pet");
    });

    canvas.addEventListener("pointercancel", () => {
      pointerDown = false;
      canvas.style.cursor = "grab";
    });
  }

  function bindEvents() {
    document.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => performAction(button.dataset.action));
    });

    el("soundBtn").addEventListener("click", toggleSound);
    el("resetBtn").addEventListener("click", resetPet);

    const petName = el("petName");
    petName.addEventListener("click", () => {
      if (petName.isContentEditable) return;
      petName.contentEditable = "true";
      requestAnimationFrame(() => {
        petName.focus({ preventScroll: true });
        selectNameContents();
      });
    });
    petName.addEventListener("focus", selectNameContents);
    petName.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        petName.blur();
      }
      if (event.key === "Escape") {
        petName.textContent = state.name;
        petName.blur();
      }
    });
    petName.addEventListener("blur", () => {
      const name = (petName.textContent || "").trim().replace(/\s+/g, " ").slice(0, 8) || state.name;
      petName.textContent = name;
      petName.contentEditable = "false";
      applyName(name, true);
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        state.lastSeen = Date.now();
        save();
      } else {
        handleReturn();
      }
    });

    window.addEventListener("pagehide", () => {
      state.lastSeen = Date.now();
      save();
    });

    setInterval(() => {
      if (document.hidden) return;
      decayLive(0.5);
      state.lastSeen = Date.now();
      save();
      renderStats();
      renderMood();
    }, 30000);

    setInterval(renderDateAndTime, 60000);
  }

  applyOfflineDecay();
  renderDateAndTime();
  bindEvents();
  render();
  applyName(state.name, false);
  if (initThree()) bindThreeEvents();

  if (isNew) {
    setSpeech(`你好呀，我是${state.name}。以后请多关照。`, 6000);
  } else if (currentAwayMs > 2 * HOUR) {
    setSpeech(`你回来啦…我在窗边等了你 ${formatDuration(currentAwayMs)}。`, 6000);
  } else {
    setSpeech(greeting(), 4800);
  }
})();
