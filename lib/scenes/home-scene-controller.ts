import type { SlotId } from "@/lib/particles/types";

export type HomeSceneState = "collapsed" | "expanding" | "expanded";

interface HomeSceneControllerOptions {
  assemble: (id: SlotId, durationMs?: number) => Promise<void>;
  refreshSlotRect: (id: SlotId) => boolean;
  onStateChange?: (state: HomeSceneState) => void;
  staggerMs?: number;
  durationMs?: number;
}

const MENU_SLOT_IDS: SlotId[] = ["menu-photo", "menu-video", "menu-music", "menu-blog"];

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export class HomeSceneController {
  private state: HomeSceneState = "collapsed";
  private readonly assemble: HomeSceneControllerOptions["assemble"];
  private readonly refreshSlotRect: HomeSceneControllerOptions["refreshSlotRect"];
  private readonly onStateChange?: HomeSceneControllerOptions["onStateChange"];
  private readonly staggerMs: number;
  private readonly durationMs: number;
  private inFlightExpand: Promise<void> | null = null;

  constructor(options: HomeSceneControllerOptions) {
    this.assemble = options.assemble;
    this.refreshSlotRect = options.refreshSlotRect;
    this.onStateChange = options.onStateChange;
    this.staggerMs = options.staggerMs ?? 350;
    this.durationMs = options.durationMs ?? 1100;
  }

  getState() {
    return this.state;
  }

  async expandMenu() {
    if (this.state === "expanded") {
      return;
    }

    if (this.inFlightExpand) {
      return this.inFlightExpand;
    }

    this.setState("expanding");

    this.inFlightExpand = (async () => {
      try {
        const pendingAssemblies: Promise<void>[] = [];

        for (const [index, slotId] of MENU_SLOT_IDS.entries()) {
          if (index > 0) {
            await delay(this.staggerMs);
          }

          if (!this.refreshSlotRect(slotId)) {
            throw new Error(`Menu slot "${slotId}" has no measurable rect.`);
          }

          pendingAssemblies.push(this.assemble(slotId, this.durationMs));
        }

        await Promise.all(pendingAssemblies);
        this.setState("expanded");
      } catch (error) {
        this.setState("collapsed");
        throw error;
      }
    })();

    try {
      await this.inFlightExpand;
    } finally {
      this.inFlightExpand = null;
    }
  }

  private setState(state: HomeSceneState) {
    this.state = state;
    this.onStateChange?.(state);
  }
}
