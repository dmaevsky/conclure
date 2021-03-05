import test from 'ava';
import { conclude, inProgress, getResult } from '../src/conclude';
import { delay } from '../src/effects';
import * as Conclude from '../src/combinators';

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
