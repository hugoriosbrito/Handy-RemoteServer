/** Minimal Expo AV surface required to serialize recorder ownership. */
export type UnloadableRecording = {
  stopAndUnloadAsync: () => Promise<unknown>;
};

/**
 * Serializes recorder replacement across chunk rotation, navigation cleanup,
 * and a new recording screen. Expo AV permits only one prepared recorder, so
 * a replacement must wait until the prior native object has fully unloaded.
 */
export class RecordingSession<T extends UnloadableRecording> {
  private active: T | null = null;
  private operation: Promise<void> = Promise.resolve();

  async prepare(factory: () => Promise<T>): Promise<T> {
    let next: T | null = null;
    this.operation = this.operation.catch(() => undefined).then(async () => {
      const current = this.active;
      this.active = null;
      if (current) {
        // An interrupted native recorder is already unusable. Do not let its
        // cleanup rejection permanently block the next recording attempt.
        await current.stopAndUnloadAsync().catch(() => undefined);
      }
      next = await factory();
      this.active = next;
    });
    await this.operation;
    if (!next) throw new Error("recording preparation did not produce a recorder");
    return next;
  }

  async stop(recording: T): Promise<void> {
    this.operation = this.operation.catch(() => undefined).then(async () => {
      if (this.active !== recording) return;
      this.active = null;
      await recording.stopAndUnloadAsync().catch(() => undefined);
    });
    await this.operation;
  }
}
