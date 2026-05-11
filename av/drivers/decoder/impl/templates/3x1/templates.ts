import { LayoutBuilder, type GridTemplate } from "../builder";

export const BUILTIN_TEMPLATES: GridTemplate[] = [
  // prettier-ignore
  new LayoutBuilder({ cols: 3, rows: 1 })
    .addRegion(0, 0, 2, 2, 1, { id: 1  })
    .addRegion(0, 2, 2, 2, 1, { id: 2  })
    .addRegion(0, 4, 2, 2, 1, { id: 3  })
    .build("Template 1", { processorId: 1, id: 1 }),

  new LayoutBuilder({ cols: 3, rows: 1 })
    .addRegion(0, 0, 2, 2, 1, { id: 1 })
    .addRegion(0, 2, 1, 1, 1, { id: 2 })
    .addRegion(1, 2, 1, 1, 1, { id: 3 })
    .addRegion(0, 3, 1, 1, 1, { id: 4 })
    .addRegion(1, 3, 1, 1, 1, { id: 5 })
    .addRegion(0, 4, 2, 2, 1, { id: 6 })
    .build("Template 2", { processorId: 2, id: 2 }),

  new LayoutBuilder({ cols: 3, rows: 1 })
    .addRegion(0, 0, 1, 1, 1, { id: 1 })
    .addRegion(1, 0, 1, 1, 1, { id: 1 })
    .addRegion(0, 1, 2, 2, 1, { id: 2 })
    .addRegion(0, 3, 2, 2, 1, { id: 2 })
    .addRegion(0, 5, 1, 1, 1, { id: 1 })
    .addRegion(1, 5, 1, 1, 1, { id: 1 })
    .build("Template 2", { processorId: 3, id: 3 }),
];
