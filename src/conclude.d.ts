/** Node-style callback. `error` is falsy on success. */
export type Continuation<T> = (error: unknown, result?: T) => void;

/** Cancels the operation it was returned from. Calling it after the operation has finished is a no-op. */
export type Cancellation = () => void;

export type EffectType = 'CALL' | 'CPS' | 'CPS_NO_CANCEL';

declare const resultType: unique symbol;

/**
 * A declarative (lazy) function call. Nothing runs until the effect is concluded.
 * `T` is the type the effect concludes with; it exists only at the type level.
 */
export interface Effect<T = unknown, K extends EffectType = EffectType> {
  readonly '@@conclude-effect': K;
  readonly context: unknown;
  readonly fn: (...args: any[]) => unknown;
  readonly args: readonly unknown[];
  readonly [resultType]?: T;
}

/** Anything conclure can run: a promise (any thenable), an iterator (e.g. a generator object), or an effect. */
export type Flow<T = unknown> = PromiseLike<T> | Iterator<unknown, T, any> | Effect<T>;

/**
 * The type a value concludes with, checked in the same order as the runtime's isFlow:
 * - an iterator concludes with its return value, which is itself concluded
 * - a promise concludes with its resolved value
 * - an effect concludes with its declared result type
 * - any other value concludes as itself
 */
export type Result<F> =
  F extends Iterator<unknown, infer R, any> ? Result<R> :
  F extends PromiseLike<infer T> ? Awaited<T> :
  F extends Effect<infer T, any> ? T :
  F;

/**
 * The final state of a flow, as stored by conclure and passed to `whenFinished` callbacks.
 * On success, `error` is `null` (or absent for non-flow values).
 */
export type FinishedState<T> =
  | { cancelled: true; error?: undefined; result?: undefined }
  | { cancelled?: undefined; error?: null; result: T }
  | { cancelled?: undefined; error: {}; result?: undefined };

export function isIterator(obj: unknown): obj is Iterator<unknown, unknown, any>;
export function isPromise(obj: unknown): obj is PromiseLike<unknown>;
export function isEffect(obj: unknown): obj is Effect;
export function isFlow(obj: unknown): obj is Flow;

/** True while the flow is running (it has been concluded at least once and has not finished). */
export function inProgress(flow: Flow): boolean;

/** True once the flow has concluded with a result or an error, or has been cancelled. */
export function finished(flow: Flow): boolean;

/** The final state of a finished flow, or `undefined` if it has not finished. */
export function getResult<F extends Flow>(flow: F): FinishedState<Result<F>> | undefined;

/**
 * Runs `flow` (or joins its run if it is already running) and calls `callback` once it concludes.
 * Non-flow values and finished flows conclude synchronously.
 *
 * A flow runs at most once and may have several subscribers; it is cancelled only when all of them cancel.
 * A cancelled flow never calls back: concluding it again is a no-op.
 */
export function conclude<F>(flow: F, callback: Continuation<Result<F>>): Cancellation;

/**
 * Attaches a weak watcher, called once the flow finishes (concludes or is cancelled).
 * It does not start the flow or keep it alive, and it is called before the flow's subscribers.
 * Non-flow values and finished flows call back synchronously.
 */
export function whenFinished<F>(flow: F, callback: (state: FinishedState<Result<F>>) => void): Cancellation;
