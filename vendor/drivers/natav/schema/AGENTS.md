# Schema Driver

The purpose of the schema driver is to autogenerate a real JSON object based
off of a Driver's `api` object. The `api` object is of type
`Drivers.ApiRecord`.

``` @av/types/drivers.ts
export type ApiMethod = (...args: any[]) => any;
export type ApiRecord = { [key: string]: ApiMethod | ApiRecord };
```

The Typescript types in `./types.ts` successfully compute the base types of a
Driver's `api` object.

For example, if it is

```ts
type FooParams = {asdf: string}

// then in the Driver object
api = {
    Asdf: (params: FooParams) => {
        return 1;
    }
}

```

The types already succesfully determine that the JSON object should be

```json
{
    name: "Asdf",
    returns: {
      type: "number",
    },
    args: [
      {
        type: "object",
        fields: [
          { name: "asdf", value: { type: "string" } },
        ],
      },
    ],
}
```

This way it can be used in other pieces of the system to generate API docs,
OpenAPI schemas, etc. This driver leverages the Typescript compiler api to
actually generate this object.

Note: I don't think the Typescript types are capable of parsing through
nested api routes such as `api = { foo: { bar: () => 1 } } `. This is
a necessity, however. Each function should be delimited by `/` just like
in the RpcServer Driver.

This driver is only responsible for taking a driver from
`natav.GetDriver(name)` and generating an above object. It then has its own
`api` structure to get another Driver's schema. It does not have any `state`.
