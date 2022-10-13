const TYPE = '@@conclude-effect';

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

const running = Symbol.for('@@conclude-running');
const resultCache = Symbol.for('@@conclude-result');
const finishWatchers = Symbol.for('@@conclude-watchers');

export const inProgress = it => running in it;
export const finished = it => resultCache in it;
export const getResult = it =>it[resultCache];

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

function finalize(it, payload) {
  it[resultCache] = payload;
  delete it[running];

  for (let cb of it[finishWatchers] || []) cb(payload);
  delete it[finishWatchers];
}

export function conclude(it, callback) {
  const flowType = isFlow(it);

  if (!flowType) {
    callback(null, it);
    return noop;
  }

  if (resultCache in it) {
    const { result, error, cancelled } = it[resultCache];

    if (cancelled) return noop;

    if (error) callback(error);
    else callback(null, result);

    return noop;
  }

  if (running in it) {
    const subscribe = it[running];
    return subscribe(callback);
  }

  const subscribers = new Set();

  const onConclude = (error, result) => {
    finalize(it, { error, result });

    for (let cb of subscribers) cb(error, result);
  }

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

  const cancel = runners.get(flowType)(it, onConclude);

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
  let cancel, step = 0;

  const setCancel = (j, fn) => {
    if (j >= step) cancel = fn;
  }

  function iterate(error, result) {
    try {
      let cancelled = false;
      setCancel(++step, () => cancelled = true);

      const { value, done } = error
        ? it.throw(error)
        : it.next(result);

      if (cancelled) return;

      setCancel(step, conclude(value, done ? callback : iterate));
    }
    catch (err) {
      callback(err);
    }
  }

  iterate();
  return () => cancel();
}
