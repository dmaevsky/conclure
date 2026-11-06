import { conclude, isPromise } from './conclude.js';
import { cps } from './effects.js';

const noop = () => {};

const returnResults = (_, results, callback) => callback(null, results);
const throwErrors = (errors, _, callback) => callback(errors);

// What to do when one flow concludes: `stop` means the combinator concludes right away with this error / result
const afterOne = {
  all: (error, result) => ({ error, result, stop: error }),
  any: (error, result) => ({ error, result, stop: !error }),
  race: (error, result) => ({ error, result, stop: true }),
  allSettled: (error, result) => ({ result: error ? { error } : { result }, stop: false }),
};

// What to do when all flows have concluded without stopping
const afterAll = {
  all: returnResults,
  any: throwErrors,
  race: noop, // unreachable unless the payload is empty: race([]) never concludes, same as Promise.race([])
  allSettled: returnResults
};

// Each combinator is a CPS function. Called without a callback, it returns a CPS effect on itself,
// so it can be yielded lazily. The function is tagged with `combinator: pattern`
// so that effect interpreters and tests can recognize it: `effect.fn.combinator === 'all'`.
const combinator = pattern => Object.assign(function (payload, callback) {
  if (!callback) return cps(combinators[pattern], payload);

  // Payload is either an array or a plain object; results and errors mirror its shape
  const results = Array.isArray(payload) ? [] : {};
  const errors = Array.isArray(payload) ? [] : {};

  let count = Object.keys(payload).length;

  if (count === 0) {
    afterAll[pattern](errors, results, callback);
    return noop;
  }

  let stopKey = undefined;
  const cancellations = {}

  const cancelOthers = () => {
    for (let k in cancellations) {
      if (k !== stopKey) cancellations[k]();
    }
  }

  for (let k in payload) {
    // A flow has already concluded the combinator synchronously: do not start the remaining flows
    if (stopKey !== undefined) {
      // Prevent unhandled rejections when stopped synchronously
      if (isPromise(payload[k])) payload[k].then(undefined, noop);
      continue;
    }

    cancellations[k] = conclude(payload[k], (err, res) => {
      const { stop, error, result } = afterOne[pattern](err, res);

      if (stop) {
        stopKey = k;
        cancelOthers();

        if (error) callback(Array.isArray(payload) ? error : { [k]: error });
        else callback(null, Array.isArray(payload) ? result : { [k]: result });
      }
      else {
        results[k] = result;
        errors[k] = error;

        if (--count === 0) {
          afterAll[pattern](errors, results, callback);
        }
      }
    });
  }

  // If the combinator concluded synchronously, all the other flows have been cancelled already
  return stopKey !== undefined ? noop : cancelOthers;
}, { combinator: pattern });

const combinators = Object.keys(afterOne).reduce((acc, pattern) => Object.assign(acc, { [pattern]: combinator(pattern) }), {});

export const { all, any, race, allSettled } = combinators;
