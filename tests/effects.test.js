import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { conclude, inProgress, getResult } from '../src/conclude.js';
import { cps, cps_no_cancel, call } from '../src/effects.js';

describe('effects', () => {
  test('cps', async () => {
    let r = null;
    let promise;

    function plus42(n, callback) {
      return conclude(promise = Promise.resolve(n + 42), callback);
    }

    function* run(input) {
      return cps(plus42, input);
    }

    const it = run(100);
    conclude(it, (error, result) => r = { error, result });

    assert(inProgress(it));
    await promise;
    assert(!inProgress(it));

    assert.deepEqual(r, { error: null, result: 142 });
  });

  test('call', async () => {
    let r = null;
    let promise;

    function plus42(n) {
      return promise = Promise.resolve(n + 42);
    }

    function* run(input) {
      return call(plus42, input);
    }

    const it = run(100);
    conclude(it, (error, result) => r = { error, result });

    assert(inProgress(it));
    await promise;
    assert(!inProgress(it));

    assert.deepEqual(r, { error: null, result: 142 });
  });

  test('cps_no_cancel', async () => {
    let r = null;
    let promise;

    function plus42(n, callback) {
      promise = Promise.resolve(n + 42).then(r => callback(null, r));
    }

    const it = cps_no_cancel(plus42, 100);
    conclude(it, (error, result) => r = { error, result });

    assert(inProgress(it));
    await promise;
    assert(!inProgress(it));

    assert.deepEqual(r, { error: null, result: 142 });
  });

  test('cps_no_cancel, cancelling', async () => {
    let r = null;
    let promise;

    function plus42(n, callback) {
      promise = Promise.resolve(n + 42).then(r => callback(null, r));
    }

    const it = cps_no_cancel(plus42, 100);
    const cancel = conclude(it, (error, result) => r = { error, result });

    assert(inProgress(it));
    cancel();
    assert(!inProgress(it));

    await promise;

    assert.equal(r, null);
    assert.deepEqual(getResult(it), { cancelled: true });
  });

  test('call, throwing', () => new Promise(resolve => {
    const boom = () => { throw 'BOOM'; }

    function* g() {
      try {
        yield call(boom);
      }
      catch (err) {
        assert.equal(err, 'BOOM');
      }
    }
    conclude(g(), resolve);
  }));

  test('a throwing callback is called only once and the exception propagates (call, cps)', () => {
    const effects = {
      call: call(() => 42),
      cps: cps(callback => {
        callback(null, 42);
        return () => {};
      }),
      cps_no_cancel: cps_no_cancel(callback => callback(null, 42)),
    };

    for (const [name, effect] of Object.entries(effects)) {
      const calls = [];

      assert.throws(() => conclude(effect, (error, result) => {
        calls.push({ error, result });
        throw 'BOOM';
      }), err => err === 'BOOM', name);

      assert.deepEqual(calls, [{ error: null, result: 42 }], name);
    }
  });

  test('cps target throwing synchronously', () => {
    let r = null;
    const effect = cps(() => { throw 'BOOM'; });

    conclude(effect, (error, result) => r = { error, result });
    assert.deepEqual(r, { error: 'BOOM', result: undefined });
  });
});
