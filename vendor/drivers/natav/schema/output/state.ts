import type { Driver } from "@av/drivers";
import schema from "@drivers/natav/schema/output/schema01";
import type { Schema } from "../types";

export const state: Record<string, Schema.Schema<Driver>> = {
  "video-wall": schema,
};
