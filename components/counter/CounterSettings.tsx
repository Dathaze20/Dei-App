// components/counter/CounterSettings.tsx
//
// Settings, in sections the menu can jump to: store profile, appearance (screen style, theme,
// language), backup, restore and recovery, app updates, and about. Backup, restore and updates
// are the same panels Classic View uses, so they behave identically.
import React, { useEffect, useState } from 'react';
import useInventory from '../../hooks/useInventory';
import { useTranslation } from '../../hooks/useTranslation';
import { useTheme } from '../../contexts/ThemeContext';
import { useDevicePrefs } from '../../hooks/useDevicePrefs';
import { useToast } from '../ui/Toast';
import { AppInfo, DeliNative, isAndroidApp } from '../../utils/nativeApp';
import AppUpdatePanel from '../AppUpdatePanel';
import DataExportPanel from '../DataExportPanel';
import RestorePanel from '../RestorePanel';
import Segmented from '../ui/Segmented';
import { ui } from '../ui/styles';
import { InformationCircleIcon, SparklesIcon, SwatchIcon, UserCircleIcon } from '../shared/icons';

const Section: React.FC<{ id: string; title: string; icon?: React.ReactNode; children: React.ReactNode }> = ({ id, title, icon, children }) => (
  <section id={id} className={`${ui.card} scroll-mt-28 p-4`}>
    <h2 className={`${ui.heading} mb-3 flex items-center gap-2`}>
      {icon && <span className="text-cyan-600 dark:text-cyan-300">{icon}</span>}
      {title}
    </h2>
    {children}
  </section>
);

const CounterSettings: React.FC = () => {
  const { deliName, updateDeliName } = useInventory();
  const { t, language, setLanguage } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const [prefs, setPrefs] = useDevicePrefs();
  const toast = useToast();
  const android = isAndroidApp();
  const [name, setName] = useState(deliName);
  const [saved, setSaved] = useState(false);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [infoFailed, setInfoFailed] = useState(false);

  useEffect(() => setName(deliName), [deliName]);
  useEffect(() => {
    if (!android) return;
    DeliNative.getAppInfo().then(setInfo).catch(() => setInfoFailed(true));
  }, [android]);

  const saveName = (event: React.FormEvent) => {
    event.preventDefault();
    updateDeliName(name.trim());
    toast(t('settingSaved'));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-3" data-testid="counter-settings">
      <h1 className="sr-only">{t('menuSettings')}</h1>

      <Section id="settings-store" title={t('storeProfile')} icon={<UserCircleIcon className="h-5 w-5" />}>
        <form onSubmit={saveName} className="space-y-2">
          <label htmlFor="deliName" className={ui.label}>{t('deliName')}</label>
          <input id="deliName" value={name} onChange={e => setName(e.target.value)} className={ui.input} dir="auto" autoComplete="off" />
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('deliNameHelp')}</p>
          <div className="flex items-center justify-end gap-3">
            {saved && <span role="status" className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{t('savedShort')}</span>}
            <button type="submit" className={ui.primary} disabled={name.trim() === deliName.trim() || !name.trim()}>{t('saveName')}</button>
          </div>
        </form>
      </Section>

      <Section id="settings-display" title={t('appearance')} icon={<SwatchIcon className="h-5 w-5" />}>
        <div className="space-y-4">
          <div data-testid="density-setting">
            <p className={`${ui.eyebrow} mb-1`}>{t('densityLabel')}</p>
            <Segmented
              label={t('densityLabel')}
              value={prefs.density}
              onChange={density => {
                setPrefs(p => ({ ...p, density }));
                toast(t('settingSaved'));
              }}
              options={[
                { value: 'comfortable', label: t('densityComfortable') },
                { value: 'compact', label: t('densityCompact') },
              ]}
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('densityHelp')}</p>
          </div>
          <div>
            <p className={`${ui.eyebrow} mb-1`}>{t('themeLabel')}</p>
            <Segmented
              label={t('themeLabel')}
              value={theme}
              onChange={value => value !== theme && toggleTheme()}
              options={[
                { value: 'light', label: t('themeLight') },
                { value: 'dark', label: t('themeDark') },
              ]}
            />
          </div>
          <div>
            <p className={`${ui.eyebrow} mb-1`}>{t('menuLanguage')}</p>
            <Segmented
              label={t('menuLanguage')}
              value={language}
              onChange={setLanguage}
              options={[
                { value: 'en', label: 'English' },
                { value: 'es', label: 'Español' },
                { value: 'ar', label: 'العربية' },
              ]}
            />
          </div>
        </div>
      </Section>

      <div id="settings-backup" className="scroll-mt-28">
        <DataExportPanel />
      </div>
      <div id="settings-restore" className="scroll-mt-28">
        <RestorePanel />
      </div>

      {android ? (
        <div id="settings-updates" className="scroll-mt-28">
          <AppUpdatePanel />
        </div>
      ) : (
        <Section id="settings-updates" title={t('menuUpdates')} icon={<SparklesIcon className="h-5 w-5" />}>
          <p className={ui.muted}>{t('updatesAndroidOnly')}</p>
        </Section>
      )}

      <Section id="settings-about" title={t('aboutApp')} icon={<InformationCircleIcon className="h-5 w-5" />}>
        <dl className="space-y-1 text-sm" data-testid="app-info">
          <div className="flex flex-wrap gap-x-2"><dt className="text-slate-500 dark:text-slate-400">{t('appNameLabel')}</dt><dd className="font-semibold">DeliOrderNYC</dd></div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-slate-500 dark:text-slate-400">{t('versionLabel')}</dt>
            <dd className="font-semibold" dir="ltr">
              {!android ? t('webVersion') : info ? `${info.versionName} (${info.versionCode})` : infoFailed ? t('versionUnknown') : t('loadingShort')}
            </dd>
          </div>
          {info && <div className="flex flex-wrap gap-x-2"><dt className="text-slate-500 dark:text-slate-400">{t('appIdLabel')}</dt><dd className="break-all font-mono text-xs" dir="ltr">{info.packageName}</dd></div>}
        </dl>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{t('aboutPrivacy')}</p>
      </Section>
    </div>
  );
};

export default CounterSettings;
