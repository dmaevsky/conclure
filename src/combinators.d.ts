import type { Cancellation, Continuation, Effect, Result } from './conclude.js';

/** A combinator payload: an array (or tuple) or a plain object of flows and/or plain values. */
export type Payload = readonly unknown[] | { readonly [key: string]: unknown };

/** Maps each entry of the payload to its concluded type, preserving the payload's shape (tuple, array or object). */
export type Results<P extends Payload> = { -readonly [K in keyof P]: Result<P[K]> };

/** A single entry concluded: the bare value for arrays, `{ [key]: value }` for objects. */
export type OneOf<P extends Payload> =
  P extends readonly unknown[]
    ? Result<P[number]>
    : { [K in keyof P]: { [Q in K]: Result<P[K]> } }[keyof P];

/** What `allSettled` reports for each entry. */
export type Settled<T> = { result: T; error?: undefined } | { error: {}; result?: undefined };

export type SettledResults<P extends Payload> = { -readonly [K in keyof P]: Settled<Result<P[K]>> };

// Each combinator is a CPS function when called with a callback, and a lazy CPS effect on itself otherwise.
// It is tagged with its name (`all.combinator === 'all'`), so effect interpreters can recognize it via `effect.fn.combinator`.

/**
 * Concludes with all the results once every entry has concluded.
 * Fails on the first error (wrapped as `{ [key]: error }` for object payloads) and cancels the rest.
 */
export function all<const P extends Payload>(payload: P, callback: Continuation<Results<P>>): Cancellation;
export function all<const P extends Payload>(payload: P): Effect<Results<P>, 'CPS'>;
export namespace all { const combinator: 'all'; }

/**
 * Concludes with the first result (wrapped as `{ [key]: result }` for object payloads) and cancels the rest.
 * Fails with all the errors, in the payload's shape, if every entry fails.
 */
export function any<const P extends Payload>(payload: P, callback: Continuation<OneOf<P>>): Cancellation;
export function any<const P extends Payload>(payload: P): Effect<OneOf<P>, 'CPS'>;
export namespace any { const combinator: 'any'; }

/**
 * Concludes or fails with the first entry to finish (wrapped as `{ [key]: ... }` for object payloads)
 * and cancels the rest. An empty payload never concludes.
 */
export function race<const P extends Payload>(payload: P, callback: Continuation<OneOf<P>>): Cancellation;
export function race<const P extends Payload>(payload: P): Effect<OneOf<P>, 'CPS'>;
export namespace race { const combinator: 'race'; }

/** Concludes once every entry has concluded, with `{ result }` or `{ error }` for each, in the payload's shape. Never fails. */
export function allSettled<const P extends Payload>(payload: P, callback: Continuation<SettledResults<P>>): Cancellation;
export function allSettled<const P extends Payload>(payload: P): Effect<SettledResults<P>, 'CPS'>;
export namespace allSettled { const combinator: 'allSettled'; }
