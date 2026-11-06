# ⤕ Conclure JS
A tiny generator runner (the core is under 200 lines) with zero dependencies. It brings cancellation and testability to your async flows.

```
npm install conclure
```

Migrating from async/await is mostly search and replace:
- `async function` → `function*`
- `await` → `yield`
- `Promise.(all|race|allSettled|any)` → `all|race|allSettled|any` from `conclure/combinators`

```js
import { conclude } from 'conclure';
import { all } from 'conclure/combinators';

function* fetchItem(item) {
  const { contentsUrl } = yield item.fetchMetaData();
  const res = yield fetch(contentsUrl);
  return res.text();
}

const loadAll = items => all(items.map(fetchItem));

const cancel = conclude(loadAll(myDocs), (err, contents) => {
  if (err) console.error(err);
  else console.log(contents);
});

// later...
cancel();
```

You can yield promises, iterators and effects interchangeably, so you can bring cancellation and testability into an existing codebase one function at a time.

## Why not just promises?
- **Promises cannot be cancelled.** Once created, a promise runs to completion whether or not anyone still needs the result.
- **`await` always costs a tick**, even when the value is already available or could be computed synchronously.

Conclure fixes both:
- **Every flow can be cancelled**, and cancellation reaches down into whatever operation is pending.
- **Synchronous flows conclude synchronously.** If every step is synchronous, the callback runs before `conclude` returns. Synchronous steps run in a loop rather than recursively, so even very long synchronous runs don't grow the stack.
- **Effects make flows testable.** Generators can yield plain data that describes a call, so tests can check what a flow *would* do without running anything (the [redux-saga](https://redux-saga.js.org/docs/basics/DeclarativeEffects.html) approach).

## Concepts

### Flows
A *flow* is any of, in the order they are checked:
- an **iterator** (e.g. the result of a generator function)
- a **promise**, or any thenable (e.g. the result of an async function)
- an **effect**: a lazy, declarative function call (see [Effects](#effects))

Any other value is not a flow and concludes as itself, synchronously.

### Concluding
To *conclude* a flow is to run it until it produces a *result* or fails with an *error*:

| Flow | Result | Error |
|---|---|---|
| iterator | returns (the returned value is concluded in turn) | throws |
| promise | resolves | rejects |
| CALL effect | `fn` returns (the returned value is concluded in turn) | `fn` throws |
| CPS effect | callback is called with `(null, result)` | callback is called with `(error)` |

When a generator yields a flow, Conclure concludes it and resumes the generator with `.next(result)` or `.throw(error)`. Returning a flow from a generator works the same way, just like returning a promise from an async function.

To start a root flow, call `conclude(flow, callback)`. Its callback is node-style `(error, result)`, and it returns a `cancel` function. You can have any number of root flows.

Errors are tested for truthiness, the usual convention for node-style callbacks: throwing or rejecting with a falsy value counts as success.

### Shared flows and cancellation
Conclure stores each flow's state on the flow object itself. As a result:
- **A flow runs at most once.** If several generators yield the same flow (its *parents*), they share one run, and each gets the outcome.
- **Outcomes are cached.** Concluding a flow that has already finished delivers its result or error synchronously.
- **Cancellation is reference-counted.** A flow is cancelled only when **all** its parents have cancelled.
- **A cancelled flow is finished for good.** Concluding it again never calls the callback.

On cancellation, Conclure cancels the operation that is currently pending and stops iterating. Unlike redux-saga, it does **not** call `.return()` on the iterator, so `finally` blocks of a cancelled generator do not run. Use `whenFinished` for cleanup.

A flow is *finished* once it has concluded (with a result or an error) or been cancelled.

### `whenFinished(flow, callback)`
Attaches a *weak* watcher. It is called with `{ cancelled, error, result }` once the flow finishes. It does not start the flow or keep it alive.

When a flow concludes, its watchers are called **before** its parents resume. That makes `whenFinished` roughly equivalent to a `finally` block, except that it works for promises and effects too, and it also fires when a flow is cancelled synchronously while its generator is running.

### Callback exceptions
Only exceptions thrown by *your flow* (a generator body, an effect's `fn`, a rejected promise) are delivered as errors. If a callback passed to `conclude` throws, the exception propagates to whoever triggered the callback, and the callback is never called a second time. For a promise flow, that means the exception surfaces as an unhandled rejection.

## Effects
```js
import { call, cps, cps_no_cancel, delay } from 'conclure/effects';
```
An effect is a plain object `{ [TYPE], context, fn, args }`. Nothing runs until it is concluded.

- **`call(fn, ...args)`** calls `fn(...args)` and concludes whatever it returns: a plain value, a promise, an iterator or another effect.
- **`cps(fn, ...args)`** calls `fn(...args, callback)`, where `callback` is node-style `(error, result)`. `fn` **must** return a cancellation function.
- **`cps_no_cancel(fn, ...args)`** is the same, for third-party CPS functions that don't return a cancellation. Cancelling just ignores the late callback.
- **`delay(ms)`** waits `ms` milliseconds. It is a CPS function: `delay(ms, callback)` returns a cancellation, and `delay(ms)` without a callback returns a CPS effect on itself.

For functions that need `this`, pass `[context, fn]` or `[context, 'methodName']` instead of `fn`.

### Testing with effects
Because effects are data, you can step a generator by hand and compare what it yields:
```js
function* loadUserName(id) {
  const user = yield call(api.getUser, id);
  return user.name;
}

const it = loadUserName(7);
assert.deepEqual(it.next().value, call(api.getUser, 7)); // nothing was fetched
assert.deepEqual(it.next({ name: 'Ann' }), { value: 'Ann', done: true });
```

## Combinators
```js
import { all, any, race, allSettled } from 'conclure/combinators';

// or, to avoid shadowing names like `any`, use a namespace import:
import * as Conclude from 'conclure/combinators'; // Conclude.all(...), Conclude.race(...)
```
`all`, `any`, `race` and `allSettled` work like their `Promise` counterparts, but accept any mix of flows and plain values. The payload is an **array** or a **plain object**. For an object, results and errors are keyed accordingly.

| Combinator | Concludes with | Fails with |
|---|---|---|
| `all([...])` | all results, once all have concluded | the first error |
| `all({...})` | `{ [k]: result }` for every key | `{ [k]: error }` for the first error |
| `any([...])` | the first result | all errors, once all have failed |
| `any({...})` | `{ [k]: result }` for the first result | `{ [k]: error }` for every key |
| `race([...])` | the first result, if it comes first | the first error, if it comes first |
| `race({...})` | `{ [k]: result }` | `{ [k]: error }` |
| `allSettled([...])` | `[{ result } or { error }, ...]`, once all have concluded | never fails |
| `allSettled({...})` | `{ [k]: { result } or { error } }` | never fails |

- **If a combinator can conclude synchronously, it does.**
- **Once a combinator concludes, it cancels the flows that are still running.**
- `all` and `allSettled` with an empty payload conclude immediately with an empty array or object. `any` with an empty array fails immediately with `[]`. `race` with an empty payload never concludes, just like `Promise.race([])`.

Combinators are CPS functions, so `all(payload, callback)` returns a cancellation. Without a callback, `all(payload)` returns a CPS effect on itself. That's what you normally `yield` or `conclude`. Each combinator function is tagged with its name (`all.combinator === 'all'`), so effect interpreters can recognize it via `effect.fn.combinator`.

## API
```js
import {
  conclude,      // (flow, callback) => cancel
  whenFinished,  // (flow, ({ cancelled, error, result }) => void) => unsubscribe
  inProgress,    // flow => boolean: running and not yet finished
  finished,      // flow => boolean: concluded or cancelled
  getResult,     // flow => { cancelled } | { error, result } | undefined
  isFlow, isPromise, isIterator, isEffect
} from 'conclure';
```

TypeScript definitions ship with the package (`src/*.d.ts`). They infer what flows, effects and combinators conclude with. For example, `call(fetchJson, url)` where `fetchJson` is `async (url: string) => Data` gives `Effect<Data>`, and `all([gen(), promise])` gives a typed tuple. TypeScript can't infer the type of a `yield` expression, so annotate the receiving variable: `const user: User = yield call(api.getUser, id)`.

## Recipes

### Abortable fetch
```js
import { whenFinished } from 'conclure';

export function* abortableFetch(url, options) {
  const controller = new AbortController();

  const promise = fetch(url, { ...options, signal: controller.signal });
  whenFinished(promise, ({ cancelled }) => cancelled && controller.abort());

  const res = yield promise;
  if (!res.ok) throw new Error(res.statusText);

  const contentType = res.headers.get('Content-Type');

  return contentType && contentType.includes('application/json')
    ? res.json()
    : res.text();
}
```

### Caching flow results
Since a flow runs only once and caches its outcome, caching the flow object caches the result. Concurrent callers share one in-flight request, and one caller cancelling doesn't affect the others.
```js
import { whenFinished } from 'conclure';

const withCache = (fn, expiry = 0, cache = new Map()) => function(key, ...args) {
  if (cache.has(key)) {
    return cache.get(key);
  }

  const it = fn(key, ...args);
  cache.set(key, it);

  whenFinished(it, ({ cancelled, error }) => {
    if (cancelled || error || !expiry) cache.delete(key);
    else setTimeout(() => cache.delete(key), expiry);
  });

  return it;
}

const cachedFetch = withCache(abortableFetch, 10000);
```

### Showing a spinner while a flow runs
```js
import { conclude, whenFinished } from 'conclure';
import { call } from 'conclure/effects';

function withSpinner(flow) {
  const it = call(() => {
    showSpinner();
    return flow;
  });
  whenFinished(it, () => hideSpinner());
  return it;
}

conclude(withSpinner(cachedFetch(FILE_URL)), (err, res) => console.log({ err, res }));
```

## License
MIT
