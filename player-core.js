/* Small, deterministic helpers shared by the player and its tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LyricSync = api;
})(typeof window !== 'undefined' ? window : null, function () {
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  // A positive delay shows the lyric later, a negative delay shows it earlier.
  function cueIndex(cues, mediaTime, delay = 0) {
    if (!Number.isFinite(mediaTime) || !Number.isFinite(delay)) return -1;
    const lyricTime = mediaTime - delay;
    let low = 0;
    let high = cues.length - 1;
    let found = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (cues[middle].time <= lyricTime) {
        found = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return found;
  }

  function seekTime(cueTime, delay = 0, duration = Infinity) {
    if (!Number.isFinite(cueTime) || !Number.isFinite(delay)) return 0;
    const end = Number.isFinite(duration) && duration >= 0 ? duration : Infinity;
    return clamp(cueTime + delay, 0, end);
  }

  function formatTime(seconds) {
    const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  }

  return { clamp, cueIndex, seekTime, formatTime };
});
