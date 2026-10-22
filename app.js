import * as THREE from "./vendor/three.module.js";
import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";

(() => {
  "use strict";

  const STORAGE_KEY = "pudding-pet-v1";
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const ACTION_CLASSES = ["is-eating", "is-petting", "is-playing", "is-sleeping"];
  const SLOW_FETCH = new URLSearchParams(location.search).has("slowfetch") ? 4 : 1;

  const el = (id) => document.getElementById(id);
  const room = el("scene");
  const speech = el("speech");
  const canvas = el("dogCanvas");
  const fallback = el("webglFallback");
  const modelStatus = el("modelStatus");
  const voiceBtn = el("voiceBtn");
  const voiceBtnLabel = el("voiceBtnLabel");
  const voiceStatus = el("voiceStatus");
  const voiceForm = el("voiceForm");
  const voiceInput = el("voiceInput");

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
  let leftArm = null;
  let rightArm = null;
  let leftLeg = null;
  let rightLeg = null;
  let cookie = null;
  let toyGroup = null;
  let fetchBall = null;
  let fetchState = null;
  let furBump = null;
  let gltfModel = null;
  let gltfMixer = null;
  let gltfActions = {};
  let gltfCurrent = null;
  let headBone = null;
  let lyingTailBase = null;
  let usingGLTF = false;
  let idleMode = "stand";
  let walkState = null;
  let spinState = null;
  let recognition = null;
  let listening = false;
  let voiceStopTimer = null;
  let lastFrameAt = performance.now();
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
  const BROWN = 0x6f4a38;
  const BROWN_DARK = 0x54382b;
  const WHITE = 0xf8f2e8;
  const NOSE = 0x3e2c24;
  const BLUE = 0x7eb6d9;

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

  function startFetch() {
    if (!fetchBall) return;
    walkState = null;
    spinState = null;
    if (fetchBall.parent !== world) world.add(fetchBall);
    fetchBall.scale.setScalar(1);
    fetchBall.visible = true;
    const mouth = getMouthWorld(new THREE.Vector3());
    const start = mouth || new THREE.Vector3(0.4, 0.55, 1.2);
    fetchBall.position.copy(start);
    fetchState = {
      startTime: performance.now(),
      start: start.clone(),
      target: new THREE.Vector3(1.9, 0.14, -0.6),
    };
  }

  function cancelFetch() {
    if (!fetchState) return;
    fetchState = null;
    walkState = null;
    spinState = null;
    if (fetchBall) {
      fetchBall.visible = false;
      if (fetchBall.parent !== world) world.add(fetchBall);
      fetchBall.scale.setScalar(1);
    }
    if (dogGroup) {
      dogGroup.position.x = 0;
      dogGroup.position.z = 0;
      dogGroup.rotation.y = 0;
    }
  }

  function performAction(action, options = {}) {
    const now = Date.now();
    if (now - lastActionAt < 180) return;
    lastActionAt = now;
    ensureAudio();
    resetCountsIfNeeded();
    const wasWilted = room.classList.contains("is-wilted");
    currentAwayMs = 0;
    if (action !== "play") cancelFetch();

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
        if (usingGLTF) {
          const mouth = getMouthWorld(new THREE.Vector3());
          if (mouth) bowlGroup.position.set(mouth.x + 0.2, 0.14, mouth.z + 0.4);
          playGltf("Eating", { once: true, fade: 0.25 });
          setTimeout(() => {
            if (usingGLTF) applyIdleMode();
          }, 2300);
        }
      }
    } else if (action === "pet") {
      if (options.toggleIdle) {
        idleMode = idleMode === "stand" ? "lie" : "stand";
      }
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
      if (usingGLTF) {
        playGltf("Idle_HitReact_Left", { once: true, fade: 0.15 });
        setTimeout(() => {
          if (usingGLTF) applyIdleMode();
        }, 900);
      }
    } else if (action === "play") {
      if (state.energy < 15) {
        setSpeech("有点累啦，先睡一会儿好不好？", 3200);
      } else {
        state.mood = clamp(state.mood + 18);
        state.energy = clamp(state.energy - 8);
        state.fullness = clamp(state.fullness - 5);
        state.counts.play += 1;
        setSpeech("球飞出去啦，我去捡！", 3000);
        startFetch();
        setActionClass("is-playing", 6400 * SLOW_FETCH);
        spawnParticles("sparkle", 7, 50, 44);
        soundPlay();
        if (usingGLTF) playGltf("Idle_2", { loop: true, fade: 0.2 });
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
        if (usingGLTF) {
          playGltf("Death", { once: true, fade: 0.3 });
          setTimeout(() => applyIdleMode(), 3000);
        }
      }
    }

    state.lastInteraction = now;
    state.lastSeen = now;
    if (wasWilted) state.mood = clamp(state.mood + 10);
    save();
    render();
  }

  function voiceStand() {
    cancelFetch();
    walkState = null;
    spinState = null;
    idleMode = "stand";
    applyIdleMode();
    setSpeech("我站起来啦。", 2400);
  }

  function voiceLie() {
    cancelFetch();
    walkState = null;
    spinState = null;
    idleMode = "lie";
    applyIdleMode();
    setSpeech("我趴下啦。", 2400);
  }

  function voiceCome() {
    cancelFetch();
    spinState = null;
    walkState = {
      start: performance.now(),
      fromX: dogGroup.position.x,
      fromZ: dogGroup.position.z,
      toX: 0,
      toZ: 0.75,
      duration: 900,
    };
    playGltf("Walk", { loop: true, fade: 0.2 });
    setSpeech("我过来啦。", 2400);
  }

  function voiceSpin() {
    cancelFetch();
    walkState = null;
    spinState = {
      start: performance.now(),
      from: dogGroup.rotation.y,
      duration: 1200,
    };
    playGltf("Walk", { loop: true, fade: 0.2 });
    spawnParticles("sparkle", 6, 50, 44);
    setSpeech("转一圈！", 2200);
  }

  function voiceShake() {
    cancelFetch();
    walkState = null;
    spinState = null;
    playGltf("Idle_HitReact_Left", { once: true, fade: 0.15 });
    spawnParticles("heart", 6, 50, 38);
    soundPet();
    setSpeech("爪爪给你。", 2400);
    setTimeout(() => applyIdleMode(), 1100);
  }

  function voiceJump() {
    cancelFetch();
    walkState = null;
    spinState = null;
    playGltf("Jump_ToIdle", { once: true, fade: 0.15 });
    spawnParticles("sparkle", 5, 50, 44);
    soundPlay();
    setSpeech("跳！", 2000);
    setTimeout(() => applyIdleMode(), 1200);
  }

  function voiceStop() {
    cancelFetch();
    walkState = null;
    spinState = null;
    applyIdleMode();
    setSpeech("好，我停下。", 2200);
  }

  function handleVoiceCommand(raw) {
    const text = String(raw || "").replace(/[\s，。！？、,.!?]/g, "");
    if (!text) return;
    const has = (...words) => words.some((word) => text.includes(word));

    if (has("站起来", "起立", "站立", "站着")) return voiceStand();
    if (has("趴下", "趴着", "躺下", "休息")) return voiceLie();
    if (has("过来", "来这里", "靠近")) return voiceCome();
    if (has("握手", "抬爪", "爪子", "握个手")) return voiceShake();
    if (has("摸摸", "摸头", "摸一下")) return performAction("pet");
    if (has("吃饭", "吃东西", "投喂", "吃吧", "饿")) return performAction("feed");
    if (has("玩球", "扔球", "捡球", "球")) return performAction("play");
    if (has("睡觉", "睡吧", "晚安")) return performAction("sleep");
    if (has("转圈", "转一圈", "转个圈")) return voiceSpin();
    if (has("跳", "跳一下")) return voiceJump();
    if (has("坐下", "坐好")) {
      playGltf("Idle_2_HeadLow", { loop: true, fade: 0.3 });
      setSpeech("我坐好啦。", 2400);
      return;
    }
    if (has("停下", "别动", "停")) return voiceStop();
    if (has("你好", "在吗", "嗨")) {
      setSpeech("我在呢，想让我做什么？", 2600);
      return;
    }
    setSpeech("我没听懂，可以说：站起来、趴下、过来、握手、吃饭、玩球、睡觉、转圈。", 3600);
  }

  function setupVoice() {
    if (!voiceBtn) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      voiceBtn.disabled = true;
      voiceBtnLabel.textContent = "不支持";
      voiceStatus.textContent = "当前浏览器不支持语音识别，请用 Chrome 或 Edge。";
      return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      listening = true;
      voiceBtn.classList.add("is-listening");
      voiceBtn.setAttribute("aria-pressed", "true");
      voiceBtnLabel.textContent = "正在听…";
      voiceStatus.textContent = "我在听，请说指令…";
      clearTimeout(voiceStopTimer);
      voiceStopTimer = setTimeout(() => {
        if (listening) recognition.stop();
      }, 8000);
    };

    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript.trim();
      voiceStatus.textContent = `听到：${text}`;
      handleVoiceCommand(text);
    };

    recognition.onerror = (event) => {
      let message = "没听清，再说一次。";
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        message = "需要麦克风权限，请在浏览器地址栏允许后重试。";
      } else if (event.error === "audio-capture") {
        message = "没有找到麦克风。";
      } else if (event.error === "no-speech") {
        message = "没有听到声音，再试一次。";
      }
      voiceStatus.textContent = message;
    };

    recognition.onend = () => {
      listening = false;
      voiceBtn.classList.remove("is-listening");
      voiceBtn.setAttribute("aria-pressed", "false");
      voiceBtnLabel.textContent = "开始听";
      clearTimeout(voiceStopTimer);
    };

    voiceBtn.addEventListener("click", () => {
      if (listening) {
        recognition.stop();
        return;
      }
      try {
        recognition.start();
      } catch (error) {
        voiceStatus.textContent = "语音识别启动失败，请稍后再试。";
      }
    });
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
    if (usingGLTF) applyIdleMode();
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
    const params = {
      color,
      roughness: 0.95,
      metalness: 0,
      ...options,
    };
    if (furBump) {
      params.bumpMap = furBump;
      params.bumpScale = 0.012;
    }
    return new THREE.MeshStandardMaterial(params);
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
    // 身体：白色底毛 + 棕色背毛
    addSphere(dogGroup, 0.72, WHITE, [-0.15, 0.46, -0.2], [1.3, 0.72, 1.0]);
    addSphere(dogGroup, 0.66, BROWN, [-0.15, 0.56, -0.24], [1.22, 0.55, 0.92]);
    addSphere(dogGroup, 0.45, WHITE, [0.12, 0.32, 0.38], [0.95, 0.7, 0.62]);

    // 身体边缘的毛簇，让轮廓不像光滑的塑料球
    for (let i = 0; i < 34; i += 1) {
      const angle = (i / 34) * Math.PI * 2;
      const tuft = new THREE.Mesh(
        new THREE.ConeGeometry(0.07 + Math.random() * 0.04, 0.24 + Math.random() * 0.12, 5),
        material(i % 4 === 0 ? BROWN : WHITE)
      );
      tuft.position.set(
        -0.12 + Math.cos(angle) * 0.97,
        0.55 + Math.sin(angle) * 0.07,
        -0.18 + Math.sin(angle) * 0.68
      );
      tuft.rotation.z = -Math.cos(angle) * 0.9;
      tuft.rotation.x = -Math.sin(angle) * 0.5;
      tuft.castShadow = true;
      dogGroup.add(tuft);
    }

    // 头
    headGroup = new THREE.Group();
    headGroup.position.set(0.38, 0.52, 0.58);
    dogGroup.add(headGroup);
    addSphere(headGroup, 0.52, WHITE, [0, 0, 0], [1.0, 0.95, 0.95]);

    // 棕色头套 + 白色鼻梁
    addSphere(headGroup, 0.5, BROWN, [0, 0.14, -0.12], [0.96, 0.78, 0.92]);
    addSphere(headGroup, 0.18, WHITE, [0, 0.14, 0.44], [0.75, 0.95, 0.55]);

    // 口鼻
    addSphere(headGroup, 0.24, WHITE, [0, -0.15, 0.48], [1.15, 0.8, 1.0]);
    addSphere(headGroup, 0.09, NOSE, [0, -0.1, 0.7], [1.15, 0.8, 0.8]);

    // 棕色眉斑（不是整圈眼罩）
    [-1, 1].forEach((side) => {
      addSphere(headGroup, 0.15, BROWN, [side * 0.24, 0.17, 0.34], [0.65, 0.4, 0.28]);
    });

    // 眼睛 + 闭眼弧线
    [-1, 1].forEach((side) => {
      const eye = new THREE.Group();
      eye.position.set(side * 0.21, 0.1, 0.47);
      addSphere(eye, 0.055, NOSE, [0, 0, 0]);
      addSphere(eye, 0.018, WHITE, [-0.016, 0.02, 0.05], [1, 1, 0.5]);
      headGroup.add(eye);
      eyeGroups.push(eye);

      const closed = new THREE.Mesh(
        new THREE.TorusGeometry(0.055, 0.014, 8, 16, Math.PI),
        material(NOSE)
      );
      closed.position.set(side * 0.21, 0.1, 0.5);
      closed.rotation.z = Math.PI;
      closed.visible = false;
      headGroup.add(closed);
      happyEyes.push(closed);
    });

    // 腮红
    [-1, 1].forEach((side) => {
      addSphere(
        headGroup,
        0.11,
        PINK,
        [side * 0.4, -0.14, 0.42],
        [1.2, 0.75, 0.3],
        { transparent: true, opacity: 0.55 }
      );
    });

    // 嘴
    smile = new THREE.Mesh(
      new THREE.TorusGeometry(0.09, 0.018, 8, 16, Math.PI),
      material(NOSE)
    );
    smile.position.set(0, -0.25, 0.72);
    smile.rotation.z = Math.PI;
    headGroup.add(smile);

    frown = new THREE.Mesh(
      new THREE.TorusGeometry(0.09, 0.018, 8, 16, Math.PI),
      material(NOSE)
    );
    frown.position.set(0, -0.25, 0.72);
    frown.visible = false;
    headGroup.add(frown);

    mouthOpen = addSphere(headGroup, 0.075, NOSE, [0, -0.25, 0.7], [1.2, 1, 0.5]);
    mouthOpen.visible = false;
    tongue = addSphere(headGroup, 0.045, PINK, [0, -0.28, 0.74], [1.3, 0.7, 0.6]);
    tongue.visible = false;

    tear = addSphere(
      headGroup,
      0.032,
      0x9fcbe0,
      [-0.2, 0, 0.56],
      [1, 1.3, 1],
      { transparent: true, opacity: 0.9 }
    );
    tear.visible = false;

    // 一只立耳，一只折耳
    const uprightEar = new THREE.Group();
    uprightEar.position.set(-0.2, 0.46, 0.02);
    const outerEar = new THREE.Mesh(
      new THREE.ConeGeometry(0.2, 0.44, 8),
      material(BROWN)
    );
    outerEar.position.set(0, 0.22, 0);
    outerEar.castShadow = true;
    uprightEar.add(outerEar);
    const innerEar = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.28, 8),
      material(CREAM)
    );
    innerEar.position.set(0, 0.2, 0.09);
    uprightEar.add(innerEar);
    uprightEar.rotation.z = 0.18;
    headGroup.add(uprightEar);
    leftEar = uprightEar;

    const floppyEar = new THREE.Group();
    floppyEar.position.set(0.48, 0.26, 0.12);
    addSphere(floppyEar, 0.24, BROWN, [0, -0.12, 0], [0.55, 0.95, 0.42]);
    addSphere(floppyEar, 0.14, CREAM, [0, -0.12, 0.12], [0.5, 0.75, 0.22]);
    floppyEar.rotation.z = -0.5;
    headGroup.add(floppyEar);
    rightEar = floppyEar;

    // 脖子一圈蓬松的毛
    for (let i = 0; i < 16; i += 1) {
      const angle = (i / 16) * Math.PI * 2;
      const tuft = new THREE.Mesh(
        new THREE.ConeGeometry(0.1, 0.34, 6),
        material(i % 3 === 0 ? BROWN : WHITE)
      );
      tuft.position.set(
        0.28 + Math.cos(angle) * 0.46,
        0.46 + Math.sin(angle) * 0.14,
        0.32 + Math.sin(angle) * 0.26
      );
      tuft.rotation.z = -angle;
      tuft.rotation.x = 0.3;
      tuft.castShadow = true;
      dogGroup.add(tuft);
    }

    // 脸颊两侧的毛
    [-1, 1].forEach((side) => {
      for (let i = 0; i < 3; i += 1) {
        const tuft = new THREE.Mesh(
          new THREE.ConeGeometry(0.045, 0.12, 5),
          material(WHITE)
        );
        tuft.position.set(side * 0.44, -0.06 + i * 0.08, 0.3);
        tuft.rotation.z = side * 1.0;
        tuft.rotation.x = 0.45;
        tuft.castShadow = true;
        headGroup.add(tuft);
      }
    });

    // 两条前腿伸在前面
    function buildFrontLeg(x) {
      const leg = new THREE.Group();
      leg.position.set(x, 0.26, 0.55);
      const limb = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.1, 0.6, 8, 16),
        material(WHITE)
      );
      limb.rotation.x = Math.PI / 2;
      limb.position.set(0, -0.02, 0.34);
      limb.castShadow = true;
      leg.add(limb);
      addSphere(leg, 0.17, WHITE, [0, -0.05, 0.72], [1.1, 0.7, 1.2]);
      [-0.055, 0, 0.055].forEach((dx) => {
        addSphere(leg, 0.036, CREAM, [dx, -0.07, 0.86], [1, 0.7, 0.8]);
      });
      dogGroup.add(leg);
      return leg;
    }

    leftArm = buildFrontLeg(-0.2);
    rightArm = buildFrontLeg(0.72);

    // 左侧后腿收在身下
    leftLeg = new THREE.Group();
    leftLeg.position.set(-0.68, 0.3, 0.0);
    addSphere(leftLeg, 0.36, BROWN, [0, 0, 0], [1, 0.9, 1]);
    addSphere(leftLeg, 0.18, WHITE, [0.08, -0.16, 0.38], [1.1, 0.7, 1.2]);
    dogGroup.add(leftLeg);

    rightLeg = new THREE.Group();
    rightLeg.position.set(0.45, 0.25, -0.48);
    addSphere(rightLeg, 0.3, BROWN, [0, 0, 0], [1, 0.9, 1]);
    addSphere(rightLeg, 0.16, WHITE, [0, -0.12, 0.28], [1.1, 0.7, 1.2]);
    dogGroup.add(rightLeg);

    // 蓬松的尾巴卷在身后
    tailGroup = new THREE.Group();
    tailGroup.position.set(-0.78, 0.35, -0.5);
    dogGroup.add(tailGroup);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(-0.3, 0.18, -0.15),
      new THREE.Vector3(-0.15, 0.45, 0.18),
      new THREE.Vector3(0.15, 0.38, 0.38),
    ]);
    const tail = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 24, 0.14, 8, false),
      material(BROWN)
    );
    tail.castShadow = true;
    tailGroup.add(tail);
    for (let i = 0; i < 7; i += 1) {
      const angle = (i / 7) * Math.PI * 2;
      addSphere(
        tailGroup,
        0.11,
        WHITE,
        [
          0.05 + Math.cos(angle) * 0.12,
          0.42 + Math.sin(angle) * 0.1,
          0.42 + Math.sin(angle) * 0.08,
        ],
        [1, 0.8, 1]
      );
    }

    // 项圈
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.055, 10, 32),
      material(MINT)
    );
    collar.position.set(0.18, 0.42, 0.38);
    collar.rotation.x = Math.PI / 2;
    collar.rotation.z = 0.3;
    collar.castShadow = true;
    dogGroup.add(collar);
    addSphere(dogGroup, 0.065, BUTTER, [0.3, 0.34, 0.62], [1, 1.2, 0.7]);

    // 爪边的小饼干
    cookie = new THREE.Group();
    cookie.position.set(0, -0.02, 0.86);
    rightArm.add(cookie);
    const cookieDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.035, 20),
      material(0xe7b779)
    );
    cookieDisc.rotation.x = Math.PI / 2;
    cookieDisc.castShadow = true;
    cookie.add(cookieDisc);
    [
      [-0.035, 0.02],
      [0.03, 0.03],
      [0.02, -0.03],
    ].forEach(([x, y]) => {
      addSphere(cookie, 0.014, COCOA, [x, y, 0.025]);
    });
    cookie.visible = false;

    headGroup.scale.set(0.92, 0.92, 0.95);

    return dogGroup;
  }


  function buildCushion() {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#c89a6c";
    ctx.fillRect(0, 0, 512, 512);

    for (let y = 0; y < 512; y += 64) {
      ctx.fillStyle = (y / 64) % 2 === 0 ? "#c99c6e" : "#bd8d61";
      ctx.fillRect(0, y, 512, 64);
      ctx.strokeStyle = "rgba(80,50,32,.22)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();

      for (let i = 0; i < 5; i += 1) {
        ctx.strokeStyle = "rgba(80,50,32,.07)";
        ctx.beginPath();
        const gy = y + 10 + Math.random() * 44;
        ctx.moveTo(0, gy);
        ctx.bezierCurveTo(140, gy - 5, 340, gy + 5, 512, gy);
        ctx.stroke();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3, 2);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 9),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.92, metalness: 0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 0.2);
    floor.receiveShadow = true;
    world.add(floor);

    const pillow = addSphere(world, 0.55, 0xfffaf2, [-1.2, 0.2, -1.1], [1.7, 0.38, 1.05]);
    pillow.castShadow = true;

    const seam = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.018, 8, 40),
      material(0xe8dccb)
    );
    seam.rotation.x = Math.PI / 2;
    seam.position.set(-1.2, 0.38, -1.1);
    seam.scale.z = 0.62;
    world.add(seam);
  }

  function buildProps() {
    bowlGroup = new THREE.Group();
    bowlGroup.position.set(0.45, 0.14, 1.62);
    bowlGroup.visible = false;
    world.add(bowlGroup);

    const bowlBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.2, 0.18, 24),
      material(0xd9a7a0)
    );
    bowlBody.castShadow = true;
    bowlGroup.add(bowlBody);

    const bowlRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.028, 8, 24),
      material(0xc98d86)
    );
    bowlRim.rotation.x = Math.PI / 2;
    bowlRim.position.y = 0.09;
    bowlGroup.add(bowlRim);

    [
      [-0.1, 0.23, 0.02],
      [0.06, 0.24, -0.02],
      [0.14, 0.22, 0.06],
    ].forEach(([x, y, z]) => addSphere(bowlGroup, 0.05, 0xe7b779, [x, y, z]));

    toyGroup = new THREE.Group();
    toyGroup.position.set(0.55, 0.16, 1.7);
    world.add(toyGroup);
    addSphere(toyGroup, 0.16, BLUE, [0, 0, 0], [1.1, 0.9, 1]);
    addSphere(toyGroup, 0.1, 0xfff6ea, [0, -0.02, 0.12], [1, 0.8, 0.45]);

    [-1, 1].forEach((side) => {
      const fin = addSphere(toyGroup, 0.08, BLUE, [side * 0.16, 0.08, 0], [0.8, 1.2, 0.6]);
      fin.rotation.z = side * 0.5;
    });

    [-1, 1].forEach((side) => {
      addSphere(toyGroup, 0.018, NOSE, [side * 0.06, 0.06, 0.14]);
    });

    addSphere(toyGroup, 0.06, BLUE, [0, 0.02, -0.15], [0.7, 0.7, 1.2]);

    fetchBall = new THREE.Group();
    fetchBall.visible = false;
    world.add(fetchBall);
    addSphere(fetchBall, 0.14, 0xd9e36b, [0, 0, 0]);
    const seamA = new THREE.Mesh(
      new THREE.TorusGeometry(0.14, 0.012, 6, 20, Math.PI),
      material(0xfffdf7)
    );
    seamA.rotation.y = Math.PI / 2;
    fetchBall.add(seamA);
    const seamB = seamA.clone();
    seamB.rotation.x = Math.PI / 2;
    fetchBall.add(seamB);
  }


  function resizeRenderer() {
    if (!renderer || !camera) return;
    const rect = el("petStage").getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const narrow = width / height < 0.95;
    camera.position.set(0, narrow ? 2.1 : 1.85, narrow ? 6.5 : 5.4);
    camera.lookAt(0, 0.8, 0.1);
    camera.updateProjectionMatrix();
  }

  function hitGroup(event, group) {
    const rect = canvas.getBoundingClientRect();
    pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);
    return raycaster.intersectObjects(group.children, true).length > 0;
  }

  function hitDog(event) {
    return hitGroup(event, dogGroup);
  }

  function hitToy(event) {
    return hitGroup(event, toyGroup);
  }

  function animate() {
    if (!renderer) return;
    requestAnimationFrame(animate);
    const frameNow = performance.now();
    const t = (frameNow - startedAt) / 1000;
    const delta = Math.min(0.05, (frameNow - lastFrameAt) / 1000);
    lastFrameAt = frameNow;    const wilted = room.classList.contains("is-wilted");
    const petting = room.classList.contains("is-petting");
    const eating = room.classList.contains("is-eating");
    const playing = room.classList.contains("is-playing");
    const sleeping = room.classList.contains("is-sleeping");
    const low = room.classList.contains("is-low");
    const happy = petting || sleeping;
    const fetching = Boolean(fetchState);

    const baseLift = idleMode === "lie" ? 0.045 : 0;
    dogGroup.position.y = baseLift + Math.sin(t * 2.1) * 0.007;
    const idleTurn = Math.sin(t * 0.35) * 0.03;
    if (walkState) {
      const p = Math.min(1, (frameNow - walkState.start) / walkState.duration);
      const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      dogGroup.position.x = THREE.MathUtils.lerp(walkState.fromX, walkState.toX, eased);
      dogGroup.position.z = THREE.MathUtils.lerp(walkState.fromZ, walkState.toZ, eased);
      dogGroup.rotation.y += (0 - dogGroup.rotation.y) * 0.15;
      if (p >= 1) {
        walkState = null;
        applyIdleMode();
      }
    } else if (spinState) {
      const p = Math.min(1, (frameNow - spinState.start) / spinState.duration);
      dogGroup.rotation.y = spinState.from + p * Math.PI * 2;
      if (p >= 1) {
        spinState = null;
        dogGroup.rotation.y = 0;
        applyIdleMode();
      }
    } else {
      dogGroup.rotation.y += (targetRotation + idleTurn - dogGroup.rotation.y) * 0.06;
    }

    let headY = 0.52;
    let headZ = 0.58;
    let headRotZ = Math.sin(t * 0.7) * 0.012;
    let headRotX = 0.08;

    if (petting) {
      headY = 0.72;
      headZ = 0.68;
      headRotZ = 0.08;
      headRotX = -0.04;
    } else if (playing) {
      headY = 0.66;
      headZ = 0.66;
      headRotZ = 0.05;
      headRotX = 0;
    } else if (eating) {
      headY = 0.66;
      headZ = 0.72;
      headRotZ = -0.04;
      headRotX = 0.2;
    } else if (sleeping) {
      headY = 0.44;
      headZ = 0.62;
      headRotZ = -0.06;
      headRotX = 0.2;
    } else if (wilted) {
      headY = 0.42;
      headZ = 0.58;
      headRotZ = -0.04;
      headRotX = 0.22;
    } else if (low) {
      headY = 0.49;
      headZ = 0.58;
      headRotZ = -0.02;
      headRotX = 0.12;
    }

    headGroup.position.y += (headY - headGroup.position.y) * 0.12;
    headGroup.position.z += (headZ - headGroup.position.z) * 0.12;
    headGroup.rotation.z += (headRotZ - headGroup.rotation.z) * 0.12;
    headGroup.rotation.x += (headRotX - headGroup.rotation.x) * 0.12;

    let earUpZ = 0.18;
    let earFlopZ = -0.5;
    let earUpX = 0;
    let earFlopX = 0;

    if (wilted && !happy) {
      earUpZ = 0.9;
      earFlopZ = -0.95;
      earUpX = 0.2;
      earFlopX = 0.2;
    } else if (petting) {
      earUpZ = 0.06;
      earFlopZ = -0.3;
    } else if (sleeping) {
      earUpZ = 0.55;
      earFlopZ = -0.75;
    } else if (playing) {
      earUpZ = 0.05;
      earFlopZ = -0.35;
    }

    const twitch = Math.sin(t * 1.7) * 0.03;
    leftEar.rotation.z += (earUpZ + twitch - leftEar.rotation.z) * 0.12;
    rightEar.rotation.z += (earFlopZ + twitch - rightEar.rotation.z) * 0.12;
    leftEar.rotation.x += (earUpX - leftEar.rotation.x) * 0.12;
    rightEar.rotation.x += (earFlopX - rightEar.rotation.x) * 0.12;

    const wagSpeed = playing || petting ? 13 : wilted ? 1.5 : 3;
    const wagAmp = playing || petting ? 0.5 : wilted ? 0.05 : 0.22;
    tailGroup.rotation.y = Math.sin(t * wagSpeed) * wagAmp;
    tailGroup.rotation.z = wilted && !happy ? -0.4 : 0.05;

    const blink = t % 5.7 > 5.56 ? 0.12 : 1;
    eyeGroups.forEach((eye, index) => {
      let scaleY = blink;
      if (happy) scaleY = 0.16;
      if (wilted && !happy) scaleY = 0.3;
      if (low && !happy && !wilted) scaleY = 0.62;
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
    }

    let leftLegX = 0;
    let rightLegX = 0;
    let rightLegZ = 0;

    if (petting) {
      rightLegX = -0.75 + Math.sin(t * 10) * 0.15;
      rightLegZ = 0.15;
    } else if (playing) {
      rightLegX = -0.55 + Math.sin(t * 12) * 0.2;
      rightLegZ = 0.25;
    } else if (eating) {
      leftLegX = 0.15;
      rightLegX = 0.15;
    } else if (sleeping) {
      leftLegX = 0.25;
      rightLegX = 0.25;
    } else if (wilted) {
      leftLegX = 0.1;
      rightLegX = 0.1;
    }

    leftArm.rotation.x += (leftLegX - leftArm.rotation.x) * 0.12;
    rightArm.rotation.x += (rightLegX - rightArm.rotation.x) * 0.12;
    rightArm.rotation.z += (rightLegZ - rightArm.rotation.z) * 0.12;
    if (!playing && !petting) rightArm.rotation.z *= 0.9;

    leftLeg.rotation.x += ((sleeping ? 0.2 : 0) - leftLeg.rotation.x) * 0.1;
    rightLeg.rotation.x += ((sleeping ? 0.2 : 0) - rightLeg.rotation.x) * 0.1;

    cookie.visible = eating;

    bowlGroup.visible = eating;
    if (eating) bowlGroup.position.y = 0.14 + Math.sin(t * 10) * 0.006;

    toyGroup.visible = !eating;
    if (playing && !fetching) {
      toyGroup.rotation.z = Math.sin(t * 14) * 0.28;
      toyGroup.position.y = 0.16 + Math.abs(Math.sin(t * 11)) * 0.1;
    } else {
      toyGroup.rotation.z *= 0.9;
      toyGroup.position.y += (0.16 - toyGroup.position.y) * 0.1;
    }

    if (fetchState) {
      const elapsed = (performance.now() - fetchState.startTime) / 1000 / SLOW_FETCH;
      const start = fetchState.start;
      const target = fetchState.target;
      const unit = (value) => Math.max(0, Math.min(1, value));
      fetchBall.visible = true;

      if (usingGLTF) {
        if (elapsed >= 1.2 && elapsed < 3.2 && fetchState.phase !== "run") {
          fetchState.phase = "run";
          playGltf("Gallop", { loop: true, fade: 0.2 });
        } else if (elapsed >= 3.2 && elapsed < 3.8 && fetchState.phase !== "pick") {
          fetchState.phase = "pick";
          playGltf("Idle_2_HeadLow", { once: true, fade: 0.2 });
        } else if (elapsed >= 3.8 && elapsed < 5.6 && fetchState.phase !== "return") {
          fetchState.phase = "return";
          playGltf("Walk", { loop: true, fade: 0.2 });
        } else if (elapsed >= 5.6 && fetchState.phase !== "end") {
          fetchState.phase = "end";
          applyIdleMode();
        }
      }

      if (elapsed < 1.2) {
        const p = unit((elapsed - 0.15) / 1.05);
        fetchBall.position.set(
          start.x + (target.x - start.x) * p,
          start.y + Math.sin(p * Math.PI) * 1.1,
          start.z + (target.z - start.z) * p
        );
        fetchBall.rotation.x += 0.25;
        dogGroup.rotation.y += (0.45 - dogGroup.rotation.y) * 0.1;
        dogGroup.position.x += (0 - dogGroup.position.x) * 0.1;
        dogGroup.position.z += (0 - dogGroup.position.z) * 0.1;
        headGroup.position.y += (0.78 - headGroup.position.y) * 0.12;
        headGroup.rotation.x += (-0.1 - headGroup.rotation.x) * 0.12;
      } else if (elapsed < 3.2) {
        const p = unit((elapsed - 1.2) / 2.0);
        dogGroup.position.x = (target.x - 0.55) * p;
        dogGroup.position.z = (target.z + 0.45) * p;
        dogGroup.position.y = usingGLTF ? 0 : 0.4 + Math.abs(Math.sin(t * 18)) * 0.04;
        dogGroup.rotation.y += (1.25 - dogGroup.rotation.y) * 0.12;
        fetchBall.position.set(target.x, 0.14, target.z);
        leftArm.rotation.x = 1.0 + Math.sin(t * 18) * 0.55;
        rightArm.rotation.x = 1.0 + Math.sin(t * 18 + Math.PI) * 0.55;
        leftLeg.rotation.x = 1.0 + Math.sin(t * 18 + Math.PI) * 0.45;
        rightLeg.rotation.x = 1.0 + Math.sin(t * 18) * 0.45;
        headGroup.position.y += (0.8 - headGroup.position.y) * 0.15;
        headGroup.rotation.x += (-0.1 - headGroup.rotation.x) * 0.15;
      } else if (elapsed < 3.8) {
        dogGroup.position.x = target.x - 0.55;
        dogGroup.position.z = target.z + 0.45;
        dogGroup.position.y = usingGLTF ? 0 : 0.4;
        headGroup.position.y += (0.4 - headGroup.position.y) * 0.25;
        headGroup.rotation.x += (0.4 - headGroup.rotation.x) * 0.25;
        if (usingGLTF) {
          if (fetchBall.parent !== world) world.add(fetchBall);
          const mouth = getMouthWorld(new THREE.Vector3());
          if (mouth) {
            mouth.y -= 0.03;
            mouth.z += 0.04;
            fetchBall.position.copy(mouth);
          }
          fetchBall.scale.setScalar(0.8);
        } else if (fetchBall.parent !== headGroup) {
          headGroup.add(fetchBall);
          fetchBall.position.set(0, -0.3, 0.72);
          fetchBall.scale.setScalar(0.75);
        }
        fetchBall.visible = true;
      } else if (elapsed < 5.6) {
        const p = unit((elapsed - 3.8) / 1.8);
        dogGroup.position.x = (target.x - 0.55) * (1 - p);
        dogGroup.position.z = (target.z + 0.45) * (1 - p);
        dogGroup.position.y = usingGLTF ? 0 : 0.4 + Math.abs(Math.sin(t * 18)) * 0.04;
        dogGroup.rotation.y += (-1.25 - dogGroup.rotation.y) * 0.12;
        leftArm.rotation.x = 1.0 + Math.sin(t * 18) * 0.55;
        rightArm.rotation.x = 1.0 + Math.sin(t * 18 + Math.PI) * 0.55;
        leftLeg.rotation.x = 1.0 + Math.sin(t * 18 + Math.PI) * 0.45;
        rightLeg.rotation.x = 1.0 + Math.sin(t * 18) * 0.45;
        headGroup.position.y += (0.7 - headGroup.position.y) * 0.15;
        if (usingGLTF) {
          if (fetchBall.parent !== world) world.add(fetchBall);
          const mouth = getMouthWorld(new THREE.Vector3());
          if (mouth) {
            mouth.y -= 0.03;
            mouth.z += 0.04;
            fetchBall.position.copy(mouth);
          }
          fetchBall.scale.setScalar(0.8);
          fetchBall.visible = true;
        }
      } else if (elapsed < 6.4) {
        dogGroup.position.x += (0 - dogGroup.position.x) * 0.25;
        dogGroup.position.z += (0 - dogGroup.position.z) * 0.25;
        dogGroup.position.y += (0 - dogGroup.position.y) * 0.2;
        dogGroup.rotation.y += (0 - dogGroup.rotation.y) * 0.15;
        headGroup.position.y += (0.55 - headGroup.position.y) * 0.15;
        if (fetchBall.parent !== world) {
          world.add(fetchBall);
          fetchBall.position.set(0.7, 0.14, 1.15);
          fetchBall.scale.setScalar(1);
        }
        fetchBall.visible = true;
      } else {
        if (fetchBall.parent !== world) {
          world.add(fetchBall);
          fetchBall.position.set(0.7, 0.14, 1.15);
          fetchBall.scale.setScalar(1);
        }
        fetchBall.visible = true;
        fetchState = null;
        dogGroup.position.set(0, 0, 0);
        dogGroup.rotation.y = 0;
        setSpeech("捡回来啦！再来一次？", 3200);
      }
    }

    if (petting) dogGroup.rotation.z = Math.sin(t * 8) * 0.012;
    else dogGroup.rotation.z *= 0.9;

    const reviving = room.classList.contains("is-reviving");
    const targetScale = reviving ? 1 + Math.sin(t * 22) * 0.02 : 1;
    dogGroup.scale.x += (targetScale - dogGroup.scale.x) * 0.2;
    dogGroup.scale.y += (targetScale - dogGroup.scale.y) * 0.2;
    dogGroup.scale.z += (targetScale - dogGroup.scale.z) * 0.2;

    const lyingView = idleMode === "lie" && !fetchState && !walkState && !spinState;
    const narrowCam = camera.aspect < 0.95;
    const camTarget = new THREE.Vector3(
      0,
      lyingView ? (narrowCam ? 1.35 : 1.2) : (narrowCam ? 2.1 : 1.85),
      lyingView ? (narrowCam ? 5.2 : 4.5) : (narrowCam ? 6.5 : 5.4)
    );
    camera.position.lerp(camTarget, 0.06);
    camera.lookAt(
      lyingView ? new THREE.Vector3(0, 0.45, 0.2) : new THREE.Vector3(0, 0.8, 0.1)
    );

    if (gltfMixer) gltfMixer.update(delta);
    if (idleMode === "lie") fixLyingTail();

    renderer.render(world, camera);
  }


  function createFurBump() {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    const image = ctx.createImageData(128, 128);
    for (let i = 0; i < image.data.length; i += 4) {
      const value = 110 + Math.random() * 80;
      image.data[i] = value;
      image.data[i + 1] = value;
      image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    for (let i = 0; i < 320; i += 1) {
      ctx.strokeStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.1})`;
      ctx.beginPath();
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      ctx.moveTo(x, y);
      ctx.lineTo(x + 2, y + 6 + Math.random() * 12);
      ctx.stroke();
    }
    furBump = new THREE.CanvasTexture(canvas);
    furBump.wrapS = THREE.RepeatWrapping;
    furBump.wrapT = THREE.RepeatWrapping;
    furBump.repeat.set(3, 3);
  }

  function playGltf(name, options = {}) {
    if (!gltfMixer) return;
    const next = gltfActions[name] || gltfActions.Idle;
    if (!next) return;
    if (gltfCurrent === next && !options.restart) return;
    const previous = gltfCurrent;
    next.reset();
    next.enabled = true;
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    next.setLoop(options.once ? THREE.LoopOnce : THREE.LoopRepeat, options.once ? 1 : Infinity);
    next.clampWhenFinished = Boolean(options.once);
    next.play();
    if (options.holdAtEnd) {
      next.time = next.getClip().duration;
      next.paused = true;
      gltfMixer.update(0);
      gltfCurrent = next;
      return;
    }
    if (previous && previous !== next && previous.enabled) {
      next.crossFadeFrom(previous, options.fade ?? 0.25, false);
    }
    gltfCurrent = next;
  }

  function getMouthWorld(target = new THREE.Vector3()) {
    if (!headBone || !gltfModel) return null;
    gltfModel.updateMatrixWorld(true);
    headBone.getWorldPosition(target);
    return target;
  }

  function captureLyingTail() {
    if (!gltfModel) return;
    lyingTailBase = ["Tail1", "Tail2", "Tail3", "Tail4", "Tail5", "Tail6"].map((name) => {
      const bone = gltfModel.getObjectByName(name);
      return bone ? bone.quaternion.clone() : null;
    });
  }

  function fixLyingTail() {
    if (!gltfModel || !lyingTailBase) return;
    ["Tail1", "Tail2", "Tail3", "Tail4", "Tail5", "Tail6"].forEach((name, index) => {
      const bone = gltfModel.getObjectByName(name);
      const base = lyingTailBase[index];
      if (!bone || !base) return;
      bone.quaternion.copy(base);
      bone.rotateZ(0.22 + index * 0.04);
      bone.rotateY(0.08);
    });
  }

  function renderNow() {
    if (dogGroup) dogGroup.position.y = (idleMode === "lie" ? 0.045 : 0) + 0.006;
    if (gltfMixer) gltfMixer.update(0.001);
    if (idleMode === "lie") fixLyingTail();
    if (renderer) renderer.render(world, camera);
  }

  function applyIdleMode() {
    if (!usingGLTF) return;
    if (idleMode === "lie") {
      playGltf("Death", { once: true, holdAtEnd: true, fade: 0.2 });
      captureLyingTail();
      fixLyingTail();
      renderNow();
      return;
    }
    const mood = getMood().key;
    if (mood === "wilted" || mood === "low") {
      playGltf("Idle_2_HeadLow", { loop: true, fade: 0.3 });
    } else {
      playGltf("Idle_2", { loop: true, fade: 0.3 });
    }
    renderNow();
  }

  function addGltfFur(model, scale) {
    const inv = 1 / (scale || 1);
    const neck =
      model.getObjectByName("Neck2") ||
      model.getObjectByName("Neck1") ||
      model.getObjectByName("Neck3");
    if (neck) {
      for (let i = 0; i < 18; i += 1) {
        const angle = (i / 18) * Math.PI * 2;
        const tuft = new THREE.Mesh(
          new THREE.ConeGeometry(0.11 * inv, 0.42 * inv, 5),
          material(i % 4 === 0 ? BROWN : WHITE)
        );
        tuft.position.set(
          Math.cos(angle) * 0.72 * inv,
          Math.sin(angle) * 0.18 * inv,
          0.18 * inv + Math.sin(angle) * 0.42 * inv
        );
        tuft.rotation.z = -angle;
        tuft.rotation.x = 0.35;
        tuft.castShadow = true;
        neck.add(tuft);
      }
    }
  }

  function loadHusky() {
    const loader = new GLTFLoader();
    loader.load(
      "assets/husky.glb?v=gltf2",
      (gltf) => {
        gltfModel = gltf.scene;
        headBone = gltfModel.getObjectByName("Head_end") || gltfModel.getObjectByName("Head");
        dogGroup.children.forEach((child) => {
          child.visible = false;
        });

        const box = new THREE.Box3().setFromObject(gltfModel);
        const size = box.getSize(new THREE.Vector3());
        const scale = 1.55 / (size.y || 1);
        gltfModel.scale.setScalar(scale);
        box.setFromObject(gltfModel);
        const center = box.getCenter(new THREE.Vector3());
        gltfModel.position.x -= center.x;
        gltfModel.position.z -= center.z;
        gltfModel.position.y -= box.min.y;
        gltfModel.rotation.y = 0;

        gltfModel.traverse((child) => {
          if (!child.isMesh) return;
          child.castShadow = true;
          child.receiveShadow = true;
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((mat) => {
            if (!mat || !mat.color) return;
            const c = mat.color;
            const lum = c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
            if (lum > 0.5) mat.color.setHex(0xfbf7ef);
            else if (lum > 0.15) mat.color.setHex(0xf2e6d4);
            else if (lum > 0.04) mat.color.setHex(BROWN);
            else mat.color.setHex(NOSE);
            mat.roughness = 0.9;
            mat.metalness = 0;
            if (furBump) {
              mat.bumpMap = furBump;
              mat.bumpScale = 0.006;
            }
            mat.needsUpdate = true;
          });
        });

        addGltfFur(gltfModel, scale);

        dogGroup.add(gltfModel);
        dogGroup.visible = true;
        modelStatus.classList.add("hidden");
        console.log("pudding-pet: Quaternius Husky glTF loaded");
        gltfMixer = new THREE.AnimationMixer(gltfModel);
        gltf.animations.forEach((clip) => {
          const name = clip.name.replace(/^AnimalArmature\|/, "");
          if (!gltfActions[name]) gltfActions[name] = gltfMixer.clipAction(clip);
        });
        usingGLTF = true;
        idleMode = "stand";
        applyIdleMode();
      },
      undefined,
      (error) => {
        console.error("Husky GLB failed to load", error);
        dogGroup.visible = false;
        modelStatus.textContent = "3D 模型加载失败，请刷新页面重试";
        modelStatus.classList.remove("hidden");
      }
    );
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
      camera.position.set(0, 1.85, 5.4);
      camera.lookAt(0, 0.8, 0.1);

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
      const rim = new THREE.DirectionalLight(0xffdcc2, 1.6);
      rim.position.set(-3, 4, -5);
      world.add(rim);
      const glow = new THREE.PointLight(0xffe3c4, 0.9, 9);
      glow.position.set(0, 2.8, 3.2);
      world.add(glow);

      dogGroup = new THREE.Group();
      dogGroup.position.set(0, 0, 0);
      world.add(dogGroup);
      dogGroup.visible = false;
      createFurBump();
      buildDog();
      buildCushion();
      buildProps();
      modelStatus.classList.remove("hidden");
      modelStatus.textContent = "正在加载 3D 模型…";
      loadHusky();

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
        canvas.style.cursor = hitDog(event) || hitToy(event) ? "pointer" : "grab";
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
      if (wasClick) {
        if (hitToy(event)) performAction("play");
        else if (hitDog(event)) performAction("pet", { toggleIdle: true });
      }
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

    if (voiceForm) {
      voiceForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const text = voiceInput.value.trim();
        if (!text) return;
        voiceStatus.textContent = `指令：${text}`;
        handleVoiceCommand(text);
        voiceInput.value = "";
      });
    }

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
  setupVoice();
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
