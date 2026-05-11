export type GridTemplate = {
  type: "builtin";
  id: number;
  name: string;
  dimensions: GridDimensions;
  regions: RectangularRegion[];
};

type GridDimensions = {
  rows: number;
  cols: number;
};

export type RectangularRegion = {
  id: number;
  row: number;
  col: number;
  width: number;
  height: number;
  zIndex?: number;
};

export class LayoutBuilder {
  dimensions: GridDimensions;
  private regions: RectangularRegion[] = [];
  private regionIdCounter = 0;

  constructor(dimensions: GridDimensions) {
    this.dimensions = dimensions;
  }

  addRegion(
    row: number,
    col: number,
    width: number,
    height: number,
    zIndex?: number,
    meta?: { id?: number },
  ): LayoutBuilder {
    const id = this.regionIdCounter++;
    this.regions.push({
      id: meta?.id ?? id,
      row,
      col,
      width,
      height,
      zIndex,
    });
    return this;
  }

  build(name: string, meta: { id: number; processorId: number }): GridTemplate {
    return {
      type: "builtin",
      id: meta.id,
      name,
      dimensions: this.dimensions,
      regions: this.regions,
    };
  }
}
