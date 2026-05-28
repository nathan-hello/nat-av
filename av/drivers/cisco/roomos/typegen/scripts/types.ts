export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type Valuespace =
  | string
  | {
      type?: string;
      Values?: readonly string[];
      values?: readonly string[];
      multiple?: string | number | boolean;
      Min?: string | number;
      Max?: string | number;
      Step?: string | number;
      MinLength?: string | number;
      MaxLength?: string | number;
      [key: string]: unknown;
    };

export type Param = {
  name: string;
  description?: string;
  required?: string | number | boolean;
  default?: JsonValue;
  valuespace: Valuespace;
  [key: string]: unknown;
};

export type EventNode = {
  children?: Record<string, EventNode>;
  valuespace?: Valuespace;
  values?: readonly string[];
  multiple?: string | number | boolean;
  required?: string | number | boolean;
  [key: string]: unknown;
};

export type SchemaEntry = {
  id: number;
  path: string;
  normPath?: string;
  products: readonly string[];
  type: "Command" | "Configuration" | "Status" | "Event";
  attributes: {
    access?: string;
    backend?: string;
    description?: string;
    multiline?: string | number | boolean;
    params?: readonly Param[];
    privacyimpact?: string;
    read?: readonly unknown[];
    role?: readonly string[];
    state_dependent?: string;
    unavailableStates?: string;
    valuespace?: Valuespace;
    children?: Record<string, EventNode>;
    [key: string]: unknown;
  };
};

export type SchemaJson = {
  objects: readonly SchemaEntry[];
};

export type ReducedValuespace =
  | string
  | {
      type?: string;
      Values?: string[];
      multiple?: true;
    };

export type ReducedParam = {
  name: string;
  required?: boolean;
  valuespace: ReducedValuespace;
};

export type ReducedEventNode = {
  children?: Record<string, ReducedEventNode>;
  valuespace?: ReducedValuespace;
  multiple?: true;
  required?: true;
};

export type ReducedEntry = {
  source: SchemaEntry;
  path: string;
  products: string[];
  type: SchemaEntry["type"];
  attributes: {
    params?: ReducedParam[];
    valuespace?: ReducedValuespace;
    children?: Record<string, ReducedEventNode>;
    multiline?: true;
  };
};

export type CommandTreeNode = {
  array: boolean;
  children: Map<string, CommandTreeNode>;
  entry?: ReducedEntry;
};
