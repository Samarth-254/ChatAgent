import { DomainError } from '../../../domain/errors.js';

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const status = err instanceof DomainError ? err.status : (err.status || 500);
  const code = err instanceof DomainError ? err.code : 'INTERNAL_SERVER_ERROR';
  const message = status === 500 && process.env.NODE_ENV === 'production'
    ? 'An unexpected error occurred.'
    : err.message;

  res.status(status).json({
    error: {
      code,
      message,
      ...(err.details ? { details: err.details } : {})
    }
  });
}

