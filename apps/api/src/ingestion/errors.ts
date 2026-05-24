export class IngestionFetchError extends Error {
  readonly context: string;
  readonly statusCode: number;

  constructor(params: {
    context: string;
    message: string;
    statusCode: number;
  }) {
    super(params.message);
    this.name = "IngestionFetchError";
    this.context = params.context;
    this.statusCode = params.statusCode;
  }
}

export function isForbiddenIngestionError(error: unknown) {
  return error instanceof IngestionFetchError && error.statusCode === 403;
}
