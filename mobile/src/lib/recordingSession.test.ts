// @ts-nocheck -- Bun supplies this module while executing the focused test.
import { expect, test } from "bun:test";
import { RecordingSession } from "./recordingSession";

type FakeRecording = {
  id: string;
  stopAndUnloadAsync: () => Promise<void>;
};

test("waits for the active recorder to unload before preparing a replacement", async () => {
  const events: string[] = [];
  let releaseFirst: (() => void) | undefined;
  const first: FakeRecording = {
    id: "first",
    stopAndUnloadAsync: () =>
      new Promise<void>((resolve) => {
        events.push("unload:first");
        releaseFirst = resolve;
      }),
  };
  const second: FakeRecording = {
    id: "second",
    stopAndUnloadAsync: async () => undefined,
  };
  const session = new RecordingSession<FakeRecording>();

  await session.prepare(async () => first);
  const replacement = session.prepare(async () => {
    events.push("prepare:second");
    return second;
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(events).toEqual(["unload:first"]);
  releaseFirst?.();
  await replacement;
  expect(events).toEqual(["unload:first", "prepare:second"]);
});

test("recovers when an interrupted recorder cannot unload cleanly", async () => {
  const first: FakeRecording = {
    id: "interrupted",
    stopAndUnloadAsync: async () => {
      throw new Error("native recorder interrupted");
    },
  };
  const second: FakeRecording = {
    id: "replacement",
    stopAndUnloadAsync: async () => undefined,
  };
  const session = new RecordingSession<FakeRecording>();

  await session.prepare(async () => first);
  await expect(session.prepare(async () => second)).resolves.toBe(second);
});
