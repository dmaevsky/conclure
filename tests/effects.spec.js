import test from 'ava';
import { conclude, inProgress } from '../src/conclude';
import { cps, call } from '../src/effects';

test('cps', async t => {
  let r = null;
  let promise;

  function plus42(n, callback) {
    return conclude(promise = Promise.resolve(n + 42), callback);
  }

  function* run(input) {
    return yield cps(plus42, input);
  }

  const it = run(100);
  conclude(it, (error, result) => r = { error, result });

  t.true(inProgress(it));
  t.truthy(promise);

  await promise;

  t.false(inProgress(it));
  t.deepEqual(r, { error: null, result: 142});
});

test('call', async t => {
  let r = null;
  let promise;

  function plus42(n) {
    return promise = Promise.resolve(n + 42);
  }

  function* run(input) {
    return yield call(plus42, input);
  }

  const it = run(100);
  conclude(it, (error, result) => r = { error, result });

  t.true(inProgress(it));
  t.truthy(promise);

  await promise;

  t.false(inProgress(it));
  t.deepEqual(r, { error: null, result: 142});
});
