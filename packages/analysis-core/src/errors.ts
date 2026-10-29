import type { ScanErrorCode } from "@webdna/shared";

/** An expected scan failure with a stable, user-facing error code. */
export class ScanFailure extends Error {
  constructor(
    readonly code: ScanErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ScanFailure";
  }
}
