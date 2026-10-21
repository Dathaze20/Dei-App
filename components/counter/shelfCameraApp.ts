// components/counter/shelfCameraApp.ts
//
// The shelf camera as the screens use it: on Android the native inbox (utils/shelfCamera.ts,
// DeliNativePlugin.java), in a browser the file input (no inbox needed: the browser page is not
// closed while its camera is open). Also turns errors into the words shown to the person.
import { DeliNative, isAndroidApp } from '../../utils/nativeApp';
import { Pickup, ShelfCameraNative, ShelfPhotoStore } from '../../utils/shelfCamera';
import { getCheck, putCheck, putShelfImage } from '../../utils/shelfStore';

/**
 * The Android inbox, or null in a browser. Browser tests can stand in for the Android side with
 * window.__deliShelfCameraForTests (it only changes this page, like any script on it could).
 */
export const nativeShelfCamera = (): ShelfCameraNative | null =>
  (window as Window & { __deliShelfCameraForTests?: ShelfCameraNative }).__deliShelfCameraForTests ?? (isAndroidApp() ? DeliNative : null);

export const shelfPhotoStore: ShelfPhotoStore = { getCheck, putCheck, putShelfImage };

/** The string key for a camera or storage error. */
export const cameraErrorKey = (error: unknown) => {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'camera-denied') return 'cameraDenied' as const;
  if (code === 'no-camera' || code === 'no-gallery') return 'cameraMissing' as const;
  if (code === 'camera-failed') return 'cameraFailedGeneric' as const;
  return 'cameraNotStored' as const;
};

type Translate = (key: 'cameraLost' | 'shelfPhotosSaved' | 'shelfPhotoSaved' | 'cameraUnreadable' | 'cameraOverflow', values?: Record<string, number>) => string;

/** What happened to the camera's photos, in words (shown in the check). */
export const pickupNote = (pickup: Pickup, t: Translate): string =>
  [
    pickup.lost ? t('cameraLost') : pickup.added > 1 ? t('shelfPhotosSaved', { count: pickup.added }) : pickup.added === 1 ? t('shelfPhotoSaved') : '',
    pickup.failed ? t('cameraUnreadable', { count: pickup.failed }) : '',
    pickup.overflowCheckId ? t('cameraOverflow') : '',
  ].filter(Boolean).join(' ');
