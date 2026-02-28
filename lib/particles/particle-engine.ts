import type {
  AssembleOptions,
  Direction,
  DisassembleOptions,
  ParticleEngine,
  SlotConfig,
  SlotId,
  SlotRect
} from "@/lib/particles/types";

interface Particle {
  x: number;
  y: number;
  tx: number;
  ty: number;
  vx: number;
  vy: number;
  color: string;
  alpha: number;
  size: number;
}

interface AmbientParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseVx: number;
  baseVy: number;
  size: number;
  alpha: number;
}

interface TransitionState {
  status: "assembling" | "disassembling";
  startTime: number;
  durationMs: number;
  resolve: () => void;
  direction: Direction;
}

interface SlotState {
  config: SlotConfig;
  visible: boolean;
  image: HTMLImageElement;
  imageReady: Promise<void>;
  particles: Particle[];
  status: "hidden" | "assembling" | "assembled" | "disassembling";
  transition?: TransitionState;
  alpha: number;
}

interface MouseState {
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  vx: number;
  vy: number;
  active: boolean;
  down: boolean;
}

const DEFAULT_DURATION_MS = 1200;
const SAMPLE_STEP = 2;
const MIN_ALPHA_THRESHOLD = 24;
const PARTICLE_SIZE = 0.92;
const SPRING = 0.085;
const FRICTION = 0.84;
const INTERACTION_RADIUS = 110;
const INTERACTION_FORCE = 0.42;
const DRAG_FORCE = 0.72;
const AMBIENT_PARTICLE_COUNT = 70;
const AMBIENT_MOUSE_RADIUS = 180;
const AMBIENT_MOUSE_FORCE = 0.0028;
const AMBIENT_FRICTION = 0.985;
const AMBIENT_RETURN = 0.008;
const ASSEMBLE_ALPHA_RATE = 0.12;
const DISASSEMBLE_ALPHA_RATE = 0.1;
const TRANSITION_SETTLE_DISTANCE = 1.4;
const TRANSITION_SETTLE_VELOCITY = 0.12;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function createImage(src: string) {
  const image = new Image();
  image.decoding = "async";

  const imageReady = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
  });

  image.src = src;

  return { image, imageReady };
}

export class CanvasParticleEngine implements ParticleEngine {
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private slots = new Map<SlotId, SlotState>();
  private ambientParticles: AmbientParticle[] = [];
  private rafId: number | null = null;
  private lastFrameTime = 0;
  private interactionEnabled = true;
  private onBusyChange?: (busy: boolean) => void;
  private busy = false;
  private mouse: MouseState = {
    x: 0,
    y: 0,
    lastX: 0,
    lastY: 0,
    vx: 0,
    vy: 0,
    active: false,
    down: false
  };
  private handlePointerMove = (event: PointerEvent) => {
    this.mouse.active = true;
    this.mouse.lastX = this.mouse.x;
    this.mouse.lastY = this.mouse.y;
    this.mouse.x = event.clientX;
    this.mouse.y = event.clientY;
    this.mouse.vx = event.clientX - this.mouse.lastX;
    this.mouse.vy = event.clientY - this.mouse.lastY;
  };
  private handlePointerDown = () => {
    this.mouse.down = true;
  };
  private handlePointerUp = () => {
    this.mouse.down = false;
  };
  private handlePointerLeave = () => {
    this.mouse.active = false;
    this.mouse.down = false;
    this.mouse.vx = 0;
    this.mouse.vy = 0;
  };

  constructor(onBusyChange?: (busy: boolean) => void) {
    this.onBusyChange = onBusyChange;
  }

  mount(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: true });

    if (!this.context) {
      throw new Error("Canvas2D context is not available.");
    }

    this.context.imageSmoothingEnabled = true;
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("pointerup", this.handlePointerUp);
    window.addEventListener("pointercancel", this.handlePointerUp);
    window.addEventListener("blur", this.handlePointerLeave);
    document.addEventListener("pointerleave", this.handlePointerLeave);

    this.lastFrameTime = performance.now();
    this.createAmbientParticles();
    this.startLoop();
  }

  resize(width: number, height: number, dpr: number) {
    if (!this.canvas || !this.context) {
      return;
    }

    this.width = width;
    this.height = height;
    this.dpr = Math.max(1, dpr);

    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.createAmbientParticles();
  }

  registerSlot(config: SlotConfig) {
    const existing = this.slots.get(config.id);
    const normalizedConfig = { ...config, rect: { ...config.rect } };

    if (existing) {
      existing.config = normalizedConfig;
      this.prepareParticles(existing);
      return;
    }

    const { image, imageReady } = createImage(config.imageSrc);
    const slot: SlotState = {
      config: normalizedConfig,
      visible: false,
      image,
      imageReady,
      particles: [],
      status: "hidden",
      alpha: 0
    };

    imageReady
      .then(() => {
        this.prepareParticles(slot);
      })
      .catch((error) => {
        console.error(error);
      });

    this.slots.set(config.id, slot);
  }

  updateSlotRect(id: SlotId, rect: SlotRect) {
    const slot = this.slots.get(id);

    if (!slot) {
      return;
    }

    slot.config.rect = { ...rect };
    if (slot.image.complete) {
      this.prepareParticles(slot);
      if (slot.status === "assembled") {
        for (const particle of slot.particles) {
          particle.x = particle.tx;
          particle.y = particle.ty;
          particle.vx = 0;
          particle.vy = 0;
        }
      }
    }
  }

  setSlotVisible(id: SlotId, visible: boolean) {
    const slot = this.slots.get(id);

    if (!slot) {
      return;
    }

    slot.visible = visible;
    if (!visible) {
      slot.status = "hidden";
      slot.alpha = 0;
      slot.transition = undefined;
    }
  }

  async assemble(id: SlotId, opts: AssembleOptions = {}) {
    const slot = this.getSlot(id);
    await slot.imageReady;
    await this.runTransition(slot, "assembling", opts.direction ?? slot.config.direction, opts.durationMs ?? DEFAULT_DURATION_MS);
  }

  async disassemble(id: SlotId, opts: DisassembleOptions = {}) {
    const slot = this.getSlot(id);
    await slot.imageReady;
    await this.runTransition(slot, "disassembling", opts.direction ?? slot.config.direction, opts.durationMs ?? DEFAULT_DURATION_MS);
  }

  setInteractionEnabled(enabled: boolean) {
    this.interactionEnabled = enabled;
    if (this.canvas) {
      this.canvas.style.pointerEvents = enabled ? "none" : "auto";
    }
  }

  destroy() {
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerdown", this.handlePointerDown);
    window.removeEventListener("pointerup", this.handlePointerUp);
    window.removeEventListener("pointercancel", this.handlePointerUp);
    window.removeEventListener("blur", this.handlePointerLeave);
    document.removeEventListener("pointerleave", this.handlePointerLeave);

    this.slots.clear();
    this.ambientParticles = [];
    this.canvas = null;
    this.context = null;
  }

  private getSlot(id: SlotId) {
    const slot = this.slots.get(id);

    if (!slot) {
      throw new Error(`Slot "${id}" is not registered.`);
    }

    return slot;
  }

  private async runTransition(
    slot: SlotState,
    status: "assembling" | "disassembling",
    direction: Direction,
    durationMs: number
  ) {
    if (slot.config.rect.w <= 0 || slot.config.rect.h <= 0) {
      throw new Error(`Slot "${slot.config.id}" has no measurable rect.`);
    }

    if (slot.transition) {
      slot.transition.resolve();
      slot.transition = undefined;
    }

    slot.visible = true;
    slot.status = status;
    this.setInteractionEnabled(false);

    const startY = this.getOffscreenY(direction, slot.config.rect);

    for (const particle of slot.particles) {
      if (status === "assembling") {
        particle.x = randomBetween(slot.config.rect.x, slot.config.rect.x + slot.config.rect.w);
        particle.y = startY - randomBetween(0, slot.config.rect.h * 0.25);
        particle.vx = randomBetween(-0.35, 0.35);
        particle.vy = randomBetween(1.2, 3.6);
      } else {
        particle.tx = randomBetween(slot.config.rect.x, slot.config.rect.x + slot.config.rect.w);
        particle.ty = startY - randomBetween(0, slot.config.rect.h * 0.35);
        particle.vx += randomBetween(-0.4, 0.4);
        particle.vy += randomBetween(-1.2, 0.4);
      }
    }

    slot.alpha = status === "assembling" ? 0 : 1;

    const promise = new Promise<void>((resolve) => {
      slot.transition = {
        status,
        startTime: performance.now(),
        durationMs,
        resolve,
        direction
      };
    });

    this.updateBusyState();
    return promise;
  }

  private getOffscreenY(direction: Direction, rect: SlotRect) {
    if (direction === "bottom") {
      return this.height + randomBetween(16, Math.max(48, rect.h * 0.6));
    }

    return -randomBetween(40, Math.max(120, rect.h * 1.25));
  }

  private prepareParticles(slot: SlotState) {
    const { rect } = slot.config;
    if (rect.w <= 0 || rect.h <= 0 || !slot.image.complete) {
      return;
    }

    const sampleCanvas = document.createElement("canvas");
    const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });

    if (!sampleContext) {
      return;
    }

    const sampleWidth = Math.max(1, Math.round(rect.w));
    const sampleHeight = Math.max(1, Math.round(rect.h));

    sampleCanvas.width = sampleWidth;
    sampleCanvas.height = sampleHeight;
    sampleContext.clearRect(0, 0, sampleWidth, sampleHeight);
    sampleContext.globalAlpha = 1;
    sampleContext.drawImage(slot.image, 0, 0, sampleWidth, sampleHeight);

    const { data, width, height } = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight);
    const particles: Particle[] = [];

    for (let y = 0; y < height; y += SAMPLE_STEP) {
      for (let x = 0; x < width; x += SAMPLE_STEP) {
        const index = (y * width + x) * 4;
        const alpha = data[index + 3];

        if (alpha < MIN_ALPHA_THRESHOLD) {
          continue;
        }

        const px = rect.x + x + SAMPLE_STEP * 0.5;
        const py = rect.y + y + SAMPLE_STEP * 0.5;

        particles.push({
          x: px,
          y: py,
          tx: px,
          ty: py,
          vx: 0,
          vy: 0,
          color: `rgba(${data[index]}, ${data[index + 1]}, ${data[index + 2]}, ${alpha / 255})`,
          alpha: alpha / 255,
          size: PARTICLE_SIZE
        });
      }
    }

    slot.particles = particles;
  }

  private createAmbientParticles() {
    if (this.width <= 0 || this.height <= 0) {
      return;
    }

    const count = Math.max(32, Math.round((this.width * this.height) / 26000));
    const targetCount = Math.min(AMBIENT_PARTICLE_COUNT, count);
    this.ambientParticles = new Array<AmbientParticle>(targetCount);

    for (let i = 0; i < targetCount; i += 1) {
      const baseVx = randomBetween(-0.08, 0.08);
      const baseVy = randomBetween(-0.05, 0.05);
      this.ambientParticles[i] = {
        x: randomBetween(0, this.width),
        y: randomBetween(0, this.height),
        vx: baseVx,
        vy: baseVy,
        baseVx,
        baseVy,
        size: randomBetween(0.5, 1.4),
        alpha: randomBetween(0.14, 0.36)
      };
    }
  }

  private startLoop() {
    if (this.rafId !== null) {
      return;
    }

    this.rafId = window.requestAnimationFrame((timestamp) => this.render(timestamp));
  }

  private render(timestamp: number) {
    this.rafId = window.requestAnimationFrame((nextTimestamp) => this.render(nextTimestamp));

    if (!this.context) {
      return;
    }

    const deltaMs = this.lastFrameTime === 0 ? 16.67 : timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;
    const delta = clamp(deltaMs / 16.67, 0.6, 1.6);

    this.context.clearRect(0, 0, this.width, this.height);
    this.updateAmbientParticles(delta);
    this.drawAmbientParticles();

    let hasTransition = false;

    for (const slot of this.slots.values()) {
      if (!slot.visible || slot.particles.length === 0) {
        continue;
      }

      if (slot.transition) {
        hasTransition = true;
        this.updateTransition(slot, timestamp);
      }

      this.updateImageParticles(slot, delta);
      this.drawSlot(slot);
    }

    if (this.busy !== hasTransition) {
      this.busy = hasTransition;
      this.onBusyChange?.(hasTransition);
    }

    if (!hasTransition) {
      this.setInteractionEnabled(true);
    }
  }

  private updateTransition(slot: SlotState, timestamp: number) {
    const transition = slot.transition;

    if (!transition) {
      return;
    }

    if (transition.status === "assembling") {
      slot.alpha += (1 - slot.alpha) * ASSEMBLE_ALPHA_RATE;
    } else {
      slot.alpha += (0 - slot.alpha) * DISASSEMBLE_ALPHA_RATE;
    }

    const elapsed = timestamp - transition.startTime;
    if (elapsed < transition.durationMs) {
      return;
    }

    let settled = true;

    for (let index = 0; index < slot.particles.length; index += 1) {
      const particle = slot.particles[index];
      const dx = particle.tx - particle.x;
      const dy = particle.ty - particle.y;

      if (
        Math.abs(dx) > TRANSITION_SETTLE_DISTANCE ||
        Math.abs(dy) > TRANSITION_SETTLE_DISTANCE ||
        Math.abs(particle.vx) > TRANSITION_SETTLE_VELOCITY ||
        Math.abs(particle.vy) > TRANSITION_SETTLE_VELOCITY
      ) {
        settled = false;
        break;
      }
    }

    if (!settled) {
      return;
    }

    const resolve = transition.resolve;
    slot.transition = undefined;

    if (transition.status === "assembling") {
      slot.status = "assembled";
      slot.alpha = 1;
      for (let index = 0; index < slot.particles.length; index += 1) {
        const particle = slot.particles[index];
        particle.x = particle.tx;
        particle.y = particle.ty;
        particle.vx = 0;
        particle.vy = 0;
      }
    } else {
      slot.status = "hidden";
      slot.visible = false;
      slot.alpha = 0;
    }

    resolve();
  }

  private updateImageParticles(slot: SlotState, delta: number) {
    const activeMouse = this.mouse.active && this.interactionEnabled;
    const radiusSq = INTERACTION_RADIUS * INTERACTION_RADIUS;
    const interactionForce = this.mouse.down ? DRAG_FORCE : INTERACTION_FORCE;

    for (let index = 0; index < slot.particles.length; index += 1) {
      const particle = slot.particles[index];
      const springX = (particle.tx - particle.x) * SPRING;
      const springY = (particle.ty - particle.y) * SPRING;

      particle.vx += springX * delta;
      particle.vy += springY * delta;

      if (activeMouse) {
        const dx = particle.x - this.mouse.x;
        const dy = particle.y - this.mouse.y;
        const distanceSq = dx * dx + dy * dy;

        if (distanceSq < radiusSq && distanceSq > 0.0001) {
          const distance = Math.sqrt(distanceSq);
          const influence = 1 - distance / INTERACTION_RADIUS;
          const force = influence * interactionForce;
          const nx = dx / distance;
          const ny = dy / distance;

          particle.vx += nx * force * delta + this.mouse.vx * 0.012 * influence;
          particle.vy += ny * force * delta + this.mouse.vy * 0.012 * influence;
        }
      }

      particle.vx *= FRICTION;
      particle.vy *= FRICTION;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
    }
  }

  private updateAmbientParticles(delta: number) {
    const activeMouse = this.mouse.active;
    const radiusSq = AMBIENT_MOUSE_RADIUS * AMBIENT_MOUSE_RADIUS;

    for (let index = 0; index < this.ambientParticles.length; index += 1) {
      const particle = this.ambientParticles[index];
      particle.vx += (particle.baseVx - particle.vx) * AMBIENT_RETURN * delta;
      particle.vy += (particle.baseVy - particle.vy) * AMBIENT_RETURN * delta;

      if (activeMouse) {
        const dx = particle.x - this.mouse.x;
        const dy = particle.y - this.mouse.y;
        const distanceSq = dx * dx + dy * dy;

        if (distanceSq < radiusSq && distanceSq > 0.0001) {
          const distance = Math.sqrt(distanceSq);
          const influence = 1 - distance / AMBIENT_MOUSE_RADIUS;
          particle.vx += dx * AMBIENT_MOUSE_FORCE * influence * delta;
          particle.vy += dy * AMBIENT_MOUSE_FORCE * influence * delta;
        }
      }

      particle.vx *= AMBIENT_FRICTION;
      particle.vy *= AMBIENT_FRICTION;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;

      if (particle.x < -8) {
        particle.x = this.width + 8;
      } else if (particle.x > this.width + 8) {
        particle.x = -8;
      }

      if (particle.y < -8) {
        particle.y = this.height + 8;
      } else if (particle.y > this.height + 8) {
        particle.y = -8;
      }
    }
  }

  private drawAmbientParticles() {
    if (!this.context) {
      return;
    }

    for (let index = 0; index < this.ambientParticles.length; index += 1) {
      const particle = this.ambientParticles[index];
      this.context.globalAlpha = particle.alpha;
      this.context.fillStyle = "rgba(255, 255, 255, 0.92)";
      this.context.fillRect(particle.x, particle.y, particle.size, particle.size);
    }

    this.context.globalAlpha = 1;
  }

  private drawSlot(slot: SlotState) {
    if (!this.context) {
      return;
    }

    for (let index = 0; index < slot.particles.length; index += 1) {
      const particle = slot.particles[index];
      this.context.globalAlpha = slot.alpha * particle.alpha;
      this.context.fillStyle = particle.color;
      this.context.fillRect(particle.x, particle.y, particle.size, particle.size);
    }

    this.context.globalAlpha = 1;
  }

  private updateBusyState() {
    let hasTransition = false;

    for (const slot of this.slots.values()) {
      if (slot.transition) {
        hasTransition = true;
        break;
      }
    }

    if (this.busy !== hasTransition) {
      this.busy = hasTransition;
      this.onBusyChange?.(hasTransition);
    }
  }
}
