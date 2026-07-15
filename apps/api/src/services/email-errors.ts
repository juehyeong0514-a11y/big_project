export class EmailProviderConfigurationError extends Error {
  readonly name = "EmailProviderConfigurationError";

  constructor(readonly provider: string, message: string) {
    super(message);
  }
}
