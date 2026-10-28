const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

// A quiet generated tone is deliberately local to the tests. No copyrighted
// recording is bundled, and the browser still exercises a real <audio> element.
function makeWav(seconds = 230) {
  const rate = 8000;
  const samples = seconds * rate;
  const wav = Buffer.alloc(44 + samples);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + samples, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate, 28);
  wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write('data', 36); wav.writeUInt32LE(samples, 40);
  for (let i = 0; i < samples; i++) wav[44 + i] = Math.round(128 + 16 * Math.sin(2 * Math.PI * 220 * i / rate));
  return wav;
}
const wav = makeWav();
async function fulfilAudio(route) {
  const range = route.request().headers().range;
  const match = range && range.match(/bytes=(\d+)-(\d*)/);
  if (match) {
    const start = Number(match[1]);
    const end = match[2] ? Math.min(Number(match[2]), wav.length - 1) : wav.length - 1;
    return route.fulfill({ status: 206, contentType: 'audio/wav', headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${wav.length}` }, body: wav.subarray(start, end + 1) });
  }
  return route.fulfill({ status: 200, contentType: 'audio/wav', headers: { 'Accept-Ranges': 'bytes' }, body: wav });
}

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith('http://127.0.0.1:4174/')) return route.continue();
    if (url.includes('/releases/download/audio-v1/')) return fulfilAudio(route);
    return route.abort();
  });
});

async function startAudio(page) {
  await page.locator('#play').click();
  await expect(page.locator('#playerStatus')).toHaveAttribute('data-state', 'playing');
  await expect.poll(() => page.locator('#audio').evaluate(audio => audio.currentTime)).toBeGreaterThan(0.1);
}

test('desktop and mobile content, local fonts, keyboard labels, and no horizontal overflow', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.track')).toHaveCount(8);
  await expect(page.locator('.char')).toHaveCount(3);
  await expect(page.locator('.lyric-line').first()).toContainText('Добро пожаловать');
  await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Воспроизвести');
  expect(await page.locator('#viz span').count()).toBeGreaterThan(30);
  expect(await page.locator('#viz').evaluate(el => getComputedStyle(el).display)).toBe('flex');
  expect(await page.evaluate(() => document.fonts.check('16px Manrope'))).toBe(true);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 850 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  }
  await page.locator('.nav-toggle').click();
  await expect(page.locator('.nav-toggle')).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('.nav-toggle')).toHaveAttribute('aria-expanded', 'false');
  expect(errors).toEqual([]);
});

test('native audio actually plays, seeks by lyric, highlights, and saves per-track timing and volume', async ({ page }) => {
  await page.goto('/');
  await startAudio(page);
  const audio = page.locator('#audio');
  expect(await audio.evaluate(element => [element.paused, element.volume, element.currentSrc])).toEqual([false, .8, expect.stringContaining('01-malo-pomalu.mp3')]);
  await page.locator('#offPlus').click();
  await expect(page.locator('#offReset')).toHaveText('+0.5 с');
  const line = page.locator('.lyric-line[data-index="5"]');
  const cueTime = await page.evaluate(() => window.LYRICS_DATA['01-malo-pomalu'][5].time);
  await line.click();
  await expect.poll(() => audio.evaluate(element => element.currentTime)).toBeGreaterThanOrEqual(cueTime + .5);
  await expect(line).toHaveAttribute('aria-current', 'true');
  await page.locator('#play').click();
  await expect(audio).toHaveJSProperty('paused', true);
  // At +0.25 after the timestamp the +0.5 delay must still show the previous line.
  await audio.evaluate((element, time) => { element.currentTime = time + .25; }, cueTime);
  await expect(page.locator('.lyric-line[data-index="4"]')).toHaveAttribute('aria-current', 'true');
  await audio.evaluate((element, time) => { element.currentTime = time + .6; }, cueTime);
  await expect(line).toHaveAttribute('aria-current', 'true');
  await page.locator('#volume').evaluate(element => { element.value = '37'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(await audio.evaluate(element => element.volume)).toBeCloseTo(.37);
  await page.locator('#lyrics').dispatchEvent('wheel');
  await expect(page.locator('#followLyrics')).toBeVisible();
  await page.locator('#followLyrics').click();
  await expect(page.locator('#followLyrics')).toBeHidden();
  await page.reload();
  await expect(page.locator('#offReset')).toHaveText('+0.5 с');
  await expect(page.locator('#volume')).toHaveValue('37');
  await page.locator('#next').click();
  await expect(page.locator('#nowTitle')).toHaveText('медленный танец');
  await expect(page.locator('#offReset')).toHaveText('0.0 с');
});

test('rapid track changes preserve playback state, mini-player works, and the last track stops unless repeated', async ({ page }) => {
  await page.goto('/');
  await startAudio(page);
  await page.locator('#next').click();
  await page.locator('#next').click();
  await page.locator('#next').click();
  await expect(page.locator('#nowTitle')).toHaveText('карусель');
  await expect(page.locator('#playerStatus')).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Пауза');
  await expect(page.locator('#audio')).toHaveJSProperty('paused', false);
  await page.locator('#album').scrollIntoViewIfNeeded();
  await expect(page.locator('#miniPlayer')).toBeVisible();
  await page.locator('#miniPlay').click();
  await expect(page.locator('#audio')).toHaveJSProperty('paused', true);
  await expect(page.locator('#miniPlay')).toHaveAttribute('aria-label', 'Воспроизвести');
  await page.locator('.track[data-i="7"]').click();
  await expect(page.locator('#nowTitle')).toHaveText('эпилог');
  await expect(page.locator('#playerStatus')).toHaveAttribute('data-state', 'playing');
  await page.locator('#audio').evaluate(element => { element.currentTime = element.duration - .25; });
  await expect(page.locator('#statusText')).toHaveText('Альбом закончился', { timeout: 7000 });
  await expect(page.locator('#nowTitle')).toHaveText('эпилог');
  await page.locator('#repeat').click();
  await page.locator('#play').click();
  await expect(page.locator('#audio')).toHaveJSProperty('paused', false);
  await page.locator('#audio').evaluate(element => { element.currentTime = element.duration - .25; });
  await expect(page.locator('#nowTitle')).toHaveText('мало-помалу', { timeout: 7000 });
  await expect(page.locator('#playerStatus')).toHaveAttribute('data-state', 'playing');
});

test('listening progress marks heard stops and persists between visits', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#heardCount')).toHaveText('00 / 08');
  await expect(page.locator('.track[data-i="0"]')).not.toHaveClass(/heard/);
  await startAudio(page);
  // Walking a track to its end is what counts as "heard".
  await page.locator('#audio').evaluate(element => { element.currentTime = element.duration - .3; });
  await expect(page.locator('#nowTitle')).toHaveText('медленный танец', { timeout: 7000 });
  await expect(page.locator('.track[data-i="0"]')).toHaveClass(/heard/);
  await expect(page.locator('#heardCount')).toHaveText('01 / 08');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ph:heard:v1') || '{}'));
  expect(stored['01-malo-pomalu']).toBeGreaterThanOrEqual(0.9);
  await page.reload();
  await expect(page.locator('.track[data-i="0"]')).toHaveClass(/heard/);
  await expect(page.locator('#heardCount')).toHaveText('01 / 08');
});

test('audio failure exposes retry, video fallback and official link', async ({ page }) => {
  await page.route('**/releases/download/audio-v1/**', route => route.abort());
  await page.goto('/');
  await page.locator('#play').click();
  await expect(page.locator('#playerError')).toBeVisible();
  await expect(page.locator('#errorText')).toContainText('Аудиофайл не загрузился');
  await expect(page.locator('#errorVideo')).toBeVisible();
  await expect(page.locator('#errorLink')).toHaveAttribute('href', 'https://www.youtube.com/watch?v=HIl0jzLga58');
  await page.locator('#errorVideo').click();
  await expect(page.locator('#sourceVideo')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#videoPanel')).toBeVisible();
  await expect(page.locator('#errorText')).toContainText('YouTube недоступен');
  await expect(page.locator('#errorVideo')).toBeHidden();
  await page.locator('#sourceAudio').click();
  await expect(page.locator('#sourceAudio')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#playerError')).toBeHidden();
});

function youtubeMock(manualReady = false) {
  return `
    window.__ytInstances = [];
    window.YT = { Player: class {
      constructor(id, options) {
        this.options = options; this.videoId = options.videoId; this.time = 0; this.state = -1; this.volume = 100;
        this.base = performance.now(); this.calls = [];
        window.__ytInstances.push(this);
        const target = document.getElementById(id); target.textContent = 'YouTube test player';
        ${manualReady ? '' : 'setTimeout(() => this.ready(), 30);'}
      }
      ready() { this.options.events.onReady({ target: this }); }
      emit(data) { this.options.events.onStateChange({ target: this, data }); }
      getVideoData() { return { video_id: this.videoId }; }
      getPlayerState() { return this.state; }
      getCurrentTime() { return this.state === 1 ? this.time + (performance.now() - this.base) / 1000 : this.time; }
      getDuration() { return 230; }
      setVolume(value) { this.volume = value; }
      isMuted() { return false; }
      unMute() {}
      loadVideoById({videoId, startSeconds}) { this.videoId = videoId; this.time = startSeconds; this.base = performance.now(); this.state = 1; this.calls.push(['load', videoId, startSeconds]); setTimeout(() => this.emit(1), 10); }
      cueVideoById({videoId, startSeconds}) { this.videoId = videoId; this.time = startSeconds; this.state = 5; this.calls.push(['cue', videoId, startSeconds]); setTimeout(() => this.emit(5), 10); }
      playVideo() { this.base = performance.now(); this.state = 1; this.calls.push(['play']); setTimeout(() => this.emit(1), 10); }
      pauseVideo() { this.time = this.getCurrentTime(); this.state = 2; this.calls.push(['pause']); setTimeout(() => this.emit(2), 10); }
      seekTo(position) { this.time = position; this.base = performance.now(); this.calls.push(['seek', position]); }
    }};
    window.onYouTubeIframeAPIReady();
  `;
}

test('YouTube API switches sources with position, state and track preserved', async ({ page }) => {
  await page.route('https://www.youtube.com/iframe_api', route => route.fulfill({ contentType: 'text/javascript', body: youtubeMock() }));
  await page.goto('/');
  await startAudio(page);
  await page.locator('#audio').evaluate(element => { element.currentTime = 32; });
  await expect.poll(() => page.locator('#audio').evaluate(element => element.currentTime)).toBeGreaterThanOrEqual(32);
  const audioTime = await page.locator('#audio').evaluate(element => element.currentTime);
  await page.locator('#sourceVideo').click();
  await expect(page.locator('#videoPanel')).toBeVisible();
  await expect(page.locator('#viz')).toBeHidden();
  await expect(page.locator('#playerStatus')).toHaveAttribute('data-state', 'playing');
  const yt = await page.evaluate(() => ({ video: window.__ytInstances[0].videoId, time: window.__ytInstances[0].getCurrentTime(), state: window.__ytInstances[0].state }));
  expect(yt.video).toBe('HIl0jzLga58');
  expect(yt.state).toBe(1);
  expect(yt.time).toBeGreaterThanOrEqual(audioTime - .2);
  await page.locator('#next').click();
  await expect(page.locator('#nowTitle')).toHaveText('медленный танец');
  await expect.poll(() => page.evaluate(() => window.__ytInstances[0].videoId)).toBe('oVvpzx8OKM4');
  // An old pause event must not override a newer playing state.
  await page.evaluate(() => window.__ytInstances[0].emit(2));
  await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Пауза');
  await page.locator('.lyric-line[data-index="3"]').click();
  const videoTime = await page.evaluate(() => window.__ytInstances[0].getCurrentTime());
  expect(videoTime).toBeGreaterThan(0);
  await page.locator('#sourceAudio').click();
  await expect(page.locator('#videoPanel')).toBeHidden();
  await expect(page.locator('#audio')).toHaveJSProperty('paused', false);
  await expect.poll(() => page.locator('#audio').evaluate(element => element.currentTime)).toBeGreaterThanOrEqual(videoTime - .5);
  await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Пауза');
});

test('a YouTube iframe that never becomes ready times out and can be retried without a stale callback starting it', async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.setTimeout;
    window.setTimeout = (fn, ms, ...args) => original(fn, ms === 12000 ? 1200 : ms, ...args);
  });
  await page.route('https://www.youtube.com/iframe_api', route => route.fulfill({ contentType: 'text/javascript', body: youtubeMock(true) }));
  await page.goto('/');
  await page.locator('#sourceVideo').click();
  await expect.poll(() => page.evaluate(() => window.__ytInstances?.length || 0)).toBe(1);
  await expect(page.locator('#errorText')).toContainText('YouTube не ответил');
  await page.locator('#retry').click();
  await expect.poll(() => page.evaluate(() => window.__ytInstances.length)).toBe(2);
  await page.evaluate(() => window.__ytInstances[0].ready());
  await page.evaluate(() => window.__ytInstances[1].ready());
  await expect(page.locator('#playerStatus')).toHaveAttribute('data-state', 'playing');
  const instances = await page.evaluate(() => window.__ytInstances.map(instance => instance.calls));
  expect(instances[0].some(call => call[0] === 'load')).toBe(false);
  expect(instances[1].some(call => call[0] === 'load')).toBe(true);
});

test('page has no WCAG A/AA accessibility violations while playing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await startAudio(page);
  await page.locator('.lyric-line[data-index="6"]').click();
  await expect(page.locator('.lyric-line[data-index="6"]')).toHaveAttribute('aria-current', 'true');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map(({ id, impact, nodes }) => ({ id, impact, targets: nodes.map(node => node.target) }))).toEqual([]);
});

test('shared links open the requested track and position without autoplay', async ({ page }) => {
  await page.goto('/?track=06-avtodrom&t=42#listen');
  await expect(page.locator('#nowTitle')).toHaveText('автодром');
  await expect(page.locator('#currentTime')).toHaveText('00:42');
  await expect(page.locator('#audio')).toHaveJSProperty('paused', true);
  await startAudio(page);
  await expect.poll(() => page.locator('#audio').evaluate(element => element.currentTime)).toBeGreaterThanOrEqual(42);
});

test('pausing while YouTube is loading prevents a delayed autoplay', async ({ page }) => {
  await page.route('https://www.youtube.com/iframe_api', route => route.fulfill({ contentType: 'text/javascript', body: youtubeMock(true) }));
  await page.goto('/');
  await startAudio(page);
  await page.locator('#sourceVideo').click();
  await expect.poll(() => page.evaluate(() => window.__ytInstances?.length || 0)).toBe(1);
  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Воспроизвести');
  await page.evaluate(() => window.__ytInstances[0].ready());
  await expect.poll(() => page.evaluate(() => window.__ytInstances[0].state)).toBe(5);
  expect(await page.evaluate(() => window.__ytInstances[0].calls.some(call => call[0] === 'load'))).toBe(false);
  await page.locator('#play').click();
  await expect(page.locator('#playerStatus')).toHaveAttribute('data-state', 'playing');
});

test('without JavaScript the page remains readable and offers a YouTube link', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4174/');
  await expect(page.locator('#story')).toBeVisible();
  await expect(page.locator('.no-script')).toContainText('Для плеера и текста нужен JavaScript');
  await expect(page.locator('.no-script a')).toHaveAttribute('href', 'https://www.youtube.com/watch?v=HIl0jzLga58');
  await context.close();
});

test('when clipboard access is denied the shareable link is placed in the address bar', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
    configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) }
  }));
  await page.goto('/');
  await startAudio(page);
  await page.locator('#audio').evaluate(element => { element.currentTime = 27; });
  await page.locator('#shareTrack').click();
  await expect(page.locator('#toast')).toContainText('скопируй её из адресной строки');
  const url = new URL(page.url());
  expect(url.searchParams.get('track')).toBe('01-malo-pomalu');
  expect(Number(url.searchParams.get('t'))).toBeGreaterThanOrEqual(27);
  expect(url.hash).toBe('#listen');
});
