export const TYPE = Symbol.for('@@conclude-effect');
export const isEffect = effect => Boolean(effect && effect[TYPE]);

const effect = (type, fn, ...args) => {
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

export const cps = effect.bind(null, 'CPS');
export const call = effect.bind(null, 'CALL');

export function delay(ms, callback) {
  if (!callback) return cps(delay, ms);

  const timeout = setTimeout(() => callback(null), ms);
  return () => clearTimeout(timeout);
}
