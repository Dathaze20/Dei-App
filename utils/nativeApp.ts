// utils/nativeApp.ts
//
// The bridge to the Android app's own code (android/…/DeliNativePlugin.java). In a normal browser
// (and in the future iPhone web app) none of this is used: isAndroidApp() is false and every
// screen keeps its browser behaviour.

import { Capacitor, PluginListenerHandle, registerPlugin } from '@capacitor/core';

export interface AppInfo {
  packageName: string;
  versionName: string;
  versionCode: number;
}

export type NativeErrorCode =
  | 'not-approved'
  | 'download-failed'
  | 'checksum-mismatch'
  | 'invalid-apk'
  | 'not-newer'
  | 'signature-mismatch'
  | 'not-downloaded'
  | 'needs-permission';

export interface DeliNativePlugin {
  getAppInfo(): Promise<AppInfo>;
  canInstallUpdates(): Promise<{ allowed: boolean }>;
  openInstallPermissionSettings(): Promise<void>;
  downloadUpdate(options: { url: string; sha256: string | null; versionCode: number }): Promise<{ sha256: string; verifiedDigest: boolean }>;
  installUpdate(): Promise<void>;
  saveTextFile(options: { fileName: string; text: string; mimeType?: string }): Promise<{ saved: boolean }>;
  /** Added in v0.1.3: the product id of a deliordernyc://product/<id> link, once. */
  consumeProductLink(): Promise<{ productId: string | null }>;
  /** Added in v0.1.6: shelf photos through a private inbox (utils/shelfCamera.ts). */
  takeShelfPhoto(): Promise<{ taken: boolean }>;
  chooseShelfPhotos(): Promise<{ taken: boolean }>;
  takeShelfPhotos(): Promise<{ photos: { name: string; dataUrl: string }[]; failed: number; capturing: boolean; cancelled?: boolean }>;
  deleteShelfPhotos(options: { names: string[] }): Promise<void>;
  addListener(event: 'updateProgress', listener: (progress: { received: number; total: number }) => void): Promise<PluginListenerHandle>;
}

export const DeliNative = registerPlugin<DeliNativePlugin>('DeliNative');

export const isAndroidApp = (): boolean => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
