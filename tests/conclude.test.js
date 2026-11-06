import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { conclude, finished, inProgress, getResult, whenFinished } from '../src/conclude.js';

describe('conclude', () => {
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

  test('thenables are concluded as promises', async () => {
    let r = null;
    const thenable = { then: (resolve) => resolve(42) };

    function* g() {
      return (yield thenable) + 1;
    }

    conclude(g(), (error, result) => r = { error, result });

    await Promise.resolve();
    assert.deepEqual(r, { error: null, result: 43 });
  });

  test('a throwing callback is called only once (promise)', async () => {
    const calls = [];
    const promise = Promise.resolve(42);

    // Spy on the promise returned by `then` to observe where the callback's exception goes
    let surfaced;
    const then = promise.then.bind(promise);
    promise.then = (...handlers) => {
      const derived = then(...handlers);
      derived.catch(e => surfaced = e);
      return derived;
    };

    conclude(promise, (error, result) => {
      calls.push({ error, result });
      throw 'BOOM';
    });

    await promise;
    await Promise.resolve();

    // The exception is not fed back to the callback as an error: it rejects the derived promise instead
    assert.deepEqual(calls, [{ error: null, result: 42 }]);
    assert.equal(surfaced, 'BOOM');
  });

  test('a throwing callback is called only once and the exception propagates (sync iterator)', () => {
    const calls = [];

    function* g() {
      yield 1;
      return 42;
    }

    assert.throws(() => conclude(g(), (error, result) => {
      calls.push({ error, result });
      throw 'BOOM';
    }), err => err === 'BOOM');

    assert.deepEqual(calls, [{ error: null, result: 42 }]);
  });

  test('concluding a cancelled flow never calls the callback', async () => {
    const promise = Promise.resolve(42);

    function* g() {
      return yield promise;
    }

    const it = g();
    const cancel = conclude(it, () => assert.fail('Flow is NOT cancelled'));
    cancel();

    assert.deepEqual(getResult(it), { cancelled: true });

    let called = false;
    const cancelAgain = conclude(it, () => called = true);
    cancelAgain();

    await promise;
    assert(!called);
    assert(!inProgress(it));
  });

  test('an object that is both an iterator and a thenable is concluded as an iterator', () => {
    let r = null;

    function* g() {
      return 42;
    }

    const it = Object.assign(g(), { then: () => assert.fail('Concluded as a promise') });
    conclude(it, (error, result) => r = { error, result });

    assert.deepEqual(r, { error: null, result: 42 });
  });

  test('long synchronous runs do not grow the stack', () => {
    let r = null;
    const N = 100000;

    function* child(i) {
      return i;
    }

    function* g() {
      let sum = 0;
      for (let i = 0; i < N; i++) sum += yield i;      // plain values
      for (let i = 0; i < N; i++) sum += yield child(1); // synchronous child flows
      return sum;
    }

    conclude(g(), (error, result) => r = { error, result });
    assert.deepEqual(r, { error: null, result: N * (N - 1) / 2 + N });
  });

  test('synchronous errors are delivered through the trampoline', () => {
    let r = null;

    function* boom() {
      throw 'BOOM';
    }

    function* g() {
      let caught = 0;
      for (let i = 0; i < 1000; i++) {
        try {
          yield boom();
        }
        catch (err) {
          if (err === 'BOOM') caught++;
        }
      }
      return caught;
    }

    conclude(g(), (error, result) => r = { error, result });
    assert.deepEqual(r, { error: null, result: 1000 });
  });

  test('cancelling after synchronous steps cancels the pending async step', async () => {
    const promise = Promise.resolve(42);
    let pendingState;

    function* g() {
      for (let i = 0; i < 1000; i++) yield i;
      yield promise;
      assert.fail('Flow is NOT cancelled');
    }

    whenFinished(promise, state => pendingState = state);

    const it = g();
    const cancel = conclude(it, () => assert.fail('Flow is NOT cancelled'));

    assert(inProgress(it));
    cancel();

    assert.deepEqual(getResult(it), { cancelled: true });
    assert.deepEqual(pendingState, { cancelled: true });
    await promise;
  });

  // The parent is cancelled from inside a child flow, synchronously, while the parent is still busy
  // concluding that child (i.e. inside conclude(child), before it returns the child's cancellation).
  // At that moment the parent's cancel function is only the step's temporary flag, so the runner must notice
  // the flag after conclude(child) returns and unsubscribe from the child. Otherwise the child keeps running
  // and, once it concludes, resumes the cancelled parent.
  test('a child flow cancelling its parent synchronously gets cancelled too', async () => {
    let cancelRoot, childState;
    const promise = Promise.resolve();

    function* child() {
      cancelRoot(); // runs synchronously inside the parent's conclude(child)
      yield promise; // keeps the child running asynchronously, so it is still there to be cancelled
      return 42;
    }

    function* parent() {
      // Defer the rest of the parent, so that conclude() below has returned and cancelRoot is assigned
      // by the time the child calls it
      yield Promise.resolve();

      const it = child();
      whenFinished(it, state => childState = state);
      yield it;

      // If the bug is back, this throws inside the generator: the runner records it as the parent's outcome,
      // overwriting { cancelled: true }, which the getResult assertion below then catches.
      // The assertion alone would not fail the test, because the root callback has already been unsubscribed.
      assert.fail('Cancelled parent resumed');
    }

    const it = parent();
    cancelRoot = conclude(it, () => assert.fail('Flow is NOT cancelled'));

    // Microtask order:
    // 1. The parent's handler on its first promise was registered before this await, so it runs first:
    //    the parent resumes, the child cancels the root, and the runner should cancel the child.
    await promise;
    // 2. The child only subscribed to `promise` during step 1, after the await above, so its handler runs now.
    //    With the bug, the child would conclude here and resume the cancelled parent.
    //    Not needed for the passing case: it gives a regression time to show up in both assertions.
    await promise;

    assert.deepEqual(getResult(it), { cancelled: true });
    assert.deepEqual(childState, { cancelled: true });
  });
});
