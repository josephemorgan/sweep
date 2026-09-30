import type { QueuedWrite } from '../app/sync/queued-write';
import type { WriteSender } from '../app/sync/write-queue';

export interface SentWrite {
  write: QueuedWrite;
  resolve: () => void;
  reject: (err: unknown) => void;
}

/** A WRITE_SENDER whose requests the test answers by hand. */
export class FakeSender {
  readonly sent: SentWrite[] = [];
  readonly send: WriteSender = (write) =>
    new Promise<void>((resolve, reject) => {
      this.sent.push({ write, resolve, reject });
    });
}
