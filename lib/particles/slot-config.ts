import type { SlotConfig } from "@/lib/particles/types";

export const HERO_SLOT: SlotConfig = {
  id: "hero",
  imageSrc: "/images/hero.png",
  rect: { x: 0, y: 0, w: 0, h: 0 },
  direction: "top"
};

export const HOME_MENU_SLOTS: SlotConfig[] = [
  {
    id: "menu-photo",
    imageSrc: "/images/menu-photo.png",
    rect: { x: 0, y: 0, w: 0, h: 0 },
    direction: "top"
  },
  {
    id: "menu-video",
    imageSrc: "/images/menu-video.png",
    rect: { x: 0, y: 0, w: 0, h: 0 },
    direction: "top"
  },
  {
    id: "menu-music",
    imageSrc: "/images/menu-music.png",
    rect: { x: 0, y: 0, w: 0, h: 0 },
    direction: "top"
  },
  {
    id: "menu-blog",
    imageSrc: "/images/menu-blog.png",
    rect: { x: 0, y: 0, w: 0, h: 0 },
    direction: "top"
  }
];

export const HOME_SLOT_IDS = [
  "hero",
  "menu-photo",
  "menu-video",
  "menu-music",
  "menu-blog"
] as const;
