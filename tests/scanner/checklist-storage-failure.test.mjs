import { test } from 'node:test';
import assert from 'node:assert/strict';
let instance = 0;
async function setup(t) {
  const previous = globalThis.window;
  const data = new Map();
  const state = { failWrite: false, failRead: false, events: 0 };
  const events = new EventTarget();
  globalThis.window = {
    localStorage: {
      getItem(key) { if (state.failRead) throw Error('read denied'); return data.get(key) ?? null; },
      setItem(key, value) { if (state.failWrite) throw Error('quota'); data.set(key, value); },
      removeItem(key) { if (state.failWrite) throw Error('remove denied'); data.delete(key); },
    },
    dispatchEvent(e) { state.events++; return events.dispatchEvent(e); },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  };
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  const store = await import('../../lib/checklistStorage.js?case=' + (++instance));
  data.set(store.storageKey('Jungle'), JSON.stringify(['old']));
  return {store, data, state};
}
test('readable stale storage cannot replace failed-write session progress', async t => {
  const {store, data, state} = await setup(t);
  state.failWrite = true;
  assert.equal(store.toggleOwned('Jungle', 'new'), false);
  assert.deepEqual(store.readOwned('Jungle'), ['old', 'new']);
  const snapshot = store.readOwned('Jungle');
  assert.strictEqual(store.readOwned('Jungle'), snapshot);
  assert.ok(Object.isFrozen(snapshot));
  assert.equal(store.toggleOwned('Jungle', 'old'), false);
  assert.deepEqual(store.readOwned('Jungle'), ['new']);
  assert.equal(data.get(store.storageKey('Jungle')), '["old"]');
  assert.deepEqual(store.readOwned('Neo Destiny'), []);
});
test('failed reset stays empty for the session even when stale storage remains readable', async t => {
  const {store, state} = await setup(t);
  state.failWrite = true;
  assert.equal(store.clearOwned('Jungle'), false);
  assert.deepEqual(store.readOwned('Jungle'), []);
  assert.equal(store.toggleOwned('Jungle', 'new'), false);
  assert.deepEqual(store.readOwned('Jungle'), ['new']);
});
test('successful retry persists the whole session snapshot then resumes external updates', async t => {
  const {store, state, data} = await setup(t);
  state.failWrite = true;
  store.toggleOwned('Jungle', 'new');
  state.failWrite = false;
  assert.equal(store.toggleOwned('Jungle', 'third'), true);
  assert.deepEqual(JSON.parse(data.get(store.storageKey('Jungle'))), ['old', 'new', 'third']);
  data.set(store.storageKey('Jungle'), '["other-tab"]');
  assert.deepEqual(store.readOwned('Jungle'), ['other-tab']);
  assert.equal(store.clearOwned('Jungle'), true);
  assert.equal(data.has(store.storageKey('Jungle')), false);
  assert.deepEqual(store.readOwned('Jungle'), []);
});
test('denied reads and writes retain session changes and notify subscribers', async t => {
  const {store, state} = await setup(t);
  state.failRead = state.failWrite = true;
  let notifications = 0;
  const unsubscribe = store.subscribeChecklist(() => notifications++);
  assert.equal(store.toggleOwned('Jungle', 'new'), false);
  assert.deepEqual(store.readOwned('Jungle'), ['new']);
  assert.equal(notifications, 1);
  unsubscribe();
  store.clearOwned('Jungle');
  assert.equal(notifications, 1);
  assert.deepEqual(store.getServerSnapshot(), []);
});
