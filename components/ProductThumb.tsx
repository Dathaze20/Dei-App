// components/ProductThumb.tsx
//
// A product's picture at a fixed size (utils/productImage.ts decides what it is):
//   - a photo added on this phone, loaded from IndexedDB;
//   - the catalog's colour tile, drawn here from its address (works offline, no request);
//   - a web picture, with a label tile if it cannot load (offline at the counter, a dead link);
//   - otherwise a label tile: a steady colour per product and the words that tell it apart.
// Tile captions are SVG text, so they scale with the box and fit at every size.
import React, { useEffect, useState } from 'react';
import { Product } from '../types';
import { imageSource, shortLabel } from '../utils/productImage';
import { getPhoto } from '../utils/photoStore';

interface ProductThumbProps {
  product: Pick<Product, 'name' | 'flavor' | 'imageUrl'>;
  /** Tailwind size and shape classes, e.g. "w-14 h-14 rounded-lg". */
  className: string;
  onClick?: () => void;
  alt?: string;
}

// Muted, readable pairs for products without a tile of their own.
const LABEL_COLOURS: Array<[string, string]> = [
  ['#0e7490', '#ecfeff'], ['#7c3aed', '#f5f3ff'], ['#b45309', '#fffbeb'], ['#be123c', '#fff1f2'],
  ['#15803d', '#f0fdf4'], ['#1d4ed8', '#eff6ff'], ['#a21caf', '#fdf4ff'], ['#334155', '#f8fafc'],
];

const colourFor = (text: string) => {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return LABEL_COLOURS[Math.abs(hash) % LABEL_COLOURS.length];
};

/** Splits a caption into at most three short lines for the tile. */
export const captionLines = (caption: string): string[] => {
  const lines: string[] = [];
  for (const word of caption.split(/\s+/).filter(Boolean)) {
    const last = lines[lines.length - 1];
    if (last !== undefined && (last + ' ' + word).length <= 9) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word.length > 10 ? `${word.slice(0, 9)}…` : word);
  }
  return lines.length > 3 ? [...lines.slice(0, 2), `${lines[2].replace(/…$/, '')}…`] : lines;
};

// The caption is drawn as SVG text in a 100x100 box, so it scales with the picture at every size.
const Tile: React.FC<{ base: string; label: string; background: string; color: string; caption: string; onClick?: () => void }> = ({
  base, label, background, color, caption, onClick,
}) => {
  const lines = captionLines(caption);
  // Fits the longest line in about 88% of the width (bold Inter is about 0.6em per character).
  const longest = Math.max(1, ...lines.map(l => l.length));
  const size = Math.min(22, 88 / (0.6 * longest), 80 / (lines.length * 1.15));
  return (
    <div
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      className={`${base} select-none`}
      style={{ background }}
      onClick={onClick}
      data-testid="product-thumb-placeholder"
    >
      <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true" focusable="false">
        {lines.map((line, i) => (
          <text
            key={i}
            x="50"
            y={50 + (i - (lines.length - 1) / 2) * size * 1.15}
            dominantBaseline="central"
            textAnchor="middle"
            fill={color}
            fontSize={size}
            fontWeight={700}
            fontFamily="Inter, system-ui, sans-serif"
          >
            {line}
          </text>
        ))}
      </svg>
    </div>
  );
};

const ProductThumb: React.FC<ProductThumbProps> = ({ product, className, onClick, alt }) => {
  const source = imageSource(product.imageUrl);
  const [failed, setFailed] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const photoId = source.kind === 'photo' ? source.id : null;
  const remoteUrl = source.kind === 'remote' ? source.url : null;

  useEffect(() => setFailed(false), [remoteUrl]);
  useEffect(() => {
    if (!photoId) return setPhoto(null);
    let live = true;
    getPhoto(photoId).then(data => {
      if (!live) return;
      setPhoto(data);
      if (!data) setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [photoId]);

  const label = alt ?? `${product.name} ${product.flavor}`.trim();
  const base = `${className} flex-shrink-0 overflow-hidden ${onClick ? 'cursor-pointer' : ''}`;

  if (source.kind === 'tile') {
    return <Tile base={base} label={label} background={source.background} color={source.color} caption={source.caption || shortLabel(product)} onClick={onClick} />;
  }
  const src = photoId ? photo : remoteUrl;
  if (src && !failed) {
    return (
      <img
        src={src}
        alt={label}
        className={`${base} bg-slate-200 object-cover dark:bg-slate-700`}
        loading="lazy"
        decoding="async"
        onClick={onClick}
        onError={() => setFailed(true)}
        data-testid="product-thumb-image"
      />
    );
  }
  if (photoId && !photo && !failed) {
    // The photo is still loading: a quiet box of the same size, so rows do not jump.
    return <div className={`${base} bg-slate-200 dark:bg-slate-700`} onClick={onClick} role={label ? 'img' : undefined} aria-label={label || undefined} />;
  }
  const [background, color] = colourFor(`${product.name}|${product.flavor}`);
  return <Tile base={base} label={label} background={background} color={color} caption={shortLabel(product)} onClick={onClick} />;
};

export default ProductThumb;
