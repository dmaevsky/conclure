// Must match TYPE in conclude.js
export const TYPE = '@@conclude-effect';

// An effect is plain data describing a call. It runs only when concluded, which keeps generators testable:
// a test can step the iterator and compare the yielded effects with deepEqual without calling anything.
// `fn` may be a function, `[context, fn]`, or `[context, 'methodName']`.
const makeEffect = (type, fn, ...args) => {
  let context = null;

  if (Array.isArray(fn)) {
    [context, fn] = fn;
    if (typeof fn !== 'function') fn = context[fn];
  }

  return {
    [TYPE]: type,
    context, fn, args
  };
}

export const cps = makeEffect.bind(null, 'CPS');
export const cps_no_cancel = makeEffect.bind(null, 'CPS_NO_CANCEL');
export const call = makeEffect.bind(null, 'CALL');

// A CPS function. Without a callback, returns a CPS effect on itself (the same convention as the combinators).
export function delay(ms, callback) {
  if (!callback) return cps(delay, ms);

  const timeout = setTimeout(() => callback(null), ms);
  return () => clearTimeout(timeout);
}
