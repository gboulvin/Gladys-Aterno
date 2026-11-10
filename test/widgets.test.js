import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeBox } from './helpers/fakeBox.js';
import { CONFIG, settle, startApp } from './helpers/app.js';

const keepAlive = setInterval(() => {}, 1000);
after(() => clearInterval(keepAlive));

const PREFIX = 'ext:test-integration:radiator:001a25abcdef';
const SALON = `${PREFIX}-1001-1001`;
const BATHROOM = `${PREFIX}-1002-1002`;

async function content(gladys, key, settings = {}) {
  const ack = await gladys.fake.widgetGet(key, { settings, language: 'fr', units: 'metric' });
  assert.equal(ack.success, true, ack.error);
  return ack.data.content;
}

const of = (widget, type) => widget.components.filter((component) => component.type === type);
const statusItem = (widget, label) =>
  of(widget, 'status')[0].items.find((item) => item.label.en === label);

// Every text of a content, wherever it sits: all four languages, or a plain value.
function assertFourLanguages(node, path = 'content') {
  if (Array.isArray(node)) {
    node.forEach((child, index) => assertFourLanguages(child, `${path}[${index}]`));
  } else if (node && typeof node === 'object') {
    if ('en' in node) {
      assert.deepEqual(Object.keys(node), ['en', 'fr', 'de', 'es'], path);
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      assertFourLanguages(child, `${path}.${key}`);
    }
  }
}

test('the overview is rendered exactly as sent, in four languages', async () => {
  const { gladys, stop } = await startApp();
  const widget = await content(gladys, 'aterno_overview');
  // [] = nothing the core would drop, truncate or trim to the content budget.
  assert.deepEqual(validateWidgetContent(widget), []);
  assertFourLanguages(widget);

  const [heating, average] = of(widget, 'value');
  assert.equal(heating.value, '2/2');
  assert.equal(average.value, 21.3); // (20.1 + 22.4) / 2, one decimal
  assert.equal(statusItem(widget, 'Connection').value.fr, 'Locale');
  assert.equal(statusItem(widget, 'Box').value, 'TYDOM1');
  assert.equal(statusItem(widget, 'Open windows').value, 0);
  assert.equal(of(widget, 'button').length, 4);
  stop();
});

test('the overview follows the radiators and the connection', async () => {
  const box = createFakeBox();
  box.reachable.local = false;
  const { gladys, stop } = await startApp({ box, preferredRetryDelay: 60_000 });
  box.push(box.radiators[0], { hvacMode: 'STOP', openingDetected: true, tempSensorDefect: true });
  await settle();

  const widget = await content(gladys, 'aterno_overview');
  assert.deepEqual(validateWidgetContent(widget), []);
  assert.equal(of(widget, 'value')[0].value, '1/2');
  const connection = statusItem(widget, 'Connection');
  assert.equal(connection.value.fr, 'Cloud (secours)');
  assert.equal(connection.color, 'warning');
  assert.equal(statusItem(widget, 'Open windows').color, 'warning');
  assert.equal(statusItem(widget, 'Faults').value, 1);
  assert.equal(statusItem(widget, 'Faults').color, 'danger');
  stop();
});

test('the overview buttons act on every radiator and answer a short toast', async () => {
  const { gladys, box, stop } = await startApp();
  const widget = await content(gladys, 'aterno_overview');
  const buttons = of(widget, 'button');
  assert.equal(new Set(buttons.map((button) => button.action.key)).size, buttons.length);
  // Stopping everything asks for a confirmation first.
  assert.equal(buttons.find((button) => button.action.key === 'all_off').action.confirm, true);

  for (const { action } of buttons) {
    const ack = await gladys.fake.widgetAction('aterno_overview', action.key, action.params, {});
    assert.equal(ack.success, true, `${action.key}: ${ack.error}`);
    assert.deepEqual(Object.keys(ack.data.message), ['en', 'fr', 'de', 'es']);
    assert.ok(Object.values(ack.data.message).every((text) => text.length <= 200));
  }
  const frost = await gladys.fake.widgetAction('aterno_overview', 'all_frost');
  assert.equal(frost.data.message.fr, '2 radiateur(s) : Hors-gel.');
  assert.deepEqual(
    box.radiators.map((radiator) => radiator.values.hvacMode),
    ['ANTI_FROST', 'ANTI_FROST'],
  );
  stop();
});

test('the radiator widget is valid for every radiator, with live temperature tiles', async () => {
  const { gladys, stop } = await startApp();
  const featureIds = new Set(
    gladys.fake.discoveredDevices.flatMap((device) => device.features.map((f) => f.external_id)),
  );
  for (const device of [SALON, BATHROOM]) {
    const widget = await content(gladys, 'aterno_radiator', { device });
    assert.deepEqual(validateWidgetContent(widget), []);
    assertFourLanguages(widget);
    const tiles = of(widget, 'value');
    assert.equal(tiles.length, 2);
    for (const tile of tiles) {
      assert.ok(featureIds.has(tile.device_feature), `unknown feature ${tile.device_feature}`);
    }
  }
  stop();
});

test('the radiator widget shows what the radiator has, and nothing else', async () => {
  const { gladys, box, stop } = await startApp();
  const salon = await content(gladys, 'aterno_radiator', { device: SALON });
  assert.equal(of(salon, 'text')[0].text, 'Radiateur salon');
  assert.equal(statusItem(salon, 'Mode').value.fr, 'En marche');
  assert.equal(statusItem(salon, 'Room').value, 'Salon');
  assert.equal(statusItem(salon, 'Window').value.fr, 'Fermée');
  assert.equal(statusItem(salon, 'Presence').value.fr, 'Oui');
  assert.equal(statusItem(salon, 'Boost'), undefined);
  assert.deepEqual(
    of(salon, 'button').map((button) => button.label.fr),
    ['Moins chaud', 'Plus chaud', 'Arrêter', 'Hors-gel'],
  );

  box.push(box.radiators[1], { boostOn: true, tempSensorDefect: true });
  await settle();
  const bathroom = await content(gladys, 'aterno_radiator', { device: BATHROOM });
  assert.deepEqual(validateWidgetContent(bathroom), []);
  assert.equal(statusItem(bathroom, 'Presence'), undefined);
  assert.equal(statusItem(bathroom, 'Boost').value.fr, 'Actif');
  assert.equal(statusItem(bathroom, 'Temperature sensor fault').color, 'danger');
  assert.equal(of(bathroom, 'button').at(-1).label.fr, 'Arrêter le boost');
  stop();
});

test('the radiator widget buttons do what they say', async () => {
  const { gladys, box, stop } = await startApp();
  const tap = async (labelFr) => {
    const widget = await content(gladys, 'aterno_radiator', { device: BATHROOM });
    const button = of(widget, 'button').find((b) => b.label.fr === labelFr);
    assert.ok(button, `no "${labelFr}" button`);
    const ack = await gladys.fake.widgetAction(
      'aterno_radiator',
      button.action.key,
      button.action.params,
      { settings: { device: BATHROOM } },
    );
    assert.equal(ack.success, true, ack.error);
    await settle();
    return ack.data.message;
  };
  const bathroom = box.radiators[1];

  assert.equal((await tap('Plus chaud')).fr, 'Température demandée : 21.5 °C.');
  assert.equal(bathroom.values.setpoint, 21.5);
  await tap('Moins chaud');
  await tap('Moins chaud');
  assert.equal(bathroom.values.setpoint, 20.5);

  assert.equal((await tap('Lancer le boost')).en, 'Boost started.');
  assert.equal(bathroom.values.boostOn, true);
  await tap('Arrêter le boost');
  assert.equal(bathroom.values.boostOn, false);

  await tap('Arrêter');
  assert.equal(bathroom.values.hvacMode, 'STOP');
  await tap('Mettre en marche');
  assert.equal(bathroom.values.hvacMode, 'NORMAL');
  stop();
});

test('the target temperature stays within the range of the radiator', async () => {
  const { gladys, box, stop } = await startApp();
  box.push(box.radiators[0], { setpoint: 30 });
  const ack = await gladys.fake.widgetAction('aterno_radiator', 'warmer', { device: SALON });
  assert.equal(ack.success, true);
  assert.equal(box.radiators[0].values.setpoint, 30);
  stop();
});

test('empty states: no radiator chosen, box not connected', async () => {
  const { gladys, stop } = await startApp();
  const unset = await content(gladys, 'aterno_radiator', {});
  assert.deepEqual(validateWidgetContent(unset), []);
  assert.match(of(unset, 'text')[0].text.fr, /Choisissez un radiateur/);
  const gone = await content(gladys, 'aterno_radiator', { device: `${PREFIX}-9-9` });
  assert.match(of(gone, 'text')[0].text.en, /Pick a radiator/);
  stop();

  const offline = await startApp({
    config: { ...CONFIG, password: 'wrong' },
    retryDelays: [60_000],
  });
  for (const key of ['aterno_overview', 'aterno_radiator']) {
    const widget = await content(offline.gladys, key, { device: SALON });
    assert.deepEqual(validateWidgetContent(widget), []);
    assertFourLanguages(widget);
    assert.match(of(widget, 'text')[0].text.fr, /pas connectée/);
    assert.equal(statusItem(widget, 'Connection').color, 'danger');
  }
  offline.stop();
});

test('an unknown action or radiator fails the tap with a reason', async () => {
  const { gladys, stop } = await startApp();
  const unknown = await gladys.fake.widgetAction('aterno_overview', 'self_destruct', {});
  assert.equal(unknown.success, false);
  const gone = await gladys.fake.widgetAction('aterno_radiator', 'warmer', {
    device: `${PREFIX}-9-9`,
  });
  assert.equal(gone.success, false);
  const noBoost = await gladys.fake.widgetAction('aterno_radiator', 'boost_start', {
    device: SALON,
  });
  assert.equal(noBoost.success, false);
  stop();
});

test('the widgets are nudged when something they show changes', async () => {
  const { gladys, box, stop } = await startApp();
  const before = gladys.fake.widgetRefreshes.length;
  box.push(box.radiators[0], { hvacMode: 'STOP' });
  await settle();
  const nudged = gladys.fake.widgetRefreshes.slice(before);
  assert.ok(nudged.includes('aterno_overview'));
  assert.ok(nudged.includes('aterno_radiator'));
  stop();
});
