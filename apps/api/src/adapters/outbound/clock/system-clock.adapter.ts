import { Injectable } from '@nestjs/common';
import { ClockPort } from '../../../core/ports';

/** Real wall-clock time. Trivial enough to use in every phase. */
@Injectable()
export class SystemClockAdapter extends ClockPort {
  now(): Date {
    return new Date();
  }
}
