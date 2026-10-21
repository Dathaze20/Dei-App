// components/counter/PhotoBackupPanel.tsx
//
// Settings › Product photos: how many photos are on this phone, and their own export and import
// file (utils/photoStore.ts). The main backup format is unchanged; this file sits beside it.
// Importing only adds photos that are missing; a photo already on the phone is never replaced.
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { buildPhotoExport, importPhotos, listPhotos, parsePhotoExport } from '../../utils/photoStore';
import { saveTextFile } from '../../utils/fileDownload';
import { ui } from '../ui/styles';
import { ArrowDownTrayIcon, ArrowUturnLeftIcon, PhotoIcon } from '../shared/icons';

const pad = (n: number) => String(n).padStart(2, '0');
const photoFileName = (d = new Date()) => `deliordernyc-photos-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;

const PhotoBackupPanel: React.FC = () => {
  const { t } = useTranslation();
  const [count, setCount] = useState<number | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const refresh = () =>
    listPhotos()
      .then(photos => setCount(photos.length))
      .catch(() => setUnavailable(true));
  useEffect(() => {
    refresh();
  }, []);

  const exportPhotos = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const fileName = photoFileName();
      const outcome = await saveTextFile(fileName, buildPhotoExport(await listPhotos()));
      if (outcome === 'saved') setMessage({ tone: 'ok', text: t('photosSaved', { fileName }) });
      else if (outcome === 'started') setMessage({ tone: 'ok', text: t('photosDownloadStarted', { fileName }) });
      else if (outcome === 'failed') setMessage({ tone: 'error', text: t('photosSaveFailed') });
    } catch {
      setMessage({ tone: 'error', text: t('photosSaveFailed') });
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const photos = parsePhotoExport(await file.text());
      if (!photos) {
        setMessage({ tone: 'error', text: t('photosImportInvalid') });
        return;
      }
      const result = await importPhotos(photos);
      setMessage({ tone: 'ok', text: t('photosImported', result) });
      await refresh();
    } catch {
      setMessage({ tone: 'error', text: t('photosUnavailable') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="settings-photos" className={`${ui.card} scroll-mt-28 p-4`} data-testid="photo-backup">
      <h2 className={`${ui.heading} mb-2 flex items-center gap-2`}>
        <span className="text-cyan-600 dark:text-cyan-300"><PhotoIcon className="h-5 w-5" /></span>
        {t('productPhotos')}
      </h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">{t('productPhotosHelp')}</p>
      <p className="mt-2 text-sm font-semibold" role="status">
        {unavailable ? t('photosUnavailable') : count === null ? t('loadingShort') : count === 0 ? t('noPhotosYet') : t('photosOnPhone', { count })}
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
        <button type="button" className={ui.secondary} disabled={busy || unavailable || !count} onClick={exportPhotos}>
          <ArrowDownTrayIcon className="h-5 w-5" /> {t('exportPhotos')}
        </button>
        <button type="button" className={ui.secondary} disabled={busy || unavailable} onClick={() => input.current?.click()}>
          <ArrowUturnLeftIcon className="h-5 w-5" /> {t('importPhotos')}
        </button>
      </div>
      <input ref={input} type="file" accept="application/json,.json" className="hidden" onChange={importFile} data-testid="photo-import-input" />
      {message && <p role="status" className={`mt-3 ${message.tone === 'ok' ? ui.ok : ui.error}`}>{message.text}</p>}
    </section>
  );
};

export default PhotoBackupPanel;
