export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public isOperational = true,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
