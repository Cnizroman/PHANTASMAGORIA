const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const expectedDurations = {
  '01-malo-pomalu': 159, '02-medlennyy-tanec': 187, '03-phantasmagoria': 133,
  '04-karusel': 146, '05-komnata-smeha': 176, '06-avtodrom': 178,
  '07-svobodnoe-padenie': 201, '08-epilog': 224
};

test('lyrics bundle is deterministic and contains ordered, in-range cues for all tracks', () => {
  const before = fs.readFileSync(path.join(root, 'lyrics.js'), 'utf8');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'phantasmagoria-lyrics-'));
  try {
    fs.mkdirSync(path.join(temp, 'scripts'));
    fs.copyFileSync(path.join(root, 'scripts/build-lyrics.js'), path.join(temp, 'scripts/build-lyrics.js'));
    fs.cpSync(path.join(root, 'lyrics'), path.join(temp, 'lyrics'), { recursive: true });
    execFileSync(process.execPath, ['scripts/build-lyrics.js'], { cwd: temp });
    assert.equal(fs.readFileSync(path.join(temp, 'lyrics.js'), 'utf8'), before, 'run npm run lyrics after editing LRC files');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
  const context = { window: {} };
  vm.runInNewContext(before, context);
  const data = context.window.LYRICS_DATA;
  assert.deepEqual(Object.keys(data), Object.keys(expectedDurations));
  for (const [key, duration] of Object.entries(expectedDurations)) {
    const cues = data[key];
    assert.ok(cues.length > 10, `${key} has too few cues`);
    assert.ok(cues.some(cue => cue.text), `${key} has no visible text`);
    cues.forEach((cue, index) => {
      assert.ok(Number.isFinite(cue.time) && cue.time >= 0 && cue.time <= duration + 2, `${key}: ${cue.time} is out of range`);
      if (index) assert.ok(cue.time >= cues[index - 1].time, `${key} is not ordered`);
    });
  }
});
