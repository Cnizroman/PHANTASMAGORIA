const test = require('node:test');
const assert = require('node:assert/strict');
const { clamp, cueIndex, seekTime, formatTime } = require('../../player-core.js');

test('clamp keeps values within the interval', () => {
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(4, 0, 10), 4);
  assert.equal(clamp(12, 0, 10), 10);
});

test('cueIndex handles start, exact boundaries, duplicate timestamps and instrumental cues', () => {
  const cues = [
    { time: 3, text: 'one' }, { time: 7, text: '' },
    { time: 9, text: 'two' }, { time: 9, text: 'three' }, { time: 15, text: 'four' }
  ];
  assert.equal(cueIndex([], 10, 0), -1);
  assert.equal(cueIndex(cues, 2.999, 0), -1);
  assert.equal(cueIndex(cues, 3, 0), 0);
  assert.equal(cueIndex(cues, 7, 0), 1);
  assert.equal(cueIndex(cues, 8.999, 0), 1);
  assert.equal(cueIndex(cues, 9, 0), 3);
  assert.equal(cueIndex(cues, 100, 0), 4);
  assert.equal(cueIndex(cues, Number.NaN, 0), -1);
});

test('positive delay shows lyrics later, negative delay earlier, and seeking is the inverse', () => {
  const cues = [{ time: 2, text: 'first' }, { time: 5, text: 'second' }];
  assert.equal(cueIndex(cues, 5.49, .5), 0);
  assert.equal(cueIndex(cues, 5.5, .5), 1);
  assert.equal(cueIndex(cues, 4.5, -.5), 1);
  assert.equal(seekTime(5, .5, 20), 5.5);
  assert.equal(seekTime(5, -.5, 20), 4.5);
  assert.equal(seekTime(0.1, -3, 20), 0);
  assert.equal(seekTime(19, 3, 20), 20);
  assert.equal(seekTime(5, .5, NaN), 5.5);
});

test('binary search agrees with a linear reference over a range of offsets and times', () => {
  const cues = Array.from({ length: 100 }, (_, i) => ({ time: Math.floor(i * 1.9) / 2, text: String(i) }));
  for (const delay of [-2.5, 0, .5, 3]) {
    for (let time = 0; time < 120; time += .37) {
      let expected = -1;
      cues.forEach((cue, index) => { if (cue.time <= time - delay) expected = index; });
      assert.equal(cueIndex(cues, time, delay), expected);
    }
  }
});

test('formatTime floors seconds and handles bad input', () => {
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(65.9), '01:05');
  assert.equal(formatTime(3671), '61:11');
  assert.equal(formatTime(-7), '00:00');
  assert.equal(formatTime(Infinity), '00:00');
  assert.equal(formatTime(NaN), '00:00');
});
