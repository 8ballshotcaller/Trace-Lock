(() => {
  "use strict";

  /* ---------------- Elements ---------------- */
  const screenUpload = document.getElementById("screen-upload");
  const screenEditor = document.getElementById("screen-editor");
  const screenTrace  = document.getElementById("screen-trace");

  const dropzone   = document.getElementById("dropzone");
  const fileInput  = document.getElementById("file-input");

  const stage      = document.getElementById("stage");
  const img        = document.getElementById("img");
  const traceImg   = document.getElementById("trace-img");

  const zoomRange    = document.getElementById("zoom-range");
  const opacityRange = document.getElementById("opacity-range");
  const btnRotate    = document.getElementById("btn-rotate");
  const btnFlip      = document.getElementById("btn-flip");
  const btnInvert    = document.getElementById("btn-invert");
  const btnReset     = document.getElementById("btn-reset");
  const btnLock      = document.getElementById("btn-lock");
  const btnBack      = document.getElementById("btn-back");

  const btnHelpUpload = document.getElementById("btn-help-upload");
  const btnHelpEditor = document.getElementById("btn-help-editor");
  const introOverlay  = document.getElementById("intro-overlay");
  const introClose    = document.getElementById("intro-close");

  const iosHint      = document.getElementById("ios-hint");
  const iosHintClose = document.getElementById("ios-hint-close");

  const unlockRight = document.getElementById("unlock-right");

  /* ---------------- State ---------------- */
  const state = {
    naturalW: 0, naturalH: 0,
    baseScale: 1,
    x: 0, y: 0, scale: 1, rotate: 0, flipped: false,
    inverted: false, opacity: 1,
  };

  const OPTS_KEY = "tracelock_opts";
  const INTRO_KEY = "tracelock_intro_seen";
  const IOS_HINT_KEY = "tracelock_ios_hint_dismissed";

  try {
    const saved = JSON.parse(localStorage.getItem(OPTS_KEY) || "{}");
    if (saved.opacity) state.opacity = saved.opacity;
    if (saved.inverted) state.inverted = saved.inverted;
  } catch (e) {}

  function saveOpts() {
    localStorage.setItem(OPTS_KEY, JSON.stringify({ opacity: state.opacity, inverted: state.inverted }));
  }

  function showScreen(el) {
    [screenUpload, screenEditor, screenTrace].forEach(s => s.classList.remove("active"));
    el.classList.add("active");
  }

  /* ---------------- Screen wake lock ----------------
     Positioning and tracing can both take several minutes; without this the
     phone will dim/lock mid-session (worst case: while frozen, with no way
     to see the screen to unlock it). Best-effort — silently no-ops where
     unsupported (e.g. iOS Safari < 16.4). */
  let wakeLock = null;
  async function requestWakeLock() {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    } catch (e) { wakeLock = null; }
  }
  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }
  document.addEventListener("visibilitychange", () => {
    const needsLock = screenEditor.classList.contains("active") || screenTrace.classList.contains("active");
    if (document.visibilityState === "visible" && needsLock && !wakeLock) requestWakeLock();
  });

  /* ---------------- First-run help + iOS install hint ---------------- */
  function openIntro() { introOverlay.classList.add("active"); }
  function closeIntro() {
    introOverlay.classList.remove("active");
    localStorage.setItem(INTRO_KEY, "1");
  }
  btnHelpUpload.addEventListener("click", openIntro);
  btnHelpEditor.addEventListener("click", openIntro);
  introClose.addEventListener("click", closeIntro);
  if (!localStorage.getItem(INTRO_KEY)) openIntro();

  function isIOS() {
    return /iP(hone|od|ad)/.test(navigator.platform) ||
      (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1);
  }
  function isStandalone() {
    return window.navigator.standalone === true ||
      window.matchMedia("(display-mode: standalone)").matches;
  }
  if (isIOS() && !isStandalone() && !localStorage.getItem(IOS_HINT_KEY)) {
    iosHint.classList.add("show");
  }
  iosHintClose.addEventListener("click", () => {
    iosHint.classList.remove("show");
    localStorage.setItem(IOS_HINT_KEY, "1");
  });

  /* ---------------- Load image ---------------- */
  function loadFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      img.src = e.target.result;
      img.onload = () => {
        state.naturalW = img.naturalWidth;
        state.naturalH = img.naturalHeight;
        showScreen(screenEditor);
        requestWakeLock();
        // wait a frame so the (now-visible) stage has real layout dimensions
        // before we measure it — measuring while still display:none gives 0x0
        // and shrinks the image to nothing.
        requestAnimationFrame(() => {
          fitToStage();
          applyOpacityInvert();
        });
      };
    };
    reader.readAsDataURL(file);
  }

  fileInput.addEventListener("change", (e) => loadFile(e.target.files[0]));

  ["dragover", "dragenter"].forEach(evt =>
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add("dragover"); })
  );
  ["dragleave", "drop"].forEach(evt =>
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove("dragover"); })
  );
  dropzone.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });
  window.addEventListener("paste", (e) => {
    if (!screenUpload.classList.contains("active")) return;
    const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith("image/"));
    if (item) loadFile(item.getAsFile());
  });

  /* ---------------- Transform helpers ---------------- */
  function fitToStage() {
    const r = stage.getBoundingClientRect();
    const w = r.width || window.innerWidth;
    const h = r.height || window.innerHeight;
    state.baseScale = Math.min(w / state.naturalW, h / state.naturalH);
    img.style.width = state.naturalW + "px";
    img.style.height = state.naturalH + "px";
    traceImg.style.width = state.naturalW + "px";
    traceImg.style.height = state.naturalH + "px";
    state.scale = state.baseScale;
    state.x = 0; state.y = 0; state.rotate = 0; state.flipped = false;
    zoomRange.value = 100;
    btnFlip.classList.remove("active");
    render();
  }

  function render() {
    const sx = state.scale * (state.flipped ? -1 : 1);
    const t = `translate(-50%,-50%) translate(${state.x}px, ${state.y}px) rotate(${state.rotate}deg) scale(${sx}, ${state.scale})`;
    img.style.transform = t;
  }

  function applyOpacityInvert() {
    img.style.opacity = state.opacity;
    img.classList.toggle("inverted", state.inverted);
    opacityRange.value = Math.round(state.opacity * 100);
  }

  /* ---------------- Editor: pan (pointer) ---------------- */
  let dragging = false, lastX = 0, lastY = 0;
  stage.addEventListener("pointerdown", (e) => {
    if (activeTouches.size >= 2) return; // let pinch handler own it
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    state.x += (e.clientX - lastX);
    state.y += (e.clientY - lastY);
    lastX = e.clientX; lastY = e.clientY;
    render();
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(evt =>
    stage.addEventListener(evt, () => { dragging = false; })
  );

  /* ---------------- Editor: pinch zoom (touch) ---------------- */
  const activeTouches = new Map();
  let pinchStartDist = null, pinchStartScale = 1;

  stage.addEventListener("touchstart", (e) => {
    for (const t of e.changedTouches) activeTouches.set(t.identifier, t);
    if (activeTouches.size === 2) {
      dragging = false;
      const pts = [...activeTouches.values()];
      pinchStartDist = dist(pts[0], pts[1]);
      pinchStartScale = state.scale;
    }
  }, { passive: true });

  stage.addEventListener("touchmove", (e) => {
    for (const t of e.changedTouches) activeTouches.set(t.identifier, t);
    if (activeTouches.size === 2 && pinchStartDist) {
      e.preventDefault();
      const pts = [...activeTouches.values()];
      const d = dist(pts[0], pts[1]);
      const factor = d / pinchStartDist;
      state.scale = clamp(pinchStartScale * factor, state.baseScale * 0.15, state.baseScale * 8);
      syncZoomSlider();
      render();
    }
  }, { passive: false });

  ["touchend", "touchcancel"].forEach(evt =>
    stage.addEventListener(evt, (e) => {
      for (const t of e.changedTouches) activeTouches.delete(t.identifier);
      if (activeTouches.size < 2) pinchStartDist = null;
    })
  );

  function dist(a, b) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }
  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    state.scale = clamp(state.scale * factor, state.baseScale * 0.15, state.baseScale * 8);
    syncZoomSlider();
    render();
  }, { passive: false });

  function syncZoomSlider() {
    const pct = Math.round((state.scale / state.baseScale) * 100);
    zoomRange.value = clamp(pct, +zoomRange.min, +zoomRange.max);
  }

  /* ---------------- Editor controls ---------------- */
  zoomRange.addEventListener("input", () => {
    state.scale = state.baseScale * (+zoomRange.value / 100);
    render();
  });
  opacityRange.addEventListener("input", () => {
    state.opacity = +opacityRange.value / 100;
    img.style.opacity = state.opacity;
    saveOpts();
  });
  btnInvert.addEventListener("click", () => {
    state.inverted = !state.inverted;
    img.classList.toggle("inverted", state.inverted);
    saveOpts();
  });
  btnRotate.addEventListener("click", () => {
    state.rotate = (state.rotate + 90) % 360;
    render();
  });
  btnFlip.addEventListener("click", () => {
    state.flipped = !state.flipped;
    btnFlip.classList.toggle("active", state.flipped);
    render();
  });
  btnReset.addEventListener("click", fitToStage);
  btnBack.addEventListener("click", () => {
    fileInput.value = "";
    releaseWakeLock();
    showScreen(screenUpload);
  });

  /* ---------------- Lock & Trace ---------------- */
  btnLock.addEventListener("click", () => {
    const sx = state.scale * (state.flipped ? -1 : 1);
    traceImg.src = img.src;
    traceImg.style.width = img.style.width;
    traceImg.style.height = img.style.height;
    traceImg.style.opacity = state.opacity;
    traceImg.classList.toggle("inverted", state.inverted);
    traceImg.style.transform =
      `translate(-50%,-50%) translate(${state.x}px, ${state.y}px) rotate(${state.rotate}deg) scale(${sx}, ${state.scale})`;
    showScreen(screenTrace);
    enterFrozenMode();
    requestWakeLock();
  });

  /* ---------------- Double-tap to fit ---------------- */
  stage.addEventListener("dblclick", (e) => {
    e.preventDefault();
    fitToStage();
  });

  /* ---------------- Arrow-key nudge (precision positioning) ---------------- */
  window.addEventListener("keydown", (e) => {
    if (!screenEditor.classList.contains("active")) return;
    const step = e.shiftKey ? 10 : 1;
    switch (e.key) {
      case "ArrowUp":    state.y -= step; break;
      case "ArrowDown":  state.y += step; break;
      case "ArrowLeft":  state.x -= step; break;
      case "ArrowRight": state.x += step; break;
      default: return;
    }
    e.preventDefault();
    render();
  });

  /* ---------------- Frozen mode: block all touch/scroll/zoom ---------------- */
  function preventAll(e) { e.preventDefault(); }

  function enterFrozenMode() {
    document.addEventListener("touchmove", preventAll, { passive: false });
    document.addEventListener("touchstart", preventAll, { passive: false });
    document.addEventListener("gesturestart", preventAll, { passive: false });
    document.addEventListener("gesturechange", preventAll, { passive: false });
    document.addEventListener("contextmenu", preventAll);
    document.addEventListener("dragstart", preventAll);
  }
  function exitFrozenMode() {
    document.removeEventListener("touchmove", preventAll, { passive: false });
    document.removeEventListener("touchstart", preventAll, { passive: false });
    document.removeEventListener("gesturestart", preventAll, { passive: false });
    document.removeEventListener("gesturechange", preventAll, { passive: false });
    document.removeEventListener("contextmenu", preventAll);
    document.removeEventListener("dragstart", preventAll);
  }

  /* ---------------- Bottom-right hold-to-unlock ---------------- */
  const HOLD_MS = 5000;
  let holdStart = null, holdRAF = null;

  function setProgress(p) {
    unlockRight.querySelector(".unlock-ring").style.setProperty("--p", p);
  }

  function tick(ts) {
    if (holdStart === null) holdStart = ts;
    const p = Math.min(1, (ts - holdStart) / HOLD_MS);
    setProgress(p);
    if (p >= 1) {
      holdRAF = null; holdStart = null;
      unlock();
      return;
    }
    holdRAF = requestAnimationFrame(tick);
  }

  function startHold() {
    if (holdRAF === null) {
      holdStart = null;
      holdRAF = requestAnimationFrame(tick);
    }
  }

  function stopHold() {
    if (holdRAF !== null) cancelAnimationFrame(holdRAF);
    holdRAF = null; holdStart = null;
    setProgress(0);
  }

  function unlock() {
    stopHold();
    unlockRight.classList.remove("pressed");
    exitFrozenMode();
    showScreen(screenEditor);
  }

  function bindZone(el) {
    const down = (e) => {
      e.preventDefault();
      el.classList.add("pressed");
      startHold();
    };
    const up = () => {
      el.classList.remove("pressed");
      stopHold();
    };
    el.addEventListener("touchstart", down, { passive: false });
    el.addEventListener("touchend", up);
    el.addEventListener("touchcancel", up);
    // mouse fallback, useful when testing on a laptop
    el.addEventListener("mousedown", down);
    el.addEventListener("mouseup", up);
    el.addEventListener("mouseleave", up);
  }
  bindZone(unlockRight);

  /* ---------------- Resize handling ---------------- */
  window.addEventListener("resize", () => {
    if (screenEditor.classList.contains("active") && state.naturalW) {
      const pct = state.baseScale ? state.scale / state.baseScale : 1;
      const r = stage.getBoundingClientRect();
      state.baseScale = Math.min(r.width / state.naturalW, r.height / state.naturalH);
      state.scale = state.baseScale * pct;
      render();
    }
  });

  /* ---------------- PWA service worker (optional, for offline use) ---------------- */
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
