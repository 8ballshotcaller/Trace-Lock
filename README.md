# TraceLock — Freeze & Trace

A tiny, no-backend web app for tracing images on your phone screen.

Drop in a photo, pinch/drag it into position, then **freeze** the screen —
once frozen, touches, scrolling, and pinch-zoom are all disabled, so you can
lay paper over your phone and trace without the image sliding around. A
4-digit code (that you set yourself) is the only way to unlock it again.

## Features

- Drag & drop / tap-to-choose / paste an image
- Pinch-to-zoom, drag-to-pan, rotate 90°, fade (opacity) slider, invert colors
- **Freeze & Trace mode**: blocks touchmove, pinch-zoom, long-press menus,
  and drag — the screen genuinely won't move
- Unlock via a private 4-digit code (hold the bottom-right corner ~0.6s to
  bring up the keypad) — no accidental unlocks from stray tracing touches
- Installable as a home-screen app (PWA) for a true **fullscreen** experience
  with no browser address bar — this matters most on **iOS**, where Safari
  never hides its own UI inside a normal browser tab. Once added to the home
  screen, it opens edge-to-edge like a native app.
- Works fully offline after first load (service worker caches the app)
- No image ever leaves your device — nothing is uploaded anywhere

## Using it

1. Open the app, choose or drop an image
2. Pinch/drag to position it, adjust fade/rotate/invert as helpful for your paper
3. Tap **🔑** once to set your own unlock code (default is `1234` — change it!)
4. Tap **🔒 Freeze & Trace**
5. Lay paper over the screen and trace — the screen will not move no matter
   how much you press on it
6. To unlock: **hold down** the small dot in the bottom-right corner for
   about half a second, then enter your code

## Getting true fullscreen on iOS (no address bar / nav bar)

This is a browser limitation, not something a webpage can override on its
own — iOS Safari doesn't expose an API to hide its own chrome. The one
real fix is installing the page as a home-screen app:

1. Open the deployed page in **Safari** on iPhone (must be Safari, not
   Chrome/Firefox on iOS)
2. Tap the **Share** icon → **Add to Home Screen**
3. Launch TraceLock from the home screen icon from now on — it opens with
   zero address bar and zero nav bar, true fullscreen

## Deploying / putting this on GitHub

```bash
cd tracelock
git init
git add .
git commit -m "Initial commit: TraceLock"
git branch -M main
git remote add origin https://github.com/<your-username>/tracelock.git
git push -u origin main
```

Then turn on **GitHub Pages** (Settings → Pages → Deploy from branch → `main`
/ root) to get a free `https://<your-username>.github.io/tracelock/` URL —
that's the link you'll open in Safari and add to your home screen.

## File structure

```
tracelock/
├── index.html        # markup for all 3 screens (upload / editor / trace)
├── style.css          # all styling
├── app.js             # all logic (upload, pan/zoom, freeze, unlock keypad)
├── manifest.json       # PWA manifest (installable, standalone display)
├── sw.js              # service worker (offline caching)
├── icons/              # app icons (apple-touch-icon + PWA icons)
└── README.md
```

Everything is plain HTML/CSS/JS — no build step, no dependencies, no
frameworks. Open `index.html` directly in a browser to test locally, or
serve the folder with any static file server.

## Notes / limits

- Images aren't saved between sessions on purpose (nothing is written to
  disk/server) — only your unlock code and fade/invert preferences are
  remembered locally on your device.
- Long-press-to-save-image and pinch-zoom-out-of-the-page are also blocked
  while frozen, along with normal scrolling.
- If you ever forget your code, the only reset is clearing this site's data
  in your browser settings (Settings → Safari → Advanced → Website Data on
  iOS), which restores the default `1234`.
