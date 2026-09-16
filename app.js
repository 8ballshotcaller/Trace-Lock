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
  const traceStage = document.getElementById("trace-stage");
  const traceImg   = document.getElementById("trace-img");

  const zoomRange    = document.getElementById("zoom-range");
  const opacityRange = document.getElementById("opacity-range");
  const btnRotate    = document.getElementById("btn-rotate");
  const btnInvert    = document.getElementById("btn-invert");
  const btnReset     = document.getElementById("btn-reset");
  const btnLock      = document.getElementById("btn-lock");
  const btnBack      = document.getElementById("btn-back");
  const btnCode      = document.getElementById("btn-code");

  const unlockCorner  = document.getElementById("unlock-corner");
  const keypadOverlay = document.getElementById("keypad-overlay");
  const keypadDots    = document.getElementById("keypad-dots");
  const setcodeOverlay= document.getElementById("setcode-overlay");
  const setcodeDots   = document.getElementById("setcode-dots");
  const setcodeTitle  = document.getElementById("setcode-title");

  /* ---------------- State ---------------- */
  const state = {
    naturalW: 0, naturalH: 0,
    baseScale: 1,
    x: 0, y: 0, scale: 1, rotate: 0,
    inverted: false, opacity: 1,
  };

  const CODE_KEY = "tracelock_code";
  const OPTS_KEY = "tracelock_opts";
  function getCode() { return localStorage.getItem(CODE_KEY) || "1234"; }
  function setCode(c) { localStorage.setItem(CODE_KEY, c); }

  // restore saved fade/invert prefs (not the image itself — images aren't persisted)
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

  dropzone.addEventListener("click", (e) => {
    // label already opens the file picker; nothing extra needed
  });
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
    state.x = 0; state.y = 0; state.rotate = 0;
    zoomRange.value = 100;
    render();
  }

  function render() {
    const t = `translate(-50%,-50%) translate(${state.x}px, ${state.y}px) rotate(${state.rotate}deg) scale(${state.scale})`;
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

  // desktop convenience: wheel to zoom
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
  btnReset.addEventListener("click", fitToStage);
  btnBack.addEventListener("click", () => {
    fileInput.value = "";
    showScreen(screenUpload);
  });

  /* ---------------- Lock & Trace ---------------- */
  btnLock.addEventListener("click", () => {
    traceImg.src = img.src;
    traceImg.style.width = img.style.width;
    traceImg.style.height = img.style.height;
    traceImg.style.opacity = state.opacity;
    traceImg.classList.toggle("inverted", state.inverted);
    traceImg.style.transform =
      `translate(-50%,-50%) translate(${state.x}px, ${state.y}px) rotate(${state.rotate}deg) scale(${state.scale})`;
    showScreen(screenTrace);
    enterFrozenMode();
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

  /* ---------------- Unlock corner: long-press to reveal keypad ---------------- */
  let pressTimer = null;
  const HOLD_MS = 650;

  function startPress(e) {
    e.preventDefault();
    unlockCorner.classList.add("charging");
    pressTimer = setTimeout(() => {
      unlockCorner.classList.remove("charging");
      openKeypad();
    }, HOLD_MS);
  }
  function cancelPress() {
    clearTimeout(pressTimer);
    unlockCorner.classList.remove("charging");
  }
  unlockCorner.addEventListener("touchstart", startPress, { passive: false });
  unlockCorner.addEventListener("touchend", cancelPress);
  unlockCorner.addEventListener("touchcancel", cancelPress);
  unlockCorner.addEventListener("mousedown", startPress);
  unlockCorner.addEventListener("mouseup", cancelPress);
  unlockCorner.addEventListener("mouseleave", cancelPress);

  /* ---------------- Keypad (unlock) ---------------- */
  let entered = "";
  function openKeypad() {
    entered = "";
    renderDots(keypadDots, entered.length, getCode().length);
    keypadOverlay.classList.add("active");
  }
  function closeKeypad() {
    keypadOverlay.classList.remove("active");
    entered = "";
  }
  function renderDots(container, filled, total) {
    container.innerHTML = "";
    for (let i = 0; i < total; i++) {
      const s = document.createElement("span");
      if (i < filled) s.classList.add("filled");
      container.appendChild(s);
    }
  }
  keypadOverlay.querySelectorAll(".key:not(.key-cancel):not(.key-del)").forEach(btn => {
    btn.addEventListener("click", () => {
      const code = getCode();
      if (entered.length >= code.length) return;
      entered += btn.textContent.trim();
      renderDots(keypadDots, entered.length, code.length);
      if (entered.length === code.length) {
        if (entered === code) {
          closeKeypad();
          exitFrozenMode();
          showScreen(screenEditor);
        } else {
          keypadDots.classList.add("shake");
          setTimeout(() => {
            keypadDots.classList.remove("shake");
            entered = "";
            renderDots(keypadDots, 0, code.length);
          }, 400);
        }
      }
    });
  });
  document.getElementById("key-del").addEventListener("click", () => {
    entered = entered.slice(0, -1);
    renderDots(keypadDots, entered.length, getCode().length);
  });
  document.getElementById("key-cancel").addEventListener("click", closeKeypad);

  /* ---------------- Set-code overlay ---------------- */
  let scStep = 1, scFirst = "", scBuf = "";
  btnCode.addEventListener("click", () => {
    scStep = 1; scFirst = ""; scBuf = "";
    setcodeTitle.textContent = "Set a new unlock code";
    renderDots(setcodeDots, 0, 4);
    setcodeOverlay.classList.add("active");
  });
  function closeSetcode() {
    setcodeOverlay.classList.remove("active");
    scStep = 1; scFirst = ""; scBuf = "";
  }
  setcodeOverlay.querySelectorAll(".sc-key").forEach(btn => {
    btn.addEventListener("click", () => {
      if (scBuf.length >= 4) return;
      scBuf += btn.textContent.trim();
      renderDots(setcodeDots, scBuf.length, 4);
      if (scBuf.length === 4) {
        if (scStep === 1) {
          scFirst = scBuf; scBuf = "";
          scStep = 2;
          setcodeTitle.textContent = "Confirm your code";
          setTimeout(() => renderDots(setcodeDots, 0, 4), 150);
        } else {
          if (scBuf === scFirst) {
            setCode(scBuf);
            closeSetcode();
          } else {
            setcodeDots.classList.add("shake");
            setTimeout(() => {
              setcodeDots.classList.remove("shake");
              scStep = 1; scFirst = ""; scBuf = "";
              setcodeTitle.textContent = "Codes didn't match — try again";
              renderDots(setcodeDots, 0, 4);
            }, 400);
          }
        }
      }
    });
  });
  document.getElementById("setcode-del").addEventListener("click", () => {
    scBuf = scBuf.slice(0, -1);
    renderDots(setcodeDots, scBuf.length, 4);
  });
  document.getElementById("setcode-cancel").addEventListener("click", closeSetcode);

  /* ---------------- Resize handling ---------------- */
  window.addEventListener("resize", () => {
    if (screenEditor.classList.contains("active") && state.naturalW) {
      // keep current zoom % relative, just refresh base scale reference point
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
