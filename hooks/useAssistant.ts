// hooks/useAssistant.ts
//
// Connects the local assistant (utils/assistant/engine.ts) to the app's real data: the catalog,
// the one saved order, verified stock, saved orders and this store's profile. Every change goes
// through the same functions the screens use.
//
// The conversation is kept on this phone only (`deliordernyc_sys_assistant`, never in backups or
// sent anywhere), for this store, last 60 messages.
import { useCallback, useMemo, useRef, useState } from 'react';
import useInventory from './useInventory';
import { useStoreProfile } from '../contexts/StoreProfileContext';
import { AssistantMessage, EngineEvent, EngineState, emptyEngineState, respond } from '../utils/assistant/engine';
import { AssistantServices } from '../utils/assistant/tools';
import { OrderItem } from '../types';
import { newLineUnit, resolveSupplierWorkflow } from '../utils/supplierWorkflow';

export const ASSISTANT_KEY = 'deliordernyc_sys_assistant';
const MAX_MESSAGES = 60;

interface Saved {
  storeId: string;
  state: EngineState;
  messages: AssistantMessage[];
}

const UNSAVED_STORE = 'this-phone';

const load = (storeId: string): Saved => {
  try {
    const saved = JSON.parse(localStorage.getItem(ASSISTANT_KEY) ?? 'null') as Saved | null;
    // A conversation from before the profile was first saved carries over to it.
    if (saved && (saved.storeId === storeId || saved.storeId === UNSAVED_STORE) && Array.isArray(saved.messages) && saved.state) return { ...saved, storeId };
  } catch {
    // Unreadable: start a new conversation (nothing else depends on it).
  }
  return { storeId, state: emptyEngineState(), messages: [] };
};

const save = (saved: Saved) => {
  try {
    localStorage.setItem(ASSISTANT_KEY, JSON.stringify({ ...saved, messages: saved.messages.slice(-MAX_MESSAGES) }));
  } catch {
    // Storage full: the conversation is only a convenience.
  }
};

export const useAssistant = (currentSupplierId: string | null) => {
  const inventory = useInventory();
  const { profile, update, persisted } = useStoreProfile();
  // Until a store profile is saved, the conversation belongs to "this phone's store".
  const storeKey = persisted ? profile.storeId : UNSAVED_STORE;
  const [saved, setSaved] = useState<Saved>(() => load(storeKey));
  const savedRef = useRef(saved);
  savedRef.current = saved.storeId === storeKey ? saved : load(storeKey);
  const storeKeyRef = useRef(storeKey);
  storeKeyRef.current = storeKey;
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const inventoryRef = useRef(inventory);
  inventoryRef.current = inventory;

  const services = useMemo<AssistantServices>(
    () => ({
      get products() {
        return inventoryRef.current.products;
      },
      get suppliers() {
        return inventoryRef.current.suppliers;
      },
      // The newest lines, also right after a change in the same step.
      orderItems: () => {
        let latest: OrderItem[] = [];
        inventoryRef.current.editOrderItems(items => {
          latest = items;
          return null;
        });
        return latest;
      },
      unitFor: p => newLineUnit(resolveSupplierWorkflow(p.supplierId)),
      getStock: p => inventoryRef.current.getStock(p),
      editOrderItems: change => inventoryRef.current.editOrderItems(change),
      profile: () => profileRef.current,
      updateProfile: change => {
        const ok = update(change);
        return ok;
      },
      history: () => inventoryRef.current.orderHistory,
      now: () => new Date(),
    }),
    [update],
  );

  const dispatch = useCallback(
    (event: EngineEvent) => {
      const current = savedRef.current;
      const out = respond(current.state, event, services, { currentSupplierId });
      let messages = [...current.messages, ...out.messages];
      // Show undone changes as undone where they first appeared.
      const undone = new Set(Object.entries(out.state.actions).filter(([, a]) => a.undone).map(([id]) => id));
      messages = messages.map(m => (m.changes && !m.changes.undone && undone.has(m.changes.actionId) ? { ...m, changes: { ...m.changes, undone: true } } : m));
      // A confirmation answered (or a choice made) is shown as answered where it was asked.
      messages = messages.map(m => (m.confirm && !m.confirm.resolved && !(m.confirm.id in out.state.confirms) ? { ...m, confirm: { ...m.confirm, resolved: 'answered' as const } } : m));
      const next = { storeId: storeKeyRef.current, state: out.state, messages: messages.slice(-MAX_MESSAGES) };
      savedRef.current = next;
      setSaved(next);
      save(next);
    },
    [services, currentSupplierId],
  );

  const clear = useCallback(() => {
    const next = { storeId: storeKeyRef.current, state: emptyEngineState(), messages: [] };
    savedRef.current = next;
    setSaved(next);
    save(next);
  }, []);

  return { messages: savedRef.current.messages, pending: savedRef.current.state.pending, dispatch, clear };
};
