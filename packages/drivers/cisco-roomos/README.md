# Cisco RoomOS Driver

The idea is that we take a schema from the following repo:

[https://github.com/cisco-ce/roomos.cisco.com/tree/master/schemas](https://github.com/cisco-ce/roomos.cisco.com/tree/master/schemas)

Place one or more schemas in `./assets/schemas/`, for example
`./assets/schemas/11.33.1 October 2025.json`.

Then run

```sh
npx tsx ./scripts/index.ts
```

The generator writes one ignored `generated.ts` file. It contains an
`GeneratedRoomOS` map with an `"any"` entry for the common API and
version-specific entries for every input file. Consumers can generate their
own schema map and pass it as the first `CiscoRoomOS` type parameter.

When `version` or `product` is omitted, the generated `"any"` surface is used
for that selector. Supplying either constructor value narrows the API types:

```ts
import { CiscoRoomOS } from "@nat-av/driver-cisco-roomos";

const roomos = new CiscoRoomOS({
  name: "roomos",
  socket,
  version: "26.8.1 August 2026",
  product: "polaris",
  strict: false,
});
```

For a consumer-generated schema map:

```ts
import { CiscoRoomOS } from "@nat-av/driver-cisco-roomos";
import type { GeneratedRoomOS } from "./generated/roomos/index.js";

const roomos = new CiscoRoomOS<GeneratedRoomOS>({
  name: "roomos",
  socket,
  strict: false,
});
```

The script is also available from an installed package:

```sh
npx tsx ./node_modules/@nat-av/driver-cisco-roomos/.dist/scripts/index.js \
  --input ./roomos-schemas \
  --output ./generated/roomos
```

To refresh the bundled Cisco schemas, pass Cisco's `schemas.json` manifest to
the downloader:

```sh
pnpm download-schemas -- /path/to/roomos.cisco.com/schemas/schemas.json
```
