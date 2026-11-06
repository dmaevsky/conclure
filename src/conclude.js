// Must match TYPE in effects.js. Duplicated on purpose so this file stays fully stand-alone.
const TYPE = '@@conclude-effect';

export function isIterator(obj) {
  return !!obj && (typeof obj === 'object' || typeof obj === 'function')
    && typeof obj.next === 'function'
    && typeof obj.throw === 'function';
}

// Any thenable counts as a promise
export function isPromise(obj) {
  return !!obj && (typeof obj === 'object' || typeof obj === 'function')
    && typeof obj.then === 'function';
}

export const isEffect = effect => Boolean(effect && effect[TYPE]);

// Returns the matching type predicate (truthy) or undefined. The predicate doubles as the key into `runners`.
// Order matters: an object that is both an iterator and a thenable is treated as an iterator.
export const isFlow = it => [isIterator, isPromise, isEffect].find(is => is(it));

const runners = new Map([
  [isIterator, runIterator],
  [isPromise, runPromise],
  [isEffect, runEffect],
]);

const noop = () => {};

// Flow state is stored intrusively on the flow object itself.
// Symbol.for (rather than module-local symbols or WeakMaps) lets several copies of conclure loaded in one realm share the state.
const running = Symbol.for('@@conclude-running');      // subscribe function, present while the flow runs
const resultCache = Symbol.for('@@conclude-result');   // { result, error } or { cancelled: true }, present once finished
const finishWatchers = Symbol.for('@@conclude-watchers'); // Set of whenFinished callbacks

export const inProgress = it => running in it;
export const finished = it => resultCache in it;
export const getResult = it => it[resultCache];

// Weak watcher: does not subscribe to the flow, so it neither starts it nor keeps it alive.
// Non-flow values are considered finished with themselves as the result.
export function whenFinished(it, callback) {
  if (!isFlow(it)) {
    callback({ result: it });
    return noop;
  }

  if (resultCache in it) {
    callback(it[resultCache]);
    return noop;
  }

  let watchers = it[finishWatchers];

  if (!watchers) watchers = it[finishWatchers] = new Set([callback]);
  else watchers.add(callback);

  return () => watchers.delete(callback);
}

// Records the final state and notifies the weak watchers.
// Called before the subscribers are notified, so watchers act like a `finally` block that runs before the parents resume.
function finalize(it, payload) {
  it[resultCache] = payload;
  delete it[running];

  for (let cb of it[finishWatchers] || []) cb(payload);
  delete it[finishWatchers];
}

export function conclude(it, callback) {
  const flowType = isFlow(it);

  // Plain values conclude as themselves, synchronously
  if (!flowType) {
    callback(null, it);
    return noop;
  }

  // Already finished: deliver the cached outcome synchronously.
  // By design, a cancelled flow never calls the callback: it is dead, and concluding it again is a no-op.
  if (resultCache in it) {
    const { result, error, cancelled } = it[resultCache];

    if (cancelled) return noop;

    if (error) callback(error);
    else callback(null, result);

    return noop;
  }

  // Already running: join the existing run instead of starting a new one
  if (running in it) {
    const subscribe = it[running];
    return subscribe(callback);
  }

  const subscribers = new Set();

  const onConclude = (error, result) => {
    finalize(it, { error, result });

    for (let cb of subscribers) cb(error, result);
  }

  // Reference-counted cancellation: the flow is cancelled only when its last subscriber unsubscribes
  function subscribe(cb) {
    subscribers.add(cb);

    return function unsubscribe() {
      subscribers.delete(cb);

      if (subscribers.size === 0 && !(resultCache in it)) {
        finalize(it, { cancelled: true });
        cancel();
      }
    }
  }

  it[running] = subscribe;

  const unsubscribe = subscribe(callback);

  // Note: the runner may conclude synchronously, before `cancel` is assigned.
  // That is safe: unsubscribe only calls `cancel` if the flow has not finished.
  const cancel = runners.get(flowType)(it, onConclude);

  return unsubscribe;
}

// Promises cannot be cancelled, so cancelling just ignores the outcome.
// Both handlers go into a single `then` call: with `.then(onResult).catch(onError)`,
// an exception thrown by the callback itself would be caught and delivered a second time as an error.
function runPromise(promise, callback) {
  let cancelled = false;

  promise.then(
    result => !cancelled && callback(null, result),
    error => !cancelled && callback(error)
  );

  return () => cancelled = true;
}

// Only exceptions thrown by `fn` itself are delivered to the callback as errors.
// An exception thrown by the callback (i.e. by whoever is downstream) is rethrown, otherwise the callback would be called twice.
function runEffect({ [TYPE]: type, context, fn, args }, callback) {
  let called = false;

  const once = cb => (error, result) => {
    called = true;
    cb(error, result);
  }

  try {
    switch (type) {
      case 'CPS':
        return fn.call(context, ...args, once(callback));

      case 'CPS_NO_CANCEL': {
        let cancelled = false;
        fn.call(context, ...args, once((error, result) => !cancelled && callback(error, result)));

        return () => cancelled = true;
      }

      case 'CALL': {
        const result = fn.apply(context, args);
        called = true; // fn has returned: anything thrown from now on comes from downstream
        return conclude(result, callback);
      }

      default:
        throw new Error('Unknown effect type ' + type);
    }
  }
  catch (error) {
    if (called) throw error;

    callback(error);
    return noop;
  }
}

// Conclure never calls `it.return()` on cancellation: it cancels the pending operation and stops iterating.
// Use whenFinished for cleanup instead of `finally`.
//
// Each step resumes the generator, then concludes the value it yielded with `iterate` as the callback.
// When that value concludes synchronously, conclude() would call `iterate` from inside itself,
// so a naive implementation recurses once per synchronous yield and overflows the stack on long synchronous runs.
// Instead, `iterate` is a trampoline: a synchronous call made while the loop is already on the stack only
// records the outcome ("bounces") and returns, and the loop picks it up and runs the next step.
// The stack depth is then bounded by how deeply flows are nested, not by how many steps they take.
function runIterator(it, callback) {
  // Cancels whatever the iterator is currently doing
  let cancel = noop;

  // True while the loop in `iterate` is on the stack
  let looping = false;

  // The outcome of a value that concluded synchronously while looping, waiting to be fed to the generator
  let bounced = null;

  function iterate(error, result) {
    if (looping) {
      bounced = { error, result };
      return;
    }

    looping = true;

    try {
      while (true) {
        // A temporary cancellation for the synchronous part of the step.
        // The flow may get cancelled synchronously while the generator body runs (e.g. it calls the cancel
        // function returned by the root conclude) or while the yielded value is being concluded
        // (e.g. a child flow cancels its parent). This records that, so the step can stop and clean up.
        let cancelled = false;
        cancel = () => cancelled = true;

        let value, done;

        // Only exceptions thrown by the generator body are delivered as errors.
        // Exceptions thrown downstream (by `callback`) propagate, otherwise the callback would be called twice.
        try {
          ({ value, done } = error
            ? it.throw(error)
            : it.next(result));
        }
        catch (err) {
          callback(err);
          return;
        }

        if (cancelled) return;

        // The final value: its outcome is the outcome of the whole iterator.
        // The guard drops it if the flow gets cancelled while the value is being concluded synchronously.
        const cancelValue = conclude(value, done
          ? (e, r) => !cancelled && callback(e, r)
          : iterate);

        if (cancelled) {
          // Cancelled while concluding the value: the value may still be running, so unsubscribe from it
          bounced = null;
          cancelValue();
          return;
        }

        if (done || !bounced) {
          // Either finished, or the value is concluding asynchronously:
          // `iterate` will be called again from a fresh stack once it concludes
          cancel = cancelValue;
          return;
        }

        // The value concluded synchronously: run the next step right here instead of recursing
        ({ error, result } = bounced);
        bounced = null;
      }
    }
    finally {
      looping = false;
      // Normally already null. Cleared in case an exception thrown downstream unwound the loop mid-step,
      // so a stale outcome is never fed to the generator later.
      bounced = null;
    }
  }

  iterate();
  return () => cancel();
}
