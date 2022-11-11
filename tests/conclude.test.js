import test from 'node:test';
import assert from 'node:assert/strict';

import { conclude, finished, inProgress, getResult, whenFinished } from '../src/conclude.js';

test('conclude generator sync', () => {
  let r = null;

  function* g() {
    yield 88;
    return 42;
  }

  const it = g();
  conclude(it, (error, result) => r = { error, result });

  assert(!inProgress(it));
  assert(finished(it));

  assert.deepEqual(r, { error: null, result: 42 });
});

test('throwing sync', () => new Promise(resolve => {
  function* boom() {
    throw 'BOOM';
  }

  function* g() {
    try {
      yield boom();
    }
    catch (err) {
      assert.equal(err, 'BOOM');
    }
  }
  conclude(g(), resolve);
}));

test('simultaneous conclude', async () => {
  let r1 = null, r2 = null;
  const promise = Promise.resolve();

  function* g() {
    yield promise;
    return 42;
  }

  const it = g();

  conclude(it, (error, result) => r1 = { error, result });
  conclude(it, (error, result) => r2 = { error, result });

  assert.equal(r1, null);
  assert.equal(r2, null);

  assert(inProgress(it));

  await promise;

  assert(finished(it));
  assert.deepEqual(r1, { error: null, result: 42 });
  assert.deepEqual(r2, { error: null, result: 42 });
});

test('simultaneous conclude, throwing', async () => {
  let r1 = null, r2 = null;
  const promise = Promise.resolve();

  function* g() {
    yield promise;
    throw new Error('BOOM!');
  }

  const it = g();

  conclude(it, (error, result) => r1 = { error, result });
  conclude(it, (error, result) => r2 = { error, result });

  assert.equal(r1, null);
  assert.equal(r2, null);

  assert(inProgress(it));

  await promise;

  assert(finished(it));
  assert.equal(r1.error.message, 'BOOM!');
  assert.equal(r2.error.message, 'BOOM!');
});

test('simultaneous conclude, cancelling', async () => {
  let r1 = null, r2 = null, isCancelled = false;
  const promise = Promise.resolve();

  function* g() {
    yield promise;
    return 42;
  }

  const it = g();
  whenFinished(it, ({ cancelled }) => isCancelled = Boolean(cancelled));

  assert(!inProgress(it));

  const [cancel1, cancel2] = [
    conclude(it, (error, result) => r1 = { error, result }),
    conclude(it, (error, result) => r2 = { error, result })
  ];

  assert.equal(r1, null);
  assert.equal(r2, null);
  assert(!isCancelled);

  assert(inProgress(it));

  cancel1();
  cancel2();

  assert(isCancelled);
  assert(finished(it));

  await promise;

  assert.equal(r1, null);
  assert.equal(r2, null);
});

test('simultaneous conclude, cancelling one', async () => {
  let r1 = null, r2 = null, isCancelled = false;
  const promise = Promise.resolve();

  function* g() {
    yield promise;
    return 42;
  }

  const it = g();
  whenFinished(it, ({ cancelled }) => isCancelled = Boolean(cancelled));

  assert(!inProgress(it));

  const [cancel1] = [
    conclude(it, (error, result) => r1 = { error, result }),
    conclude(it, (error, result) => r2 = { error, result })
  ];

  assert.equal(r1, null);
  assert.equal(r2, null);
  assert(!isCancelled);

  assert(inProgress(it));

  cancel1();

  await promise;

  assert(!inProgress(it));
  assert(finished(it));

  assert(!isCancelled);
  assert.equal(r1, null);
  assert.deepEqual(r2, { error: null, result: 42 });
});

test('yielding a rejected promise', async () => {
  let r = null;
  const promise = Promise.reject(new Error('OOPS'));

  function* g() {
    yield promise;
    return 42;
  }

  const it = g();

  assert(!inProgress(it));

  conclude(it, (error, result) => r = { error, result });

  assert.equal(r, null);
  assert(inProgress(it));

  await promise.catch(e => e);

  assert(!inProgress(it));
  assert(finished(it));

  assert.equal(r.error.message, 'OOPS');
});

test('returning a rejected promise and cancelling', async () => {
  let r = null;
  const promise = Promise.reject(new Error('OOPS'));

  function* g() {
    return promise;
  }

  const it = g();

  assert(!inProgress(it));

  const cancel = conclude(it, (error, result) => r = { error, result });

  assert(inProgress(it));
  cancel();
  assert(finished(it));

  await promise.catch(e => e);

  assert.deepEqual(getResult(it), { cancelled: true });
});

test('sync self cancellation while generator is running', async () => {
  let r = null;
  let cancel;
  const promise = Promise.resolve().then(() => cancel);

  function* g() {
    const selfCancel = yield promise;
    selfCancel();
    return 42;
  }

  const it = g();

  assert(!inProgress(it));

  cancel = conclude(it, (error, result) => r = { error, result });

  assert(inProgress(it));
  await promise;
  assert(finished(it));

  assert.deepEqual(getResult(it), { cancelled: true });
});
