export type MonitorRegion = {
  monitorId: number;
  localX: number;
  localY: number;
  width: number;
  height: number;
};

export class Monitor {
  readonly id: number;
  readonly resX: number;
  readonly resY: number;
  readonly offsetX: number;
  readonly offsetY: number;

  constructor(config: { id: number; resX: number; resY: number; offsetX: number; offsetY: number }) {
    this.id = config.id;
    this.resX = config.resX;
    this.resY = config.resY;
    this.offsetX = config.offsetX;
    this.offsetY = config.offsetY;
  }
}
