export const CARD_HOLD_MS = 600;

// One press produces either a short action or a long action, never both.
export class CardHold {
  private timer?: ReturnType<typeof setTimeout>;
  private source: string | null = null;
  private fired = false;
  constructor(private changed: (holding: boolean) => void) {}

  start(source: string, longAction: () => void) {
    if (this.source !== null) return;
    this.source = source;
    this.fired = false;
    this.changed(true);
    this.timer = setTimeout(() => {
      this.fired = true;
      this.changed(false);
      longAction();
    }, CARD_HOLD_MS);
  }

  release(source: string): boolean {
    if (this.source !== source) return false;
    const short = !this.fired;
    this.cancel();
    return short;
  }

  cancel() {
    clearTimeout(this.timer);
    this.source = null;
    this.fired = false;
    this.changed(false);
  }
}
