export type OrderedCommand = {
  clientSeq: number;
  requestId: string;
  sessionId: string;
  opName: string;
  payload: unknown;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  receivedAt: number;
};

export interface OrderingConfig {
  bufferSize?: number;    // proposed default: 64
  timeoutMs?: number;     // proposed default: 5000 (5s)
}

export class SessionOrderer {
  private expectedSeq = 1;
  private buffer = new Map<number, OrderedCommand>();
  private timer: NodeJS.Timeout | null = null;
  private readonly config: Required<OrderingConfig>;
  private isRunning = false;

  constructor(sessionId: string, config: OrderingConfig = {}) {
    this.config = {
      bufferSize: config.bufferSize ?? 64,
      timeoutMs: config.timeoutMs ?? 5_000,
    };
  }

  /** Submit a command for ordered execution. Returns a promise that resolves when the command is executed in sequence. */
  submit(command: OrderedCommand): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const entry: OrderedCommand = { ...command, resolve, reject, receivedAt: Date.now() };

      if (command.clientSeq === this.expectedSeq) {
        // Next expected sequence - execute immediately
        this.expectedSeq++;
        this.processBuffered();
        resolve(entry);
        return;
      }

      if (command.clientSeq < this.expectedSeq) {
        // Duplicate or stale - reject
        reject(new Error(`Duplicate or stale client_seq ${command.clientSeq}, expected ${this.expectedSeq}`));
        return;
      }

      // Buffer out-of-order command
      if (this.buffer.size >= this.config.bufferSize) {
        reject(new Error(`Reorder buffer overflow (${this.config.bufferSize} entries)`));
        return;
      }

      this.buffer.set(command.clientSeq, entry);
      this.startTimer();
    });
  }

  /** Signal that the current sequence number has been processed, allowing the next buffered command to proceed. */
  advance(): void {
    this.expectedSeq++;
    this.processBuffered();
  }

  private processBuffered(): void {
    while (this.buffer.has(this.expectedSeq)) {
      const entry = this.buffer.get(this.expectedSeq)!;
      this.buffer.delete(this.expectedSeq);
      entry.resolve(entry); // release the buffered command so its caller can proceed
      this.expectedSeq++;
    }
    if (this.buffer.size === 0) {
      this.stopTimer();
    } else {
      this.startTimer();
    }
  }

  private startTimer(): void {
    this.stopTimer();
    this.timer = setTimeout(() => {
      // Timeout on buffered commands - abort them
      const timeoutError = new Error(`Reorder buffer timeout (${this.config.timeoutMs}ms)`);
      for (const [seq, entry] of this.buffer.entries()) {
        entry.reject(timeoutError);
      }
      this.buffer.clear();
      this.stopTimer();
    }, this.config.timeoutMs);
  }

  private stopTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Cancel all buffered commands (queued commands are dropped). */
  cancelQueued(): void {
    const cancelError = new Error('Command cancelled');
    for (const [seq, entry] of this.buffer.entries()) {
      entry.reject(cancelError);
    }
    this.buffer.clear();
    this.stopTimer();
  }

  get pendingCount(): number {
    return this.buffer.size;
  }

  get expectedSequence(): number {
    return this.expectedSeq;
  }

  cleanup(): void {
    this.stopTimer();
    this.buffer.clear();
  }
}

export interface OrdererRegistry {
  getOrCreate(principal: string, sessionId: string): SessionOrderer;
  remove(principal: string, sessionId: string): void;
}

export class OrdererRegistryImpl implements OrdererRegistry {
  private orderers = new Map<string, SessionOrderer>();

  private key(principal: string, sessionId: string): string {
    return `${principal}:${sessionId}`;
  }

  getOrCreate(principal: string, sessionId: string): SessionOrderer {
    const k = this.key(principal, sessionId);
    let orderer = this.orderers.get(k);
    if (!orderer) {
      orderer = new SessionOrderer(sessionId);
      this.orderers.set(k, orderer);
    }
    return orderer;
  }

  remove(principal: string, sessionId: string): void {
    const k = this.key(principal, sessionId);
    const orderer = this.orderers.get(k);
    if (orderer) {
      orderer.cleanup();
      this.orderers.delete(k);
    }
  }
}

export const ordererRegistry = new OrdererRegistryImpl();
