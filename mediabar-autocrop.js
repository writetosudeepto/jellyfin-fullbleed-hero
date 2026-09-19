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
  var CONTROL_PATCH_VERSION = '2026.08.28-mediabar-all-backdrops-v13';
  var CATALOG_PAGE_SIZE = 200;

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

  function isMobileView() {
    return window.matchMedia('(max-width: 900px)').matches ||
      !!document.querySelector('.layout-mobile');
  }

  function isJellyfinMediaPlayer() {
    var ua = navigator.userAgent || '';
    var isQt = /JellyfinMediaPlayer|QtWebEngine|QtWebKit/i.test(ua);
    var isDesktopWidth = window.matchMedia('(min-width: 901px)').matches;
    var isChromiumBrowser = !!window.chrome && /Chrome|Chromium|Edg/i.test(ua);
    return isQt || (isDesktopWidth && !isChromiumBrowser);
  }

  function syncHomeViewClass() {
    var isHome = !!document.querySelector('#indexPage:not(.hide)');
    var hasSlides = !!document.querySelector('#slides-container');
    var isMediaPlayer = isJellyfinMediaPlayer();
    if (document.body) document.body.classList.toggle('mb-home', isHome);
    if (document.documentElement) document.documentElement.classList.toggle('mb-home', isHome);
    if (document.body) document.body.classList.toggle('mb-has-slides', hasSlides);
    if (document.documentElement) document.documentElement.classList.toggle('mb-has-slides', hasSlides);
    if (document.body) document.body.classList.toggle('mb-jmp', isMediaPlayer);
    if (document.documentElement) document.documentElement.classList.toggle('mb-jmp', isMediaPlayer);
  }

  function forceCaptionsOff(player) {
    if (!isMobileView() || !player) return;
    try {
      if (typeof player.unloadModule === 'function') player.unloadModule('captions');
    } catch (e) { /* unsupported by this YouTube player build */ }
    try {
      if (typeof player.setOption === 'function') player.setOption('captions', 'track', {});
    } catch (e) { /* captions module is not ready yet */ }
  }

  function scheduleCaptionsOff(player) {
    forceCaptionsOff(player);
    setTimeout(function () { forceCaptionsOff(player); }, 750);
  }

  function disableKnownPlayerCaptions() {
    if (!isMobileView()) return;
    var state = window.slideshowPure && window.slideshowPure.STATE;
    var players = state && state.slideshow && state.slideshow.players;
    if (!players) return;
    Object.keys(players).forEach(function (itemId) {
      forceCaptionsOff(players[itemId]);
    });
  }

  function scheduleKnownPlayerCaptionsOff() {
    disableKnownPlayerCaptions();
    setTimeout(disableKnownPlayerCaptions, 750);
  }

  function slideshowState() {
    return window.slideshowPure && window.slideshowPure.STATE &&
      window.slideshowPure.STATE.slideshow;
  }

  function currentTrailerContext() {
    var state = slideshowState();
    if (!state) return { state: null, itemId: null, player: null };

    /* The visible slide is authoritative during Media Bar's asynchronous
       transitions. currentSlideIndex is updated separately and can briefly
       point at the previous player while the new slide is already on screen. */
    var activeSlide = document.querySelector('#slides-container .slide.active');
    var itemId = activeSlide && activeSlide.getAttribute('data-item-id');
    if (!itemId && state.itemIds) itemId = state.itemIds[state.currentSlideIndex];

    return {
      state: state,
      itemId: itemId || null,
      player: itemId && state.players ? state.players[itemId] : null
    };
  }

  function currentTrailerPlayer() {
    return currentTrailerContext().player;
  }

  function knownTrailerPlayers() {
    var result = [];
    function add(player) {
      if (player && result.indexOf(player) === -1) result.push(player);
    }

    var state = slideshowState();
    var players = state && state.players;
    if (players) Object.keys(players).forEach(function (itemId) {
      add(players[itemId]);
    });

    /* Some preloaded iframe players briefly exist before Media Bar stores
       them in STATE.slideshow.players. Include those too so they cannot escape
       the exclusivity check during fast repeated slide changes. */
    if (window.YT && typeof window.YT.get === 'function') {
      document.querySelectorAll('iframe[src*="youtube"]').forEach(function (iframe) {
        try { add(window.YT.get(iframe.id)); } catch (e) { /* player not ready */ }
      });
    }
    return result;
  }

  function clearInactiveTrailerPresentation(itemId) {
    if (!itemId) return;
    var slide = document.querySelector('.slide[data-item-id="' + itemId + '"]');
    if (!slide) return;
    var video = slide.querySelector('.video-container');
    var backdrop = slide.querySelector('.backdrop');
    var plot = slide.querySelector('.plot-container');
    if (video) video.classList.remove('active');
    if (backdrop) backdrop.classList.remove('with-video');
    if (plot) plot.classList.remove('with-video');
  }

  function stopInactiveTrailer(player, itemId) {
    if (!player) return;
    try {
      if (typeof player.mute === 'function') player.mute();
      var playerState = typeof player.getPlayerState === 'function' ?
        player.getPlayerState() : 1;
      if ((playerState === 1 || playerState === 3) &&
          typeof player.pauseVideo === 'function') player.pauseVideo();
    } catch (e) {
      console.warn('Media Bar controls: could not stop hidden trailer', e);
    }
    clearInactiveTrailerPresentation(itemId);
  }

  function enforceExclusiveTrailerPlayback(activePlayer) {
    var state = slideshowState();
    var players = state && state.players;
    knownTrailerPlayers().forEach(function (player) {
      if (player === activePlayer) return;
      var itemId = null;
      if (players) Object.keys(players).some(function (candidateId) {
        if (players[candidateId] !== player) return false;
        itemId = candidateId;
        return true;
      });
      stopInactiveTrailer(player, itemId);
    });
  }

  function enforceCurrentTrailerExclusivity() {
    var context = currentTrailerContext();
    enforceExclusiveTrailerPlayback(context.player);
  }

  function eventTargetsCurrentTrailer(player, itemId) {
    var context = currentTrailerContext();
    if (context.itemId && itemId) return context.itemId === itemId;
    if (context.player) return context.player === player;
    return true;
  }

  function syncCurrentTrailerState() {
    var context = currentTrailerContext();
    if (!context.state || !context.player) return;
    try {
      context.state.isVideoPlaying =
        typeof context.player.getPlayerState === 'function' &&
        context.player.getPlayerState() === 1;
    } catch (e) { /* retain Media Bar's last known state */ }
  }

  function renderMuteState(isMuted) {
    document.querySelectorAll('.volume-toggle').forEach(function (button) {
      var icon = button.querySelector && button.querySelector('i');
      if (icon) icon.textContent = isMuted ? 'volume_off' : 'volume_up';
      var label = isMuted ? 'Turn trailer sound on' : 'Mute trailer';
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
      button.setAttribute('aria-pressed', isMuted ? 'false' : 'true');
    });
  }

  function renderPauseState(isPaused) {
    document.querySelectorAll('.pause-button').forEach(function (button) {
      var icon = button.querySelector && button.querySelector('i');
      if (icon) icon.textContent = isPaused ? 'play_arrow' : 'pause';
      var label = isPaused ? 'Resume trailer' : 'Pause trailer';
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
      button.setAttribute('aria-pressed', isPaused ? 'true' : 'false');
    });
  }

  function applyTrailerAudio(player, isMuted) {
    if (!player) return false;
    try {
      if (isMuted) {
        if (typeof player.mute === 'function') player.mute();
      } else {
        /* Sound must never control playback. Restarting an UNSTARTED/PAUSED
           iframe here makes Android WebView rebuffer and can leave the player
           trapped at -1. Only change audio inside the user's pointer gesture. */
        if (typeof player.setVolume === 'function') player.setVolume(100);
        if (typeof player.unMute === 'function') player.unMute();
        if (typeof player.setVolume === 'function') player.setVolume(100);
        if (typeof player.unMute === 'function') player.unMute();
      }
      return true;
    } catch (e) {
      console.warn('Media Bar controls: could not apply trailer audio', e);
      return false;
    }
  }

  function reconcileTrailerAudio(player, state, expectedMuted) {
    [150, 600].forEach(function (delay) {
      setTimeout(function () {
        if (!state || state.isMuted !== expectedMuted ||
            currentTrailerPlayer() !== player) return;
        applyTrailerAudio(player, expectedMuted);
        renderMuteState(expectedMuted);
        if (delay === 600) {
          try {
            var actualMuted = typeof player.isMuted === 'function' ?
              player.isMuted() : expectedMuted;
            var actualVolume = typeof player.getVolume === 'function' ?
              player.getVolume() : 'unknown';
            var actualState = typeof player.getPlayerState === 'function' ?
              player.getPlayerState() : 'unknown';
            console.info('Media Bar controls: sound verified',
              actualMuted ? 'muted' : 'audible',
              'volume=' + actualVolume, 'state=' + actualState);
          } catch (e) {
            console.warn('Media Bar controls: sound verification unavailable', e);
          }
        }
      }, delay);
    });
  }

  /* A sound tap must be handled entirely inside the user gesture. In
     particular, do not rely on the plugin's delayed player callbacks: mobile
     browsers only allow unmuting from the gesture itself, and a delayed mute
     from startup would immediately undo the user's choice. */
  function toggleTrailerSound() {
    var context = currentTrailerContext();
    var state = context.state;
    if (!state) return false;

    var currentlyMuted = !!state.isMuted;
    try {
      if (context.player && typeof context.player.isMuted === 'function') {
        currentlyMuted = !!context.player.isMuted();
      }
    } catch (e) { /* fall back to Media Bar's stored state */ }

    state.isMuted = !currentlyMuted;
    applyTrailerAudio(context.player, state.isMuted);
    renderMuteState(state.isMuted);
    if (context.player) reconcileTrailerAudio(context.player, state, state.isMuted);
    console.info('Media Bar controls: sound', state.isMuted ? 'muted' : 'audible',
      context.player ? 'player-found' : 'player-missing');
    return true;
  }

  function toggleTrailerPause() {
    var context = currentTrailerContext();
    var state = context.state;
    if (!state) return false;

    /* Pause is a Media Bar mode, not a mirror of YouTube's transient state.
       YouTube may briefly report PAUSED while a slide is being cued; deriving
       the button action from that value makes the first tap resume instead of
       pause and leaves the icon apparently stuck. */
    state.isPaused = !state.isPaused;
    try {
      if (state.isPaused) {
        if (state.slideInterval && typeof state.slideInterval.stop === 'function') {
          state.slideInterval.stop();
        }
        if (context.player && typeof context.player.pauseVideo === 'function') {
          context.player.pauseVideo();
        }
      } else {
        if (context.player && typeof context.player.playVideo === 'function') {
          context.player.playVideo();
        }
        /* Reapply the requested audio state after playback resumes so the
           fork's unconditional onReady mute cannot win a race here. */
        applyTrailerAudio(context.player, !!state.isMuted);
        if (state.slideInterval && typeof state.slideInterval.start === 'function') {
          state.slideInterval.start();
        }
      }
    } catch (e) {
      console.warn('Media Bar controls: could not change trailer playback', e);
    }

    renderPauseState(state.isPaused);
    console.info('Media Bar controls: playback', state.isPaused ? 'paused' : 'playing',
      context.player ? 'player-found' : 'player-missing');
    return true;
  }

  function extractYouTubeId(url) {
    if (!url || typeof url !== 'string') return null;
    try {
      var parsed = new URL(url, window.location.href);
      var host = parsed.hostname.toLowerCase().replace(/^www\./, '');
      var candidate = null;
      if (host === 'youtu.be') {
        candidate = parsed.pathname.split('/').filter(Boolean)[0];
      } else if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
        candidate = parsed.searchParams.get('v');
        if (!candidate) {
          var parts = parsed.pathname.split('/').filter(Boolean);
          if (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') {
            candidate = parts[1];
          }
        }
      }
      return candidate && /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
    } catch (e) {
      var match = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([A-Za-z0-9_-]{11})/);
      return match ? match[1] : null;
    }
  }

  function playerItemId(el) {
    var id = typeof el === 'string' ? el : el && el.id;
    var prefix = 'yt-player-';
    return id && id.indexOf(prefix) === 0 ? id.slice(prefix.length) : null;
  }

  function trailerCandidates(itemId, initialId) {
    var ids = [];
    function add(id) {
      if (id && ids.indexOf(id) === -1) ids.push(id);
    }
    add(initialId);
    var state = slideshowState();
    var item = state && state.loadedItems && state.loadedItems[itemId];
    var trailers = item && item.RemoteTrailers;
    if (Array.isArray(trailers)) {
      trailers.forEach(function (trailer) {
        add(extractYouTubeId(trailer && trailer.Url));
      });
    }
    return ids;
  }

  function recoverFromTrailerFailure(itemId, errorCode) {
    var state = slideshowState();
    var slide = document.querySelector('.slide[data-item-id="' + itemId + '"]');
    if (slide) {
      var video = slide.querySelector('.video-container');
      var backdrop = slide.querySelector('.backdrop');
      var plot = slide.querySelector('.plot-container');
      if (video) {
        video.classList.remove('active');
        video.dataset.playbackFailed = String(errorCode || 'unknown');
      }
      if (backdrop) backdrop.classList.remove('with-video');
      if (plot) plot.classList.remove('with-video');
    }
    if (state) {
      state.isVideoPlaying = false;
      if (state.slideInterval && typeof state.slideInterval.restart === 'function') {
        state.slideInterval.restart();
      }
    }
  }

  function ensureTitleFallbackStyles() {
    if (document.getElementById('mb-title-fallback-styles')) return;
    var style = document.createElement('style');
    style.id = 'mb-title-fallback-styles';
    style.textContent =
      '#slides-container .logo-container:has(.mb-title-fallback){' +
      'justify-content:center!important;align-items:center!important}' +
      '#slides-container .logo.mb-title-fallback{' +
      'position:relative!important;top:auto!important;left:auto!important;' +
      'display:flex!important;align-items:center;width:100%!important;' +
      'max-width:100%!important;max-height:none!important;height:auto!important;' +
      'transform:none!important;justify-content:center!important;' +
      'margin:0 auto!important;padding:0 .5rem!important;text-align:center!important;' +
      'color:#fff;font-size:clamp(2.15rem,5.3vw,5.2rem);font-weight:800;' +
      'line-height:.95;letter-spacing:-.045em;text-wrap:balance;' +
      'overflow-wrap:anywhere;filter:none!important;' +
      'text-shadow:0 3px 18px rgba(0,0,0,.72)}' +
      '@media (max-width:767px){' +
      '#slides-container .logo-container:has(.mb-title-fallback){' +
      'width:min(88vw,32rem)!important;left:50%!important;' +
      'transform:translate(-50%,-50%)!important}' +
      '#slides-container .logo.mb-title-fallback{' +
      'font-size:clamp(1.7rem,8vw,2.85rem);line-height:1.02;' +
      'letter-spacing:-.035em}}';
    (document.head || document.body).appendChild(style);
  }

  function addTextTitleFallback(result, item, title) {
    if (!item || (item.ImageTags && item.ImageTags.Logo) ||
        !result || !result.slide) return;
    var logoContainer = result.slide.querySelector('.logo-container');
    if (!logoContainer) return;
    var logo = logoContainer.querySelector('.logo');
    if (!logo) return;

    ensureTitleFallbackStyles();
    var textLogo = document.createElement('div');
    textLogo.className = 'logo mb-title-fallback';
    textLogo.textContent = item.Name || title || '';
    textLogo.setAttribute('role', 'img');
    textLogo.setAttribute('aria-label', item.Name || title || 'Title');
    logo.replaceWith(textLogo);
  }

  function patchMediaBarCatalog() {
    var pure = window.slideshowPure;
    var api = pure && pure.ApiUtils;
    var state = pure && pure.STATE;
    if (!api || !state || api._mbAllBackdropsPatched ||
        typeof api.getAuthHeaders !== 'function') return false;

    /* Media Bar normally requests 50 random entries and then discards every
       item without a separate Logo image. Posters/backdrops and trailers are
       independent Jellyfin assets, so that excluded legitimate films such as
       The Devil (1972). Fetch the complete, stable eligible set in pages and
       require only the backdrop that the carousel actually displays. */
    var originalFetchItemIdsFromServer = api.fetchItemIdsFromServer;
    api.fetchItemIdsFromServer = async function () {
      try {
        var jellyfin = state.jellyfinData || {};
        if (!jellyfin.accessToken || jellyfin.accessToken === 'Not Found' ||
            !jellyfin.serverAddress || jellyfin.serverAddress === 'Not Found') {
          console.warn('Media Bar catalog: Jellyfin connection is not ready');
          return [];
        }

        var ids = [];
        var startIndex = 0;
        var total = Infinity;
        while (startIndex < total) {
          var query =
            '/Items?IncludeItemTypes=Movie,Series&Recursive=true' +
            '&hasOverview=true&imageTypes=Backdrop&SortBy=SortName' +
            '&isPlayed=False&enableUserData=true' +
            '&StartIndex=' + startIndex + '&Limit=' + CATALOG_PAGE_SIZE +
            '&fields=Id,ImageTags,RemoteTrailers';
          var response = await fetch(jellyfin.serverAddress + query, {
            headers: this.getAuthHeaders()
          });
          if (!response.ok) {
            console.error('Media Bar catalog request failed:',
              response.status, response.statusText);
            return ids;
          }

          var data = await response.json();
          var items = Array.isArray(data.Items) ? data.Items : [];
          total = Number.isFinite(Number(data.TotalRecordCount))
            ? Number(data.TotalRecordCount) : startIndex + items.length;
          /* imageTypes=Backdrop already performs this filtering server-side.
             Jellyfin exposes backdrop hashes in BackdropImageTags, not under
             ImageTags, so checking ImageTags.Backdrop empties the result. */
          items.forEach(function (item) {
            if (item && item.Id) ids.push(item.Id);
          });
          if (!items.length) break;
          startIndex += items.length;
        }
        if (ids.length) {
          console.info('Media Bar catalog: loaded all backdrop items', ids.length);
          return ids;
        }
        console.warn('Media Bar catalog: no items returned; using original query');
        return originalFetchItemIdsFromServer.call(this);
      } catch (error) {
        console.error('Media Bar catalog request failed:', error);
        return originalFetchItemIdsFromServer.call(this);
      }
    };
    api._mbAllBackdropsPatched = true;
    return true;
  }

  function normalizeRemoteTrailers() {
    var pure = window.slideshowPure;
    var creator = pure && pure.SlideCreator;
    if (!creator || creator._mbTrailersPatched ||
        typeof creator.createSlideElement !== 'function') return false;

    var original = creator.createSlideElement;
    creator.createSlideElement = function (item, title) {
      if (item && Array.isArray(item.RemoteTrailers)) {
        var valid = item.RemoteTrailers.filter(function (trailer) {
          return extractYouTubeId(trailer && trailer.Url);
        });
        if (valid.length) {
          /* Media Bar only understands watch?v= and only reads entry zero. */
          var firstId = extractYouTubeId(valid[0].Url);
          valid[0] = Object.assign({}, valid[0], {
            Url: 'https://www.youtube.com/watch?v=' + firstId
          });
          item.RemoteTrailers = valid;
        }
      }
      var result = original.call(this, item, title);
      addTextTitleFallback(result, item, title);
      return result;
    };
    creator._mbTrailersPatched = true;
    return true;
  }

  /* cc_load_policy only controls the initial default and YouTube may restore
     a signed-in user's preference. On mobile, also unload the captions module
     whenever the player becomes ready, changes state, or loads its API. */
  function patchYTPlayer() {
    if (!window.YT || !window.YT.Player || window.YT.Player._ccPatched) return false;
    var Original = window.YT.Player;
    window.YT.Player = function (el, config) {
      if (config && isMobileView()) {
        config.playerVars = config.playerVars || {};
        config.playerVars.cc_load_policy = 0;
        /* Keep playback inline, but preserve Media Bar's autoplay=0 lifecycle.
           Forcing autoplay=1 + mute=1 here leaves some Android WebViews on a
           permanently silent audio path even after the player reports that it
           was unmuted. Media Bar already mutes in onReady before playVideo(). */
        config.playerVars.playsinline = 1;
        delete config.playerVars.mute;
        var events = config.events = config.events || {};
        ['onReady', 'onStateChange', 'onApiChange'].forEach(function (eventName) {
          var originalHandler = events[eventName];
          events[eventName] = function (event) {
            if (typeof originalHandler === 'function') originalHandler(event);
            /* YouTube can restore captions after honoring cc_load_policy=0,
               especially when the viewer enabled them in another YouTube
               session. Disable the live captions module after every API
               lifecycle callback and once more after its async setup. */
            if (event && event.target) scheduleCaptionsOff(event.target);
            if (event && event.target &&
                !eventTargetsCurrentTrailer(event.target, itemId)) {
              /* Preloaded players can finish their delayed startup after the
                 user has already moved several slides away. Never allow such
                 a hidden player to remain audible or playing. */
              stopInactiveTrailer(event.target, itemId);
              syncCurrentTrailerState();
              return;
            }
            if (event && event.target &&
                (eventName === 'onReady' ||
                 (eventName === 'onStateChange' && event.data === 1))) {
              enforceExclusiveTrailerPlayback(event.target);
              var state = slideshowState();
              if (state) {
                /* The IAmParadox27 fork always mutes in onReady. Reapply the
                   user's requested state after that callback and once when
                   playback actually begins. Do not issue commands for every
                   buffering/paused transition. */
                applyTrailerAudio(event.target, !!state.isMuted);
                renderMuteState(!!state.isMuted);
                renderPauseState(!!state.isPaused);
                if (state.isPaused && eventName === 'onStateChange' &&
                    event.data === 1 &&
                    typeof event.target.pauseVideo === 'function') {
                  event.target.pauseVideo();
                }
              }
            }
          };
        });
      }

      /* The upstream plugin neither retries alternate RemoteTrailers nor
         handles YouTube errors, so one removed/embed-blocked first link can
         freeze the slide forever. Cycle through the item's remaining trailer
         IDs, then restore the backdrop and slideshow timer if all fail. */
      if (config) {
        var itemId = playerItemId(el);
        var candidates = trailerCandidates(itemId, config.videoId);
        var candidateIndex = Math.max(0, candidates.indexOf(config.videoId));
        var playerEvents = config.events = config.events || {};
        var originalError = playerEvents.onError;
        playerEvents.onError = function (event) {
          if (typeof originalError === 'function') originalError(event);
          var nextId = candidates[++candidateIndex];
          if (nextId && event && event.target &&
              typeof event.target.loadVideoById === 'function') {
            console.warn('Media Bar: trailer failed; trying alternate source',
              itemId, event.data);
            event.target.loadVideoById({
              videoId: nextId,
              startSeconds: config.playerVars && config.playerVars.start || 0
            });
          } else {
            console.warn('Media Bar: no playable trailer source remains',
              itemId, event && event.data);
            recoverFromTrailerFailure(itemId, event && event.data);
          }
        };
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
    if (!isMobileView()) return;
    /* Never rewrite a live YouTube iframe URL. Assigning iframe.src reloads
       the browsing context behind YT.Player and breaks its postMessage bridge
       (the observed youtube.com -> Jellyfin origin mismatch). The constructor
       playerVars and API calls above handle captions without navigation. */
    iframe.dataset.ccFixed = '1';
  }

  function eventPoint(event) {
    var point = event.changedTouches && event.changedTouches[0] || event;
    return {
      x: Number(point.screenX != null ? point.screenX : point.clientX) || 0,
      y: Number(point.screenY != null ? point.screenY : point.clientY) || 0
    };
  }

  function activateMobileControl(btn, actionName) {
    if (actionName === 'sound') return toggleTrailerSound();
    if (actionName === 'pause') return toggleTrailerPause();
    if (actionName === 'play') {
      return startLocalPlayback(currentHeroItemId(btn));
    }
    return false;
  }

  /* Modern Android WebView sends Pointer Events; older builds may send only
     Touch Events, and accessibility services frequently activate controls by
     dispatching click. Own all three mobile paths in capture phase, perform a
     single action, and suppress the synthetic duplicate click. */
  function fixMobileControl(btn, actionName) {
    if (btn.dataset.mbMobileControl) return;
    btn.dataset.mbMobileControl = actionName;
    if (btn.tagName !== 'BUTTON') btn.setAttribute('role', 'button');
    if (!btn.hasAttribute('tabindex')) btn.setAttribute('tabindex', '0');

    var startPoint = { x: 0, y: 0 };
    var suppressClickUntil = 0;

    function onStart(event) {
      if (!isMobileView()) return;
      startPoint = eventPoint(event);
      event.stopPropagation();
    }

    function onEnd(event) {
      if (!isMobileView()) return;
      var endPoint = eventPoint(event);
      if (Math.abs(endPoint.x - startPoint.x) > 18 ||
          Math.abs(endPoint.y - startPoint.y) > 18) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClickUntil = Date.now() + 900;
      activateMobileControl(btn, actionName);
    }

    if (window.PointerEvent) {
      btn.addEventListener('pointerdown', onStart, true);
      btn.addEventListener('pointerup', function (event) {
        if (event.pointerType === 'mouse') return;
        onEnd(event);
      }, true);
      btn.addEventListener('pointercancel', function (event) {
        if (isMobileView()) event.stopPropagation();
      }, true);
    } else {
      btn.addEventListener('touchstart', onStart, { capture: true, passive: true });
      btn.addEventListener('touchend', onEnd, { capture: true, passive: false });
      btn.addEventListener('touchcancel', function (event) {
        if (isMobileView()) event.stopPropagation();
      }, { capture: true, passive: true });
    }

    btn.addEventListener('click', function (event) {
      if (!isMobileView()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (Date.now() >= suppressClickUntil) {
        activateMobileControl(btn, actionName);
      }
    }, true);

    btn.addEventListener('keydown', function (event) {
      if (!isMobileView() || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      activateMobileControl(btn, actionName);
    }, true);
  }

  /* Media Bar's hero Play button sends a remote-control PlayNow command to a
     session rediscovered by deviceId. That path is unreliable in mobile
     browsers/WebViews and fails silently when the session cannot be resolved.
     Route mobile activation through Jellyfin's own item-details Play control
     instead, so playback is started locally by the current client. */
  var PENDING_LOCAL_PLAY_KEY = 'mbLocalPlay.v1';
  var pendingPlaybackPoll = null;

  function currentHeroItemId(btn) {
    /* Each hero slide owns its Play button and carries the authoritative item
       id in its own data-item-id attribute — that is exactly how Media Bar maps
       a slide to an item. Read it directly. Do NOT infer the item from the
       slide's DOM position: itemIds is shuffled at load and slides are appended
       lazily in visit order, so a slide's DOM index has no relationship to its
       index in itemIds — indexing itemIds by DOM position plays a random other
       movie (the wrong "before/after" item reported on mobile). */
    var slide = btn.closest && btn.closest('.slide');
    if (slide) {
      var slideItemId = slide.getAttribute && slide.getAttribute('data-item-id');
      if (slideItemId) return slideItemId;
    }

    /* Fallback (button not inside a slide): the active slide is itemIds indexed
       by the plugin's own currentSlideIndex. */
    var state = window.slideshowPure && window.slideshowPure.STATE;
    var slideshow = state && state.slideshow;
    if (!slideshow || !slideshow.itemIds) return null;
    return slideshow.itemIds[slideshow.currentSlideIndex] || null;
  }

  function queueLocalPlayback(itemId) {
    if (!itemId) return false;

    try {
      sessionStorage.setItem(PENDING_LOCAL_PLAY_KEY, JSON.stringify({
        itemId: itemId,
        queuedAt: Date.now()
      }));
    } catch (e) {
      return false;
    }

    var state = window.slideshowPure && window.slideshowPure.STATE;
    var jellyfinData = state && state.jellyfinData;
    var route = '/details?id=' + encodeURIComponent(itemId);
    if (jellyfinData && jellyfinData.serverId) {
      route += '&serverId=' + encodeURIComponent(jellyfinData.serverId);
    }

    if (window.Emby && window.Emby.Page &&
        typeof window.Emby.Page.show === 'function') {
      window.Emby.Page.show(route);
    } else {
      window.location.hash = '#' + route;
    }
    startPendingLocalPlaybackPoll();
    console.info('Media Bar controls: local Play queued', itemId);
    return true;
  }

  function startLocalPlayback(itemId) {
    return queueLocalPlayback(itemId);
  }

  function stopPendingLocalPlaybackPoll() {
    if (pendingPlaybackPoll !== null) {
      clearInterval(pendingPlaybackPoll);
      pendingPlaybackPoll = null;
    }
  }

  function startPendingLocalPlaybackPoll() {
    stopPendingLocalPlaybackPoll();
    runPendingLocalPlayback();
    try {
      if (!sessionStorage.getItem(PENDING_LOCAL_PLAY_KEY)) return;
    } catch (e) {
      return;
    }
    pendingPlaybackPoll = setInterval(runPendingLocalPlayback, 100);
  }

  function runPendingLocalPlayback() {
    var pending;
    try {
      pending = JSON.parse(sessionStorage.getItem(PENDING_LOCAL_PLAY_KEY) || 'null');
    } catch (e) {
      sessionStorage.removeItem(PENDING_LOCAL_PLAY_KEY);
      stopPendingLocalPlaybackPoll();
      return false;
    }
    if (!pending || !pending.itemId) {
      stopPendingLocalPlaybackPoll();
      return false;
    }

    if (!pending.queuedAt || Date.now() - pending.queuedAt > 15000) {
      sessionStorage.removeItem(PENDING_LOCAL_PLAY_KEY);
      stopPendingLocalPlaybackPoll();
      console.warn('Media Bar controls: local Play timed out', pending.itemId);
      return false;
    }

    var hash = window.location.hash || '';
    if (hash.indexOf('/details') === -1 ||
        hash.indexOf(encodeURIComponent(pending.itemId)) === -1) return false;

    var candidates = document.querySelectorAll('.btnPlay');
    for (var i = 0; i < candidates.length; i++) {
      var nativePlayButton = candidates[i];
      if (nativePlayButton.closest &&
          nativePlayButton.closest('#slides-container')) continue;
      if (nativePlayButton.disabled ||
          nativePlayButton.getClientRects().length === 0) continue;

      sessionStorage.removeItem(PENDING_LOCAL_PLAY_KEY);
      stopPendingLocalPlaybackPoll();
      (function (button) {
        requestAnimationFrame(function () { button.click(); });
      })(nativePlayButton);
      console.info('Media Bar controls: native Jellyfin Play activated', pending.itemId);
      return true;
    }
    return false;
  }

  function fixMediaControls(root) {
    if (root.matches && root.matches('.play-button')) {
      fixMobileControl(root, 'play');
    }
    if (root.matches && root.matches('.volume-toggle')) {
      fixMobileControl(root, 'sound');
    }
    if (root.matches && root.matches('.pause-button')) {
      fixMobileControl(root, 'pause');
    }
    root.querySelectorAll('.volume-toggle').forEach(function (btn) {
      fixMobileControl(btn, 'sound');
    });
    root.querySelectorAll('.pause-button').forEach(function (btn) {
      fixMobileControl(btn, 'pause');
    });
    root.querySelectorAll('.play-button').forEach(function (btn) {
      fixMobileControl(btn, 'play');
    });
  }

  function boot() {
    console.info('Media Bar controls: patch ready', CONTROL_PATCH_VERSION,
      isMobileView() ? 'mobile' : 'desktop');
    syncHomeViewClass();
    scan(document);
    if (!patchMediaBarCatalog()) {
      var catalogPatchPoll = setInterval(function () {
        if (patchMediaBarCatalog()) clearInterval(catalogPatchPoll);
      }, 150);
      setTimeout(function () { clearInterval(catalogPatchPoll); }, 30000);
    }
    if (!normalizeRemoteTrailers()) {
      var trailerPatchPoll = setInterval(function () {
        if (normalizeRemoteTrailers()) clearInterval(trailerPatchPoll);
      }, 150);
      setTimeout(function () { clearInterval(trailerPatchPoll); }, 30000);
    }
    if (!patchYTPlayer()) {
      var iv = setInterval(function () { if (patchYTPlayer()) clearInterval(iv); }, 150);
      setTimeout(function () { clearInterval(iv); }, 30000);
    }
    fixMediaControls(document);
    scheduleKnownPlayerCaptionsOff();
    startPendingLocalPlaybackPoll();
    window.addEventListener('hashchange', function () {
      syncHomeViewClass();
      startPendingLocalPlaybackPoll();
    });
    window.addEventListener('pageshow', function () {
      syncHomeViewClass();
      startPendingLocalPlaybackPoll();
    });

    /* Observe body, not #slides-container: Play navigates away from the home
       page and the old slides node is detached before Jellyfin creates its real
       details-page Play button. */
    var target = document.body;
    new MutationObserver(function (mutations) {
      syncHomeViewClass();
      scan(document);
      runPendingLocalPlayback();
      var activeSlideChanged = false;
      mutations.forEach(function (mutation) {
        if (mutation.type === 'attributes' &&
            mutation.target.matches && mutation.target.matches('.slide')) {
          activeSlideChanged = true;
        }
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          if (node.querySelectorAll) {
            fixMediaControls(node);
            if ((node.matches && node.matches('iframe[src*="youtube"]')) ||
                node.querySelector('iframe[src*="youtube"]')) {
              scheduleKnownPlayerCaptionsOff();
            }
          }
        });
      });
      if (activeSlideChanged) {
        enforceCurrentTrailerExclusivity();
        setTimeout(enforceCurrentTrailerExclusivity, 500);
      }
    }).observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
