/** Source of the current time, so use cases stay deterministic under test. */
export abstract class ClockPort {
  abstract now(): Date;
}
