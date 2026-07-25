(function () {
  'use strict';

  /* AutoCrop */
  var CACHE_KEY = 'mbAutocrop.v1';
  var MAX_SCALE = 1.5;
  var MIN_BAR = 0.03;
  var PIXEL_BLACK = 26;
  var ROW_BLACK = 0.98;
  var MAX_SCAN = 0.30;
  var SYMMETRY = 2.5;
  var SAMPLE_W = 160;
  var SAMPLE_H = 90;

  var cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch (e) {}

  function saveCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) {}
  }

  function loadThumb(videoId) {
    var urls = [
      'https://i.ytimg.com/vi/' + videoId + '/maxresdefault.jpg',
      'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg'
    ];
    return new Promise(function (resolve) {
      (function next(i) {
        if (i >= urls.length) { resolve(null); return; }
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
          if (img.naturalWidth < 300) { next(i + 1); return; }
          resolve(img);
        };
        img.onerror = function () { next(i + 1); };
        img.src = urls[i];
      })(0);
    });
  }

  function analyze(img) {
    var canvas = document.createElement('canvas');
    canvas.width = SAMPLE_W;
    canvas.height = SAMPLE_H;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    try { ctx.drawImage(img, 0, 0, SAMPLE_W, SAMPLE_H); } catch (e) { return 1; }
    var data;
    try { data = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data; } catch (e) { return 1; }

    function rowBlackness(y) {
      var black = 0;
      for (var x = 0; x < SAMPLE_W; x++) {
        var i = (y * SAMPLE_W + x) * 4;
        var luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (luma < PIXEL_BLACK) black++;
      }
      return black / SAMPLE_W;
    }

    var top = 0;
    while (top < SAMPLE_H * MAX_SCAN && rowBlackness(top) >= ROW_BLACK) top++;
    var bottom = 0;
    while (bottom < SAMPLE_H * MAX_SCAN && rowBlackness(SAMPLE_H - 1 - bottom) >= ROW_BLACK) bottom++;

    var topFrac = top / SAMPLE_H;
    var bottomFrac = bottom / SAMPLE_H;
    if (topFrac < MIN_BAR || bottomFrac < MIN_BAR) return 1;
    var ratio = topFrac / bottomFrac;
    if (ratio < 1 / SYMMETRY || ratio > SYMMETRY) return 1;
    var scale = 1 / (1 - topFrac - bottomFrac);
    if (scale <= 1.02) return 1;
    return Math.min(scale, MAX_SCALE);
  }

  function applyScale(container, scale) {
    if (scale > 1.02) {
      container.style.transform = 'translate(-50%, -50%) scale(' + scale.toFixed(4) + ')';
      container.dataset.autocropped = 'true';
    }
  }

  function process(container) {
    if (container.dataset.autocropDone) return;
    var iframe = container.querySelector('iframe');
    if (!iframe || !iframe.src) return;
    var m = iframe.src.match(/\/embed\/([A-Za-z0-9_-]{11})/);
    if (!m) return;
    container.dataset.autocropDone = '1';
    var videoId = m[1];
    if (Object.prototype.hasOwnProperty.call(cache, videoId)) {
      applyScale(container, cache[videoId]);
      return;
    }
    loadThumb(videoId).then(function (img) {
      var scale = img ? analyze(img) : 1;
      cache[videoId] = scale;
      saveCache();
      applyScale(container, scale);
    });
  }

  function scan(root) {
    var containers = root.querySelectorAll('.video-container');
    for (var i = 0; i < containers.length; i++) process(containers[i]);
  }

  /* Subtitle disabling - patch YT.Player constructor to always set cc_load_policy:0 */
  function patchYTPlayer() {
    if (!window.YT || !window.YT.Player || window.YT.Player._ccPatched) return false;
    var Original = window.YT.Player;
    window.YT.Player = function (el, config) {
      if (config && config.playerVars) {
        config.playerVars.cc_load_policy = 0;
      } else if (config) {
        config.playerVars = { cc_load_policy: 0 };
      }
      return new Original(el, config);
    };
    window.YT.Player.prototype = Original.prototype;
    window.YT.Player._ccPatched = true;
    return true;
  }

  function disableCaptionsOnIframe(iframe) {
    if (!iframe || !iframe.src || iframe.dataset.ccFixed) return;
    if (!/youtube/.test(iframe.src)) return;
    iframe.dataset.ccFixed = '1';
    if (!iframe.src.includes('cc_load_policy')) {
      iframe.src = iframe.src + (iframe.src.includes('?') ? '&' : '?') + 'cc_load_policy=0';
    }
  }

  /* Sound-button-triggers-pause fix - stop touch events on volume toggle from bubbling */
  function fixVolumeToggle(btn) {
    if (btn.dataset.touchFixed) return;
    btn.dataset.touchFixed = '1';
    ['touchstart', 'touchend', 'touchcancel'].forEach(function (evtName) {
      btn.addEventListener(evtName, function (e) { e.stopPropagation(); }, { passive: false });
    });
  }

  function boot() {
    scan(document);
    if (!patchYTPlayer()) {
      var iv = setInterval(function () { if (patchYTPlayer()) clearInterval(iv); }, 150);
      setTimeout(function () { clearInterval(iv); }, 30000);
    }
    document.querySelectorAll('iframe[src*="youtube"]').forEach(disableCaptionsOnIframe);
    document.querySelectorAll('.volume-toggle').forEach(fixVolumeToggle);

    var target = document.getElementById('slides-container') || document.body;
    new MutationObserver(function (mutations) {
      scan(document);
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          if (node.tagName === 'IFRAME') disableCaptionsOnIframe(node);
          if (node.classList && node.classList.contains('volume-toggle')) fixVolumeToggle(node);
          if (node.querySelectorAll) {
            node.querySelectorAll('iframe[src*="youtube"]').forEach(disableCaptionsOnIframe);
            node.querySelectorAll('.volume-toggle').forEach(fixVolumeToggle);
          }
        });
        if (mutation.type === 'attributes' && mutation.target.tagName === 'IFRAME') {
          disableCaptionsOnIframe(mutation.target);
        }
      });
    }).observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();