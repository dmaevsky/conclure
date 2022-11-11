import test from 'node:test';
import assert from 'node:assert/strict';

import { conclude, inProgress, getResult, whenFinished } from '../src/conclude.js';
import { delay, call } from '../src/effects.js';
import * as Conclude from '../src/combinators.js';

test('all', async () => {
  let r = null;
  const promise = Promise.resolve();

  function* processItem(item) {
    yield promise;
    return item.toUpperCase();
  }

  function* run(data) {
    return Conclude.all(data.map(processItem));
  }

  const flow = run(['foo', 'bar', 'baz']);
  conclude(flow, (error, result) => r = { error, result });

  assert(inProgress(flow));
  await promise;
  assert(!inProgress(flow));

  assert.deepEqual(r, { error: null, result: ['FOO', 'BAR', 'BAZ']});
});

test('all with the same flow twice', async () => {
  const promise = Promise.resolve(42);
  let result;

  conclude(Conclude.all([promise, promise]), (_, r) => result = r);

  await promise;
  assert.deepEqual(result, [42, 42]);
});

test('race', async () => {
  const promise = Promise.resolve(42);

  const flow = Conclude.race({
    slow: delay(1000),
    fast: promise
  });

  conclude(flow, e => e);

  assert(inProgress(flow));
  await promise;
  assert(!inProgress(flow));

  assert.deepEqual(getResult(flow).result, { fast: 42 });
});

test('allSettled', () => new Promise(resolve => {
  function* g() {
    const results = yield Conclude.allSettled([
      Promise.resolve(42),
      Promise.reject('OOPS')
    ]);

    assert.deepEqual(results, [
      { result: 42 },
      { error: 'OOPS' }
    ]);
  }
  conclude(g(), resolve);
}));

test('any', () => new Promise(resolve => {
  function* g() {
    const result = yield Conclude.any([
      Promise.resolve(42),
      Promise.reject('OOPS')
    ]);

    assert.equal(result, 42);
  }
  conclude(g(), resolve);
}));

test('all throwing sync', () => new Promise(resolve => {
  const boom = () => { throw 'BOOM'; }

  function* g() {
    try {
      yield Conclude.all({
        sync: call(boom),
        async: Promise.reject('I will be cancelled anyway')
      });
    }
    catch (err) {
      assert.deepEqual(err, { sync: 'BOOM' });
    }
  }
  conclude(g(), resolve);
}));

test('all, cancelling before completion', () => new Promise(resolve => {
  const promises = [
    Promise.resolve(42),
    Promise.reject('boom')
  ];

  function* g() {
    yield 5;
    yield Conclude.all(promises);
  }

  const cancel = conclude(g(), () => assert.fail('Flow is NOT cancelled'));

  let count = 2;

  whenFinished(promises[0], ({ cancelled }) => cancelled && --count === 0 && resolve());
  whenFinished(promises[1], ({ cancelled }) => cancelled && --count === 0 && resolve());

  cancel();
}));

test('combinator tag', () => {
  for (let pattern in Conclude) {
    const effect = Conclude[pattern]([Promise.resolve()]);
    assert.equal(effect.fn.combinator, pattern);
  }
});
