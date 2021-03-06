import { conclude, isPromise } from './conclude';
import { cps } from './effects';

const noop = () => {};

function returnResults(finishedStates, callback) {
  const results = Array.isArray(finishedStates) ? [] : {};

  for (let k in finishedStates) results[k] = finishedStates[k].result;
  callback(null, results);
}

function throwErrors(finishedStates, callback) {
  const errors = Array.isArray(finishedStates) ? [] : {};

  for (let k in finishedStates) errors[k] = finishedStates[k].error;
  callback(errors);
}

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

  const finishedStates = Array.isArray(payload) ? [] : {};
  let count = Object.keys(payload).length;

  if (count === 0) {
    afterAll[pattern](finishedStates, callback);
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
        finishedStates[k] = { error, result };
        if (--count === 0) {
          afterAll[pattern](finishedStates, callback);
        }
      }
    });
  }
  return stopKey !== undefined ? noop : cancelOthers;
}

const combinators = Object.fromEntries(Object.keys(afterAll).map(k => [k, combinator(k)]));

export default combinators;
