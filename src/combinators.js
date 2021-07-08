import { conclude, isPromise } from './conclude.js';
import { cps } from './effects.js';

const noop = () => {};

const returnResults = (_, results, callback) => callback(null, results);
const throwErrors = (errors, _, callback) => callback(errors);

const afterOne = {
  all: (error, result) => ({ error, result, stop: error }),
  any: (error, result) => ({ error, result, stop: !error }),
  race: (error, result) => ({ error, result, stop: true }),
  allSettled: (error, result) => ({ result: error ? { error } : { result }, stop: false }),
};

const afterAll = {
  all: returnResults,
  any: throwErrors,
  race: noop,
  allSettled: returnResults
};

const combinator = pattern => function (payload, callback) {
  if (!callback) return cps(combinators[pattern], payload);

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
    if (stopKey !== undefined) {
      // Prevent unhandled rejections when stopped synchronously
      if (isPromise(payload[k])) payload[k].catch(noop);
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
  return stopKey !== undefined ? noop : cancelOthers;
}

const combinators = Object.keys(afterOne).reduce((acc, pattern) => Object.assign(acc, { [pattern]: combinator(pattern) }), {});

export const { all, any, race, allSettled } = combinators;
