const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('mediabar-autocrop.js', 'utf8');
const listeners = {};
const storage = new Map();
/* The hero Play button lives inside the active slide, which carries the
   authoritative item id in data-item-id. Its DOM position (index 0 here)
   deliberately points at a DIFFERENT itemIds entry ('movie-decoy') to prove the
   handler reads data-item-id, not the slide's DOM position. */
const slide = {
  getAttribute(name) {
    return name === 'data-item-id' ? 'movie-1' : null;
  }
};
let detailsVisible = false;
let nativePlayClicks = 0;
let shownRoute = null;
let observerCallback = null;

const heroPlayButton = {
  tagName: 'BUTTON',
  dataset: {},
  attrs: {},
  disabled: false,
  setAttribute(name, value) { this.attrs[name] = value; },
  hasAttribute(name) { return Object.hasOwn(this.attrs, name); },
  addEventListener(type, handler) {
    listeners[type] = handler;
  },
  closest(selector) {
    return selector === '.slide' ? slide : null;
  }
};

const nativePlayButton = {
  disabled: false,
  closest(selector) {
    return selector === '#slides-container' ? null : null;
  },
  getClientRects() {
    return detailsVisible ? [{}] : [];
  },
  click() {
    nativePlayClicks++;
  }
};

const emptyList = [];
emptyList.forEach = Array.prototype.forEach;

const document = {
  readyState: 'complete',
  // syncHomeViewClass() toggles mb-home / mb-has-slides / mb-jmp on both.
  body: { querySelectorAll() { return emptyList; }, classList: { toggle() {} } },
  documentElement: { classList: { toggle() {} } },
  querySelector(selector) {
    if (selector === '.layout-mobile') return {};
    if (selector === '#slides-container .slide.active') return slide;
    if (selector === '#slides-container') return { querySelectorAll() { return emptyList; } };
    return null;
  },
  getElementById(id) {
    return id === 'slides-container' ? { querySelectorAll() { return emptyList; } } : null;
  },
  querySelectorAll(selector) {
    if (selector === '.play-button') return [heroPlayButton];
    if (selector === '#slides-container .slide') return [slide];
    if (selector === '.btnPlay') return detailsVisible ? [nativePlayButton] : [];
    return emptyList;
  },
  addEventListener() {},
  createElement() {
    throw new Error('Canvas creation is not expected in this interaction test');
  }
};

const context = {
  console,
  document,
  // isJellyfinMediaPlayer() reads navigator.userAgent at boot.
  navigator: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
  window: {
    matchMedia: () => ({ matches: true }),
    location: { hash: '#/home' },
    addEventListener() {},
    slideshowPure: {
      STATE: {
        jellyfinData: { serverId: 'server-1' },
        slideshow: {
          currentSlideIndex: 1,
          itemIds: ['movie-decoy', 'movie-1'],
          players: {}
        }
      }
    },
    Emby: {
      Page: {
        show(route) {
          shownRoute = route;
        }
      }
    }
  },
  sessionStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, value); },
    removeItem(key) { storage.delete(key); }
  },
  MutationObserver: class {
    constructor(callback) {
      observerCallback = callback;
    }
    observe() {}
  },
  Image: class {},
  requestAnimationFrame(callback) { callback(); },
  setInterval() { return 1; },
  clearInterval() {},
  setTimeout() { return 1; },
  Date,
  JSON,
  Math,
  Array,
  Object,
  encodeURIComponent
};
context.window.window = context.window;
context.window.document = document;
context.window.sessionStorage = context.sessionStorage;
context.window.requestAnimationFrame = context.requestAnimationFrame;

vm.runInNewContext(source, context, { filename: 'mediabar-autocrop.js' });

assert.equal(typeof listeners.click, 'function', 'mobile hero Play handler was attached');

let defaultPrevented = false;
let propagationStopped = false;
listeners.click({
  preventDefault() { defaultPrevented = true; },
  stopImmediatePropagation() { propagationStopped = true; }
});

assert.equal(defaultPrevented, true, 'Media Bar remote Play handler was prevented');
assert.equal(propagationStopped, true, 'Media Bar remote Play handler was stopped');
assert.equal(shownRoute, '/details?id=movie-1&serverId=server-1');
assert.equal(storage.has('mbLocalPlay.v1'), true, 'local playback handoff was queued');

/* Jellyfin creates the real details-page button asynchronously after the old
   slides container is detached. The body observer must keep watching until it
   becomes visible, then activate it exactly once. */
context.window.location.hash = '#/details?id=movie-1&serverId=server-1';
detailsVisible = true;
observerCallback([]);
assert.equal(nativePlayClicks, 1, 'details-page native Play was activated');
assert.equal(storage.has('mbLocalPlay.v1'), false, 'completed handoff was cleared');

console.log('PASS mobile hero Play hands off to Jellyfin native local playback');
