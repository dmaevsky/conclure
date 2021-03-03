import { isEffect, TYPE } from './effects';

export function isIterator(obj) {
  return !!obj && (typeof obj === 'object' || typeof obj === 'function') && typeof obj.next === 'function';
}

export function isPromise(obj) {
  return !!obj && (typeof obj === 'object' || typeof obj === 'function') && typeof obj.then === 'function';
}

const noop = () => {};

const running = new Map();
const resultCache = new WeakMap();

export function inProgress(it) {
  return running.has(it);
}

export function concluded(it) {
  return resultCache.has(it);
}

export function conclude(it, callback) {
  if (isPromise(it)) {
    let cancelled = false;

    it.then(result => !cancelled && callback(null, result))
      .catch(error => !cancelled && callback(error));

    return () => cancelled = true;
  }

  if (isEffect(it)) {
    return runEffect(it, callback);
  }

  if (!isIterator(it)) {
    callback(null, it);
    return noop;
  }

  // At this point it is an iterator

  if (resultCache.has(it)) {
    const { result, error } = resultCache.get(it);

    if (error) callback(error);
    else callback(null, result);

    return noop;
  }

  if (running.has(it)) {
    const { subscribe } = running.get(it);
    return subscribe(callback);
  }

  return start(it, callback);
}

function start(it, callback) {
  // it is an iterator that has not stared yet

  const watchers = new Set();
  const cancelWatchers = new Set();

  const onConclude = (error, result) => {
    resultCache.set(it, { error, result });
    running.delete(it);

    for (let cb of watchers) cb(error, result);
  }

  function subscribe(cb) {
    watchers.add(cb);

    return function unsubscribe() {
      watchers.delete(cb);

      if (running.has(it) && watchers.size === 0) {
        const { cancel } = running.get(it);
        running.delete(it);

        if (typeof cancel === 'function') cancel();

        for (let cb of cancelWatchers) cb();
      }
    }
  }

  function subscribeCancel(cb) {
    cancelWatchers.add(cb);
    return () => cancelWatchers.delete(cb);
  }

  running.set(it, {
    subscribe,
    subscribeCancel
  });

  const unsubscribe = subscribe(callback);

  iterate(it, null, null, onConclude);
  return unsubscribe;
}

function iterate(it, error, result, callback) {
  const runRecord = running.get(it);
  if (!runRecord) return;

  try {
    runRecord.cancel = noop;

    const { value, done } = error
      ? it.throw(error)
      : it.next(result);

    if (running.get(it) !== runRecord) return; // synchronously cancelled while generator was running

    const continuation = (err, res) => iterate(it, err, res, callback);

    runRecord.cancel = conclude(value, done ? callback : continuation);
  }
  catch (err) {
    callback(err);
  }
}

function runEffect({ [TYPE]: type, context, fn, args }, callback) {
  if (type === 'CPS') {
    return fn.call(context, ...args, callback);
  }

  // type === 'CALL'
  try {
    const result = fn.apply(context, args);
    return conclude(result, callback);
  }
  catch (error) {
    callback(error);
    return noop;
  }
}

export function onCancel(it, callback) {
  if (!running.has(it)) {
    if (!resultCache.has(it)) callback();   // already cancelled (or never started)
    return noop;
  }

  const { subscribeCancel } = running.get(it);
  return subscribeCancel(callback);
}
