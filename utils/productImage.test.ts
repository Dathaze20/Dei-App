import { describe, expect, it } from 'vitest';
import { imageSource, parsePlaceholder, shortLabel } from './productImage';
import { isValidPhotoData, parsePhotoExport } from './photoStore';
import { captionLines } from '../components/ProductThumb';

describe('product pictures', () => {
  it('reads the catalog tiles from their address (offline, no request)', () => {
    expect(parsePlaceholder('https://placehold.co/400x400/ff6347/ffffff?text=AZ+Fruit+Punch')).toEqual({
      kind: 'tile', background: '#ff6347', color: '#ffffff', caption: 'AZ Fruit Punch',
    });
    expect(parsePlaceholder('https://placehold.co/400x400/d3d3d3/ffb3a7.png?text=Diet+Peach')).toMatchObject({ background: '#d3d3d3', color: '#ffb3a7' });
    expect(parsePlaceholder('https://example.com/400x400/ff6347/ffffff?text=x')).toBeNull();
    expect(parsePlaceholder('https://placehold.co/400x400/zzz/ffffff')).toBeNull();
  });

  it('tells photos, tiles, web pictures and nothing apart; never trusts other schemes', () => {
    expect(imageSource('photo:pabc123')).toEqual({ kind: 'photo', id: 'pabc123' });
    expect(imageSource('photo:../x')).toEqual({ kind: 'none' });
    expect(imageSource('https://cdn.example.com/a.jpg')).toEqual({ kind: 'remote', url: 'https://cdn.example.com/a.jpg' });
    expect(imageSource('http://insecure.example.com/a.jpg')).toEqual({ kind: 'none' });
    expect(imageSource('javascript:alert(1)')).toEqual({ kind: 'none' });
    expect(imageSource(undefined)).toEqual({ kind: 'none' });
  });

  it('labels use the distinguishing words', () => {
    expect(shortLabel({ name: 'Arizona RX Energy', flavor: 'Caution Extreme Fruit Punch' })).toBe('Caution Extreme Fruit…');
    expect(shortLabel({ name: 'Snapple', flavor: '' })).toBe('Snapple');
  });

  it('photo backups accept only small, real image data', () => {
    expect(isValidPhotoData('data:image/jpeg;base64,AAAA')).toBe(true);
    expect(isValidPhotoData('data:text/html;base64,AAAA')).toBe(false);
    expect(isValidPhotoData('data:image/jpeg;base64,' + 'A'.repeat(700_000))).toBe(false);
    const text = JSON.stringify({ format: 'deliordernyc-photos', photos: [
      { id: 'pok', dataUrl: 'data:image/jpeg;base64,AAAA', createdAt: 'x' },
      { id: '../bad', dataUrl: 'data:image/jpeg;base64,AAAA' },
      { id: 'pbad', dataUrl: 'javascript:1' },
    ] });
    expect(parsePhotoExport(text)?.map(p => p.id)).toEqual(['pok']);
    expect(parsePhotoExport('{"format":"other"}')).toBeNull();
    expect(parsePhotoExport('nope')).toBeNull();
  });

  it('tile captions wrap into at most three short lines', () => {
    expect(captionLines('RX Fruit Punch')).toEqual(['RX Fruit', 'Punch']);
    expect(captionLines('AZ Rooibos')).toEqual(['AZ', 'Rooibos']);
    expect(captionLines('Caution Extreme Fruit Punch Large')).toEqual(['Caution', 'Extreme', 'Fruit…']);
    expect(captionLines('Supercalifragilistic')).toEqual(['Supercali…']);
  });
});
