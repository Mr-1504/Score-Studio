export interface LoopRegion {
  startSec: number;
  endSec:   number;
  enabled:  boolean;
}

export class LoopEngine {
  private region: LoopRegion = { startSec: 0, endSec: 0, enabled: false };
  private totalSec = 0;
  private onRegionChange?: (r: LoopRegion) => void;

  constructor(onRegionChange?: (r: LoopRegion) => void) {
    this.onRegionChange = onRegionChange;
  }

  setTotalDuration(sec: number): void {
    this.totalSec = sec;
  }

  setRegion(startSec: number, endSec: number): void {
    const s = Math.max(0, Math.min(startSec, this.totalSec));
    const e = Math.max(s + 0.5, Math.min(endSec, this.totalSec));
    this.region = { startSec: s, endSec: e, enabled: true };
    this.onRegionChange?.(this.region);
  }

  enable():  void { this.region = { ...this.region, enabled: true };  this.onRegionChange?.(this.region); }
  disable(): void { this.region = { ...this.region, enabled: false }; this.onRegionChange?.(this.region); }
  toggle():  void { this.region.enabled ? this.disable() : this.enable(); }
  clear():   void { this.region = { startSec: 0, endSec: 0, enabled: false }; this.onRegionChange?.(this.region); }

  get isEnabled():  boolean     { return this.region.enabled; }
  get startSec():   number      { return this.region.startSec; }
  get endSec():     number      { return this.region.endSec; }
  get current():    LoopRegion  { return { ...this.region }; }

  // Kiểm tra position có vượt qua endSec không → cần seek về startSec
  shouldLoop(currentSec: number): boolean {
    return this.region.enabled && currentSec >= this.region.endSec;
  }
}