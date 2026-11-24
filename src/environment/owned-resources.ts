import type { IOwnedCleanup } from "../interfaces/owned-process.interface.ts";

export class OwnedResources {
  private readonly cleanups: IOwnedCleanup[] = [];
  private readonly cancellation = new AbortController();
  readonly signal = this.cancellation.signal;
  readonly own = (resource: IOwnedCleanup): void => {
    this.cleanups.unshift(resource);
  };
  readonly cancel = (): void => {
    this.cancellation.abort(new Error("Owned stack startup cancelled"));
  };
  readonly stop = async (): Promise<void> => {
    const failures: unknown[] = [];
    for (const resource of this.cleanups.splice(0)) {
      try {
        await resource.stop();
      } catch (error) {
        failures.push(new Error(`Cleanup failed: ${resource.name}`, { cause: error }));
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, "Owned stack cleanup failed");
    }
  };
}
