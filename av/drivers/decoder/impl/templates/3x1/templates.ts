import { LayoutBuilder, type GridTemplate } from "../builder";

export const BUILTIN_TEMPLATES: GridTemplate[] = [
  // prettier-ignore
  new LayoutBuilder({ cols: 2, rows: 2 })
    .addRegion(0, 0, 1, 1, 1, { id: 0  })
    .addRegion(0, 1, 1, 1, 1, { id: 1  })
    .addRegion(1, 0, 1, 1, 1, { id: 2  })
    .addRegion(1, 1, 1, 1, 1, { id: 3  })
    .build("Quad view", { processorId: 1, id: 1 }),

  new LayoutBuilder({ cols: 2, rows: 2 })
    .addRegion(0, 0, 2, 2, 1, { id: 0 })
    .build("Fullscreen", { processorId: 2, id: 2 }),

new LayoutBuilder({ cols: 4, rows: 4 })
  .addRegion(1, 0, 2, 2, 1, { id: 0 })
  .addRegion(1, 2, 2, 2, 1, { id: 1 })
  .build("Side by side", { processorId: 3, id: 3 })
];
