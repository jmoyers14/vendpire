# Naming Conventions

Adapted from the Swift API Design Guidelines (https://www.swift.org/documentation/api-design-guidelines/). Applies to both the TypeScript codebase and the Swift app. Where the languages differ, follow that language's precedent.

## Core principle

**Optimize for clarity at the call site.** A name is declared once and read many times. Before you settle on a signature, write the call site and read it aloud. Clarity beats brevity.

If you can't describe what a function does in one sentence, the design is probably wrong. Fix the design before you name it.

## Rules for both languages

### Clarity
- **Include every word needed to remove ambiguity.** `list.remove(at: index)` / `removeAt(index)`, not `remove(index)`.
- **Leave out words that repeat the type or context.** `trip.cancel()`, not `trip.cancelTrip()`. `users.remove(user)`, not `users.removeUser(user)`.
- **Name by role, not type.** `greeting`, not `string`. `supplier`, not `widgetFactory`. `host`, not `userDoc`. No type suffixes like `tripsArray`, `nameStr`, or `dataObj`.
- **Make up for weak types.** If a value is a `string`, `number`, `Int`, or `Any`, the name has to carry the meaning: `tripId`, `timeoutMs`, `priceCents`, `startDate`.

### Side effects determine grammar
- **No side effects → noun or noun phrase:** `distance(to:)`, `totalPrice(items)`, `trip.remainingSpots`.
- **Side effects → imperative verb:** `sendInvite()`, `applyDiscount()`, `sort()`, `append()`.
- **Booleans read as assertions about the subject:** `isEmpty`, `hasDeposit`, `canBook`, `shouldNotify`, `isPublished`. Never `flag`, `status`, or a bare adjective like `active`.

### Types
- **Types, properties, variables, and constants are nouns.**
- **Protocols and interfaces** are nouns when they describe what something *is* (`Collection`, `Trip`). They end in `-able`, `-ible`, or `-ing` when they describe a *capability* (`Bookable`, `Equatable`, `ProgressReporting`).

### Terminology
- Avoid obscure words when a common one works.
- Avoid nonstandard abbreviations. Use `configuration`, not `cfg`. Use `traveler`, not `trvlr`. Well-known ones (`id`, `url`, `api`, `max`, `min`) are fine.
- If you use a term of art, use it with its established meaning.
- **Use the domain vocabulary consistently.** Pick one term per concept and use it everywhere, in both codebases. Don't mix `booking`, `reservation`, and `order` for the same thing.

### Overloads
- Overloads or methods can share a base name only when they mean the same thing.
- Don't overload on return type alone.
- Prefer one function with defaulted parameters over a family of near-identical overloads. Put defaulted parameters last.

## Swift-specific

- **Case:** `UpperCamelCase` for types and protocols, `lowerCamelCase` for everything else. Acronyms are uniformly cased by position: `utf8Bytes`, `userSMTPServer`, `isRepresentableAsASCII`.
- **Calls should read as grammatical English:** `x.insert(y, at: z)`, `x.subviews(havingColor: y)`.
- **Factory methods** start with `make`: `makeIterator()`, `makeTripCard(for:)`.
- **Mutating / non-mutating pairs:**
  - Verb operations: plain verb for the mutating version, `-ed` (or `-ing` when `-ed` is ungrammatical) for the non-mutating one: `sort()`/`sorted()`, `stripNewlines()`/`strippingNewlines()`.
  - Noun operations: noun for the non-mutating version, `form` prefix for the mutating one: `union(_:)`/`formUnion(_:)`.
- **Argument labels:**
  - Omit all labels when arguments are interchangeable: `min(a, b)`.
  - Omit the first label for value-preserving conversions: `Int64(x)`, `String(value)`. Label narrowing conversions: `UInt32(truncating:)`.
  - First argument in a prepositional phrase → label starts at the preposition: `removeBoxes(havingLength: 12)`.
  - First argument completes a grammatical phrase → no label; move the words into the base name: `addSubview(y)`.
  - Label everything else, including all defaulted arguments: `dismiss(animated: false)`, never `dismiss(false)`.
- **Prefer methods and properties to free functions** unless there's no obvious `self`, the function is an unconstrained generic, or free-function syntax is the domain norm (`sin(x)`).
- Name closure parameters and tuple members in public APIs.
- Document the complexity of any computed property that isn't O(1).

## TypeScript-specific

- **Case:** `PascalCase` for types, interfaces, classes, enums, and React components. `camelCase` for variables, functions, methods, and properties. `SCREAMING_SNAKE_CASE` only for true module-level constants.
- **Acronyms are treated as words:** `tripApi`, `parseHttpUrl`, `smtpServer`, `NmiGateway`. This intentionally differs from Swift.
- **No `I` prefix on interfaces:** `Trip`, not `ITrip`.
- **`build` constructs, `create` persists.** A pure function that assembles a value in memory is `build*`: `buildCostBasis(purchaseLines)`, `buildCatalogItems(products, packs)`. A function that writes a record is `create`: `purchaseService.create(orgId, draft)`, the `purchases.create` mutation. The verb tells you whether a call touches the database. Framework-mandated names are exempt — tRPC's `createContext` has to be called that.
- **`build*` is the one verb allowed for a non-mutating function** — the construction exception to the side-effect rule. A free function has no receiver to hang a noun phrase on, so a bare noun reads like a variable (`costBasis(lines)`) unless a preposition connects the name to its argument (`levelAfter(line)`, `cogsForUnits(units, basis)`, `dispositionFor(reason)`). Prefer the noun phrase when a natural connective exists; reach for `build*` when one doesn't.
- **Labels become options objects.** TypeScript has no argument labels, so:
  - A single obvious argument stays positional: `getTrip(tripId)`.
  - Interchangeable arguments stay positional: `max(a, b)`.
  - **Never pass a bare boolean positionally.** Use an options object: `closeModal({ animated: false })`, not `closeModal(false)`.
  - Two or more arguments of the same type, or any optional or configuration arguments, go in a named options object: `fetchNotifications({ includeRead: true, perPage: 50 })`.
  - Prepositions belong in the function name or the option keys: `copyFrom(source)`, `moveTrip({ from, to })`.
- **Mutating / non-mutating pairs** follow ES2023 precedent (`sort`/`toSorted`, `reverse`/`toReversed`): the bare verb mutates and `to` + past participle returns a copy. Prefer non-mutating code. In modules that are entirely pure, the bare verb can return a new value, as long as the module doc says so.
- **Async:** name by effect (`fetchTrip`, `loadHosts`, `syncInventory`). No `Async` suffix, since the `Promise` return type already says it.
- **Getters vs. fetchers:** `get` for cheap or synchronous access, `fetch`/`load` for I/O, `compute`/`calculate` only when the cost matters to the caller.

### Stack conventions
- **React:** components are PascalCase nouns (`TripCard`, `HostDashboard`). Hooks start with `use` (`useTripBookings`). Handler props are `onX` (`onSubmit`), and their implementations are `handleX` (`handleSubmit`).
- **tRPC:** queries are nouns or `get`/`list`/`by*` (`trip.byId`, `booking.list`). Mutations are imperative verbs (`booking.create`, `trip.publish`, `payment.refund`).
- **Mongoose:** models are singular PascalCase nouns (`Trip`, `Booking`). Statics and instance methods follow the side-effect rule (`Trip.findPublished()`, `booking.markPaid()`).
- **RabbitMQ:**
  - Events are past-tense facts: `booking.created`, `payment.failed`, `trip.published`.
  - Commands are imperatives: `sendReminderEmail`, `syncHostPayouts`.
  - Never name an event like a command, or the reverse.

## Before finalizing a name
1. Write the call site. Does it read clearly without seeing the declaration?
2. Is every word earning its place? Is anything ambiguous?
3. Does the grammar match the side effects (noun vs. verb)?
4. Are positional booleans, or confusable same-type arguments, hidden behind labels or an options object?
5. Does it match existing names for the same concept elsewhere in the codebase?

# Readability

Naming is most of clarity, but not all of it. These are the non-naming habits
worth holding the line on.

## Name the intermediate value

**Don't `await` inside an expression that also destructures, spreads, or
indexes the result.** Give the awaited value a name on its own line, then use
it. One line saved is not worth a reader having to unpick what is being awaited
from what is being done to it, and a named value is what a debugger, a stack
trace, and a reviewer all need.

```typescript
// Good
const stored = await this.buildStored(orgId, draft);
return this.purchases.create(orgId, { ...stored, clientRequestId });

// Avoid
return this.purchases.create(orgId, {
  ...(await this.buildStored(orgId, draft)),
  clientRequestId,
});
```

The same applies to `(await fetchTrip(id)).host`, `[...(await loadRows())]`, and
`(await getConfig()).timeoutMs` — name it first. A bare `await` as a whole
argument (`create(orgId, await buildInput(draft))`) is fine; it is the
*combination* with a spread or member access that hurts.
