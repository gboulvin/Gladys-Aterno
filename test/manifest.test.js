// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { ACTION, createApp } from '../src/app.js';
import { DEFAULT_CONFIG, LANGUAGES } from '../src/config.js';
import { FAULTS, MODE } from '../src/radiators.js';
import { SCENE_ACTIONS, SCENE_TRIGGER_KEYS } from '../src/scenes.js';
import { WIDGETS } from '../src/widgets.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest can declare (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

// Manifest fields older Gladys releases reject as unknown, with the first
// release accepting them. The store validator refuses a manifest whose
// `gladys_version` minimum is lower: these tests catch it before a release.
const CAPABILITY_FIELDS = ['scene_triggers', 'scene_actions', 'widgets'];
const CAPABILITY_MIN_GLADYS_VERSION = [5, 1, 0];
const LATER_FIELDS = ['keywords', 'countries'];
const LATER_MIN_GLADYS_VERSION = [5, 3, 0];

const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const optionValues = (field) => field.options.map((option) => option.value);
const find = (list, key) => list.find((entry) => entry.key === key);

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

function isAtLeast(version, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (version[i] !== required[i]) {
      return version[i] > required[i];
    }
  }
  return true;
}

test('every manifest action has a registered handler, and vice versa', async () => {
  const gladys = createFakeGladys();
  createApp(gladys);
  const declared = keysOf(manifest.actions);
  assert.deepEqual([...declared].sort(), Object.values(ACTION).sort());
  for (const key of declared) {
    // An action without handler is acked as failed by the SDK.
    const ack = await gladys.fake.action(key);
    assert.equal(ack.success, true, `manifest action "${key}": ${ack.error}`);
  }
});

test('the manifest fields require the Gladys version it declares', () => {
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  assert.ok(CAPABILITY_FIELDS.every((field) => manifest[field] !== undefined));
  assert.ok(
    isAtLeast(minGladysVersion(), CAPABILITY_MIN_GLADYS_VERSION),
    `scene and widget fields require gladys_version >= 5.1.0, got "${manifest.gladys_version}"`,
  );
  if (LATER_FIELDS.some((field) => manifest[field] !== undefined)) {
    assert.ok(
      isAtLeast(minGladysVersion(), LATER_MIN_GLADYS_VERSION),
      `keywords and countries require gladys_version >= 5.3.0`,
    );
  }
});

test('both transports are declared: Gladys shows its "prefer local" toggle', () => {
  assert.deepEqual(manifest.transports, ['local', 'cloud']);
  // The reserved key is Gladys' own: never in the schema.
  assert.ok(!keysOf(manifest.config_schema).includes('GLADYS_PREFER_LOCAL'));
});

test('every scene_actions key has an onSceneAction handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_actions).sort(), Object.keys(SCENE_ACTIONS).sort());
});

test('every widgets key has a content and an action handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.widgets).sort(), Object.keys(WIDGETS).sort());
  for (const widget of Object.values(WIDGETS)) {
    assert.equal(typeof widget.get, 'function');
    assert.equal(typeof widget.action, 'function');
  }
});

test('every scene trigger the code fires is declared in scene_triggers, and vice versa', () => {
  // An undeclared key is a 404 on publishSceneEvent; a declared key nobody
  // fires is a dead card in the scene editor.
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), [...SCENE_TRIGGER_KEYS].sort());
});

test('the choices offered in the scene editor are the values the code uses', () => {
  const modes = Object.values(MODE).sort();
  const trigger = (key) => find(manifest.scene_triggers, key);
  const action = (key) => find(manifest.scene_actions, key);

  assert.deepEqual(
    optionValues(find(trigger('radiator_mode_changed').fields, 'mode')).sort(),
    modes,
  );
  assert.deepEqual(optionValues(find(action('set_mode').fields, 'mode')).sort(), modes);
  assert.deepEqual(
    optionValues(find(trigger('radiator_fault').fields, 'fault')).sort(),
    [...FAULTS].sort(),
  );
  assert.deepEqual(optionValues(find(trigger('connection_changed').fields, 'status')).sort(), [
    'cloud',
    'local',
    'unreachable',
  ]);
  assert.deepEqual(optionValues(find(action('set_boost').fields, 'state')), ['on', 'off']);
});

test('a required scene action field always has a default', () => {
  // Adding a required field without default breaks the scenes already using
  // the action: keep the rule from day one.
  for (const action of manifest.scene_actions) {
    for (const field of action.fields ?? []) {
      if (field.required) {
        assert.notEqual(field.default, undefined, `${action.key}.${field.key} needs a default`);
      }
    }
  }
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.type === 'section') {
      continue;
    }
    assert.ok(field.key in DEFAULT_CONFIG, `DEFAULT_CONFIG.${field.key} is missing`);
    if (field.default !== undefined) {
      assert.equal(
        DEFAULT_CONFIG[field.key],
        field.default,
        `DEFAULT_CONFIG.${field.key} must match the manifest default`,
      );
    }
  }
  assert.deepEqual(optionValues(find(manifest.config_schema, 'language')), LANGUAGES);
});

test('the password is a secret: never sent back to the browser, no default', () => {
  const password = find(manifest.config_schema, 'password');
  assert.equal(password.type, 'secret');
  assert.equal(password.default, undefined);
  assert.equal(password.required, true);
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((f) => f.type === 'section');
  assert.ok(sections.length > 0);
  for (const section of sections) {
    // A section stores NO value: declaring `required`, `default` or
    // `placeholder` on it rejects the manifest.
    assert.equal(section.required, undefined, `section "${section.key}" must not be required`);
    assert.equal(section.default, undefined, `section "${section.key}" must not have a default`);
    assert.equal(section.placeholder, undefined);
    assert.ok(!(section.key in DEFAULT_CONFIG));
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('dynamic selects declare a source and no static options', () => {
  const dynamicSelects = allFields.filter((f) => f.source !== undefined);
  assert.ok(dynamicSelects.length > 0);
  for (const field of dynamicSelects) {
    assert.equal(field.source, 'devices');
    assert.equal(
      field.options,
      undefined,
      `field "${field.key}": declaring source and options together rejects the manifest`,
    );
    assert.equal(field.default, undefined, `field "${field.key}": no default with a source`);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  // The Release workflow writes all three: a mismatch means one was edited by
  // hand, and Gladys would offer a version whose image is another one.
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.ok(
    manifest.docker_image.endsWith(`:${manifest.version}`),
    `docker_image must be tagged :${manifest.version}, got "${manifest.docker_image}"`,
  );
  // ghcr.io image names are lowercase, whatever the case of the repository.
  assert.equal(manifest.docker_image, manifest.docker_image.toLowerCase());
});

test('the store limits on names and descriptions are respected', () => {
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${lang} has ${text.length} characters (10 to 100 allowed)`,
    );
  }
  for (const widget of manifest.widgets) {
    for (const [lang, text] of Object.entries(widget.label)) {
      assert.ok(text.length >= 3 && text.length <= 30, `widget ${widget.key} label.${lang}`);
    }
    for (const [lang, text] of Object.entries(widget.description)) {
      assert.ok(text.length <= 100, `widget ${widget.key} description.${lang}: ${text.length}`);
    }
  }
});
