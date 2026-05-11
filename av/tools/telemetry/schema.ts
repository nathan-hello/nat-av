import { z } from "zod";

const Scalar = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.instanceof(Uint8Array),
  z.null(),
  z.undefined(),
]);

// Recursive type means that we have to lazily evaluate it.
// This also means that we have to type it as any because
// typescript can't know that we're doing infinite recursion
const LogAnyValueSchema: z.ZodType<any> = z.lazy(() =>
  z.union([Scalar, z.array(LogAnyValueSchema), z.record(z.string(), LogAnyValueSchema)]),
);

export const LogAttributesSchema = z.record(z.string(), LogAnyValueSchema);

const SpanAttributeValueSchema = z.union([
  z.undefined(),
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.null(), z.undefined()])),
  z.array(z.union([z.number(), z.null(), z.undefined()])),
  z.array(z.union([z.boolean(), z.null(), z.undefined()])),
]);

// Use this for span.setAttributes()
export const SpanAttributesSchema = z.record(z.string(), SpanAttributeValueSchema);
