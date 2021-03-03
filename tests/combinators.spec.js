import test from 'ava';
import { conclude, inProgress } from '../src/conclude';
import { delay } from '../src/effects';
import * as Conclude from '../src/combinators';

test('conclude all', async t => {
  let r = null;
  const promise = Promise.resolve();

  function* processItem(item) {
    yield promise;
    return item.toUpperCase();
  }

  function* run(data) {
    return yield Conclude.all(data.map(processItem));
  }

  const it = run(['foo', 'bar', 'baz']);
  conclude(it, (error, result) => r = { error, result });

  t.true(inProgress(it));

  await promise;

  t.false(inProgress(it));
  t.deepEqual(r, { error: null, result: ['FOO', 'BAR', 'BAZ']});
});
