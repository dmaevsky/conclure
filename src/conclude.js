import { TYPE } from './effects';

export function isIterator(obj) {
  return !!obj && (typeof obj === 'object' || typeof obj === 'function')
    && typeof obj.next === 'function'
    && typeof obj.throw === 'function';
}

export function isPromise(obj) {
  return !!obj && (typeof obj === 'object' || typeof obj === 'function')
    && typeof obj.then === 'function'
    && typeof obj.catch === 'function';
}

export const isEffect = effect => Boolean(effect && effect[TYPE]);

export const isFlow = it => [isPromise, isEffect, isIterator].find(is => is(it));

const runners = new Map([
  [isPromise, runPromise],
  [isEffect, runEffect],
  [isIterator, runIterator],
]);

const noop = () => {};

const running = new WeakMap();
const resultCache = new WeakMap();
const finishWatchers = new WeakMap();

export function inProgress(it) {
  return running.has(it);
}

export function finished(it) {
  return resultCache.has(it);
}

export function getResult(it) {
  return resultCache.get(it);
}

export function whenFinished(it, callback) {
  if (!isFlow(it)) {
    callback({ result: it });
    return noop;
  }

  if (resultCache.has(it)) {
    callback(resultCache.get(it));
    return noop;
  }

  let watchers = finishWatchers.get(it);

  if (!watchers) finishWatchers.set(it, watchers = new Set([callback]));
  else watchers.add(callback);

  return () => watchers.delete(callback);
}

function finalize(it, payload) {
  resultCache.set(it, payload);
  running.delete(it);

  for (let cb of finishWatchers.get(it) || []) cb(payload);
  finishWatchers.delete(it);
}

export function conclude(it, callback) {
  const flowType = isFlow(it);

  if (!flowType) {
    callback(null, it);
    return noop;
  }

  if (resultCache.has(it)) {
    const { result, error, cancelled } = resultCache.get(it);

    if (cancelled) return noop;

    if (error) callback(error);
    else callback(null, result);

    return noop;
  }

  if (running.has(it)) {
    const subscribe = running.get(it);
    return subscribe(callback);
  }

  const subscribers = new Set();
  let cancel;

  const onConclude = (error, result) => {
    finalize(it, { error, result });

    for (let cb of subscribers) cb(error, result);
  }

  function subscribe(cb) {
    subscribers.add(cb);

    return function unsubscribe() {
      subscribers.delete(cb);

      if (subscribers.size === 0) {
        finalize(it, { cancelled: true });
        cancel();
      }
    }
  }

  running.set(it, subscribe);

  const unsubscribe = subscribe(callback);

  cancel = runners.get(flowType)(it, onConclude);

  return unsubscribe;
}

function runPromise(promise, callback) {
  let cancelled = false;

  promise
    .then(result => !cancelled && callback(null, result))
    .catch(error => !cancelled && callback(error));

  return () => cancelled = true;
}

function runEffect({ [TYPE]: type, context, fn, args }, callback) {
  try {
    switch (type) {
      case 'CPS':
        return fn.call(context, ...args, callback);

      case 'CPS_NO_CANCEL':
        let cancelled = false;
        fn.call(context, ...args, (error, result) => !cancelled && callback(error, result));

        return () => cancelled = true;

      case 'CALL':
        const result = fn.apply(context, args);
        return conclude(result, callback);

      default:
        throw new Error('Unknown effect type ' + type);
    }
  }
  catch (error) {
    callback(error);
    return noop;
  }
}

function runIterator(it, callback) {
  let cancel;

  function iterate(error, result) {
    try {
      let cancelled = false;
      cancel = () => cancelled = true;

      const { value, done } = error
        ? it.throw(error)
        : it.next(result);

      if (cancelled) return;

      cancel = conclude(value, done ? callback : iterate);
    }
    catch (err) {
      callback(err);
    }
  }

  iterate();
  return () => cancel();
}
