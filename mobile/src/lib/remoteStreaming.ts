import * as FileSystem from "expo-file-system";
import type { TranscriptionResponse } from "@/api/client";

type ServerMessage =
  | { type: "ready" }
  | { type: "partial"; committed: string; tentative: string }
  | { type: "final"; transcription: TranscriptionResponse }
  | { type: "error"; code: string; message: string };

type Callbacks = {
  onPartial: (committed: string, tentative: string) => void;
  onError: (code: string, message: string) => void;
};

/**
 * One authenticated remote streaming session. Authentication stays in the
 * message protocol because React Native WebSocket cannot attach Authorization
 * headers on Android and iOS.
 */
export class RemoteStreamingSession {
  private socket: WebSocket | null = null;
  private nextSequence = 0;
  private finalResolver: ((value: TranscriptionResponse) => void) | null = null;
  private finalRejecter: ((reason: Error) => void) | null = null;

  constructor(
    private readonly token: string,
    private readonly baseUrl: string,
    private readonly callbacks: Callbacks,
  ) {}

  async connect(): Promise<void> {
    const url = this.baseUrl.replace(/^http/, "ws").replace(/\/$/, "") + "/v1/stream";
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("stream_connect_timeout")), 8000);
      const socket = new WebSocket(url);
      this.socket = socket;
      socket.onopen = () => {
        socket.send(JSON.stringify({ type: "authenticate", token: this.token }));
        socket.send(JSON.stringify({ type: "start" }));
      };
      socket.onmessage = (event) => {
        let message: ServerMessage;
        try {
          message = JSON.parse(String(event.data)) as ServerMessage;
        } catch {
          return;
        }
        if (message.type === "ready") {
          clearTimeout(timeout);
          resolve();
        } else if (message.type === "partial") {
          this.callbacks.onPartial(message.committed, message.tentative);
        } else if (message.type === "final") {
          this.finalResolver?.(message.transcription);
          this.close();
        } else if (message.type === "error") {
          const error = new Error(`${message.code}: ${message.message}`);
          this.callbacks.onError(message.code, message.message);
          clearTimeout(timeout);
          reject(error);
          this.finalRejecter?.(error);
        }
      };
      socket.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("stream_network_error"));
      };
      socket.onclose = () => {
        clearTimeout(timeout);
      };
    });
  }

  async sendAudioFile(uri: string): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("stream_not_connected");
    }
    const data = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    this.socket.send(
      JSON.stringify({ type: "audio", sequence: this.nextSequence++, data }),
    );
  }

  finish(postProcess: boolean): Promise<TranscriptionResponse> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("stream_not_connected"));
    }
    return new Promise<TranscriptionResponse>((resolve, reject) => {
      this.finalResolver = resolve;
      this.finalRejecter = reject;
      this.socket?.send(JSON.stringify({ type: "finish", postProcess }));
    });
  }

  cancel(): void {
    this.socket?.send(JSON.stringify({ type: "cancel" }));
    this.close();
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
  }
}
