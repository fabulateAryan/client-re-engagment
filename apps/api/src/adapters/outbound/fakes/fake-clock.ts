import { ClockPort } from '../../../core/ports';

/** Controllable clock for tests. */
export class FakeClock extends ClockPort {
  private current: Date;

  constructor(start: Date) {
    super();
    this.current = new Date(start.getTime());
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  set(time: Date): void {
    this.current = new Date(time.getTime());
  }

  advanceBy(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}
