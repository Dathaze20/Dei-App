// contexts/StoreProfileContext.tsx
//
// The store's own ordering profile (utils/storeProfile.ts), kept in `inventory_storeProfile`
// through the storage guard like the rest of the deli data: an unreadable saved profile is never
// overwritten, and the key is only created by the first fact saved.
import React, { createContext, ReactNode, useCallback, useContext, useRef, useState, useSyncExternalStore } from 'react';
import { getGuardState, guardedSetItem, isKeyBlocked, loadGuarded, subscribeGuard } from '../utils/storageGuard';
import { STORE_PROFILE_KEY, StoreProfile, emptyStoreProfile } from '../utils/storeProfile';

interface StoreProfileContextType {
  profile: StoreProfile;
  /** False when the saved profile cannot be read: nothing is saved over it. */
  available: boolean;
  /** True once a profile is stored (until then `storeId` is new on every start). */
  persisted: boolean;
  /** Applies a change and saves it. Reports success only after it is stored. */
  update: (change: (profile: StoreProfile) => StoreProfile) => boolean;
}

const StoreProfileContext = createContext<StoreProfileContextType | undefined>(undefined);

export const StoreProfileProvider = ({ children }: { children: ReactNode }) => {
  const [initial] = useState(() =>
    loadGuarded<StoreProfile>(STORE_PROFILE_KEY, { parse: JSON.parse, fallback: () => emptyStoreProfile(), serialize: JSON.stringify }),
  );
  const [profile, setProfile] = useState<StoreProfile>(initial.value);
  const [persisted, setPersisted] = useState(initial.status === 'ok');
  const ref = useRef(profile);
  const guard = useSyncExternalStore(subscribeGuard, getGuardState);
  const available = !guard.blocked.some(entry => entry.key === STORE_PROFILE_KEY);

  const update = useCallback((change: (profile: StoreProfile) => StoreProfile) => {
    if (isKeyBlocked(STORE_PROFILE_KEY)) return false;
    const next = change(ref.current);
    if (next === ref.current) return true;
    if (!guardedSetItem(STORE_PROFILE_KEY, JSON.stringify(next))) return false;
    ref.current = next;
    setProfile(next);
    setPersisted(true);
    return true;
  }, []);

  return <StoreProfileContext.Provider value={{ profile, available, persisted, update }}>{children}</StoreProfileContext.Provider>;
};

export const useStoreProfile = (): StoreProfileContextType => {
  const value = useContext(StoreProfileContext);
  if (!value) throw new Error('useStoreProfile must be used inside StoreProfileProvider');
  return value;
};
