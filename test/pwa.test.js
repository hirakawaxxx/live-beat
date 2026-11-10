import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PUBLIC_DIR,
  SW_PATH,
  computeRevision,
  readPrecacheUrls,
  readRevision,
  urlToFile,
} from '../scripts/sw-revision.mjs';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const read = (name) => readFileSync(join(PUBLIC_DIR, name), 'utf8');

const swSource = readFileSync(SW_PATH, 'utf8');
const precacheUrls = readPrecacheUrls(swSource);
const manifest = JSON.parse(read('manifest.webmanifest'));

describe('service worker precache', () => {
  test('uses the live-beat cache prefix', () => {
    assert.match(swSource, /const CACHE_PREFIX = 'live-beat-';/);
  });

  test('lists the shell and catalog but no WAV files', () => {
    for (const url of ['/', '/play', '/packs/catalog.json', '/js/audio-engine.js']) {
      assert.ok(precacheUrls.includes(url), `${url} missing from precache`);
    }
    assert.ok(precacheUrls.every((url) => !url.endsWith('.wav')));
  });

  test('has no duplicate entries and no redirected .html URLs', () => {
    assert.equal(new Set(precacheUrls).size, precacheUrls.length);
    assert.ok(precacheUrls.every((url) => !url.endsWith('.html')));
  });

  test('every precached URL exists in public/', () => {
    const missing = precacheUrls.filter((url) => !existsSync(urlToFile(url)));
    assert.deepEqual(missing, []);
  });

  test('caches WAVs at runtime cache-first (immutable assets)', () => {
    assert.match(swSource, /\.wav/);
    assert.match(swSource, /cacheFirst\(request, RUNTIME_CACHE_NAME\)/);
    assert.doesNotMatch(swSource, /staleWhileRevalidate\(event, RUNTIME_CACHE_NAME\)/);
  });

  test('PRECACHE_REVISION matches the precached files (run `node scripts/sw-revision.mjs`)', () => {
    assert.equal(readRevision(swSource), computeRevision(precacheUrls));
  });
});

describe('web app manifest and icons', () => {
  test('is a standalone app rooted at /', () => {
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.scope, '/');
  });

  test('every manifest icon is precached and exists', () => {
    for (const { src } of manifest.icons) {
      assert.ok(precacheUrls.includes(src), `${src} not precached`);
      assert.ok(existsSync(urlToFile(src)), `${src} missing`);
    }
  });

  test('PNG icons are real PNGs of the declared size', () => {
    for (const { src, sizes, type } of manifest.icons.filter(({ type }) => type === 'image/png')) {
      const bytes = readFileSync(urlToFile(src));
      assert.ok(bytes.subarray(0, 8).equals(PNG_SIGNATURE), `${src} is not a PNG`);
      assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, sizes, type);
    }
  });
});

describe('HTML PWA wiring', () => {
  for (const page of ['index.html', 'play.html']) {
    test(`${page} links the manifest and registers the service worker`, () => {
      const html = read(page);
      assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest"/);
      assert.match(html, /<meta name="theme-color" content="#[0-9a-f]{6}"/);
      assert.match(html, /<script src="\/register-sw\.js"><\/script>/);
    });
  }

  test('register-sw.js registers /sw.js on load', () => {
    const source = read('register-sw.js');
    assert.match(source, /serviceWorker\.register\('\/sw\.js'\)/);
    assert.match(source, /addEventListener\('load'/);
  });
});
