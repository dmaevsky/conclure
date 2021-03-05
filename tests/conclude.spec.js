import test from 'ava';
import { conclude, finished, inProgress, whenFinished } from '../src/conclude';

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
  t.false(inProgress(it));

  await promise;

  t.true(finished(it));

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
