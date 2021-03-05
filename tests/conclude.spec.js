import test from 'ava';
import { conclude, finished, inProgress, whenFinished, getResult } from '../src/conclude';

test('conclude generator sync', t => {
  let r = null;

  function* g() {
    yield 88;
    return 42;
  }

  const it = g();
  conclude(it, (error, result) => r = { error, result });

  t.false(inProgress(it));
  t.true(finished(it));

  t.deepEqual(r, { error: null, result: 42 });
});

test('simultaneous conclude', async t => {
  let r1 = null, r2 = null;
  const promise = Promise.resolve();

  function* g() {
    yield promise;
    return 42;
  }

  const it = g();

  conclude(it, (error, result) => r1 = { error, result });
  conclude(it, (error, result) => r2 = { error, result });

  t.is(r1, null);
  t.is(r2, null);

  t.true(inProgress(it));

  await promise;

  t.true(finished(it));
  t.deepEqual(r1, { error: null, result: 42 });
  t.deepEqual(r2, { error: null, result: 42 });
});

test('simultaneous conclude, throwing', async t => {
  let r1 = null, r2 = null;
  const promise = Promise.resolve();

  function* g() {
    yield promise;
    throw new Error('BOOM!');
  }

  const it = g();

  conclude(it, (error, result) => r1 = { error, result });
  conclude(it, (error, result) => r2 = { error, result });

  t.is(r1, null);
  t.is(r2, null);

  t.true(inProgress(it));

  await promise;

  t.true(finished(it));
  t.is(r1.error.message, 'BOOM!');
  t.is(r2.error.message, 'BOOM!');
});

test('simultaneous conclude, cancelling', async t => {
  let r1 = null, r2 = null, isCancelled = false;
  const promise = Promise.resolve();

  function* g() {
    yield promise;
    return 42;
  }

  const it = g();
  whenFinished(it, ({ cancelled }) => isCancelled = Boolean(cancelled));

  t.false(inProgress(it));

  const [cancel1, cancel2] = [
    conclude(it, (error, result) => r1 = { error, result }),
    conclude(it, (error, result) => r2 = { error, result })
  ];

  t.is(r1, null);
  t.is(r2, null);
  t.false(isCancelled);

  t.true(inProgress(it));

  cancel1();
  cancel2();

  t.true(isCancelled);
  t.true(finished(it));

  await promise;

  t.is(r1, null);
  t.is(r2, null);
});

test('simultaneous conclude, cancelling one', async t => {
  let r1 = null, r2 = null, isCancelled = false;
  const promise = Promise.resolve();

  function* g() {
    yield promise;
    return 42;
  }

  const it = g();
  whenFinished(it, ({ cancelled }) => isCancelled = Boolean(cancelled));

  t.false(inProgress(it));

  const [cancel1] = [
    conclude(it, (error, result) => r1 = { error, result }),
    conclude(it, (error, result) => r2 = { error, result })
  ];

  t.is(r1, null);
  t.is(r2, null);
  t.false(isCancelled);

  t.true(inProgress(it));

  cancel1();

  await promise;

  t.false(inProgress(it));
  t.true(finished(it));

  t.false(isCancelled);
  t.is(r1, null);
  t.deepEqual(r2, { error: null, result: 42 });
});

test('yielding a rejected promise', async t => {
  let r = null;
  const promise = Promise.reject(new Error('OOPS'));

  function* g() {
    yield promise;
    return 42;
  }

  const it = g();

  t.false(inProgress(it));

  conclude(it, (error, result) => r = { error, result });

  t.is(r, null);
  t.true(inProgress(it));

  await promise.catch(e => e);

  t.false(inProgress(it));
  t.true(finished(it));

  t.is(r.error.message, 'OOPS');
});

test('returning a rejected promise and cancelling', async t => {
  let r = null;
  const promise = Promise.reject(new Error('OOPS'));

  function* g() {
    return promise;
  }

  const it = g();

  t.false(inProgress(it));

  const cancel = conclude(it, (error, result) => r = { error, result });

  t.true(inProgress(it));
  cancel();
  t.true(finished(it));

  await promise.catch(e => e);

  t.deepEqual(getResult(it), { cancelled: true });
});

test('sync self cancellation while generator is running', async t => {
  let r = null;
  let cancel;
  const promise = Promise.resolve().then(() => cancel);

  function* g() {
    const selfCancel = yield promise;
    selfCancel();
    return 42;
  }

  const it = g();

  t.false(inProgress(it));

  cancel = conclude(it, (error, result) => r = { error, result });

  t.true(inProgress(it));
  await promise;
  t.true(finished(it));

  t.deepEqual(getResult(it), { cancelled: true });
});
