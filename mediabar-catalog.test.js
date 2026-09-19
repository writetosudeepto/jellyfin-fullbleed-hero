const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('mediabar-autocrop.js', 'utf8');
const requestedUrls = [];
const appendedStyles = [];
let replacement = null;
let originalFetchCalls = 0;

const logo = {
  replaceWith(node) { replacement = node; }
};
const logoContainer = {
  querySelector(selector) { return selector === '.logo' ? logo : null; }
};
const slide = {
  querySelector(selector) {
    return selector === '.logo-container' ? logoContainer : null;
  }
};
const emptyList = [];
emptyList.forEach = Array.prototype.forEach;

const document = {
  readyState: 'complete',
  head: { appendChild(node) { appendedStyles.push(node); } },
  // syncHomeViewClass() toggles mb-home / mb-has-slides / mb-jmp on both.
  body: { querySelectorAll() { return emptyList; }, classList: { toggle() {} } },
  documentElement: { classList: { toggle() {} } },
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return emptyList; },
  addEventListener() {},
  createElement(tag) {
    return {
      tagName: tag.toUpperCase(),
      id: '',
      className: '',
      textContent: '',
      attrs: {},
      setAttribute(name, value) { this.attrs[name] = value; }
    };
  }
};

const pages = [
  {
    Items: [
      { Id: 'devil-1972', BackdropImageTags: ['backdrop-a'], ImageTags: {} },
      { Id: 'devils-1971', BackdropImageTags: ['backdrop-b'], ImageTags: { Logo: 'logo-b' } }
    ],
    TotalRecordCount: 3
  },
  {
    Items: [{ Id: 'series-1', BackdropImageTags: ['backdrop-c'], ImageTags: {} }],
    TotalRecordCount: 3
  }
];

const api = {
  getAuthHeaders() { return { 'X-Emby-Token': 'test-token' }; },
  fetchItemIdsFromServer() {
    originalFetchCalls++;
    return ['original-fallback'];
  }
};

const context = {
  console,
  document,
  // isJellyfinMediaPlayer() reads navigator.userAgent at boot.
  navigator: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
  window: {
    matchMedia: () => ({ matches: false }),
    location: { hash: '#/home' },
    addEventListener() {},
    slideshowPure: {
      ApiUtils: api,
      STATE: {
        jellyfinData: {
          accessToken: 'test-token',
          serverAddress: 'http://jellyfin.test'
        },
        slideshow: { players: {}, itemIds: [] }
      },
      SlideCreator: {
        createSlideElement(item) { return { slide, item }; }
      }
    }
  },
  localStorage: { getItem() { return null; }, setItem() {} },
  sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  MutationObserver: class { observe() {} },
  Image: class {},
  fetch: async (url) => {
    requestedUrls.push(url);
    const page = pages.shift();
    return {
      ok: true,
      async json() { return page; }
    };
  },
  requestAnimationFrame(callback) { callback(); },
  setInterval() { return 1; },
  clearInterval() {},
  setTimeout() { return 1; },
  Date,
  JSON,
  Math,
  Array,
  Object,
  Number,
  encodeURIComponent
};
context.window.window = context.window;
context.window.document = document;
context.window.localStorage = context.localStorage;
context.window.sessionStorage = context.sessionStorage;

vm.runInNewContext(source, context, { filename: 'mediabar-autocrop.js' });

(async () => {
  const ids = await api.fetchItemIdsFromServer();
  assert.deepEqual(Array.from(ids), ['devil-1972', 'devils-1971', 'series-1']);
  assert.equal(requestedUrls.length, 2, 'the full catalog is fetched in stable pages');
  assert.match(requestedUrls[0], /imageTypes=Backdrop/);
  assert.match(requestedUrls[0], /SortBy=SortName/);
  assert.doesNotMatch(requestedUrls[0], /sortBy=Random/i);
  assert.match(requestedUrls[1], /StartIndex=2/);

  pages.push({ Items: [], TotalRecordCount: 0 });
  const fallbackIds = await api.fetchItemIdsFromServer();
  assert.deepEqual(Array.from(fallbackIds), ['original-fallback']);
  assert.equal(originalFetchCalls, 1,
    'an empty replacement query falls back to Media Bar instead of blanking it');

  const item = {
    Id: 'devil-1972',
    Name: 'The Devil',
    BackdropImageTags: ['backdrop-a'],
    ImageTags: {},
    RemoteTrailers: [{ Url: 'https://youtu.be/UZpXxyY0mYQ' }]
  };
  context.window.slideshowPure.SlideCreator.createSlideElement(item, 'Movie');
  assert.ok(replacement, 'a text title replaces the missing logo image');
  assert.equal(replacement.className, 'logo mb-title-fallback');
  assert.equal(replacement.textContent, 'The Devil');
  assert.equal(replacement.attrs['aria-label'], 'The Devil');
  assert.equal(item.RemoteTrailers[0].Url,
    'https://www.youtube.com/watch?v=UZpXxyY0mYQ');
  assert.equal(appendedStyles.length, 1, 'fallback title styling is installed');
  assert.match(appendedStyles[0].textContent, /transform:none!important/);
  assert.match(appendedStyles[0].textContent,
    /logo-container:has\(\.mb-title-fallback\).*justify-content:center!important/);
  assert.match(appendedStyles[0].textContent, /@media \(max-width:767px\)/);

  console.log('PASS complete Media Bar catalog and logo-free title fallback');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
