// components/ui/styles.ts
//
// Shared class names for the Counter screen, so every screen, sheet and form looks the same:
// solid surfaces (white / deep navy), cyan-to-blue for the main action, teal for "in the order",
// red only for removing. Every button is at least 44px tall.

const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[0.9375rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400';

export const ui = {
  /** Main action: Save, Share, Create List. */
  primary: `${button} bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-600/20 dark:from-cyan-400 dark:to-blue-500 dark:text-slate-950`,
  /** Second action: Cancel, Copy, Add more. */
  secondary: `${button} bg-slate-100 text-slate-800 ring-1 ring-slate-200 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-100 dark:ring-white/10 dark:hover:bg-white/10`,
  /** Quiet text action. */
  ghost: `${button} text-cyan-700 hover:bg-cyan-500/10 dark:text-cyan-300`,
  /** Removing or clearing. */
  danger: `${button} bg-red-600 text-white hover:bg-red-700`,
  dangerQuiet: `${button} text-red-700 ring-1 ring-red-200 hover:bg-red-50 dark:text-red-300 dark:ring-red-500/30 dark:hover:bg-red-500/10`,
  /** A card on the page. */
  card: 'rounded-2xl bg-white ring-1 ring-slate-200 dark:bg-slate-900/80 dark:ring-white/10',
  /** Section heading inside a page. */
  heading: 'text-lg font-bold text-slate-900 dark:text-white',
  /** Small caps label above a group of settings. */
  eyebrow: 'text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400',
  muted: 'text-sm text-slate-500 dark:text-slate-400',
  /** Text fields and selects. */
  input:
    'block w-full min-h-11 min-w-0 rounded-xl bg-white px-3 text-base text-slate-900 ring-1 ring-slate-300 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-60 dark:bg-slate-900 dark:text-white dark:ring-white/15',
  label: 'mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200',
  /** Messages. */
  ok: 'rounded-xl bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-800 dark:text-emerald-300',
  error: 'rounded-xl bg-red-500/10 p-3 text-sm font-semibold text-red-700 ring-1 ring-red-500/30 dark:text-red-300',
  warn: 'rounded-xl bg-amber-400/10 p-3 text-sm font-semibold text-amber-800 ring-1 ring-amber-500/30 dark:text-amber-300',
  /** A round 44px icon button (always with an aria-label). */
  iconButton:
    'inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10',
};
