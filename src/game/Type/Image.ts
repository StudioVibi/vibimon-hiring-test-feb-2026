import * as Type from "../Type";

const image_cache = new Map<Type.Sprite, Type.Image>();

// Get an image element from the cache.
export function get(id: Type.Sprite): Type.Image {
  const existing = image_cache.get(id);
  if (existing) {
    return existing;
  }

  const image = new Image();
  image.src = `/assets/${id}.png`;
  image_cache.set(id, image);
  return image;
}

// Check whether an image is loaded.
export function ready(image: Type.Image): boolean {
  return image.complete && image.naturalWidth > 0;
}

// Preload a list of sprite ids.
export function preload(target: Type.Sprite[]): void {
  for (const id of target) {
    get(id);
  }
}
