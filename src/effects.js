export const TYPE = '@@conclude-effect';

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

export function delay(ms, callback) {
  if (!callback) return cps(delay, ms);

  const timeout = setTimeout(() => callback(null), ms);
  return () => clearTimeout(timeout);
}
