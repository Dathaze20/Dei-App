// utils/speech.ts
//
// Speaking a command to the assistant, once per tap. Never always-listening.
//   Android app: the phone's own speech screen (DeliNativePlugin.listenOnce). The app holds no
//                microphone permission and never records audio; it gets back only the text.
//   Browser:     the Web Speech API where the browser has it (Chrome sends the audio to its own
//                speech service; the browser asks for the microphone itself).
//   Otherwise:   not available, and the screen says so; typing works the same.
import { DeliNative, isAndroidApp } from './nativeApp';

export type SpeechSupport = 'android' | 'browser' | 'none';

interface BrowserRecognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type RecognitionCtor = new () => BrowserRecognition;

const browserRecognition = (): RecognitionCtor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const speechSupport = async (): Promise<SpeechSupport> => {
  if (isAndroidApp()) {
    try {
      return (await DeliNative.speechAvailable()).available ? 'android' : 'none';
    } catch {
      return 'none';
    }
  }
  return browserRecognition() ? 'browser' : 'none';
};

const LOCALES: Record<string, string> = { en: 'en-US', es: 'es-US', ar: 'ar' };

export interface Listening {
  result: Promise<string | null>;
  stop: () => void;
}

/** Listens for one command. Resolves with the text, or null (nothing heard, stopped). */
export const listenOnce = (support: SpeechSupport, language: string, prompt?: string): Listening => {
  const locale = LOCALES[language] ?? 'en-US';
  if (support === 'android') {
    return {
      result: DeliNative.listenOnce({ language: locale, prompt }).then(r => r.text?.trim() || null),
      // The phone's own screen has its own close button.
      stop: () => undefined,
    };
  }
  const Ctor = browserRecognition();
  if (support !== 'browser' || !Ctor) return { result: Promise.reject(new Error('unsupported')), stop: () => undefined };
  const recognition = new Ctor();
  recognition.lang = locale;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  let settle: (text: string | null) => void = () => undefined;
  let fail: (error: Error) => void = () => undefined;
  const result = new Promise<string | null>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  let heard: string | null = null;
  recognition.onresult = e => {
    heard = e.results[0]?.[0]?.transcript?.trim() || null;
  };
  recognition.onerror = e => (e.error === 'not-allowed' || e.error === 'service-not-allowed' ? fail(new Error('denied')) : settle(null));
  recognition.onend = () => settle(heard);
  recognition.start();
  return { result, stop: () => recognition.abort() };
};
