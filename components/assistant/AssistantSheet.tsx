// components/assistant/AssistantSheet.tsx
//
// The assistant's conversation (v0.1.7): typed or spoken commands, answers with the real changes
// made to the draft order (each with Undo), product choices when a request fits several products,
// Save / Don't save for anything learned about the store, and links to the screens.
//
// It says what it is: "Local commands · no AI model". Speaking is one tap = one command, through
// the phone's own speech service; when that is not available it says so and typing works the same.
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useInventory from '../../hooks/useInventory';
import { useTranslation } from '../../hooks/useTranslation';
import { useAssistant } from '../../hooks/useAssistant';
import { AssistantMessage, Say, fullName } from '../../utils/assistant/engine';
import { Listening, SpeechSupport, listenOnce, speechSupport } from '../../utils/speech';
import { Weekday } from '../../utils/storeProfile';
import { formatCountDate } from '../StockLabel';
import ProductThumb from '../ProductThumb';
import Sheet from '../ui/Sheet';
import { ui } from '../ui/styles';
import { CheckIcon, InformationCircleIcon, MicrophoneIcon, PaperAirplaneIcon, TrashIcon } from '../shared/icons';

const SOURCE_KEYS: Record<string, string> = {
  'owner-estimate': 'srcOwnerEstimate', 'confirmed-order': 'srcConfirmedOrder', invoice: 'srcInvoice', 'verified-count': 'srcVerifiedCount', 'sales-record': 'srcSalesRecord',
};

const weekdayNames = (locale: string, days: Weekday[]) =>
  // 4 January 2026 is a Sunday.
  days.map(d => new Date(2026, 0, 4 + d).toLocaleDateString(locale, { weekday: 'long' }));

interface Props {
  open: boolean;
  onClose: () => void;
  currentSupplierId: string | null;
}

const AssistantSheet: React.FC<Props> = ({ open, onClose, currentSupplierId }) => {
  const { t, language } = useTranslation();
  const navigate = useNavigate();
  const { products, suppliers } = useInventory();
  const { messages, pending, dispatch, clear } = useAssistant(currentSupplierId);
  const [text, setText] = useState('');
  const [support, setSupport] = useState<SpeechSupport | null>(null);
  const [listening, setListening] = useState<Listening | null>(null);
  const [speechNote, setSpeechNote] = useState<string | null>(null);
  const [info, setInfo] = useState(false);
  const [days, setDays] = useState<Weekday[] | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const locale = language === 'ar' ? 'ar-u-nu-latn' : language === 'es' ? 'es-US' : 'en-US';

  useEffect(() => {
    if (open && support === null) speechSupport().then(setSupport).catch(() => setSupport('none'));
  }, [open, support]);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages.length, open]);
  useEffect(() => () => listening?.stop(), [listening]);

  const say = (s: Say) => {
    const params: Record<string, string | number> = { ...s.params };
    if (typeof params.date === 'string' && params.date) params.date = formatCountDate(params.date, language);
    if (typeof params.days === 'string') params.days = weekdayNames(locale, params.days.split(',').filter(Boolean).map(Number) as Weekday[]).join(', ');
    return t(s.key as never, params);
  };
  const name = (productId: string) => {
    const p = products.find(x => x.id === productId);
    return p ? fullName(p) : productId;
  };
  const unitWord = (unit: string) => (unit === 'item' ? t('itemsUnit') : t('casesUnit'));

  const submit = (value: string, via: 'text' | 'voice' = 'text') => {
    const command = value.trim();
    if (!command) return;
    dispatch({ type: 'text', text: command, via });
    setText('');
  };

  const speak = async () => {
    setSpeechNote(null);
    if (support !== 'android' && support !== 'browser') {
      setSpeechNote(t('speechUnsupported'));
      return;
    }
    const session = listenOnce(support, language, t('assistantListening'));
    setListening(session);
    try {
      const heard = await session.result;
      if (heard) submit(heard, 'voice');
      else setSpeechNote(t('speechFailed'));
    } catch (error) {
      setSpeechNote(error instanceof Error && error.message === 'denied' ? t('speechDenied') : t('speechFailed'));
    } finally {
      setListening(null);
    }
  };

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  const activeChoices = pending && (pending.kind === 'choose' || pending.kind === 'weekly-choose') ? pending.candidates : null;
  const activeDays = pending?.kind === 'setup-days' ? pending.supplierId : null;

  const render = (m: AssistantMessage) => {
    if (m.role === 'user') {
      return (
        <div key={m.id} className="flex justify-end">
          <p dir="auto" className="max-w-[85%] break-words rounded-2xl rounded-ee-md bg-cyan-600 px-3 py-2 text-[0.9375rem] text-white dark:bg-cyan-500 dark:text-slate-950" data-testid="assistant-user">
            {m.via === 'voice' && <MicrophoneIcon className="me-1 inline h-4 w-4 align-[-2px]" />}
            {m.text}
          </p>
        </div>
      );
    }
    const choicesLive = !!m.choices && !!activeChoices && m.choices.productIds.join() === activeChoices.join();
    return (
      <div key={m.id} className="max-w-[94%] space-y-2 rounded-2xl rounded-es-md bg-white px-3 py-2 text-[0.9375rem] ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-white/10" data-testid="assistant-reply">
        {m.say?.map((s, i) => <p key={i} dir="auto" className="break-words leading-snug">{say(s)}</p>)}

        {m.changes && (
          <ul className={`space-y-1 ${m.changes.undone ? 'opacity-60' : ''}`} data-testid="assistant-changes">
            {m.changes.lines.map(l => (
              <li key={`${l.productId}${l.unit}`} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span dir="auto" className="min-w-0 flex-1 font-semibold">{name(l.productId)}</span>
                <span className="whitespace-nowrap tabular-nums">
                  {l.before} → <b>{l.after}</b> {unitWord(l.unit)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {m.changes && !m.changes.undone && m.say?.[0]?.key === 'a_changed' && (
          <button type="button" className={`${ui.secondary} !min-h-11 text-sm`} onClick={() => dispatch({ type: 'undo', actionId: m.changes!.actionId })} data-testid="assistant-undo">
            {t('undoChange')}
          </button>
        )}
        {m.changes?.undone && m.say?.[0]?.key === 'a_changed' && <p className={ui.muted}>{t('undoneLabel')}</p>}

        {m.choices && (
          <div className="grid gap-1.5" data-testid="assistant-choices">
            {m.choices.productIds.map(pid => {
              const p = products.find(x => x.id === pid);
              if (!p) return null;
              return (
                <button
                  key={pid}
                  type="button"
                  disabled={!choicesLive}
                  onClick={() => dispatch({ type: 'choose', productId: pid })}
                  className="flex min-h-12 items-center gap-2 rounded-xl px-2 py-1 text-start ring-1 ring-slate-200 enabled:hover:bg-cyan-500/10 disabled:opacity-50 dark:ring-white/10"
                  data-testid="assistant-choice"
                >
                  <ProductThumb product={p} alt="" className="h-10 w-10 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span dir="auto" className="block break-words font-semibold leading-tight">{p.flavor || p.name}</span>
                    <span dir="auto" className="block break-words text-xs text-slate-500 dark:text-slate-400">{[p.flavor ? p.name : '', p.size].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {m.supplierChoices && (
          <div className="flex flex-wrap gap-1.5" data-testid="assistant-suppliers">
            {m.supplierChoices.map(sid => (
              <button key={sid} type="button" disabled={pending?.kind !== 'supplier'} className={`${ui.secondary} !min-h-11 !px-3 text-sm`} onClick={() => dispatch({ type: 'supplier', supplierId: sid })}>
                {suppliers.find(x => x.id === sid)?.name ?? sid}
              </button>
            ))}
          </div>
        )}

        {m.days && (
          <DayPicker
            locale={locale}
            live={activeDays === m.days.supplierId}
            initial={m.days.selected}
            value={days}
            onChange={setDays}
            onSave={selected => {
              dispatch({ type: 'days', supplierId: m.days!.supplierId, days: selected });
              setDays(null);
            }}
            saveLabel={t('saveDays')}
            skipLabel={t('skipDays')}
          />
        )}

        {m.proposal && (
          <ul className="space-y-1.5 text-sm" data-testid="assistant-proposal">
            {m.proposal.lines.map(l => (
              <li key={l.productId}>
                <span dir="auto" className="font-semibold">{name(l.productId)}</span>
                <span className="block text-slate-600 dark:text-slate-300">
                  {l.kind === 'calculated'
                    ? t('propCalculated', { cases: `${l.cases} ${t('casesUnit')}`, weekly: l.weekly ?? '', source: t((l.weeklyEstimate ? 'srcOwnerEstimate' : 'srcConfirmedOrder') as never), onHand: l.onHand ?? '', date: l.countedAt ? formatCountDate(l.countedAt, language) : '', keep: l.keep ?? '', days: (l.untilDelivery ?? 0) + l.coverDays })
                    : t('propTypical', { cases: `${l.cases} ${t('casesUnit')}`, days: l.coverDays, weekly: l.weekly ?? '', source: t((l.weeklyEstimate ? 'srcOwnerEstimate' : 'srcConfirmedOrder') as never) })}
                </span>
              </li>
            ))}
          </ul>
        )}

        {m.usual && (
          <div className="space-y-1.5 text-sm" data-testid="assistant-usual">
            <ul className="space-y-1">
              {m.usual.lines.map(l => (
                <li key={l.productId}>
                  <span dir="auto" className="font-semibold">{name(l.productId)}</span>
                  {l.weekly && <span className="block">{t('usualWeekly', { value: `${l.weekly.value} ${t('casesUnit')}`, source: t(SOURCE_KEYS[l.weekly.source] as never), date: formatCountDate(l.weekly.at, language) })}</span>}
                  {l.pattern && <span className="block text-slate-600 dark:text-slate-300">{t('usualPattern', { orders: l.pattern.orders, perOrder: `${l.pattern.perOrder} ${unitWord(l.pattern.unit)}`, perWeek: l.pattern.perWeek })}</span>}
                </li>
              ))}
            </ul>
            {m.usual.basis && <p className={ui.muted}>{t(m.usual.basis === 'sent' ? 'usualBasisSent' : 'usualBasisSaved', { orders: m.usual.orders, weeks: m.usual.weeks })}</p>}
          </div>
        )}

        {m.order && (
          <div className="space-y-2 text-sm" data-testid="assistant-order">
            {m.order.map(g => (
              <div key={g.supplierId}>
                <p className="font-bold">{suppliers.find(x => x.id === g.supplierId)?.name}</p>
                <ul>
                  {g.lines.map(l => (
                    <li key={`${l.productId}${l.unit}`} className="flex gap-2">
                      <span className="w-14 flex-shrink-0 text-end font-semibold tabular-nums">{l.quantity}</span>
                      <span dir="auto" className="min-w-0 flex-1 break-words">{name(l.productId)} <span className="text-slate-500">({unitWord(l.unit)})</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {m.confirm && (
          <div className="space-y-2" data-testid="assistant-confirm">
            <p dir="auto" className="font-semibold">{say(m.confirm.label)}</p>
            {m.confirm.resolved ? (
              <p className={`${ui.muted} inline-flex items-center gap-1`}><CheckIcon className="h-4 w-4" /> {t('a_answered' as never)}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={`${ui.primary} !min-h-11 text-sm`} onClick={() => dispatch({ type: 'confirm', id: m.confirm!.id, yes: true })} data-testid="assistant-yes">
                  {m.confirm.label.key === 'a_putOnDraft' ? t('addToDraft') : t('saveFact')}
                </button>
                <button type="button" className={`${ui.secondary} !min-h-11 text-sm`} onClick={() => dispatch({ type: 'confirm', id: m.confirm!.id, yes: false })} data-testid="assistant-no">
                  {m.confirm.label.key === 'a_putOnDraft' ? t('notNow') : t('dontSave')}
                </button>
              </div>
            )}
          </div>
        )}

        {m.links?.map(link => (
          <button key={link.to} type="button" className={`${ui.ghost} !min-h-11 !px-2 text-sm`} onClick={() => go(link.to)}>
            {say(link.label)}
          </button>
        ))}
      </div>
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      testId="assistant-sheet"
      title={t('assistantTitle')}
      subtitle={
        <button type="button" className="inline-flex min-h-8 items-center gap-1 text-start text-xs font-semibold text-amber-700 dark:text-amber-300" onClick={() => setInfo(v => !v)} aria-expanded={info} data-testid="assistant-mode">
          <InformationCircleIcon className="h-4 w-4 flex-shrink-0" /> {t('assistantLocalBadge')}
        </button>
      }
      footer={
        <div className="space-y-1.5">
          {listening && (
            <div role="status" className="flex items-center gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-700 dark:text-red-300" data-testid="assistant-listening">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" /> <span className="flex-1">{t('assistantListening')}</span>
              <button type="button" className={`${ui.secondary} !min-h-11 text-sm`} onClick={() => { listening.stop(); setListening(null); }}>{t('assistantStop')}</button>
            </div>
          )}
          {speechNote && <p role="status" className={`${ui.muted} text-xs`} data-testid="assistant-speech-note">{speechNote}</p>}
          <form
            className="flex items-end gap-2"
            onSubmit={e => {
              e.preventDefault();
              submit(text);
            }}
          >
            <button
              type="button"
              className={`${ui.iconButton} ring-1 ring-slate-200 dark:ring-white/10 ${support === 'none' ? 'opacity-50' : ''}`}
              onClick={speak}
              disabled={!!listening}
              aria-label={t('assistantSpeak')}
              data-testid="assistant-mic"
            >
              <MicrophoneIcon className="h-6 w-6" />
            </button>
            <label className="min-w-0 flex-1">
              <span className="sr-only">{t('assistantPlaceholder')}</span>
              <input
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={t('assistantPlaceholder')}
                enterKeyHint="send"
                autoComplete="off"
                maxLength={500}
                className={ui.input}
                data-testid="assistant-input"
              />
            </label>
            <button type="submit" className={`${ui.primary} !px-3`} aria-label={t('assistantSend')} disabled={!text.trim()} data-testid="assistant-send">
              <PaperAirplaneIcon className="h-5 w-5" />
            </button>
          </form>
        </div>
      }
    >
      <div className="space-y-2" data-testid="assistant-conversation">
        {info && (
          <div className={`${ui.warn} space-y-1 font-normal`} data-testid="assistant-info">
            <p>{t('assistantLocalInfo')}</p>
            <p>{t('speechPrivacy')}</p>
          </div>
        )}
        {messages.length === 0 && <p className={`${ui.muted}`}>{t('assistantExamples')}</p>}
        <div ref={list} className="max-h-[52vh] space-y-2 overflow-y-auto" aria-live="polite">
          {messages.map(render)}
        </div>
        {messages.length > 0 && (
          <div className="flex justify-end">
            <button type="button" className={`${ui.ghost} !min-h-11 !px-2 text-sm`} onClick={clear} data-testid="assistant-clear">
              <TrashIcon className="h-4 w-4" /> {t('assistantClear')}
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
};

const DayPicker: React.FC<{
  locale: string;
  live: boolean;
  initial: Weekday[];
  value: Weekday[] | null;
  onChange: (days: Weekday[]) => void;
  onSave: (days: Weekday[]) => void;
  saveLabel: string;
  skipLabel: string;
}> = ({ locale, live, initial, value, onChange, onSave, saveLabel, skipLabel }) => {
  const selected = value ?? initial;
  const order: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="space-y-2" data-testid="assistant-days">
      <div className="flex flex-wrap gap-1.5">
        {order.map(d => {
          const on = selected.includes(d);
          return (
            <button
              key={d}
              type="button"
              disabled={!live}
              aria-pressed={on}
              onClick={() => onChange(on ? selected.filter(x => x !== d) : [...selected, d])}
              className={`min-h-11 min-w-11 rounded-xl px-2 text-sm font-semibold ring-1 ${on ? 'bg-cyan-600 text-white ring-cyan-600 dark:bg-cyan-400 dark:text-slate-950' : 'ring-slate-300 dark:ring-white/20'} disabled:opacity-50`}
            >
              {new Date(2026, 0, 4 + d).toLocaleDateString(locale, { weekday: 'short' })}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!live || !selected.length} className={`${ui.primary} !min-h-11 text-sm`} onClick={() => onSave(selected)}>{saveLabel}</button>
        <button type="button" disabled={!live} className={`${ui.secondary} !min-h-11 text-sm`} onClick={() => onSave([])}>{skipLabel}</button>
      </div>
    </div>
  );
};

export default AssistantSheet;
