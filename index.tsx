import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { InventoryProvider } from './contexts/InventoryContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <HashRouter>
      <LanguageProvider>
        <ThemeProvider>
          <InventoryProvider>
            <App />
          </InventoryProvider>
        </ThemeProvider>
      </LanguageProvider>
    </HashRouter>
  </React.StrictMode>
);