type Continuation<TResult> = (error: Error | null, result?: TResult) => void

type Cancellation = () => void;

declare module 'conclure' {
  export function isIterator(obj: any): obj is Iterator<any>;
  export function isPromise(obj: any): obj is PromiseLike<any>;

  export function inProgress(it: Iterator<any>): boolean;
  export function concluded(it: Iterator<any>): boolean;

  export function conclude<TResult>(it: any, callback: Continuation<TResult>): Cancellation;

  export function onCancel(it: Iterator<any>, callback: () => void): Cancellation;
}

declare module 'conclure/effects' {
  export const TYPE: Symbol;

  type EffectType = 'CALL' | 'CPS';

  type Effect<T extends EffectType> = {
    [TYPE]: T;
    context: object;
    fn: Function;
    args: any[];
  };

  type CallableTarget<T extends Function> = T | [object, string | T];

  type CPS<TResult> = [...unknown[], Continuation<TResult>];
  type CPSFunction<TResult> = (...args: CPS<TResult>) => Cancellation;

  export function isEffect(effect: any): effect is Effect<any>;

  export function cps<TResult>(fn: CallableTarget<CPSFunction<TResult>>, ...args: unknown[]): Effect<'CPS'>
  export function call<Fn>(fn: CallableTarget<Fn>, ...args: unknown[]): Effect<'CALL'>;

  export function delay(ms: number, callback: Continuation<void>): Cancellation;
  export function delay(ms: number): Effect<'CPS'>;
}
