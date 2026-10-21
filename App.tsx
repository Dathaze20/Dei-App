import React, { useEffect } from 'react';
import { audioManager } from './utils/audioManager';
import { useTranslation } from './hooks/useTranslation';
import { StartupNotice } from './utils/safetyBootstrap';
import CounterShell from './components/counter/CounterShell';

// DeliOrderNYC has one interface: the Counter screen (C2.3 retired Classic View). Older links,
// such as shelf-tag QR codes (#/product/<id>) and the old #/order and #/manage pages, are sent to
// their Counter equivalents inside CounterShell. Saved data is the same as before.
function App({ startupNotice = null }: { startupNotice?: StartupNotice | null }) {
  const { dir } = useTranslation();

  // Sounds can only start after the first touch.
  useEffect(() => {
    const unlockAudio = () => {
      audioManager.unlock();
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchend', unlockAudio);
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    window.addEventListener('touchend', unlockAudio);
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchend', unlockAudio);
    };
  }, []);

  return (
    <div dir={dir} className="font-sans px-safe">
      <CounterShell startupNotice={startupNotice} />
    </div>
  );
}

export default App;
