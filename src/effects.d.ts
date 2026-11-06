import type { Cancellation, Continuation, Effect, Result } from './conclude.js';

export const TYPE: '@@conclude-effect';

/** A CPS function: takes a Continuation as its last argument and returns a Cancellation. */
export type CPSFunction<A extends unknown[], T> = (...args: [...A, Continuation<T>]) => Cancellation;

/** A CPS function that does not return a Cancellation. */
export type CPSFunctionNoCancel<A extends unknown[], T> = (...args: [...A, Continuation<T>]) => unknown;

type AnyFunction = (...args: any[]) => any;

type MethodKeys<C> = { [K in keyof C]: C[K] extends AnyFunction ? K : never }[keyof C];

type CPSArgs<F> = F extends (...args: [...infer A, Continuation<any>]) => any ? A : never;
type CPSResult<F> = F extends (...args: [...infer _A, Continuation<infer T>]) => any ? T : never;

/**
 * A CALL effect. When concluded, calls `fn.apply(context, args)` and concludes the returned value,
 * so `fn` may return a plain value, a promise, an iterator or another effect.
 * Pass `[context, fn]` or `[context, 'methodName']` to call `fn` with `this` bound to `context`.
 */
export function call<F extends AnyFunction>(fn: F, ...args: Parameters<F>): Effect<Result<ReturnType<F>>, 'CALL'>;
export function call<C, F extends AnyFunction>(target: [C, F], ...args: Parameters<F>): Effect<Result<ReturnType<F>>, 'CALL'>;
export function call<C, K extends MethodKeys<C>>(target: [C, K], ...args: Parameters<Extract<C[K], AnyFunction>>): Effect<Result<ReturnType<Extract<C[K], AnyFunction>>>, 'CALL'>;

/**
 * A CPS effect. When concluded, calls `fn.call(context, ...args, callback)`.
 * `fn` must return a Cancellation; use `cps_no_cancel` for functions that do not.
 */
export function cps<A extends unknown[], T>(fn: CPSFunction<A, T>, ...args: A): Effect<T, 'CPS'>;
export function cps<C, A extends unknown[], T>(target: [C, CPSFunction<A, T>], ...args: A): Effect<T, 'CPS'>;
export function cps<C, K extends MethodKeys<C>>(target: [C, K], ...args: CPSArgs<C[K]>): Effect<CPSResult<C[K]>, 'CPS'>;

/** Same as `cps`, for CPS functions that do not return a Cancellation. Cancelling just ignores the late callback. */
export function cps_no_cancel<A extends unknown[], T>(fn: CPSFunctionNoCancel<A, T>, ...args: A): Effect<T, 'CPS_NO_CANCEL'>;
export function cps_no_cancel<C, A extends unknown[], T>(target: [C, CPSFunctionNoCancel<A, T>], ...args: A): Effect<T, 'CPS_NO_CANCEL'>;
export function cps_no_cancel<C, K extends MethodKeys<C>>(target: [C, K], ...args: CPSArgs<C[K]>): Effect<CPSResult<C[K]>, 'CPS_NO_CANCEL'>;

/** Calls back after `ms` milliseconds. Without a callback, returns a CPS effect on itself. */
export function delay(ms: number, callback: Continuation<void>): Cancellation;
export function delay(ms: number): Effect<void, 'CPS'>;
