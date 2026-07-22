export class RemoteApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "RemoteApiError";
    this.status = status;
    this.body = body;
  }
}

export class RemoteApiValidationError extends Error {
  readonly issues: unknown;

  constructor(message: string, issues: unknown) {
    super(message);
    this.name = "RemoteApiValidationError";
    this.issues = issues;
  }
}
