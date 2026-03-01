type ThreeNamespace = {
  WebGLRenderer: new (opts: { canvas: HTMLCanvasElement; antialias: boolean; alpha: boolean }) => any;
  Scene: new () => any;
  OrthographicCamera: new (
    left: number,
    right: number,
    top: number,
    bottom: number,
    near: number,
    far: number
  ) => any;
  Vector3: new (x?: number, y?: number, z?: number) => any;
  Geometry: new () => any;
  PointCloudMaterial: new () => any;
  Color: new (color: string) => any;
  Points: new (geometry: any, material: any) => any;
};

interface Circle {
  x: number;
  y: number;
  dx: number;
  dy: number;
  radius: number;
  minRadius: number;
  fill: string;
}

interface OverlayVertex {
  x: number;
  y: number;
  z: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  phase: number;
  driftX: number;
  driftY: number;
}

interface PhotoVertex {
  x: number;
  y: number;
  z: number;
  speed: number;
  baseX: number;
  baseY: number;
  baseZ: number;
}

interface ReferenceEngineOptions {
  container: HTMLElement;
  canvasMain: HTMLCanvasElement;
  canvasStars?: HTMLCanvasElement;
  imageSrc: string;
  maskSrc?: string;
}

const STAR_COLORS = ["#4c1a22", "#4c1a23", "#5d6268", "#1f2e37", "#474848", "#542619", "#ead8cf", "#4c241f", "#d6b9b1", "#964a47"];
const STAR_MOUSE_DISTANCE = 50;
const STAR_RADIUS = 0.5;
const STAR_MAX_RADIUS = 1.5;
const PORTRAIT_CANVAS_WIDTH = 440;
const PORTRAIT_CANVAS_HEIGHT = 660;
const SPEED = 10;
const IMAGE_SAMPLE_SCALE = 2;
const IMAGE_SAMPLE_STEP = 1;
const IMAGE_ALPHA_THRESHOLD = 12;
const PHOTO_POINT_SIZE = 0.68;
const OVERLAY_STEP = 10;
const OVERLAY_ALPHA_THRESHOLD = 48;
const OVERLAY_MASK_THRESHOLD = 127;
const OVERLAY_POINT_SIZE = 1.08;
const OVERLAY_MOUSE_RADIUS = 90;
const OVERLAY_MOUSE_FORCE = 2.2;
const PARALLAX_X = 4;
const PARALLAX_Y = 3;
const OVERLAY_PARALLAX_X = 6;
const OVERLAY_PARALLAX_Y = 4;

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function getThree(): ThreeNamespace | null {
  if (typeof window === "undefined") {
    return null;
  }

  return ((window as typeof window & { THREE?: ThreeNamespace }).THREE ?? null) as ThreeNamespace | null;
}

function getImageData(image: HTMLImageElement, sampleScale: number) {
  const canvas = document.createElement("canvas");
  canvas.width = PORTRAIT_CANVAS_WIDTH * sampleScale;
  canvas.height = PORTRAIT_CANVAS_HEIGHT * sampleScale;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to acquire 2D context for image sampling.");
  }

  ctx.imageSmoothingEnabled = false;

  const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const offsetX = (canvas.width - drawWidth) / 2;
  const offsetY = (canvas.height - drawHeight) / 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function getMaskData(mask: HTMLImageElement, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to acquire 2D context for mask sampling.");
  }

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(mask, 0, 0, width, height);

  return ctx.getImageData(0, 0, width, height);
}

function getPixel(imageData: ImageData, x: number, y: number) {
  const position = (x + imageData.width * y) * 4;
  const data = imageData.data;

  return {
    r: data[position],
    g: data[position + 1],
    b: data[position + 2],
    a: data[position + 3]
  };
}

export function mountReferenceEngine(opts: ReferenceEngineOptions) {
  const three = getThree();
  if (!three) {
    throw new Error("THREE r72 is required before mounting the reference engine.");
  }
  const THREE = three;

  const { container, canvasMain, canvasStars, imageSrc, maskSrc } = opts;

  let renderer: any = null;
  let scene: any = null;
  let camera: any = null;
  let particles: any = null;
  let overlayParticles: any = null;
  let imageData: ImageData | null = null;
  let maskData: ImageData | null = null;
  let rafId: number | null = null;
  let ww = window.innerWidth;
  let wh = window.innerHeight;
  let dpr = Math.max(1, window.devicePixelRatio || 1);
  let lastMousePos = { x: 0, y: 0 };
  let isMouseDown = false;
  let destroyed = false;
  let pendingImageReady = false;
  let pendingMaskReady = !maskSrc;
  const centerVector = new three.Vector3(0, 0, 0);
  const image = new Image();
  const maskImage = new Image();

  const starsCanvas = canvasStars ?? document.createElement("canvas");
  const starsContext = starsCanvas.getContext("2d");
  const starMouse = {
    x: -10_000,
    y: -10_000
  };
  let circles: Circle[] = [];

  function prepareStars() {
    if (!starsContext) {
      return;
    }

    circles = [];
    for (let i = 0; i < 1200; i += 1) {
      const radius = STAR_RADIUS;
      circles.push({
        x: Math.random() * (ww - radius * 2) + radius,
        y: Math.random() * (wh - radius * 2) + radius,
        dx: (Math.random() - 0.5) * 1.5,
        dy: (Math.random() - 1) * 1.5,
        radius,
        minRadius: radius,
        fill: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)] ?? STAR_COLORS[0]
      });
    }
  }

  function updateStars() {
    if (!starsContext) {
      return;
    }

    starsContext.clearRect(0, 0, ww, wh);

    for (let i = 0; i < circles.length; i += 1) {
      const circle = circles[i];
      if (!circle) {
        continue;
      }

      if (circle.x + circle.radius > ww || circle.x - circle.radius < 0) {
        circle.dx = -circle.dx;
      }
      if (circle.y + circle.radius > wh || circle.y - circle.radius < 0) {
        circle.dy = -circle.dy;
      }

      circle.x += circle.dx;
      circle.y += circle.dy;

      if (
        starMouse.x - circle.x < STAR_MOUSE_DISTANCE &&
        starMouse.x - circle.x > -STAR_MOUSE_DISTANCE &&
        starMouse.y - circle.y < STAR_MOUSE_DISTANCE &&
        starMouse.y - circle.y > -STAR_MOUSE_DISTANCE
      ) {
        if (circle.radius < STAR_MAX_RADIUS) {
          circle.radius += 1;
        }
      } else if (circle.radius > circle.minRadius) {
        circle.radius -= 1;
      }

      starsContext.beginPath();
      starsContext.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2, false);
      starsContext.fillStyle = circle.fill;
      starsContext.fill();
    }
  }

  function createPhotoPoint(x: number, y: number) {
    const HERO_OFFSET_X = -260;
    const baseX = x / IMAGE_SAMPLE_SCALE - PORTRAIT_CANVAS_WIDTH / 2 + (HERO_OFFSET_X - 440 * 0.5);
    const baseY = -(y / IMAGE_SAMPLE_SCALE) + PORTRAIT_CANVAS_HEIGHT / 2;
    const baseZ = -Math.random() * 500;
    const vertex = new THREE.Vector3(baseX, baseY, baseZ) as PhotoVertex;
    vertex.baseX = baseX;
    vertex.baseY = baseY;
    vertex.baseZ = baseZ;
    vertex.speed = Math.random() / SPEED + 0.015;
    return vertex;
  }

  function drawTheMap() {
    if (!scene || !imageData) {
      return;
    }

    const geometry = new THREE.Geometry();
    const material = new THREE.PointCloudMaterial();
    material.vertexColors = true;
    material.transparent = true;
    material.opacity = 0.98;
    material.size = PHOTO_POINT_SIZE;
    material.sizeAttenuation = false;
    material.depthWrite = false;
    material.blending = 2;

    for (let y = 0, y2 = imageData.height; y < y2; y += IMAGE_SAMPLE_STEP) {
      for (let x = 0, x2 = imageData.width; x < x2; x += IMAGE_SAMPLE_STEP) {
        if (imageData.data[x * 4 + y * 4 * imageData.width] > IMAGE_ALPHA_THRESHOLD) {
          const vertex = createPhotoPoint(x, y);
          const pixelColor = getPixel(imageData, x, y);
          const color = `rgb(${pixelColor.r}, ${pixelColor.g}, ${pixelColor.b})`;
          geometry.colors.push(new THREE.Color(color));
          geometry.vertices.push(vertex);
        }
      }
    }

    particles = new THREE.Points(geometry, material);
    scene.add(particles);
  }

  function drawOverlayParticles() {
    if (!scene || !imageData || !maskData) {
      return;
    }

    const geometry = new THREE.Geometry();
    const material = new THREE.PointCloudMaterial();
    material.vertexColors = true;
    material.transparent = true;
    material.opacity = 0.18;
    material.size = OVERLAY_POINT_SIZE;
    material.sizeAttenuation = false;
    material.depthWrite = false;
    material.blending = 2;

    for (let y = 0, y2 = imageData.height; y < y2; y += OVERLAY_STEP) {
      for (let x = 0, x2 = imageData.width; x < x2; x += OVERLAY_STEP) {
        const index = (x + imageData.width * y) * 4;
        const alpha = imageData.data[index + 3];
        const maskValue = maskData.data[index];

        if (alpha <= OVERLAY_ALPHA_THRESHOLD || maskValue <= OVERLAY_MASK_THRESHOLD) {
          continue;
        }

        if (Math.random() > 0.2) {
          continue;
        }

        const baseX = x / IMAGE_SAMPLE_SCALE - PORTRAIT_CANVAS_WIDTH / 2 + (500 - 440 * 0.5);
        const baseY = -(y / IMAGE_SAMPLE_SCALE) + PORTRAIT_CANVAS_HEIGHT / 2;
        const baseZ = -randomBetween(4, 28);
        const vertex = new THREE.Vector3(baseX, baseY, baseZ) as OverlayVertex;
        vertex.baseX = baseX;
        vertex.baseY = baseY;
        vertex.baseZ = baseZ;
        vertex.phase = Math.random() * Math.PI * 2;
        vertex.driftX = randomBetween(0.08, 0.28);
        vertex.driftY = randomBetween(0.06, 0.2);

        const pixelColor = getPixel(imageData, x, y);
        const color = `rgb(${pixelColor.r}, ${pixelColor.g}, ${pixelColor.b})`;
        geometry.colors.push(new THREE.Color(color));
        geometry.vertices.push(vertex);
      }
    }

    overlayParticles = new THREE.Points(geometry, material);
    scene.add(overlayParticles);
  }

  function maybeInitScene() {
    if (renderer || destroyed || !pendingImageReady || !pendingMaskReady || !image.complete || !image.naturalWidth) {
      return;
    }

    renderer = new THREE.WebGLRenderer({
      canvas: canvasMain,
      antialias: false,
      alpha: true
    });
    renderer.setPixelRatio(dpr);
    renderer.setSize(ww, wh);

    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(ww / -2, ww / 2, wh / 2, wh / -2, 1, 1000);
    camera.position.set(0, -20, 4);
    camera.lookAt(centerVector);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    scene.add(camera);

    imageData = getImageData(image, IMAGE_SAMPLE_SCALE);
    if (maskSrc && maskImage.complete && maskImage.naturalWidth) {
      maskData = getMaskData(maskImage, imageData.width, imageData.height);
    }

    drawTheMap();
    if (maskData) {
      drawOverlayParticles();
    }
  }

  function onResize() {
    ww = window.innerWidth;
    wh = window.innerHeight;
    dpr = Math.max(1, window.devicePixelRatio || 1);

    container.style.height = `${wh}px`;

    canvasMain.width = Math.round(ww * dpr);
    canvasMain.height = Math.round(wh * dpr);
    canvasMain.style.width = `${ww}px`;
    canvasMain.style.height = `${wh}px`;

    starsCanvas.width = Math.round(ww * dpr);
    starsCanvas.height = Math.round(wh * dpr);
    starsCanvas.style.width = `${ww}px`;
    starsCanvas.style.height = `${wh}px`;

    if (starsContext) {
      starsContext.setTransform(1, 0, 0, 1, 0, 0);
      starsContext.scale(dpr, dpr);
      starsContext.imageSmoothingEnabled = false;
    }

    if (renderer && camera) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(ww, wh);
      camera.left = ww / -2;
      camera.right = ww / 2;
      camera.top = wh / 2;
      camera.bottom = wh / -2;
      camera.updateProjectionMatrix();
    }

    prepareStars();
  }

  function onPointerDown(event: PointerEvent) {
    isMouseDown = true;
    lastMousePos = { x: event.clientX, y: event.clientY };
  }

  function onPointerUp() {
    isMouseDown = false;
  }

  function onPointerMove(event: PointerEvent) {
    starMouse.x = event.clientX;
    starMouse.y = event.clientY;

    if (isMouseDown && camera) {
      camera.position.x += (event.clientX - lastMousePos.x) / 100;
      camera.position.y -= (event.clientY - lastMousePos.y) / 100;
      camera.lookAt(centerVector);
      lastMousePos = { x: event.clientX, y: event.clientY };
    }
  }

  function updateOverlay(time: number) {
    if (!overlayParticles?.geometry?.vertices) {
      return;
    }

    const vertices = overlayParticles.geometry.vertices as OverlayVertex[];
    const mouseWorldX = starMouse.x - ww / 2;
    const mouseWorldY = -(starMouse.y - wh / 2);
    const parallaxX = ((starMouse.x <= -9999 ? ww * 0.5 : starMouse.x) - ww * 0.5) / ww;
    const parallaxY = ((starMouse.y <= -9999 ? wh * 0.5 : starMouse.y) - wh * 0.5) / wh;

    for (let i = 0; i < vertices.length; i += 1) {
      const vertex = vertices[i];
      if (!vertex) {
        continue;
      }

      const driftTime = time * 0.00055 + vertex.phase;
      const floatX = Math.cos(driftTime) * vertex.driftX;
      const floatY = Math.sin(driftTime * 0.9) * vertex.driftY;
      let mouseOffsetX = 0;
      let mouseOffsetY = 0;

      const dx = vertex.baseX - mouseWorldX;
      const dy = vertex.baseY - mouseWorldY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < OVERLAY_MOUSE_RADIUS && distance > 0.001) {
        const influence = 1 - distance / OVERLAY_MOUSE_RADIUS;
        mouseOffsetX = (dx / distance) * influence * OVERLAY_MOUSE_FORCE;
        mouseOffsetY = (dy / distance) * influence * OVERLAY_MOUSE_FORCE;
      }

      vertex.x += (vertex.baseX + floatX + mouseOffsetX + parallaxX * OVERLAY_PARALLAX_X - vertex.x) * 0.035;
      vertex.y += (vertex.baseY + floatY + mouseOffsetY - parallaxY * OVERLAY_PARALLAX_Y - vertex.y) * 0.035;
      vertex.z += (vertex.baseZ + Math.sin(driftTime) * 0.6 - vertex.z) * 0.03;
    }

    overlayParticles.geometry.verticesNeedUpdate = true;
  }

  function updatePhotoParticles(time: number) {
    if (!particles?.geometry?.vertices) {
      return;
    }

    const vertices = particles.geometry.vertices as PhotoVertex[];
    const safeMouseX = starMouse.x <= -9999 ? ww * 0.5 : starMouse.x;
    const safeMouseY = starMouse.y <= -9999 ? wh * 0.5 : starMouse.y;
    const parallaxX = (safeMouseX - ww * 0.5) / ww;
    const parallaxY = (safeMouseY - wh * 0.5) / wh;

    for (let i = 0; i < vertices.length; i += 1) {
      const vertex = vertices[i];
      if (!vertex) {
        continue;
      }

      vertex.x = vertex.baseX + parallaxX * PARALLAX_X;
      vertex.y = vertex.baseY - parallaxY * PARALLAX_Y;
    }

    particles.geometry.verticesNeedUpdate = true;
  }

  function renderFrame(time: number) {
    if (destroyed) {
      return;
    }

    rafId = window.requestAnimationFrame(renderFrame);

    updateStars();

    if (!renderer || !camera || !scene || !particles?.geometry) {
      return;
    }

    updatePhotoParticles(time);
    updateOverlay(time);

    if (!isMouseDown) {
      camera.position.x += (0 - camera.position.x) * 0.06;
      camera.position.y += (0 - camera.position.y) * 0.06;
      camera.lookAt(centerVector);
    }

    renderer.render(scene, camera);
  }

  function cleanupPoints(object: any) {
    if (!object) {
      return;
    }

    object.geometry?.dispose?.();
    object.material?.dispose?.();
    scene?.remove?.(object);
  }

  onResize();

  image.onload = () => {
    if (destroyed) {
      return;
    }

    pendingImageReady = true;
    maybeInitScene();
  };

  image.onerror = () => {
    console.error("Failed to load portrait image:", imageSrc);
  };

  if (maskSrc) {
    maskImage.onload = () => {
      if (destroyed) {
        return;
      }

      pendingMaskReady = true;
      maybeInitScene();
    };

    maskImage.onerror = () => {
      console.error("Failed to load face mask image:", maskSrc);
      pendingMaskReady = true;
      maybeInitScene();
    };

    maskImage.src = maskSrc;
  }

  image.src = imageSrc;

  window.addEventListener("resize", onResize);
  window.addEventListener("pointermove", onPointerMove, false);
  window.addEventListener("pointerdown", onPointerDown, false);
  window.addEventListener("pointerup", onPointerUp, false);
  window.addEventListener("pointercancel", onPointerUp, false);

  rafId = window.requestAnimationFrame(renderFrame);

  return {
    destroy() {
      destroyed = true;

      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }

      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove, false);
      window.removeEventListener("pointerdown", onPointerDown, false);
      window.removeEventListener("pointerup", onPointerUp, false);
      window.removeEventListener("pointercancel", onPointerUp, false);

      cleanupPoints(particles);
      cleanupPoints(overlayParticles);

      if (renderer) {
        renderer.dispose?.();
        renderer.forceContextLoss?.();
      }
    }
  };
}
