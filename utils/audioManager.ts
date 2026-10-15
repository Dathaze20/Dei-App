// utils/audioManager.ts

const sounds = {
  add: 'data:audio/wav;base64,UklGRlYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YSoAAABt+v/3/vQ+87vut+mwy4zKa8Jov2i6ZbBWsVGtVahRpkShOKAirQ==',
  remove: 'data:audio/wav;base64,UklGRlIAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YSAAAAAA/v/9//7/3/+h/9n/wv/L/6z/uv+1/8z/vv/D/6v/df+k/3f/cv9w/3L/b/9t/2z/a/9u/3T/eP+G/5b/qP+3/7n/w//O//H/+v8=',
  success: 'data:audio/wav;base64,UklGRpQAAABXQVZFZm10IBAAAAABAAIARKwAABCxAgAEABAAZGF0YYgAAABo/v/67v/rAAsBCgEWASwBOgFEAV0BigGeAdIC6gMMAyIDNgNSA+EECAX+Bj4IIwkPCnILCAwGDS0OFg+UEAYRkhI+ExoVSBYyFvUXaBhmGW0Z/hpIGzgcNh2ZHyYgOSDMIikieyUnKFsp1ysNLAYtEy6xMAIzCDTxNbU3eTj0Ofc75D4eP/hBEkO2RA5Fw0gaSh5Lp0xzTk5QolFvUn9VsVf+WMtZp1sAXApdyl7GYM1j8WU+Zsln/2o+bSVuN3KAdEd2t3l0eqB9UX5pf/iBH4LdhDqFBoerh8eJrIrci+OM847tkAqSNJL8lWyXIpg3mUCaSJtHnEaepp/yoNqj4qVcpn+ocKrRq92uTrBUskO3bLiAvNm9+8AEwSXCAsNsxHjFh8b0yAnL9M20z/7R8tUA2Wnc0uFw4/3l2edY6bHrYO0l74TxyvPx9eH4rfm0+wD9/v9Z/zsADgEHAh4CGwIuAj0CTQJUAloCXgJlAm0CgAKKAqACqwK1AsEC3wLoAwQDFAMpAz0DTgNeA3UDhQOUA6cDswPgA+QD9QQGBBUEEQQiBCkEPQRrBIgEqwTBBOCFBoW8hyqLSY6eklqXupqyn7miuqu/sr+6wMLGx8vN0c/U2djc3+Lh5efp7e/w8vP09vf4+fn6+/z9/v8AAQACAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4vMDEyMzQ1Njc4OTo7PD0+P0BBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWltcXV5fYGFiY2RlZmdoaWprbG1ub3Bxcv8=',
  open: 'data:audio/wav;base64,UklGRlIAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YSCAAAAAAP/A/8f/yP/J/8b/xv/F/8X/w//C/8H/wP/A/7/wv++/73/tf+1/7X/t/++/8L/zP/U/9v/3//k/+r/8P/3//7/',
  close: 'data:audio/wav;base64,UklGRlIAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YSCgAAAAAPr/+f/x/9z/1P/O/8r/xv/C/8H/v//A/8H/w//F/8b/yv/Q/9X/3P/j/+j/7//z//n//P/+/wA=',
};

class AudioManager {
  private audioContext: AudioContext | null = null;
  private isUnlocked = false;
  private soundBuffers: { [key: string]: AudioBuffer } = {};

  constructor() {
    // This code runs only in the browser, so `window` is safe to use.
    if (typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext)) {
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        this._loadSounds();
      } catch (e) {
        console.error("Web Audio API is not supported in this browser.");
      }
    }
  }

  private async _loadSounds() {
    if (!this.audioContext) return;

    // Use Promise.all to load all sounds concurrently
    await Promise.all(
      Object.entries(sounds).map(async ([key, dataUri]) => {
        try {
          const response = await fetch(dataUri);
          const arrayBuffer = await response.arrayBuffer();
          // Use the promise-based version of decodeAudioData for cleaner async/await
          const buffer = await this.audioContext!.decodeAudioData(arrayBuffer);
          this.soundBuffers[key] = buffer;
        } catch (e) {
          console.error(`Failed to load or decode sound "${key}":`, e);
        }
      })
    );
  }

  public unlock() {
    if (!this.audioContext || this.isUnlocked) {
      return;
    }
    
    // The user has interacted with the page.
    // Calling resume() on the AudioContext is the standard way to enable audio playback.
    this.audioContext.resume().then(() => {
      if (this.audioContext!.state === 'running') {
        this.isUnlocked = true;
      }
    }).catch(e => console.error("Error resuming AudioContext:", e));
  }
  
  public play(soundName: keyof typeof sounds) {
    if (!this.audioContext || !this.isUnlocked) {
      // Don't play if context isn't ready or unlocked.
      // Unlocking happens on first user interaction.
      return;
    }

    const buffer = this.soundBuffers[soundName];
    if (!buffer) {
      // Sound might not have loaded yet, or failed to load.
      return;
    }
    
    try {
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioContext.destination);
      source.start(0);
    } catch (e) {
        console.error(`Error playing sound "${soundName}":`, e);
    }
  }
}

// Export a single, shared instance of the AudioManager.
export const audioManager = new AudioManager();