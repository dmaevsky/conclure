# ⤕ Conclure JS
Brings cancellation and testability to your async flows.

It is a tiny (core is < 200 lines of code), zero dependencies generator runner.

Just grep and replace:
- `async` -> `function*`
- `await` -> `yield`
- `Promise.(all|race|allSettled|any)` -> `Conclude.(all|race|allSettled|any)`

```js
import { conclude } from 'conclure';
import * as Conclude from 'conclure/combinators';

// An example of a multi-step async flow that a user might want to cancel at any time
function* fetchItem(item) {
  const { contentsUrl } = yield item.fetchMetaData();
  const res = yield fetch(contentsUrl);
  return res.text();
};

const loadAll = items => Conclude.all(items.map(fetchItem));

const cancel = conclude(loadAll(myDocs), (err, contents) => {
  if (err) console.error(err);
  else console.log(contents);
});

/// later...
cancel();

```
You can yield/conclude iterators, promises, and effects interchangeably, so you can gradually introduce cancellation and testability to your async flows.


## Design concepts and rationale
You should avoid Promises for two major reasons:
- Promises are *greedy*: once created, cannot be cancelled
- `await promise` **always** inserts a *tick* into your async flow, even if the promise is already resolved or can be resolved synchronously.

You can see a `Promise` as a particular type of an iterator for which the JS VM provides a built-in runner, a quite poorly designed one nonetheless.

**⤕ Conclure JS** is a custom generator runner that
- allows you to cancel your async flows
- ensures that sync flows always resolve synchronously
- delivers better testability through the use of *effects* as popularized by [redux-saga](https://redux-saga.js.org/docs/basics/DeclarativeEffects.html).

### Terminology and semantics
An async flow may be represented by *any* of the three base concepts:
- a promise (e.g. a result of an async function)
- an iterator (e.g. a result of a generator function)
- an effect: a declarative (lazy) function call, [redux-saga style](https://redux-saga.js.org/docs/basics/DeclarativeEffects.html)

You can `yield` or `return` a flow from a generator function. Conclure's runner will *conclude* the flow that will either
- produce a *result*: promise resolves / iterator returns / CPS callback is called with (null, result), or
- fail with an *error*: promise rejects / iterator throws / CPS callback is called with (error)

The runner returns the concluded value to the generator function via `.next(result)` or `.throw(error)`

The return value of the generator function yielding the flow - an iterator - becomes the flow's *parent*.

A flow may have multiple parents - different generators yielding the same flow. Conclure ensures that in this case the flow only runs once, but the results are delivered to all parents once concluded.

The root flow may be concluded by calling `conclude` explicitly, which itself is a CPS function, in the same vein as you would attach a `then` handler to a Promise outside of an async function. You may have multiple root flows.

`conclude` returns a `cancel` function that cancels the top-level flow. A child flow would then be cancelled if **all** of its parents are cancelled.

Unlike redux-saga, Conclure does not call `.return` with some "magic" value on the iterator. It simply attempts to cancel the currently pending operation and stops iterating the iterator.

A flow is considered *finished* when it is either *concluded* (with a *result* or an *error*) or *cancelled*.

You can also attach *weak* watchers to a flow using `whenFinished(flow, callback)`. The callback will be called with `{ cancelled, error, result }` when the flow has finished.

In case the flow concludes with a result or an error, the weak watchers are called *before* the result is delivered to the flow's parents, so the callback passed to `whenFinished` is roughly equivalent to the `finally` block of a redux-saga generator. However, it can be attached to promises and effects as well, and enables perfectly valid edge cases, when a flow is cancelled synchronously while the generator is running.

Check out some examples in the Recipes section below.

### Effects
```js
import { call, cps, cps_no_cancel, delay } from 'conclure/effects';
```
An effect is simply an abstracted declarative (lazy) function call: it is a simple object `{ [TYPE], context, fn, args }` which may come in two flavors: `CALL` or `CPS`.

- A `CALL` effect, when concluded, will call `fn.apply(context, args)` and conclude the result. Create a `CALL` effect using `call(fn, ...args)`. If `fn` requires `this`, you can pass the context as `call([context, fn], ...args)`.

- A `CPS` effect, when concluded, will call `fn.call(context, ...args, callback)`, and resolve or reject when the callback is called. `fn` **must** return a cancellation. Create a `CPS` effect using `cps(fn, ...args)`. If `fn` requires `this`, you can pass the context as `cps([context, fn], ...args)`.

To call third-party CPS functions that do not return a cancellation, use the `cps_no_cancel` effect instead.

**`delay(ms)`**

`delay` is a CPS function. However, when called without the second callback argument it returns a cps effect on itself. When concluded, it introduces a delay of `ms` milliseconds into the flow.

### Combinators
```js
import * as Conclude from 'conclure/combinators';
```
`Conclude.[all|any|race|allSettled]` combinators would do the same thing as their `Promise` counterparts, except that they operate on all types of flows supported by ConclureJS: promises, iterators, or effects. All other values are concluded as themselves. The payload argument may be an `Iterable` or an object.

Combinator conclude behavior summary:

| Combinator | Flow `k` produces `result` | Flow `k` fails with `error` | All flows conclude
|---|---|---|---|
|`all([])`|*continue*|Fail with `error`|Return all `results`
|`all({})`|*continue*|Fail with `{[k]: error}`|Return `{ [k in payload]: results[k] }`
|`any([])`|Return `result`|*continue*|Fail with all `errors`
|`any({})`|Return `{[k]: result}`|*continue*|Fail with `{ [k in payload]: errors[k] }`
|`race([])`|Return `result`|Fail with `error`|*noop*
|`race({})`|Return `{[k]: result}`|Fail with `{[k]: error}`|*noop*
|`allSettled([])`|*continue*|*continue*|Return `[{ result: results[k], error: errors[k] }]` for all `k`
|`allSettled({})`|*continue*|*continue*|Return `{ [k in payload]: { result: results[k], error: errors[k] } }`

All the combinators are implemented as CPS functions. Same as `delay`, when called without the callback argument, each combinator returns a cps effect on itself.

**IMPORTANT**
- If a combinator can conclude synchronously, it is guaranteed to do so!
- If some of the flows are still running when a combinator concludes they will be automatically cancelled

Refer to the [API reference](https://github.com/dmaevsky/conclure/blob/master/conclude.d.ts) for more details.

### Typical use cases and recipes
1. Abortable fetch
```js
export function* abortableFetch(url, options) {
  const controller = new AbortController();

  const promise = fetch(url, { ...options, signal: controller.signal });
  whenFinished(promise, ({ cancelled }) => cancelled && controller.abort());

  const res = yield promise;
  if (!res.ok) throw new Error(res.statusText);

  const contentType = res.headers.get('Content-Type');

  return contentType && contentType.indexOf('application/json') !== -1
    ? res.json()
    : res.text();
}
```

2. Caching flow results
```js
const withCache = (fn, expiry = 0, cache = new Map()) => function(key, ...args) {
  if (cache.has(key)) {
    return cache.get(key);
  }

  const it = fn(key, ...args);
  cache.set(key, it);

  whenFinished(it, ({ cancelled, error, result }) => {
    if (cancelled || error || !expiry) cache.delete(key);
    else setTimeout(() => cache.delete(key), expiry);
  });

  return it;
}

const cachedFetch = withCache(abortableFetch, 10000);
```

3. Show a spinner while a flow is running
```js
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
