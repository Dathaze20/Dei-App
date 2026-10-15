import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { InventoryProvider } from './contexts/InventoryContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import RecoveryScreen from './components/RecoveryScreen';
import { bootstrapSafety } from './utils/safetyBootstrap';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

// The app's screens (and their automatic saving) only mount after the startup safety check has
// finished or rolled back any interrupted restore.
const CHECKING: Record<string, string> = {
  en: 'Checking your saved data...',
  es: 'Revisando tus datos guardados...',
  ar: 'جارٍ فحص بياناتك المحفوظة...',
};
const savedLanguage = (() => {
  try {
    return localStorage.getItem('language') ?? 'en';
  } catch {
    return 'en';
  }
})();
root.render(<p className="p-8 text-center text-slate-500">{CHECKING[savedLanguage] ?? CHECKING.en}</p>);

bootstrapSafety().then(state => {
  root.render(
    <React.StrictMode>
      <HashRouter>
        <LanguageProvider>
          <ThemeProvider>
            {state.kind === 'blocked' ? (
              <RecoveryScreen state={state} />
            ) : (
              <InventoryProvider>
                <App startupNotice={state.notice} />
              </InventoryProvider>
            )}
          </ThemeProvider>
        </LanguageProvider>
      </HashRouter>
    </React.StrictMode>
  );
});
