// -----------------------------------------------------------------------------
// Internationalization: everything the user reads exists in English, French,
// German and Spanish — the manifest, the runtime texts and the documentation.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES } from '../src/config.js';
import { MESSAGE_KEYS, t, tl } from '../src/i18n.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const TEXT_KEYS = new Set(['label', 'description', 'placeholder']);

// Every multi-language text of the manifest, with its path.
function collectTexts(node, path = 'manifest', texts = []) {
  if (Array.isArray(node)) {
    node.forEach((child, index) => collectTexts(child, `${path}[${index}]`, texts));
  } else if (node && typeof node === 'object') {
    for (const [key, child] of Object.entries(node)) {
      if (TEXT_KEYS.has(key)) {
        texts.push({ path: `${path}.${key}`, text: child });
      } else {
        collectTexts(child, `${path}.${key}`, texts);
      }
    }
  }
  return texts;
}

test('the four languages are English, French, German and Spanish', () => {
  assert.deepEqual(LANGUAGES, ['en', 'fr', 'de', 'es']);
});

test('every manifest text is written in the four languages', () => {
  const texts = collectTexts(manifest);
  assert.ok(texts.length > 50, 'the manifest texts were found');
  for (const { path, text } of texts) {
    // A plain string instead of a multi-language object rejects the manifest.
    assert.equal(typeof text, 'object', `${path} must be a multi-language object`);
    assert.deepEqual(Object.keys(text), LANGUAGES, path);
    for (const language of LANGUAGES) {
      assert.ok(text[language].trim().length > 0, `${path}.${language} is empty`);
    }
  }
});

test('every runtime message is written in the four languages', () => {
  assert.ok(MESSAGE_KEYS.length > 50);
  for (const key of MESSAGE_KEYS) {
    const text = t(key);
    assert.deepEqual(Object.keys(text), LANGUAGES, key);
    const placeholders = (value) => (value.match(/\{\w+\}/g) ?? []).sort();
    for (const language of LANGUAGES) {
      assert.ok(text[language].trim().length > 0, `${key}.${language} is empty`);
      // A translation that drops a placeholder silently loses a value.
      assert.deepEqual(placeholders(text[language]), placeholders(text.en), `${key}.${language}`);
    }
  }
});

test('placeholders are filled, with translated values where they are texts', () => {
  const text = t('toast.mode', { count: 2, mode: t('mode.frost') });
  assert.equal(text.en, '2 radiator(s) set to: Frost protection.');
  assert.equal(text.fr, '2 radiateur(s) : Hors-gel.');
  assert.equal(text.de, '2 Heizkörper: Frostschutz.');
  assert.equal(text.es, '2 radiador(es): Antihielo.');
});

test('single-language texts fall back on English, unknown keys fail loudly', () => {
  assert.equal(tl('feature.frost', 'de'), 'Frostschutz');
  assert.equal(tl('feature.frost', 'it'), 'Frost protection');
  assert.throws(() => t('nope'), /Unknown message key/);
});

test('the user documentation exists in the four languages, with the same sections', async () => {
  const headings = {};
  for (const language of LANGUAGES) {
    const doc = await readFile(new URL(`../docs/${language}.md`, import.meta.url), 'utf8');
    // The store requires at least 300 characters for a documentation file.
    assert.ok(doc.length >= 300, `docs/${language}.md is too short`);
    headings[language] = doc.split('\n').filter((line) => /^#{1,3} /.test(line)).length;
  }
  for (const language of LANGUAGES) {
    assert.equal(headings[language], headings.en, `docs/${language}.md has other sections`);
  }
});
