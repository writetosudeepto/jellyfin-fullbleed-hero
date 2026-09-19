const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('mediabar-autocrop.js', 'utf8');
const volumeListeners = {};
const pauseListeners = {};
const icon = { textContent: 'volume_off' };
const pauseIcon = { textContent: 'pause' };
let unmuteCalls = 0;
let muteCalls = 0;
let playCalls = 0;
let pauseCalls = 0;
let timerStarts = 0;
let timerStops = 0;
let volume = null;
let restarted = 0;
let alternateLoad = null;
let playerMuted = true;
let playerState = 2;
let captionUnloads = 0;
let captionTrackClears = 0;

const currentPlayer = {
  mute() { muteCalls++; playerMuted = true; },
  unMute() { unmuteCalls++; playerMuted = false; },
  isMuted() { return playerMuted; },
  setVolume(value) { volume = value; },
  getPlayerState() { return playerState; },
  playVideo() { playCalls++; playerState = 1; },
  pauseVideo() { pauseCalls++; playerState = 2; },
  unloadModule(name) { if (name === 'captions') captionUnloads++; },
  setOption(module, option, value) {
    if (module === 'captions' && option === 'track' &&
        Object.keys(value).length === 0) captionTrackClears++;
  }
};

let hiddenMuted = false;
let hiddenState = 1;
let hiddenMuteCalls = 0;
let hiddenPauseCalls = 0;
const hiddenPlayer = {
  mute() { hiddenMuteCalls++; hiddenMuted = true; },
  isMuted() { return hiddenMuted; },
  getPlayerState() { return hiddenState; },
  pauseVideo() { hiddenPauseCalls++; hiddenState = 2; },
  unloadModule() {},
  setOption() {}
};

const volumeButton = {
  tagName: 'DIV',
  dataset: {},
  attrs: {},
  querySelector(selector) { return selector === 'i' ? icon : null; },
  setAttribute(name, value) { this.attrs[name] = value; },
  hasAttribute(name) { return Object.hasOwn(this.attrs, name); },
  addEventListener(type, handler) { volumeListeners[type] = handler; }
};

const pauseButton = {
  tagName: 'DIV',
  dataset: {},
  attrs: {},
  querySelector(selector) { return selector === 'i' ? pauseIcon : null; },
  setAttribute(name, value) { this.attrs[name] = value; },
  hasAttribute(name) { return Object.hasOwn(this.attrs, name); },
  addEventListener(type, handler) { pauseListeners[type] = handler; }
};

const classes = () => ({
  removed: [],
  remove(name) { this.removed.push(name); }
});
const video = { classList: classes(), dataset: {} };
const backdrop = { classList: classes() };
const plot = { classList: classes() };
const slide = {
  getAttribute(name) { return name === 'data-item-id' ? 'movie-1' : null; },
  querySelector(selector) {
    return selector === '.video-container' ? video :
      selector === '.backdrop' ? backdrop :
      selector === '.plot-container' ? plot : null;
  }
};
const hiddenVideo = { classList: classes(), dataset: {} };
const hiddenBackdrop = { classList: classes() };
const hiddenPlot = { classList: classes() };
const hiddenSlide = {
  getAttribute(name) { return name === 'data-item-id' ? 'movie-2' : null; },
  querySelector(selector) {
    return selector === '.video-container' ? hiddenVideo :
      selector === '.backdrop' ? hiddenBackdrop :
      selector === '.plot-container' ? hiddenPlot : null;
  }
};

const emptyList = [];
emptyList.forEach = Array.prototype.forEach;

let capturedConfig = null;
function OriginalYTPlayer(el, config) {
  capturedConfig = config;
  return { el, config };
}
OriginalYTPlayer.prototype = {};

const slideshow = {
  currentSlideIndex: 0,
  itemIds: ['movie-1'],
  isMuted: true,
  isPaused: false,
  isVideoPlaying: true,
  players: { 'movie-1': currentPlayer },
  loadedItems: {
    'movie-1': {
      RemoteTrailers: [
        { Url: 'https://www.youtube.com/watch?v=AAAAAAAAAAA' },
        { Url: 'https://youtu.be/BBBBBBBBBBB' }
      ]
    }
  },
  slideInterval: {
    start() { timerStarts++; },
    stop() { timerStops++; },
    restart() { restarted++; }
  }
};

const document = {
  readyState: 'complete',
  // syncHomeViewClass() toggles mb-home / mb-has-slides / mb-jmp on both.
  body: { querySelectorAll() { return emptyList; }, classList: { toggle() {} } },
  documentElement: { classList: { toggle() {} } },
  querySelector(selector) {
    if (selector === '.layout-mobile') return {};
    if (selector === '#slides-container .slide.active') return slide;
    if (selector === '.slide[data-item-id="movie-1"]') return slide;
    if (selector === '.slide[data-item-id="movie-2"]') return hiddenSlide;
    return null;
  },
  querySelectorAll(selector) {
    if (selector === '.volume-toggle') return [volumeButton];
    if (selector === '.pause-button') return [pauseButton];
    return emptyList;
  },
  getElementById() { return { querySelectorAll() { return emptyList; } }; },
  addEventListener() {},
  createElement() { throw new Error('Canvas is not expected in this test'); }
};

const context = {
  console,
  document,
  // isJellyfinMediaPlayer() reads navigator.userAgent at boot.
  navigator: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
  window: {
    location: { href: 'https://jellyfin.example/web/', origin: 'https://jellyfin.example', hash: '#/home' },
    matchMedia: () => ({ matches: true }),
    addEventListener() {},
    PointerEvent: function PointerEvent() {},
    YT: { Player: OriginalYTPlayer },
    slideshowPure: {
      STATE: { slideshow },
      SlideshowManager: {},
      SlideCreator: { createSlideElement(item) { return item; } }
    }
  },
  localStorage: { getItem() { return null; }, setItem() {} },
  sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  MutationObserver: class { observe() {} },
  Image: class {},
  URL,
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
context.window.localStorage = context.localStorage;
context.window.sessionStorage = context.sessionStorage;

vm.runInNewContext(source, context, { filename: 'mediabar-autocrop.js' });

function pointerTap(listeners) {
  listeners.pointerdown({
    pointerType: 'touch', screenX: 10, screenY: 10, stopPropagation() {}
  });
  listeners.pointerup({
    pointerType: 'touch', screenX: 10, screenY: 10,
    preventDefault() {}, stopImmediatePropagation() {}
  });
}

assert.equal(typeof volumeListeners.pointerup, 'function', 'sound Pointer Event handler attached');
pointerTap(volumeListeners);
assert.equal(slideshow.isMuted, false, 'sound tap updates Media Bar mute state');
assert.equal(unmuteCalls, 2, 'active player is unmuted inside the pointer gesture');
assert.equal(volume, 100, 'audible volume is restored');
assert.equal(playCalls, 0, 'sound control never changes trailer playback state');
assert.equal(muteCalls, 0, 'sound control does not force a muted playback restart');
assert.equal(icon.textContent, 'volume_up', 'sound icon reflects audible state');
assert.equal(volumeButton.attrs['aria-pressed'], 'true');

/* Android emits a synthetic click after pointerup; it must not toggle sound a
   second time. */
volumeListeners.click({
  preventDefault() {},
  stopImmediatePropagation() {}
});
assert.equal(slideshow.isMuted, false, 'synthetic click was suppressed');

assert.equal(typeof pauseListeners.pointerup, 'function', 'pause Pointer Event handler attached');
pointerTap(pauseListeners);
assert.equal(slideshow.isPaused, true);
assert.equal(pauseCalls, 1, 'active trailer was paused directly');
assert.equal(timerStops, 1, 'slideshow timer stopped with the trailer');
assert.equal(pauseIcon.textContent, 'play_arrow');

pauseListeners.click({ preventDefault() {}, stopImmediatePropagation() {} });
assert.equal(slideshow.isPaused, true, 'synthetic pause click was suppressed');

pauseListeners.keydown({
  key: 'Enter', preventDefault() {}, stopImmediatePropagation() {}
});
assert.equal(slideshow.isPaused, false);
assert.equal(playCalls, 1, 'keyboard activation resumed the active trailer');
assert.equal(timerStarts, 1, 'slideshow timer resumed');
assert.equal(pauseIcon.textContent, 'pause');

const config = {
  videoId: 'AAAAAAAAAAA',
  playerVars: { start: 3, autoplay: 0 },
  events: { onReady(event) { event.target.mute(); } }
};
new context.window.YT.Player('yt-player-movie-1', config);
const activeConfig = capturedConfig;
assert.equal(activeConfig.playerVars.playsinline, 1);
assert.equal(activeConfig.playerVars.autoplay, 0, 'Media Bar controls when playback starts');
assert.equal(activeConfig.playerVars.mute, undefined, 'iframe is not pinned to its muted startup path');
assert.equal(activeConfig.playerVars.origin, undefined, 'patch does not override YouTube iframe origin');
assert.equal(typeof activeConfig.events.onError, 'function', 'YouTube errors are handled');

activeConfig.events.onReady({ target: currentPlayer });
assert.equal(muteCalls, 1, 'fork onReady mute was observed');
assert.equal(playerMuted, false, 'patch immediately restored the requested audible state');
assert.equal(unmuteCalls, 6, 'onReady reapplied unmute through the iframe bridge');
assert.equal(playCalls, 1, 'onReady patch did not start playback itself');
assert.equal(captionUnloads, 2, 'captions are disabled at boot and again when the player is ready');
assert.equal(captionTrackClears, 2, 'YouTube caption track preference is cleared');

slideshow.players['movie-2'] = hiddenPlayer;
slideshow.itemIds.push('movie-2');
slideshow.loadedItems['movie-2'] = { RemoteTrailers: [] };
new context.window.YT.Player('yt-player-movie-2', {
  videoId: 'CCCCCCCCCCC', playerVars: {}, events: {}
});
const hiddenConfig = capturedConfig;

hiddenConfig.events.onStateChange({ data: 1, target: hiddenPlayer });
assert.equal(hiddenMuteCalls, 1, 'a hidden player that starts late is muted');
assert.equal(hiddenPauseCalls, 1, 'a hidden player that starts late is paused');
assert.equal(hiddenState, 2);
assert.equal(slideshow.isVideoPlaying, true, 'hidden PAUSED event does not clear active playback state');
assert.deepEqual(hiddenVideo.classList.removed, ['active']);

hiddenMuted = false;
hiddenState = 1;
activeConfig.events.onStateChange({ data: 1, target: currentPlayer });
assert.equal(hiddenMuteCalls, 2, 'active playback mutes every other known player');
assert.equal(hiddenPauseCalls, 2, 'active playback pauses every other known player');
assert.equal(playerState, 1, 'the current trailer remains playing');

const errorTarget = {
  loadVideoById(options) { alternateLoad = options; }
};
activeConfig.events.onError({ data: 150, target: errorTarget });
assert.deepEqual(JSON.parse(JSON.stringify(alternateLoad)), {
  videoId: 'BBBBBBBBBBB',
  startSeconds: 3
});

activeConfig.events.onError({ data: 100, target: errorTarget });
assert.equal(restarted, 1, 'slideshow timer resumes after all trailers fail');
assert.equal(video.dataset.playbackFailed, '100');
assert.deepEqual(video.classList.removed, ['active']);
assert.deepEqual(backdrop.classList.removed, ['with-video']);

console.log('PASS mobile controls, exclusive trailer playback, captions, and fallbacks');
