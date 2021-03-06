import test from 'ava';
import { conclude, inProgress, getResult } from '../src/conclude';
import { delay, call } from '../src/effects';
import Conclude from '../src/combinators';

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

test.cb('allSettled', t => {
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
  conclude(g(), t.end);
});

test.cb('any', t => {
  function* g() {
    const result = yield Conclude.any([
      Promise.resolve(42),
      Promise.reject('OOPS')
    ]);

    t.is(result, 42);
  }
  conclude(g(), t.end);
});

test.cb('all throwing sync', t => {
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
  conclude(g(), t.end);
});
