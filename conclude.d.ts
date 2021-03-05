type Continuation<TResult> = (error: Error | null, result?: TResult) => void
type Cancellation = () => void;

type FinishedState<TResult> = {
  cancelled: boolean;
  error: Error;
  result: TResult;
}

type CPS<TResult> = [...unknown[], Continuation<TResult>];
type CPSFunction<TResult> = (...args: CPS<TResult>) => Cancellation;
type CPSFunctionNoCancel<TResult> = (...args: CPS<TResult>) => unknown;
type CALLFunction<TResult> = (...args: unknown[]) => TResult;

type TYPE = '@@conclude-effect';

type EffectType = 'CALL' | 'CPS' | 'CPS_NO_CANCEL';
type EffectTarget<TResult, T extends EffectType> =
  T extends 'CPS' ? CPSFunction<TResult> :
  T extends 'CPS_NO_CANCEL' ? CPSFunctionNoCancel<TResult> :
  (...args: unknown[]) => TResult;

type Effect<TResult, T extends EffectType> = {
  [TYPE]: T;
  context: object;
  fn: EffectTarget<TResult, T>;
  args: any[];
};

type AsyncConcludable<TResult> = PromiseLike<TResult> | Iterator<any, TResult> | Effect<TResult, EffectType>;

type CallableTarget<T extends Function> = T | [object, string | T];

declare module 'conclure' {
  export function isIterator(obj: any): obj is Iterator<any, unknown>;
  export function isPromise(obj: any): obj is PromiseLike<unknown>;

  export function inProgress<TResult>(it: AsyncConcludable<TResult>): boolean;
  export function finished<TResult>(it: AsyncConcludable<TResult>): boolean;

  export function conclude<TResult>(it: TResult | AsyncConcludable<TResult>, callback: Continuation<TResult>): Cancellation;

  export function whenFinished<TResult>(it: TResult | AsyncConcludable<TResult>, callback: (state: FinishedState<TResult>) => void): Cancellation;
}

declare module 'conclure/effects' {

  export function isEffect(effect: any): effect is Effect<unknown, EffectType>;

  export function cps<TResult>(fn: CallableTarget<CPSFunction<TResult>>, ...args: unknown[]): Effect<TResult, 'CPS'>
  export function cps_no_cancel<TResult>(fn: CallableTarget<CPSFunctionNoCancel<TResult>>, ...args: unknown[]): Effect<TResult, 'CPS_NO_CANCEL'>
  export function call<TResult>(fn: CallableTarget<CALLFunction<TResult>>, ...args: unknown[]): Effect<TResult, 'CALL'>;

  export function delay(ms: number, callback: Continuation<void>): Cancellation;
  export function delay(ms: number): Effect<void, 'CPS'>;
}
