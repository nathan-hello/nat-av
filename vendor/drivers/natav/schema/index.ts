import { Driver } from "@av/drivers";
import { state } from "@drivers/natav/schema/output/state";

export class SchemaGenerator<const N extends string> extends Driver<N> {
  api = {}
  state = state;
}
