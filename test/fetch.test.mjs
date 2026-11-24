// node --test test/  — fetch.mjs'yi sahte bir EczaneAPI sunucusuna karşı çalıştırır.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {execFile} from 'node:child_process';
import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {payload, day} from './fixture.mjs';
import {transform, phone, trDay} from '../scripts/fetch.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const today = trDay();

function server(handler) {
  return new Promise(res => {
    const s = http.createServer(handler);
    s.listen(0, '127.0.0.1', () => res(s));
  });
}
function run(env) {
  return new Promise(res => {
    execFile(process.execPath, [join(root, 'scripts/fetch.mjs')], {env: {PATH: process.env.PATH, ...env}},
      (err, stdout, stderr) => res({code: err ? err.code : 0, stdout, stderr}));
  });
}

test('phone numbers are normalised to 0XXXXXXXXXX', () => {
  assert.equal(phone('0212 000 12 34'), '02120001234');
  assert.equal(phone('(0212) 000 11 22'), '02120001122');
  assert.equal(phone('+90 532 000 11 22'), '05320001122');
  assert.equal(phone('2120001122'), '02120001122');
  assert.equal(phone('yok'), '');
  assert.equal(phone(null), '');
});

test('transform keeps good rows, drops broken ones, other cities and duplicates', () => {
  const {days, skipped, noPoint, foreign} = transform(payload(today), 'istanbul');
  const y = days[day(today, -1)];
  assert.ok(y && days[today] && days[day(today, 1)], 'three days');
  assert.equal(skipped, 1, 'one row without a name');
  assert.equal(noPoint, 1, 'one row with 0,0');
  assert.equal(foreign, 1, 'Çankaya row filed under İstanbul is dropped');
  assert.ok(!y.some(r => r.d === 'Çankaya'));
  assert.equal(y.find(r => r.id === 'old-name').d, 'Eyüpsultan', 'Eyüp mapped to Eyüpsultan');
  assert.ok(!y.some(r => r.n === 'Başka İl Eczanesi'), 'other city left out');
  assert.equal(new Set(y.map(r => r.id)).size, y.length, 'no duplicate ids');
  const noAddr = y.find(r => r.id === 'no-addr');
  assert.equal(noAddr.a, '');
  assert.equal(noAddr.t, '02120001122');
  assert.equal(noAddr.y, 41.0375, 'string coordinates parsed');
  assert.equal(y.find(r => r.id === 'no-phone').t, '');
  assert.equal(y.find(r => r.id === 'bad-point').y, null);
});

test('transform rejects a failed answer', () => {
  assert.throws(() => transform({success: false}, 'istanbul'));
  assert.throws(() => transform(null, 'istanbul'));
});

test('end to end: one request a day, FORCE asks again, failures keep the old file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nobetci-'));
  let calls = 0, mode = 'ok', lastKey = '';
  const s = await server((req, res) => {
    calls++;
    lastKey = req.headers['x-api-key'];
    const url = new URL(req.url, 'http://x');
    assert.equal(url.pathname, '/api/v1/pharmacies/on-duty');
    assert.equal(url.searchParams.get('city'), 'istanbul');
    if (mode === '429') { res.writeHead(429); return res.end('{"success":false}'); }
    if (mode === '401') { res.writeHead(401); return res.end('{}'); }
    res.writeHead(200, {'content-type': 'application/json'});
    res.end(JSON.stringify(payload(today)));
  });
  const env = {ECZANEAPI_KEY: 'test-key', ECZANEAPI_BASE: `http://127.0.0.1:${s.address().port}/api/v1`, DATA_DIR: dir};

  let r = await run(env);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(calls, 1);
  assert.equal(lastKey, 'test-key');
  const out = JSON.parse(await readFile(join(dir, 'istanbul.json'), 'utf8'));
  assert.equal(out.fetchedDay, today);
  assert.equal(out.name, 'İstanbul');
  assert.deepEqual(Object.keys(out.days), [day(today, -1), today, day(today, 1)]);
  const idx = JSON.parse(await readFile(join(dir, 'index.json'), 'utf8'));
  assert.deepEqual(idx.cities, [{slug: 'istanbul', name: 'İstanbul'}]);
  const idxBefore = await readFile(join(dir, 'index.json'), 'utf8');

  r = await run(env);
  assert.equal(r.code, 0);
  assert.equal(calls, 1, 'second run the same day does not call the API');
  assert.match(r.stdout, /zaten çekilmiş/);
  assert.equal(await readFile(join(dir, 'index.json'), 'utf8'), idxBefore, 'skipped run leaves index.json alone (no commit)');

  r = await run({...env, FORCE: '1'});
  assert.equal(calls, 2, 'FORCE asks again');

  const before = await readFile(join(dir, 'istanbul.json'), 'utf8');
  mode = '429';
  r = await run({...env, FORCE: '1'});
  assert.equal(r.code, 1, 'quota error fails the job');
  assert.equal(calls, 3, '429 is not retried');
  assert.equal(await readFile(join(dir, 'istanbul.json'), 'utf8'), before, 'old list kept');

  mode = '401';
  r = await run({...env, FORCE: '1'});
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Anahtar reddedildi/);

  r = await run({DATA_DIR: dir});
  assert.equal(r.code, 1);
  assert.match(r.stderr, /ECZANEAPI_KEY tanımlı değil/);
  s.close();
});

test('old days are pruned, a still-running list survives a partial answer', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'nobetci-'));
  const old = {city: 'istanbul', name: 'İstanbul', fetchedDay: day(today, -1), days: {
    [day(today, -3)]: [{id: 'a', n: 'Çok Eski', a: '', d: 'Fatih', t: '', y: null, x: null}],
    [day(today, -1)]: [{id: 'b', n: 'Dünkü Liste', a: '', d: 'Fatih', t: '', y: 41, x: 29}],
  }};
  await writeFile(join(dir, 'istanbul.json'), JSON.stringify(old));
  const only = payload(today);
  only.data = only.data.slice(1); // API answers only today and tomorrow
  const s = await server((req, res) => { res.writeHead(200); res.end(JSON.stringify(only)); });
  const r = await run({ECZANEAPI_KEY: 'k', ECZANEAPI_BASE: `http://127.0.0.1:${s.address().port}/api/v1`, DATA_DIR: dir});
  s.close();
  assert.equal(r.code, 0, r.stderr);
  const out = JSON.parse(await readFile(join(dir, 'istanbul.json'), 'utf8'));
  assert.ok(!out.days[day(today, -3)], 'three days ago dropped');
  assert.equal(out.days[day(today, -1)][0].n, 'Dünkü Liste', 'yesterday kept from the old file');
  assert.ok(out.days[today].length > 10);
});
