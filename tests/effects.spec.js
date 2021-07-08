import test from 'ava';
import { conclude, inProgress, getResult } from '../src/conclude.js';
import { cps, cps_no_cancel, call } from '../src/effects.js';

test('cps', async t => {
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

  t.true(inProgress(it));
  await promise;
  t.false(inProgress(it));

  t.deepEqual(r, { error: null, result: 142 });
});

test('call', async t => {
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

  t.true(inProgress(it));
  await promise;
  t.false(inProgress(it));

  t.deepEqual(r, { error: null, result: 142 });
});

test('cps_no_cancel', async t => {
  let r = null;
  let promise;

  function plus42(n, callback) {
    promise = Promise.resolve(n + 42).then(r => callback(null, r));
  }

  const it = cps_no_cancel(plus42, 100);
  conclude(it, (error, result) => r = { error, result });

  t.true(inProgress(it));
  await promise;
  t.false(inProgress(it));

  t.deepEqual(r, { error: null, result: 142 });
});

test('cps_no_cancel, cancelling', async t => {
  let r = null;
  let promise;

  function plus42(n, callback) {
    promise = Promise.resolve(n + 42).then(r => callback(null, r));
  }

  const it = cps_no_cancel(plus42, 100);
  const cancel = conclude(it, (error, result) => r = { error, result });

  t.true(inProgress(it));
  cancel();
  t.false(inProgress(it));

  await promise;

  t.is(r, null);
  t.deepEqual(getResult(it), { cancelled: true });
});

test.cb('call, throwing', t => {
  const boom = () => { throw 'BOOM'; }

  function* g() {
    try {
      yield call(boom);
    }
    catch (err) {
      t.is(err, 'BOOM');
    }
  }
  conclude(g(), t.end);
});
