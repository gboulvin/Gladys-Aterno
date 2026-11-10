import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  isConfigured,
  normalizeConfig,
  normalizeHost,
  normalizeMac,
  sameConnection,
} from '../src/config.js';

test('an empty config gets the defaults and is not usable yet', () => {
  const config = normalizeConfig();
  assert.deepEqual(config, DEFAULT_CONFIG);
  assert.equal(isConfigured(config), false);
});

test('the MAC address is accepted however it is typed', () => {
  assert.equal(normalizeMac('00:1a:25:ab:cd:ef'), '001A25ABCDEF');
  assert.equal(normalizeMac('00-1A-25-AB-CD-EF'), '001A25ABCDEF');
  assert.equal(normalizeMac(' 001a25abcdef '), '001A25ABCDEF');
  assert.equal(normalizeMac('001A25'), '');
  assert.equal(normalizeMac(undefined), '');
});

test('the local address is reduced to a host', () => {
  assert.equal(normalizeHost('192.168.1.50'), '192.168.1.50');
  assert.equal(normalizeHost(' https://192.168.1.50:443/ '), '192.168.1.50');
  assert.equal(normalizeHost('Box.Local'), 'box.local');
  assert.equal(normalizeHost('not a host'), '');
  assert.equal(normalizeHost(''), '');
});

test('values are typed and bounded', () => {
  const config = normalizeConfig({
    mac: '00:1a:25:ab:cd:ef',
    password: 'pw',
    host: '192.168.1.50',
    poll_frequency: '5',
    language: 'it',
    mediation_host: '',
    GLADYS_PREFER_LOCAL: false,
  });
  assert.equal(config.mac, '001A25ABCDEF');
  assert.equal(config.poll_frequency, 60);
  assert.equal(config.language, DEFAULT_CONFIG.language);
  assert.equal(config.mediation_host, DEFAULT_CONFIG.mediation_host);
  assert.equal(config.GLADYS_PREFER_LOCAL, false);
  assert.equal(isConfigured(config), true);
  assert.equal(normalizeConfig({ poll_frequency: 'abc' }).poll_frequency, 300);
  assert.equal(normalizeConfig({ poll_frequency: 99999 }).poll_frequency, 3600);
});

test('only what changes the connection restarts it', () => {
  const base = normalizeConfig({ mac: '001A25ABCDEF', password: 'pw' });
  assert.ok(sameConnection(base, { ...base, language: 'de', poll_frequency: 600 }));
  assert.ok(!sameConnection(base, { ...base, password: 'other' }));
  assert.ok(!sameConnection(base, { ...base, host: '192.168.1.50' }));
  assert.ok(!sameConnection(base, { ...base, GLADYS_PREFER_LOCAL: false }));
});
