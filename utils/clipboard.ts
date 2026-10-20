// utils/clipboard.ts
//
// Copy text, with a fallback for WebViews where the Clipboard API is missing or refused.
// Resolves true only when the text was really copied, so the screen never says "Copied" falsely.

export const copyText = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the older way.
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
};

/** An "sms:" link with the text as the message body (opens the phone's messaging app). */
export const smsHref = (text: string) => `sms:?&body=${encodeURIComponent(text)}`;
