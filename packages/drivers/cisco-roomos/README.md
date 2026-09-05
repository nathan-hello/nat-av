# Cisco RoomOS Driver

The idea is that we take a schema from the following repo:

[https://github.com/cisco-ce/roomos.cisco.com/tree/master/schemas](https://github.com/cisco-ce/roomos.cisco.com/tree/master/schemas)

Place it in `./typegen/schemas/`, for example `./typegen/schemas/11.33.1 October 2025.json`

Then run

```sh
npx tsx ./typegen/scripts/index.ts
```

And it will generate a `.ts` file with a typesafe API that will be given
to a writer. That writer will take the JS function path + args and serialize
it to a JSONRPC, XML, or Terminal string. Then, it's sent over the socket
with the driver in `./index.ts`. After that the tests will pass.
