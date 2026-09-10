import type { Natav } from "../../drivers/index.js";
import type { Test } from "../../test/data.test.js";
import type { Rpc } from "../types.js";

type Shape = Natav.Shape & {
  readonly state: {
    readonly name: string;
    readonly date: Date;
    readonly nested: {
      readonly callback: () => void;
      readonly count: number;
    };
  };
  readonly api: {
    echo(input: { readonly callback: () => void; readonly name: string }): {
      readonly date: Date;
      readonly name: string;
    };
    reset(): void;
  };
};

type EchoInput = Parameters<Rpc.Api<Shape>["echo"]>[0];
type EchoData = Awaited<ReturnType<Rpc.Api<Shape>["echo"]>>["data"];
type ResetData = Awaited<ReturnType<Rpc.Api<Shape>["reset"]>>["data"];
type State = Rpc.State<Shape>;

type _callback = Test.Assert<Test.Equal<EchoInput["callback"], Rpc.Never>>;
type _inputName = Test.Assert<Test.Equal<EchoInput["name"], string>>;
type _returnDate = Test.Assert<Test.Equal<EchoData["date"], Rpc.Never>>;
type _returnName = Test.Assert<Test.Equal<EchoData["name"], string>>;
type _reset = Test.Assert<Test.Equal<ResetData, Rpc.Void>>;
type _stateDate = Test.Assert<Test.Equal<State["date"], Rpc.Never>>;
type _stateCallback = Test.Assert<
  Test.Equal<State["nested"]["callback"], Rpc.Never>
>;
type _stateCount = Test.Assert<Test.Equal<State["nested"]["count"], number>>;

// TSAS: Preventing unused type lint warning.
void (0 as unknown as _callback);
// TSAS: Preventing unused type lint warning.
void (0 as unknown as _inputName);
// TSAS: Preventing unused type lint warning.
void (0 as unknown as _returnDate);
// TSAS: Preventing unused type lint warning.
void (0 as unknown as _returnName);
// TSAS: Preventing unused type lint warning.
void (0 as unknown as _reset);
// TSAS: Preventing unused type lint warning.
void (0 as unknown as _stateDate);
// TSAS: Preventing unused type lint warning.
void (0 as unknown as _stateCallback);
// TSAS: Preventing unused type lint warning.
void (0 as unknown as _stateCount);
