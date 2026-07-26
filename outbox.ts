import { KeyedStorage } from './storage';

export interface OutboxItem<TPayload = unknown> {
  id: string;
  payload: TPayload;
  createdAt: number;
  attempts: number;
}

export type OutboxSender<TPayload> = (payload: TPayload) => Promise<void>;

/**
 * Persistent FIFO queue for mutations made while offline (or that failed).
 * Call `enqueue` whenever a write happens; call `flush` to attempt sending
 * everything queued, in order, stopping at the first failure so ordering
 * is preserved.
 */
export class Outbox<TPayload = unknown> {
  private storage: KeyedStorage;
  private queueKey = 'queue';
  private flushing = false;

  constructor(namespace: string) {
    this.storage = new KeyedStorage(`outbox:${namespace}`);
  }

  private async readQueue(): Promise<OutboxItem<TPayload>[]> {
    return (await this.storage.get<OutboxItem<TPayload>[]>(this.queueKey)) ?? [];
  }

  private async writeQueue(queue: OutboxItem<TPayload>[]): Promise<void> {
    await this.storage.set(this.queueKey, queue);
  }

  async enqueue(payload: TPayload): Promise<OutboxItem<TPayload>> {
    const queue = await this.readQueue();
    const item: OutboxItem<TPayload> = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      payload,
      createdAt: Date.now(),
      attempts: 0,
    };
    queue.push(item);
    await this.writeQueue(queue);
    return item;
  }

  async size(): Promise<number> {
    return (await this.readQueue()).length;
  }

  async peekAll(): Promise<OutboxItem<TPayload>[]> {
    return this.readQueue();
  }

  async clear(): Promise<void> {
    await this.writeQueue([]);
  }

  /**
   * Attempts to send every queued item in order via `send`.
   * Stops at the first failure (keeping it and everything after it queued)
   * so writes are applied in the order they happened.
   * Returns how many items were successfully sent.
   */
  async flush(send: OutboxSender<TPayload>): Promise<number> {
    if (this.flushing) return 0;
    this.flushing = true;
    let sentCount = 0;
    try {
      let queue = await this.readQueue();
      while (queue.length > 0) {
        const item = queue[0];
        try {
          await send(item.payload);
          queue = queue.slice(1);
          await this.writeQueue(queue);
          sentCount++;
        } catch (err) {
          queue[0] = { ...item, attempts: item.attempts + 1 };
          await this.writeQueue(queue);
          break;
        }
      }
    } finally {
      this.flushing = false;
    }
    return sentCount;
  }
}
