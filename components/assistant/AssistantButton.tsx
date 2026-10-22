// components/assistant/AssistantButton.tsx
//
// The assistant's small round button: bottom corner (end side), above the bottom navigation and
// above the order tray when it shows (--tray-h, set by CounterHome). It slides away while the list
// scrolls down, like the Counter bar, and comes back on any scroll up, so it never sits on a row's
// button for long. Hidden where it would get in the way (camera, settings, search).
import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useHideOnScroll } from '../../hooks/useHideOnScroll';
import { ChatIcon } from '../shared/icons';

const AssistantButton: React.FC<{ onOpen: () => void; hidden: boolean }> = ({ onOpen, hidden }) => {
  const { t } = useTranslation();
  const scrolledAway = useHideOnScroll(!hidden);
  if (hidden) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t('assistantOpen')}
      data-testid="assistant-button"
      className={`fixed end-3 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-blue-900/30 ring-2 ring-white transition-transform duration-200 dark:ring-[#0b1120] ${
        scrolledAway ? 'translate-y-[calc(100%+6rem)]' : ''
      }`}
      style={{ bottom: 'calc(var(--nav-h) + var(--safe-bottom) + var(--tray-h, 0px) + 0.75rem)' }}
    >
      <ChatIcon className="h-7 w-7" />
    </button>
  );
};

export default AssistantButton;
