/* PHANTASMAGORIA: the player deliberately uses the media element directly.
   GitHub release assets are cross-origin; a MediaElementAudioSourceNode without
   CORS approval would output silence even while the audio appears to play. */
const tracks = [
  { n: 1, title: 'мало-помалу', key: '01-malo-pomalu', seconds: 159, video: 'HIl0jzLga58', cover: 'assets/cover.jpg', desc: 'Вход в парк: праздничный фасад и первые признаки того, что за весельем скрывается нечто совсем другое.' },
  { n: 2, title: 'медленный танец', key: '02-medlennyy-tanec', seconds: 187, video: 'oVvpzx8OKM4', cover: 'assets/cover.jpg', desc: 'Игрушечность, память и тревога переплетаются: парк уже начинает показывать свою другую сторону.' },
  { n: 3, title: 'phantasmagoria', key: '03-phantasmagoria', seconds: 132, video: 'JFHYBcEt4mg', cover: 'assets/character-nyuta.jpg', desc: 'Центральная тема: детство, взросление и попытка разделить с кем-то собственные травмы.' },
  { n: 4, title: 'карусель', key: '04-karusel', seconds: 146, video: '-ZcITdWVap0', cover: 'assets/scene-karusel.jpg', desc: 'Карусель превращается в образ круга, который продолжает вращаться даже тогда, когда парк уже не безопасен.' },
  { n: 5, title: 'комната смеха', key: '05-komnata-smeha', seconds: 176, video: 'AgWgoLZj6So', cover: 'assets/character-reflections.jpg', desc: 'Кривые зеркала становятся метафорой искажения правды, памяти и собственного отражения.' },
  { n: 6, title: 'автодром', key: '06-avtodrom', seconds: 178, video: '67HBrJSbjSM', cover: 'assets/scene-autodrom.jpg', desc: 'Жизнь как вечный автодром: столкновения, вина, страх и движение по кругу.' },
  { n: 7, title: 'свободное падение', key: '07-svobodnoe-padenie', seconds: 201, video: '6PIzbzYEGwM', cover: 'assets/character-alfred.jpg', desc: 'Высота и потеря контроля: аттракцион становится продолжением вины, страха и последствий.' },
  { n: 8, title: 'эпилог', key: '08-epilog', seconds: 224, video: 'rp24NvnRfNc', cover: 'assets/character-nyuta.jpg', desc: 'Финал истории: признание, последствия и попытка завершить то, что парк начал.' }
];
const RELEASE = 'https://github.com/Cnizroman/PHANTASMAGORIA/releases/download/audio-v1/';
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const audio = $('#audio');
const seek = $('#seek');
const volume = $('#volume');
const lyricsBox = $('#lyrics');
const lyricsShell = $('#lyricsShell');
const list = $('#trackList');
const { clamp, cueIndex, seekTime, formatTime } = window.LyricSync;
const store = {
  get(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch (_) { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, String(value)); } catch (_) { /* private mode */ } }
};
const HEARD_KEY = 'ph:heard:v1';
let heard = {};
try { heard = JSON.parse(store.get(HEARD_KEY, '{}')) || {}; } catch (_) { heard = {}; }
if (!heard || typeof heard !== 'object') heard = {};
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const reducedMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const scrollBehavior = () => reducedMotion() ? 'auto' : 'smooth';

let current = 0;
let provider = 'audio';
let repeat = false;
let shuffle = false;
let trackHistory = [];
let lyrics = [];
let lineEls = [];
let activeIndex = -1;
let delay = 0;
let follow = true;
let draggingSeek = false;
let desiredPlaying = false;
let hasStarted = false;
let controlsVisible = true;
let raf = 0;
let playRevision = 0;
let audioPendingSeek = null;
let youtubePlayer = null;
let youtubeReady = false;
let youtubeLoading = false;
let youtubeScript = null;
let youtubeTimeout = 0;
let youtubeAttempt = 0;
let youtubeVideoId = null;
let youtubePendingSeek = null;
let youtubeSeekTimer = 0;
let lastMediaSecond = -1;

function videoURL(track = tracks[current]) {
  return `https://www.youtube.com/watch?v=${track.video}`;
}

function renderTracks() {
  list.innerHTML = tracks.map((track, index) => `
    <button class="track" type="button" data-i="${index}">
      <span class="track-no">${String(track.n).padStart(2, '0')}</span>
      <span class="track-copy"><span class="track-name">${escapeHTML(track.title)}</span><span class="track-progress" aria-hidden="true"><i></i></span><span class="track-desc">${escapeHTML(track.desc)}</span></span>
      <span class="track-time">${formatTime(track.seconds)}</span><span class="track-go"><span class="go-label">СЛУШАТЬ </span><span aria-hidden="true">↗</span></span>
    </button>`).join('');
  $$('.track').forEach(button => button.addEventListener('click', () => {
    loadTrack(Number(button.dataset.i), true);
    $('#listen').scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  }));
  paintHeard();
}

// How far the visitor has travelled through each stop is remembered locally,
// so the tracklist can double as a map of the album.
function paintHeard() {
  let done = 0;
  $$('.track').forEach((element, index) => {
    const value = Math.max(0, Math.min(1, Number(heard[tracks[index].key]) || 0));
    if (value >= 0.9) done++;
    const bar = element.querySelector('.track-progress i');
    if (bar) bar.style.width = `${Math.round(value * 100)}%`;
    element.classList.toggle('heard', value >= 0.9);
    element.classList.toggle('heard-part', value > 0 && value < 0.9);
  });
  const counter = $('#heardCount');
  if (counter) counter.textContent = `${String(done).padStart(2, '0')} / 08`;
}

function recordHeard() {
  const duration = getDuration();
  const position = getPosition();
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(position)) return;
  const fraction = clamp(position / duration, 0, 1);
  const key = tracks[current].key;
  const previous = Number(heard[key]) || 0;
  const next = Math.round(fraction * 100) / 100;
  if (next <= previous) return;
  heard[key] = next;
  store.set(HEARD_KEY, JSON.stringify(heard));
  paintHeard();
}

// The hero doubles as the map of the album: eight stops in release order.
function renderHeroRoute() {
  const route = $('#heroRoute');
  if (!route) return;
  route.innerHTML = '<span class="route-label">МАРШРУТ</span>' + tracks.map((track, index) => `
    <button class="route-stop" type="button" data-i="${index}" title="Слушать: ${escapeHTML(track.title)}">
      <i>${String(track.n).padStart(2, '0')}</i><span>${escapeHTML(track.title)}</span>
    </button>`).join('');
  route.querySelectorAll('.route-stop').forEach(button => button.addEventListener('click', () => {
    loadTrack(Number(button.dataset.i), true);
    $('#listen').scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  }));
}

function renderPlot() {
  if (!window.STORY) return;
  $('#plot').innerHTML = '<div class="plot-title">СЮЖЕТ ПО ТРЕКАМ</div>' + tracks.map((track, index) => {
    const story = window.STORY[track.key];
    if (!story) return '';
    return `<button class="plot-step" data-i="${index}" type="button"><span>${String(track.n).padStart(2, '0')}</span><b>${escapeHTML(track.title)}</b><i>${escapeHTML(story.act)}</i><p>${escapeHTML(story.key)}</p></button>`;
  }).join('');
  $$('.plot-step').forEach(button => button.addEventListener('click', () => {
    loadTrack(Number(button.dataset.i), true);
    $('#listen').scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
  }));
}

function renderChars() {
  if (!window.CHARS) return;
  $('#charGrid').innerHTML = window.CHARS.map(character => `
    <article class="char">
      <a class="char-image" href="${escapeHTML(character.video)}" target="_blank" rel="noopener noreferrer" aria-label="Открыть видео: ${escapeHTML(character.name)}">
        <img src="${escapeHTML(character.image)}" alt="${escapeHTML(character.alt)}" width="1280" height="720" loading="lazy">
        <span class="char-watch" aria-hidden="true">▸ Смотреть кадр</span>
        <span class="char-image-number" aria-hidden="true">✦</span>
      </a>
      <div class="char-content"><span>${escapeHTML(character.role)}</span><h3>${escapeHTML(character.name)}</h3><p>${escapeHTML(character.text)}</p>
        <a class="char-source" href="${escapeHTML(character.video)}" target="_blank" rel="noopener noreferrer">${escapeHTML(character.caption)} ↗</a>
      </div>
    </article>`).join('');
}

function renderStory(track) {
  const story = window.STORY && window.STORY[track.key];
  const box = $('#storyBox');
  if (!story) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="story-head"><span>${escapeHTML(story.act)}</span><b>${escapeHTML(story.tag)}</b></div>${story.text.map(text => `<p>${escapeHTML(text)}</p>`).join('')}<div class="story-key">${escapeHTML(story.key)}</div>`;
}

function renderLyrics(track) {
  const lyricsTitle = $('#lyricsTrack');
  if (lyricsTitle) lyricsTitle.textContent = track.title;
  lyrics = (window.LYRICS_DATA && window.LYRICS_DATA[track.key]) || [];
  activeIndex = -1;
  setFollow(true);
  if (!lyrics.some(cue => cue.text)) {
    lyricsBox.innerHTML = '<p class="lyrics-empty">Текст для этого трека не найден.</p>';
    lineEls = [];
    return;
  }
  lyricsBox.innerHTML = lyrics.map((cue, index) => cue.text
    ? `<button class="lyric-line" type="button" data-index="${index}" title="Перейти к ${formatTime(cue.time)}"><span class="lyric-time" aria-hidden="true">${formatTime(cue.time)}</span><span>${escapeHTML(cue.text)}</span></button>`
    : `<span class="lyric-break" data-index="${index}" aria-label="Инструментальный фрагмент">✦</span>`).join('');
  lineEls = [...lyricsBox.querySelectorAll('[data-index]')];
  lyricsBox.querySelectorAll('button.lyric-line').forEach(button => button.addEventListener('click', () => {
    const cue = lyrics[Number(button.dataset.index)];
    setFollow(true);
    setPosition(seekTime(cue.time, delay, getDuration()));
    if (!desiredPlaying) play();
  }));
  lyricsBox.scrollTop = 0;
  updateLyrics(true);
}

function setFollow(enabled) {
  follow = enabled;
  $('#followLyrics').hidden = enabled;
}

function updateLyrics(force = false) {
  if (!lyrics.length) return;
  const index = cueIndex(lyrics, getPosition(), delay);
  if (!force && index === activeIndex) return;
  activeIndex = index;
  lineEls.forEach((element, i) => {
    element.classList.toggle('active', i === index);
    element.classList.toggle('past', i < index);
    element.classList.toggle('future', i > index);
    if (element.tagName === 'BUTTON') {
      if (i === index) element.setAttribute('aria-current', 'true');
      else element.removeAttribute('aria-current');
    }
  });
  const active = lineEls[index];
  if (active && follow && !draggingSeek) {
    // Use relative bounding boxes: offsetTop may be relative to a sticky ancestor.
    const delta = active.getBoundingClientRect().top - lyricsBox.getBoundingClientRect().top - (lyricsBox.clientHeight - active.clientHeight) / 2;
    lyricsBox.scrollTo({ top: lyricsBox.scrollTop + delta, behavior: scrollBehavior() });
  }
}

function showOffset() {
  const sign = delay > 0 ? '+' : '';
  const value = `${sign}${delay.toFixed(1)} с`;
  $('#offReset').textContent = value;
  $('#offReset').setAttribute('aria-label', `${value}: сбросить сдвиг текста`);
}

function setOffset(value) {
  delay = Math.round(clamp(value, -10, 10) * 10) / 10;
  store.set(`ph:sync:v3:${tracks[current].key}`, delay);
  showOffset();
  updateLyrics(true);
}

function setStatus(kind, message) {
  $('#playerStatus').dataset.state = kind;
  $('#statusText').textContent = message;
}

function clearError() {
  $('#playerError').hidden = true;
}

function showError(message) {
  desiredPlaying = false;
  updatePlayButtons();
  setStatus('error', 'Не удалось воспроизвести');
  $('#errorText').textContent = message;
  $('#errorVideo').hidden = provider === 'youtube';
  $('#playerError').hidden = false;
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 4400);
}

function updatePlayButtons() {
  const icon = desiredPlaying ? '#icon-pause' : '#icon-play';
  const label = desiredPlaying ? 'Пауза' : 'Воспроизвести';
  for (const button of [$('#play'), $('#miniPlay')]) {
    button.querySelector('use').setAttribute('href', icon);
    button.setAttribute('aria-label', label);
    button.title = label;
  }
  $('#viz').classList.toggle('is-playing', desiredPlaying);
  for (const card of $$('.player-card, .lyrics-card')) card.classList.toggle('is-playing', desiredPlaying);
  if ('mediaSession' in navigator) {
    try { navigator.mediaSession.playbackState = desiredPlaying ? 'playing' : 'paused'; } catch (_) { /* unsupported */ }
  }
}

function updateMiniVisibility() {
  const visible = hasStarted && !controlsVisible;
  $('#miniPlayer').hidden = !visible;
  document.body.classList.toggle('has-mini-player', visible);
}

function markStarted() {
  hasStarted = true;
  updateMiniVisibility();
}

function getPosition() {
  if (provider === 'audio') {
    if (audioPendingSeek !== null) return audioPendingSeek;
    return Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
  }
  if (youtubePendingSeek !== null) return youtubePendingSeek;
  if (youtubeReady && youtubePlayer && youtubeVideoId === tracks[current].video) {
    try {
      const time = youtubePlayer.getCurrentTime();
      if (Number.isFinite(time)) return time;
    } catch (_) { /* player is still loading */ }
  }
  return 0;
}

function getDuration() {
  if (provider === 'audio' && Number.isFinite(audio.duration) && audio.duration > 0) return audio.duration;
  if (provider === 'youtube' && youtubeReady && youtubePlayer && youtubeVideoId === tracks[current].video) {
    try {
      const duration = youtubePlayer.getDuration();
      if (Number.isFinite(duration) && duration > 0) return duration;
    } catch (_) { /* player is still loading */ }
  }
  return tracks[current].seconds;
}

function clearYoutubePendingSoon() {
  clearTimeout(youtubeSeekTimer);
  youtubeSeekTimer = setTimeout(() => {
    youtubePendingSeek = null;
    if (provider === 'youtube') updateTime(true);
  }, 1200);
}

function setPosition(seconds) {
  const position = clamp(Number.isFinite(seconds) ? seconds : 0, 0, getDuration());
  if (provider === 'audio') {
    audioPendingSeek = position;
    if (audio.readyState >= 1) {
      try { audio.currentTime = position; audioPendingSeek = null; } catch (_) { /* apply after metadata */ }
    }
  } else {
    youtubePendingSeek = position;
    if (youtubeReady && youtubePlayer && youtubeVideoId === tracks[current].video) {
      try { youtubePlayer.seekTo(position, true); clearYoutubePendingSoon(); } catch (_) { /* apply on ready */ }
    }
  }
  updateTime(true);
}

function updateTime(forceLyrics = false) {
  const duration = getDuration();
  const position = clamp(getPosition(), 0, duration);
  if (!draggingSeek) seek.value = duration ? Math.round(position / duration * 1000) : 0;
  seek.style.setProperty('--p', `${duration ? (position / duration) * 100 : 0}%`);
  seek.setAttribute('aria-valuetext', `${formatTime(position)} из ${formatTime(duration)}`);
  $('#currentTime').textContent = formatTime(position);
  $('#duration').textContent = formatTime(duration);
  $('#miniTime').textContent = formatTime(position);
  $('#miniProgress').style.width = `${duration ? position / duration * 100 : 0}%`;
  if (lyricsShell) lyricsShell.style.setProperty('--lyrics-progress', `${duration ? Math.min(100, position / duration * 100) : 0}%`);
  recordHeard();
  updateLyrics(forceLyrics);
  const second = Math.floor(position);
  if (second !== lastMediaSecond && 'mediaSession' in navigator && navigator.mediaSession.setPositionState) {
    lastMediaSecond = second;
    try { navigator.mediaSession.setPositionState({ duration, playbackRate: 1, position }); } catch (_) { /* browser may not support the current state */ }
  }
}

function tick() {
  updateTime();
  if (desiredPlaying) raf = requestAnimationFrame(tick);
  else raf = 0;
}

function startTick() {
  if (!raf) raf = requestAnimationFrame(tick);
}

function setMediaMetadata(track) {
  if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title, artist: 'MZLFF', album: 'PHANTASMAGORIA',
      artwork: [{ src: new URL('assets/cover.jpg', location.href).href, sizes: '881x881', type: 'image/jpeg' }]
    });
  } catch (_) { /* optional platform integration */ }
}

function updateTrackUI(track) {
  $('#nowTitle').textContent = track.title;
  $('#nowDesc').textContent = track.desc;
  $('#nowCover').src = track.cover;
  $('#nowCover').alt = `Иллюстрация к треку «${track.title}»`;
  const playerCard = document.querySelector('.player-card');
  if (playerCard) playerCard.style.setProperty('--cover-art', `url('${track.cover}')`);
  $('#miniCover').src = track.cover;
  $('#miniTitle').textContent = track.title;
  $('#trackCounter').textContent = `${String(track.n).padStart(2, '0')} / 08`;
  const following = tracks[(current + 1) % tracks.length];
  const nextLabel = $('#nextTitle');
  if (nextLabel) nextLabel.textContent = following.title;
  $('#videoLink').href = videoURL(track);
  $('#errorLink').href = videoURL(track);
  document.title = `${track.title} · MZLFF / PHANTASMAGORIA`;
  $$('.track').forEach((element, index) => {
    element.classList.toggle('selected', index === current);
    if (index === current) element.setAttribute('aria-current', 'true');
    else element.removeAttribute('aria-current');
  });
  $$('.route-stop').forEach((element, index) => {
    element.setAttribute('aria-current', String(index === current));
    element.classList.toggle('is-current', index === current);
  });
  setMediaMetadata(track);
}

function loadTrack(index, autoplay = false, initialPosition = 0) {
  const nextIndex = ((index % tracks.length) + tracks.length) % tracks.length;
  playRevision++;
  desiredPlaying = false;
  audio.pause();
  if (youtubeReady && youtubePlayer) {
    try { youtubePlayer.pauseVideo(); } catch (_) { /* iframe may still be loading */ }
  }
  current = nextIndex;
  const track = tracks[current];
  // Do not call load() here: preload="none" must not download every track on page load.
  audio.src = `${RELEASE}${track.key}.mp3`;
  audioPendingSeek = initialPosition > 0 ? clamp(initialPosition, 0, track.seconds) : null;
  youtubePendingSeek = initialPosition > 0 ? clamp(initialPosition, 0, track.seconds) : 0;
  youtubeVideoId = null;
  clearTimeout(youtubeSeekTimer);
  delay = Number(store.get(`ph:sync:v3:${track.key}`, 0));
  if (!Number.isFinite(delay)) delay = 0;
  delay = clamp(delay, -10, 10);
  showOffset();
  clearError();
  updateTrackUI(track);
  renderStory(track);
  renderLyrics(track);
  store.set('ph:track', current);
  updatePlayButtons();
  setStatus('ready', 'Готово к прослушиванию');
  updateTime(true);
  if (provider === 'youtube' && youtubeReady) cueYoutube(autoplay);
  else if (autoplay) play();
}

function playAudio() {
  const revision = ++playRevision;
  desiredPlaying = true;
  markStarted();
  clearError();
  updatePlayButtons();
  setStatus('loading', 'Загружаем аудио…');
  if (audio.error) audio.load();
  const result = audio.play();
  if (result && typeof result.catch === 'function') result.catch(error => {
    if (revision !== playRevision || provider !== 'audio' || error.name === 'AbortError') return;
    if (error.name === 'NotAllowedError') showError('Браузер заблокировал запуск. Нажми «Попробовать снова», чтобы включить звук.');
    else showError('Аудиофайл не загрузился. Проверь соединение или переключись на официальное видео.');
  });
  startTick();
}

function youtubeFailure(message, attempt = youtubeAttempt) {
  if (attempt !== youtubeAttempt) return;
  youtubeLoading = false;
  clearTimeout(youtubeTimeout);
  if (provider === 'youtube') showError(message);
}

function createYoutubePlayer(attempt) {
  if (attempt !== youtubeAttempt || !youtubeLoading || youtubeReady || youtubePlayer || !window.YT || !window.YT.Player) return;
  const playerVars = { playsinline: 1, rel: 0, controls: 1 };
  if (/^https?:$/.test(location.protocol)) playerVars.origin = location.origin;
  try {
    youtubePlayer = new window.YT.Player('youtubeMount', {
      width: '100%', height: '100%', videoId: tracks[current].video, playerVars,
      events: {
        onReady(event) {
          // A late iframe from a timed-out attempt must not start playing.
          if (attempt !== youtubeAttempt || !youtubeLoading) {
            try { event.target.pauseVideo(); } catch (_) { /* optional */ }
            return;
          }
          clearTimeout(youtubeTimeout);
          youtubePlayer = event.target;
          youtubeReady = true;
          youtubeLoading = false;
          try { youtubePlayer.setVolume(Number(volume.value)); } catch (_) { /* optional */ }
          if (provider === 'youtube') cueYoutube(desiredPlaying);
          else {
            try { youtubePlayer.pauseVideo(); } catch (_) { /* optional */ }
          }
        },
        onStateChange(event) {
          if (attempt !== youtubeAttempt || provider !== 'youtube') return;
          // Ignore events from a video that was replaced during a rapid track change.
          try {
            const data = event.target.getVideoData();
            if (data && data.video_id && data.video_id !== tracks[current].video) return;
            // Events can arrive after a newer play/pause command has already won.
            if (typeof event.target.getPlayerState === 'function' && event.target.getPlayerState() !== event.data) return;
          } catch (_) { /* some implementations do not expose video data */ }
          if (event.data === 1) {
            youtubePendingSeek = null;
            desiredPlaying = true;
            markStarted();
            clearError();
            updatePlayButtons();
            setStatus('playing', 'Воспроизводится · YouTube');
            startTick();
          } else if (event.data === 2) {
            youtubePendingSeek = null;
            desiredPlaying = false;
            updatePlayButtons();
            setStatus('paused', 'На паузе');
            updateTime(true);
          } else if (event.data === 3) {
            setStatus('loading', 'Загружаем видео…');
          } else if (event.data === 5 && !desiredPlaying) {
            setStatus('ready', 'Видео готово к прослушиванию');
            updateTime(true);
          } else if (event.data === 0) {
            desiredPlaying = false;
            youtubePendingSeek = null;
            updatePlayButtons();
            onEnded();
          }
        },
        onError(event) {
          if (attempt !== youtubeAttempt) return;
          const restricted = event.data === 101 || event.data === 150 || event.data === 153;
          youtubeFailure(restricted
            ? 'YouTube не разрешил встроенное воспроизведение. Открой официальное видео отдельно или вернись к аудио.'
            : 'Не удалось загрузить видео YouTube. Проверь соединение или открой видео отдельно.', attempt);
        }
      }
    });
  } catch (_) {
    youtubePlayer = null;
    youtubeFailure('Не удалось запустить YouTube. Открой официальное видео отдельно или вернись к аудио.', attempt);
  }
}

function ensureYoutube() {
  if (youtubeReady || youtubeLoading) return;
  // A previous attempt may have timed out while the visitor was using audio.
  if (youtubePlayer) {
    youtubePlayer = null;
    $('.video-frame').innerHTML = '<div id="youtubeMount"></div>';
  }
  youtubeLoading = true;
  const attempt = ++youtubeAttempt;
  setStatus('loading', 'Загружаем YouTube…');
  // Keep the deadline until onReady, not merely until the API script has loaded.
  youtubeTimeout = setTimeout(() => {
    if (!youtubeReady) youtubeFailure('YouTube не ответил. Проверь соединение или открой официальное видео отдельно.', attempt);
  }, 12000);
  if (window.YT && window.YT.Player) { createYoutubePlayer(attempt); return; }
  // API is loaded only after the visitor explicitly selects VIDEO.
  window.onYouTubeIframeAPIReady = () => createYoutubePlayer(attempt);
  if (youtubeScript) youtubeScript.remove();
  youtubeScript = document.createElement('script');
  youtubeScript.src = 'https://www.youtube.com/iframe_api';
  youtubeScript.onerror = () => youtubeFailure('YouTube недоступен. Проверь соединение или открой официальное видео отдельно.', attempt);
  document.head.appendChild(youtubeScript);
}

function cueYoutube(autoplay) {
  if (!youtubeReady || !youtubePlayer) return;
  const track = tracks[current];
  const position = youtubePendingSeek === null ? 0 : youtubePendingSeek;
  youtubeVideoId = track.video;
  desiredPlaying = autoplay;
  updatePlayButtons();
  try {
    youtubePlayer.setVolume(Number(volume.value));
    if (autoplay) {
      markStarted();
      clearError();
      setStatus('loading', 'Загружаем видео…');
      youtubePlayer.loadVideoById({ videoId: track.video, startSeconds: position });
      startTick();
    } else {
      youtubePlayer.cueVideoById({ videoId: track.video, startSeconds: position });
      setStatus('ready', 'Видео готово к прослушиванию');
    }
    clearYoutubePendingSoon();
  } catch (_) {
    showError('Не удалось запустить видео. Открой его на YouTube или вернись к аудио.');
  }
}

function playYoutube() {
  desiredPlaying = true;
  markStarted();
  clearError();
  updatePlayButtons();
  startTick();
  if (!youtubeReady) { ensureYoutube(); return; }
  if (youtubeVideoId !== tracks[current].video) { cueYoutube(true); return; }
  try {
    setStatus('loading', 'Запускаем видео…');
    youtubePlayer.playVideo();
  } catch (_) {
    showError('Не удалось запустить видео. Открой его на YouTube или вернись к аудио.');
  }
}

function play() {
  if (provider === 'audio') playAudio();
  else playYoutube();
}

function pause() {
  playRevision++;
  desiredPlaying = false;
  if (provider === 'audio') audio.pause();
  else if (youtubeReady && youtubePlayer) {
    try { youtubePlayer.pauseVideo(); } catch (_) { /* optional */ }
  }
  updatePlayButtons();
  setStatus('paused', 'На паузе');
  updateTime(true);
}

function togglePlayback() {
  if (desiredPlaying) pause();
  else play();
}

function setProvider(next, forcePlay = false) {
  if (provider === next) { if (forcePlay) play(); return; }
  const position = getPosition();
  const shouldPlay = forcePlay || desiredPlaying;
  playRevision++;
  const previous = provider;
  provider = next;
  desiredPlaying = false;
  if (previous === 'audio') audio.pause();
  else if (youtubeReady && youtubePlayer) {
    try { youtubePlayer.pauseVideo(); } catch (_) { /* optional */ }
  }
  clearError();
  $('#sourceAudio').setAttribute('aria-pressed', String(next === 'audio'));
  $('#sourceVideo').setAttribute('aria-pressed', String(next === 'youtube'));
  $('#videoPanel').hidden = next !== 'youtube';
  $('#viz').hidden = next === 'youtube';
  updatePlayButtons();
  if (next === 'audio') {
    audioPendingSeek = position;
    if (audio.readyState >= 1) {
      try { audio.currentTime = clamp(position, 0, getDuration()); audioPendingSeek = null; } catch (_) { /* applied on metadata */ }
    }
    setStatus('ready', 'Готово к прослушиванию');
    updateTime(true);
    if (shouldPlay) playAudio();
  } else {
    youtubePendingSeek = position;
    youtubeVideoId = null;
    desiredPlaying = shouldPlay;
    updatePlayButtons();
    updateTime(true);
    if (youtubeReady) cueYoutube(shouldPlay);
    else ensureYoutube();
  }
}

function next(manual = true) {
  let index;
  if (shuffle) {
    do { index = Math.floor(Math.random() * tracks.length); } while (index === current && tracks.length > 1);
  } else if (current < tracks.length - 1) index = current + 1;
  else if (manual || repeat) index = 0;
  else {
    desiredPlaying = false;
    updatePlayButtons();
    setStatus('ready', 'Альбом закончился');
    updateTime(true);
    return;
  }
  trackHistory.push(current);
  if (trackHistory.length > 50) trackHistory.shift();
  loadTrack(index, true);
}

function previous() {
  if (getPosition() > 4) { setPosition(0); return; }
  const index = shuffle && trackHistory.length ? trackHistory.pop() : (current - 1 + tracks.length) % tracks.length;
  loadTrack(index, true);
}

function onEnded() { next(false); }

// The wave is a decorative playback indicator, not an audio analyser.
const waveHeights = Array.from({ length: 56 }, (_, index) => Math.round(14 + 52 * Math.abs(Math.sin(index * 1.71) * Math.cos(index * 0.31))));
$('#viz').innerHTML = waveHeights.map((height, index) => `<span style="--bar:${height}%;--delay:${(index % 8) * -0.1}s"></span>`).join('');

$('#play').addEventListener('click', togglePlayback);
$('#miniPlay').addEventListener('click', togglePlayback);
$('#prev').addEventListener('click', previous);
$('#next').addEventListener('click', () => next(true));
$('#nextUp').addEventListener('click', () => next(true));
$('#miniNext').addEventListener('click', () => next(true));
$('#sourceAudio').addEventListener('click', () => setProvider('audio'));
$('#sourceVideo').addEventListener('click', () => setProvider('youtube'));
$('#errorVideo').addEventListener('click', () => setProvider('youtube', true));
$('#retry').addEventListener('click', () => {
  clearError();
  if (provider === 'youtube' && !youtubeReady) {
    // Remove a stalled iframe before trying again. Its callbacks are ignored by attempt id.
    youtubeLoading = false;
    clearTimeout(youtubeTimeout);
    youtubeAttempt++;
    youtubePlayer = null;
    $('.video-frame').innerHTML = '<div id="youtubeMount"></div>';
  }
  play();
});
$('#shuffle').addEventListener('click', event => {
  shuffle = !shuffle;
  event.currentTarget.classList.toggle('active', shuffle);
  event.currentTarget.setAttribute('aria-pressed', String(shuffle));
  showToast(shuffle ? 'Случайный порядок включён' : 'Случайный порядок выключен');
});
$('#repeat').addEventListener('click', event => {
  repeat = !repeat;
  event.currentTarget.classList.toggle('active', repeat);
  event.currentTarget.setAttribute('aria-pressed', String(repeat));
  showToast(repeat ? 'Повтор альбома включён' : 'Повтор альбома выключен');
});

const savedVolume = Number(store.get('ph:vol', 0.8));
volume.value = String(Math.round(clamp(Number.isFinite(savedVolume) ? savedVolume : 0.8, 0, 1) * 100));
volume.style.setProperty('--p', `${volume.value}%`);
audio.volume = Number(volume.value) / 100;
volume.addEventListener('input', () => {
  const value = Number(volume.value);
  volume.style.setProperty('--p', `${value}%`);
  audio.volume = value / 100;
  store.set('ph:vol', value / 100);
  if (youtubeReady && youtubePlayer) {
    try {
      youtubePlayer.setVolume(value);
      if (value > 0 && youtubePlayer.isMuted()) youtubePlayer.unMute();
    } catch (_) { /* optional */ }
  }
});
seek.addEventListener('input', () => {
  draggingSeek = true;
  setPosition(Number(seek.value) / 1000 * getDuration());
});
seek.addEventListener('change', () => {
  draggingSeek = false;
  updateTime(true);
});

for (const eventName of ['wheel', 'touchstart']) lyricsBox.addEventListener(eventName, () => setFollow(false), { passive: true });
lyricsBox.addEventListener('pointerdown', event => { if (event.target === lyricsBox) setFollow(false); });
lyricsBox.addEventListener('keydown', event => {
  if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) setFollow(false);
});
$('#followLyrics').addEventListener('click', () => { setFollow(true); updateLyrics(true); });
$('#offMinus').addEventListener('click', () => setOffset(delay - 0.5));
$('#offPlus').addEventListener('click', () => setOffset(delay + 0.5));
$('#offReset').addEventListener('click', () => setOffset(0));
$('#lyricsHelp').addEventListener('click', () => showToast('−0.5 показывает строки раньше, +0.5 — позже. Сдвиг сохраняется отдельно для каждого трека. Нажми на значение, чтобы сбросить.'));

$('#shareTrack').addEventListener('click', async () => {
  const url = new URL(location.href);
  url.searchParams.set('track', tracks[current].key);
  url.searchParams.set('t', String(Math.floor(getPosition())));
  url.hash = 'listen';
  try {
    if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(url.href);
    showToast('Ссылка на этот момент скопирована');
  } catch (_) {
    try {
      window.history.replaceState(null, '', url.href);
      showToast('Ссылка подготовлена — скопируй её из адресной строки.');
    } catch (_) {
      // Some file:// and privacy-restricted contexts also block replaceState.
      window.prompt('Скопируй ссылку на этот момент:', url.href);
    }
  }
});

audio.addEventListener('play', () => {
  // Media events are queued; a rapid pause or track switch may make them stale.
  if (provider !== 'audio' || audio.paused) return;
  desiredPlaying = true;
  markStarted();
  updatePlayButtons();
  startTick();
});
audio.addEventListener('playing', () => {
  if (provider !== 'audio' || audio.paused) return;
  clearError();
  setStatus('playing', 'Воспроизводится · аудио');
});
audio.addEventListener('waiting', () => { if (provider === 'audio' && desiredPlaying && !audio.paused) setStatus('loading', 'Загружаем аудио…'); });
audio.addEventListener('pause', () => {
  if (provider !== 'audio' || !audio.paused) return;
  desiredPlaying = false;
  updatePlayButtons();
  if (!audio.ended && !audio.error) setStatus('paused', 'На паузе');
  updateTime(true);
});
audio.addEventListener('loadedmetadata', () => {
  if (audioPendingSeek !== null) {
    try { audio.currentTime = clamp(audioPendingSeek, 0, Number.isFinite(audio.duration) ? audio.duration : tracks[current].seconds); audioPendingSeek = null; } catch (_) { /* can retry after seekable */ }
  }
  if (provider === 'audio') updateTime(true);
});
audio.addEventListener('durationchange', () => { if (provider === 'audio') updateTime(); });
audio.addEventListener('timeupdate', () => { if (provider === 'audio') updateTime(); });
audio.addEventListener('seeked', () => { if (provider === 'audio') updateTime(true); });
audio.addEventListener('ended', () => { if (provider === 'audio' && audio.ended) onEnded(); });
audio.addEventListener('error', () => {
  if (provider === 'audio' && audio.error && (hasStarted || desiredPlaying)) showError('Аудиофайл не загрузился. Проверь соединение или переключись на официальное видео.');
});
document.addEventListener('visibilitychange', () => updateTime(true));

if ('mediaSession' in navigator) {
  const handlers = {
    play, pause, previoustrack: previous, nexttrack: () => next(true),
    seekbackward: details => setPosition(getPosition() - (details.seekOffset || 10)),
    seekforward: details => setPosition(getPosition() + (details.seekOffset || 10)),
    seekto: details => { if (Number.isFinite(details.seekTime)) setPosition(details.seekTime); }
  };
  Object.entries(handlers).forEach(([action, handler]) => {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch (_) { /* not supported by this browser */ }
  });
}

addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target.closest('input, textarea, select, button, a, [contenteditable], .lyrics')) return;
  if (event.code === 'Space') {
    if (!hasStarted) return;
    event.preventDefault();
    togglePlayback();
    return;
  }
  if (event.key === 'ArrowRight') { event.preventDefault(); next(true); return; }
  if (event.key === 'ArrowLeft') { event.preventDefault(); previous(); return; }
  if (event.key === 'm' || event.key === 'M' || event.key === 'ь' || event.key === 'Ь') {
    const muted = Number(volume.value) === 0;
    if (muted) {
      const restored = Number(store.get('ph:vol:last', 0.8));
      volume.value = String(Math.round(clamp(Number.isFinite(restored) ? restored : 0.8, 0.05, 1) * 100));
    } else {
      store.set('ph:vol:last', (Number(volume.value) || 80) / 100);
      volume.value = '0';
    }
    volume.dispatchEvent(new Event('input', { bubbles: true }));
    showToast(muted ? 'Звук включён' : 'Звук выключен');
  }
});

/* Navigation, section visibility, and the mini-player. */
const nav = $('.topbar nav');
const navToggle = $('.nav-toggle');
navToggle.addEventListener('click', () => {
  const open = nav.classList.toggle('mobile-open');
  navToggle.setAttribute('aria-expanded', String(open));
  navToggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
});
$$('.topbar nav a').forEach(link => link.addEventListener('click', () => {
  nav.classList.remove('mobile-open');
  navToggle.setAttribute('aria-expanded', 'false');
  navToggle.setAttribute('aria-label', 'Открыть меню');
}));
addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    nav.classList.remove('mobile-open');
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', 'Открыть меню');
  }
});
if ('IntersectionObserver' in window) {
  document.documentElement.classList.add('has-reveal');
  const revealObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('in'); revealObserver.unobserve(entry.target); }
  }), { threshold: 0.08 });
  $$('.reveal').forEach(element => revealObserver.observe(element));
  const links = $$('.topbar nav a');
  const sectionObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) links.forEach(link => link.classList.toggle('on', link.getAttribute('href') === `#${entry.target.id}`));
  }), { rootMargin: '-45% 0px -50% 0px' });
  $$('main section[id]').forEach(section => sectionObserver.observe(section));
  const controlsObserver = new IntersectionObserver(entries => {
    controlsVisible = entries[0].isIntersecting;
    updateMiniVisibility();
  }, { threshold: 0.1 });
  controlsObserver.observe($('.controls'));
} else {
  controlsVisible = false;
  $$('.reveal').forEach(element => element.classList.add('in'));
}

renderTracks();
renderHeroRoute();
renderPlot();
renderChars();
const params = new URLSearchParams(location.search);
const linkedIndex = tracks.findIndex(track => track.key === params.get('track'));
const savedIndex = Number(store.get('ph:track', 0));
const initialIndex = linkedIndex >= 0 ? linkedIndex : clamp(Number.isInteger(savedIndex) ? savedIndex : 0, 0, tracks.length - 1);
const linkedTime = linkedIndex >= 0 ? Number(params.get('t')) : 0;
loadTrack(initialIndex, false, Number.isFinite(linkedTime) ? Math.max(0, linkedTime) : 0);
