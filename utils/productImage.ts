// utils/productImage.ts
//
// What a product's picture is, read from its `imageUrl` (the stored field is unchanged):
//   - "photo:<id>": a photo the person added on this phone (kept in IndexedDB, utils/photoStore.ts);
//   - a placehold.co address: the catalog's own colour tile with a short caption. These are drawn
//     on the phone from the address itself (same colours, same caption), so they show offline
//     and need no network request. They are labels, not pictures of the packaging;
//   - any other https address: loaded as a normal picture, with a label tile if it cannot load;
//   - nothing: a label tile.

export type ImageSource =
  | { kind: 'photo'; id: string }
  | { kind: 'tile'; background: string; color: string; caption: string }
  | { kind: 'remote'; url: string }
  | { kind: 'none' };

export const PHOTO_PREFIX = 'photo:';

const HEX = /^[0-9a-f]{3}([0-9a-f]{3})?$/i;

/** Reads a placehold.co address: /<size>/<background>/<colour>?text=<caption>. */
export const parsePlaceholder = (url: string): ImageSource | null => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== 'placehold.co') return null;
  const [, , bg = '', fg = ''] = parsed.pathname.split('/');
  const background = bg.replace(/\.(png|jpe?g|svg|webp)$/i, '');
  const color = fg.replace(/\.(png|jpe?g|svg|webp)$/i, '');
  if (!HEX.test(background) || !HEX.test(color)) return null;
  const caption = (parsed.searchParams.get('text') ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return { kind: 'tile', background: `#${background}`, color: `#${color}`, caption };
};

export const imageSource = (imageUrl: string | undefined): ImageSource => {
  const url = (imageUrl ?? '').trim();
  if (!url) return { kind: 'none' };
  if (url.startsWith(PHOTO_PREFIX)) {
    const id = url.slice(PHOTO_PREFIX.length);
    return /^[\w-]{1,64}$/.test(id) ? { kind: 'photo', id } : { kind: 'none' };
  }
  const tile = parsePlaceholder(url);
  if (tile) return tile;
  return /^https:\/\//i.test(url) ? { kind: 'remote', url } : { kind: 'none' };
};

/** A short label for a product without a picture: the words that tell it apart. */
export const shortLabel = (product: { name: string; flavor: string }): string => {
  const text = (product.flavor || product.name).trim();
  return text.length > 24 ? `${text.slice(0, 22).trimEnd()}…` : text;
};
