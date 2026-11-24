// Nöbet listesini EczaneAPI'den çekip data/<il>.json olarak yazar.
// GitHub Actions her gece çalıştırır; anahtar ECZANEAPI_KEY gizli değişkeninde durur, tarayıcıya hiç gitmez.
//
// Ortam değişkenleri:
//   ECZANEAPI_KEY   (zorunlu)  eczaneapi.com hesabından alınan anahtar
//   CITIES          (isteğe bağlı) virgülle iller, ör. "istanbul,yalova". Varsayılan: istanbul
//   FORCE=1         (isteğe bağlı) bugün zaten çekildiyse bile tekrar iste
//   ECZANEAPI_BASE  (test için) API kökü
//   DATA_DIR        (test için) çıktı klasörü

import {mkdir, readFile, writeFile, rename} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const API = (process.env.ECZANEAPI_BASE || 'https://eczaneapi.com/api/v1').replace(/\/$/, '');
const DATA_DIR = process.env.DATA_DIR || 'data';
const KEY = (process.env.ECZANEAPI_KEY || '').trim();
const FORCE = /^(1|true|yes)$/i.test(process.env.FORCE || '');
const CITIES = (process.env.CITIES || 'istanbul')
  .split(',').map(s => slugify(s)).filter(Boolean);

const NAMES = {istanbul: 'İstanbul', yalova: 'Yalova', ankara: 'Ankara', izmir: 'İzmir', bursa: 'Bursa',
  kocaeli: 'Kocaeli', antalya: 'Antalya', tekirdag: 'Tekirdağ', sakarya: 'Sakarya', edirne: 'Edirne'};

export function slugify(s) {
  return String(s || '').trim().toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
}

/** YYYY-MM-DD in Turkey time. */
export function trDay(date = new Date(), offsetDays = 0) {
  const d = new Date(date.getTime() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Istanbul'}).format(d);
}

function num(v) {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.trim()) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Turkish landline/mobile to 0XXXXXXXXXX, or '' if it doesn't look like one. */
export function phone(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  if (/^0[2-5]\d{9}$/.test(d)) return d;
  if (/^[2-5]\d{9}$/.test(d)) return '0' + d;
  if (/^90[2-5]\d{9}$/.test(d)) return '0' + d.slice(2);
  return '';
}

const clean = v => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/**
 * Turns an EczaneAPI answer into {days: {'YYYY-MM-DD': [pharmacy, ...]}}.
 * Without a date the API returns yesterday, today and tomorrow as an array of {date, pharmacies}.
 */
export function transform(payload, citySlug) {
  if (!payload || payload.success !== true || !payload.data) throw new Error('Beklenmeyen yanıt biçimi');
  const blocks = Array.isArray(payload.data) ? payload.data : [payload.data];
  const days = {};
  let skipped = 0, noPoint = 0;
  for (const block of blocks) {
    const list = Array.isArray(block?.pharmacies) ? block.pharmacies : [];
    for (const p of list) {
      const name = clean(p?.name);
      const date = clean(p?.duty?.date || block?.date).slice(0, 10);
      if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { skipped++; continue; }
      const rowCity = slugify(p?.city?.slug || p?.city?.name || '');
      if (rowCity && citySlug && rowCity !== citySlug) continue;
      let lat = num(p?.location?.latitude), lng = num(p?.location?.longitude);
      // Turkey bounds; anything else is a bad point.
      if (lat === null || lng === null || lat < 35 || lat > 43 || lng < 25 || lng > 45) { lat = lng = null; noPoint++; }
      const row = {
        id: String(p.id ?? `${name}-${date}`),
        n: name,
        a: clean(p?.address),
        d: clean(p?.district?.name),
        t: phone(p?.phone) || phone(p?.phone2),
        y: lat === null ? null : +lat.toFixed(6),
        x: lng === null ? null : +lng.toFixed(6),
      };
      const t2 = phone(p?.phone2);
      if (t2 && t2 !== row.t) row.t2 = t2;
      (days[date] ||= []);
      if (!days[date].some(r => r.id === row.id)) days[date].push(row);
    }
  }
  for (const k of Object.keys(days)) days[k].sort((a, b) => a.d.localeCompare(b.d, 'tr') || a.n.localeCompare(b.n, 'tr'));
  return {days, skipped, noPoint};
}

async function readJson(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return null; }
}

async function writeJsonAtomic(file, obj) {
  const tmp = file + '.tmp';
  await writeFile(tmp, JSON.stringify(obj));
  await rename(tmp, file);
}

async function request(url, tries = 2) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: {'X-API-Key': KEY, Accept: 'application/json', 'User-Agent': 'nobetci-pwa (GitHub Actions)'},
        signal: AbortSignal.timeout(30000),
      });
      if (res.status === 401 || res.status === 403) throw Object.assign(new Error(`Anahtar reddedildi (${res.status})`), {final: true});
      if (res.status === 429) throw Object.assign(new Error('Kota doldu (429)'), {final: true});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      last = e;
      if (e.final) break;
      if (i < tries - 1) await new Promise(r => setTimeout(r, 10000));
    }
  }
  throw last;
}

async function updateCity(slug, now) {
  const file = join(DATA_DIR, `${slug}.json`);
  const prev = await readJson(file);
  const today = trDay(now);
  if (!FORCE && prev?.fetchedDay === today && prev?.days?.[today]?.length) {
    console.log(`• ${slug}: bugün zaten çekilmiş (${prev.fetchedAt}), API çağrılmadı.`);
    return {slug, name: prev.name || NAMES[slug] || slug, ok: true, cached: true};
  }
  const payload = await request(`${API}/pharmacies/on-duty?city=${encodeURIComponent(slug)}`);
  const {days, skipped, noPoint} = transform(payload, slug);
  const keepFrom = trDay(now, -1);
  // Keep yesterday onward; merge with previous file so a partial answer never drops a still-running list.
  const merged = {};
  for (const [k, v] of Object.entries(prev?.days || {})) if (k >= keepFrom) merged[k] = v;
  for (const [k, v] of Object.entries(days)) if (k >= keepFrom && v.length) merged[k] = v;
  const total = Object.values(days).reduce((s, v) => s + v.length, 0);
  if (!total) throw new Error('API bu il için hiç nöbet kaydı döndürmedi');
  const out = {
    city: slug,
    name: NAMES[slug] || slug,
    source: 'EczaneAPI',
    fetchedAt: now.toISOString(),
    fetchedDay: today,
    days: Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b))),
  };
  await writeJsonAtomic(file, out);
  const counts = Object.entries(out.days).map(([k, v]) => `${k}: ${v.length}`).join(', ');
  console.log(`✓ ${slug}: ${counts}${skipped ? ` · ${skipped} bozuk kayıt atlandı` : ''}${noPoint ? ` · ${noPoint} kaydın konumu yok` : ''}`);
  return {slug, name: out.name, ok: true};
}

export async function main(now = new Date()) {
  if (!KEY) {
    console.error('ECZANEAPI_KEY tanımlı değil. Repo → Settings → Secrets and variables → Actions → New repository secret.');
    process.exitCode = 1;
    return;
  }
  await mkdir(DATA_DIR, {recursive: true});
  const results = [];
  for (const slug of CITIES) {
    try { results.push(await updateCity(slug, now)); }
    catch (e) {
      console.error(`✗ ${slug}: ${e.message}`);
      const prev = await readJson(join(DATA_DIR, `${slug}.json`));
      results.push({slug, name: prev?.name || NAMES[slug] || slug, ok: false});
    }
  }
  const index = {
    updatedAt: now.toISOString(),
    cities: results.map(r => ({slug: r.slug, name: r.name})),
  };
  await writeJsonAtomic(join(DATA_DIR, 'index.json'), index);
  if (results.every(r => !r.ok)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
