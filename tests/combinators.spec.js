import test from 'ava';
import { conclude, inProgress, getResult, whenFinished } from '../src/conclude.js';
import { delay, call } from '../src/effects.js';
import * as Conclude from '../src/combinators.js';

test('all', async t => {
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

  t.true(inProgress(flow));
  await promise;
  t.false(inProgress(flow));

  t.deepEqual(r, { error: null, result: ['FOO', 'BAR', 'BAZ']});
});

test('all with the same flow twice', async t => {
  const promise = Promise.resolve(42);
  let result;

  conclude(Conclude.all([promise, promise]), (_, r) => result = r);

  await promise;
  t.deepEqual(result, [42, 42]);
});

test('race', async t => {
  const promise = Promise.resolve(42);

  const flow = Conclude.race({
    slow: delay(1000),
    fast: promise
  });

  conclude(flow, e => e);

  t.true(inProgress(flow));
  await promise;
  t.false(inProgress(flow));

  t.deepEqual(getResult(flow).result, { fast: 42 });
});

test('allSettled', t => new Promise(resolve => {
  function* g() {
    const results = yield Conclude.allSettled([
      Promise.resolve(42),
      Promise.reject('OOPS')
    ]);

    t.deepEqual(results, [
      { result: 42 },
      { error: 'OOPS' }
    ]);
  }
  conclude(g(), resolve);
}));

test('any', t => new Promise(resolve => {
  function* g() {
    const result = yield Conclude.any([
      Promise.resolve(42),
      Promise.reject('OOPS')
    ]);

    t.is(result, 42);
  }
  conclude(g(), resolve);
}));

test('all throwing sync', t => new Promise(resolve => {
  const boom = () => { throw 'BOOM'; }

  function* g() {
    try {
      yield Conclude.all({
        sync: call(boom),
        async: Promise.reject('I will be cancelled anyway')
      });
    }
    catch (err) {
      t.deepEqual(err, { sync: 'BOOM' });
    }
  }
  conclude(g(), resolve);
}));

test('all, cancelling before completion', t => new Promise(resolve => {
  const promises = [
    Promise.resolve(42),
    Promise.reject('boom')
  ];

  function* g() {
    yield 5;
    yield Conclude.all(promises);
  }

  const cancel = conclude(g(), t.fail);

  let count = 2;

  whenFinished(promises[0], ({ cancelled }) => cancelled && --count === 0 && resolve());
  whenFinished(promises[1], ({ cancelled }) => cancelled && --count === 0 && resolve());

  cancel();
  t.pass('Ava requires at least one assertion in a test');
}));

test('combinator tag', t => {
  for (let pattern in Conclude) {
    const effect = Conclude[pattern]([Promise.resolve()]);
    t.is(effect.fn.combinator, pattern);
  }
});
