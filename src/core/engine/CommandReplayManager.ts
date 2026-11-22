export interface AbortedCommand {
  clientSeq: bigint;
  replay: () => Promise<void>;
}

export class CommandReplayManager {
  private queue: AbortedCommand[] = [];

  queueAborted(cmd: AbortedCommand): void {
    this.queue.push(cmd);
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  async replayAll(): Promise<void> {
    // Sort by client_seq ascending for deterministic replay order.
    const ordered = [...this.queue].sort((a, b) =>
      a.clientSeq < b.clientSeq ? -1 : a.clientSeq > b.clientSeq ? 1 : 0
    );

    for (const cmd of ordered) {
      await cmd.replay();
    }

    this.queue = [];
  }
}
