import { conclude } from './conclude';
import { cps } from './effects';

export function all(payload, callback) {
  if (!callback) return cps(all, payload);

  const results = Array.isArray(payload) ? [] : {};

  let count = Object.keys(payload).length;

  if (!count) {
    callback(null, results);
    return noop;
  }

  let syncStop = false;
  const watchers = new Set();

  const cancel = () => {
    for (let stop of watchers) stop();
  }

  for (let k in payload) {
    watchers.add(conclude(payload[k], (error, result) => {
      if (error) {
        syncStop = true;
        cancel();
        callback(Array.isArray(payload) ? error : { [k]: error });
      }
      else {
        results[k] = result;
        if (--count === 0) callback(null, results);
      }
    }));

    if (syncStop) return noop;
  }

  return cancel;
}

export function race(payload, callback) {
  if (!callback) return cps(race, payload);

  if (!Object.keys(payload).length) {
    return noop;
  }

  let syncStop = false;
  const watchers = new Set();

  const cancel = () => {
    for (let stop of watchers) stop();
  }

  for (let k in payload) {
    watchers.add(conclude(payload[k], (error, result) => {
      syncStop = true;
      cancel();

      if (error) {
        callback(Array.isArray(payload) ? error : { [k]: error });
      }
      else {
        callback(null, Array.isArray(payload) ? result : { [k]: result });
      }
    }));

    if (syncStop) return noop;
  }

  return cancel;
}

export function allSettled(payload, callback) {
  if (!callback) return cps(allSettled, payload);

  const results = Array.isArray(payload) ? [] : {};

  let count = Object.keys(payload).length;

  if (!count) {
    callback(null, results);
    return noop;
  }

  const watchers = new Set();

  const cancel = () => {
    for (let stop of watchers) stop();
  }

  for (let k in payload) {
    watchers.add(conclude(payload[k], (error, result) => {
      results[k] = error
        ? { error }
        : { result };

      if (--count === 0) callback(null, results);
    }));
  }

  return cancel;
}

export function any(payload, callback) {
  if (!callback) return cps(any, payload);

  const errors = Array.isArray(payload) ? [] : {};

  let count = Object.keys(payload).length;

  if (!count) {
    callback(errors);
    return noop;
  }

  let syncStop = false;
  const watchers = new Set();

  const cancel = () => {
    for (let stop of watchers) stop();
  }

  for (let k in payload) {
    watchers.add(conclude(payload[k], (error, result) => {
      if (!error) {
        syncStop = true;
        cancel();
        callback(null, Array.isArray(payload) ? result : { [k]: result });
      }
      else {
        errors[k] = error;
        if (--count === 0) callback(errors);
      }
    }));

    if (syncStop) return noop;
  }

  return cancel;
}
