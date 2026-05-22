import { LayoutBuilder, type GridTemplate } from "../builder";

export const BUILTIN_TEMPLATES: GridTemplate[] = [
  new LayoutBuilder({ cols: 2, rows: 2 })
    .addRegion(0, 0, 1, 1, 1, { id: 0 })
    .addRegion(0, 1, 1, 1, 1, { id: 1 })
    .addRegion(1, 0, 1, 1, 1, { id: 2 })
    .addRegion(1, 1, 1, 1, 1, { id: 3 })
    .build("Quad view", { processorId: 1, id: 1 }),

  new LayoutBuilder({ cols: 2, rows: 2 })
    .addRegion(0, 0, 2, 2, 1, { id: 0 })
    .build("Fullscreen", { processorId: 2, id: 2 }),

  new LayoutBuilder({ cols: 4, rows: 4 })
    .addRegion(1, 0, 2, 2, 1, { id: 0 })
    .addRegion(1, 2, 2, 2, 1, { id: 1 })
    .build("Side by side", { processorId: 3, id: 3 }),

  // prettier-ignore
  new LayoutBuilder({ cols: 4, rows: 4 })
    .addRegion(0, 0, 1, 1, 1, { id: 0  })
    .addRegion(0, 1, 1, 1, 1, { id: 1  })
    .addRegion(0, 2, 1, 1, 1, { id: 2  })
    .addRegion(0, 3, 1, 1, 1, { id: 3  })
    .addRegion(1, 0, 1, 1, 1, { id: 4  })
    .addRegion(1, 1, 1, 1, 1, { id: 5  })
    .addRegion(1, 2, 1, 1, 1, { id: 6  })
    .addRegion(1, 3, 1, 1, 1, { id: 7  })
    .addRegion(2, 0, 1, 1, 1, { id: 8  })
    .addRegion(2, 1, 1, 1, 1, { id: 9  })
    .addRegion(2, 2, 1, 1, 1, { id: 10 })
    .addRegion(2, 3, 1, 1, 1, { id: 11 })
    .addRegion(3, 0, 1, 1, 1, { id: 12 })
    .addRegion(3, 1, 1, 1, 1, { id: 13 })
    .addRegion(3, 2, 1, 1, 1, { id: 14 })
    .addRegion(3, 3, 1, 1, 1, { id: 15 })
    .build("16 Windows", { processorId: 3, id: 3 }),
];
