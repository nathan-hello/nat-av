# Schema Driver

The schema driver describes every driver's TypeScript `api` as JSON. The
schema is intended to be consumed by JavaScript clients and by future API
documentation, OpenAPI, REPL, CLI, and language-binding tooling.

The source API is a nested `Drivers.ApiRecord`:

```ts
export type ApiMethod = (...args: any[]) => any;
export type ApiRecord = { [key: string]: ApiMethod | ApiRecord };
```

Nested records are preserved as `children` nodes. Methods become leaf nodes
with their name, argument schemas, and return schema. For example:

```ts
api = {
  Asdf: (params: { asdf: string }) => 1,
};
```

becomes conceptually:

```json
{
  "name": "Asdf",
  "returns": { "type": "number" },
  "args": [
    {
      "type": "object",
      "properties": {
        "asdf": { "type": "string" }
      }
    }
  ]
}
```

## Runtime Driver

`index.ts` implements the `schema` driver. It loads the generated manifest
from `output/state.json`, then loads each driver's JSON schema from the file
named by that manifest. Its API is used to retrieve a schema by driver name.
The generated schemas are runtime JSON, not imported TypeScript modules. The
driver has no meaningful connection state of its own; its `state` is the
in-memory map of loaded schemas.

## Generation

`scripts/index.ts` uses the TypeScript compiler API to inspect the `natav`
driver tuple and enumerate every driver except `schema`. For every API record
it:

- Traverses nested API branches until it reaches methods.
- Reads method parameters and return types from TypeScript signatures.
- Resolves promise return values and represents `void`/`undefined` returns as
  a JSON `null` literal because that is the wire representation.
- Emits scalar, literal, union, array, tuple, object, `any`, and recursive
  schema nodes, plus first-class `map`, `set`, `bytes`, and `date` nodes for
  built-in JavaScript values.
- Carries optional parameters and properties with `optional: true`.
- Omits TypeScript symbol members such as `__@iterator`; they are compiler
  artifacts, not runtime API endpoints or JSON properties.

Built-in collection values are not traversed as objects. A map is represented
as `{ "type": "map", "keys": ..., "values": ... }`, a set as
`{ "type": "set", "items": ... }`, bytes as `{ "type": "bytes" }`, and
dates as `{ "type": "date" }`. This prevents prototype methods such as
`Map.prototype.get` from being presented as API fields to CLI or UI generators.

Object schemas use a JSON-compatible `properties` map. They do not use the
old `fields`/`name`/`value` representation.

Run generation with:

```sh
npm run generate-schemas
```

This writes one JSON file per driver and regenerates `output/state.json`. It
also regenerates the compile-time validation units under
`output/validate/<driver>/`. Generated output is build/runtime data and is
excluded from the main TypeScript project in `tsconfig.json`.

## Compile-Time Validation

`types.ts` defines the type-level schema model. It maps a driver's actual API
types to `Schema.ApiNode` and is deliberately checked against the generated
JSON-shaped TypeScript literals.

`SchemaOf<T>` supports:

- Primitive values: `string`, `number`, `boolean`, `null`, `undefined`, and
  `any`.
- Literal values through `{ type: "literal", value }`.
- Unions through `{ type: "union", anyOf }`.
- Arrays through `{ type: "array", items }`.
- Tuples through `{ type: "tuple", items }`.
- Objects through `{ type: "object", properties }`.
- Recursive references through `{ type: "recursive" }`.
- Maps through `{ type: "map", keys, values }`.
- Sets through `{ type: "set", items }`.
- `Uint8Array`/`Buffer` through `{ type: "bytes" }`.
- Dates through `{ type: "date" }`.

The generator detects recursive compiler types while they are on the active
traversal path. The corresponding schema is an explicit `recursive` node; it
must not silently become `any`.

Union schemas are order-independent. Validation checks each generated union
member rather than requiring every possible permutation of union members.
Some TypeScript unions contain structurally identical aliases that the type
system collapses. The validation types allow the generator's explicit union
node in the affected nested array case while retaining the generated schema's
actual contents.

Run validation with:

```sh
npm run validate-schemas
```

The validator compiles generated endpoint units in bounded batches. This
keeps compiler memory and file-descriptor usage reasonable across all drivers,
while avoiding the large startup cost of compiling one endpoint at a time.

## Files

- `index.ts`: Runtime schema driver and generated-schema loader.
- `types.ts`: Type-level schema representation and API-node validation types.
- `scripts/index.ts`: TypeScript compiler API generator.
- `scripts/validate.ts`: Bounded-batch compiler validation runner.
- `output/*.json`: Generated runtime schemas.
- `output/state.json`: Driver-name to schema-file manifest.
- `output/validate/`: Generated compile-time validation units.

When changing schema behavior, run generation first, then validation, typecheck,
and the test suite:

```sh
npm run generate-schemas
npm run validate-schemas
npm run typecheck
npm test
```
