export type SlotId =
  | "hero"
  | "menu-photo"
  | "menu-video"
  | "menu-music"
  | "menu-blog";

export type Direction = "top" | "bottom";

export interface SlotRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SlotConfig {
  id: SlotId;
  imageSrc: string;
  rect: SlotRect;
  direction: Direction;
}

export interface AssembleOptions {
  direction?: Direction;
  durationMs?: number;
}

export interface DisassembleOptions {
  direction?: Direction;
  durationMs?: number;
}

export interface ParticleEngine {
  mount(canvas: HTMLCanvasElement): void;
  resize(width: number, height: number, dpr: number): void;
  registerSlot(config: SlotConfig): void;
  updateSlotRect(id: SlotId, rect: SlotRect): void;
  setSlotVisible(id: SlotId, visible: boolean): void;
  assemble(id: SlotId, opts?: AssembleOptions): Promise<void>;
  disassemble(id: SlotId, opts?: DisassembleOptions): Promise<void>;
  setInteractionEnabled(enabled: boolean): void;
  destroy(): void;
}
