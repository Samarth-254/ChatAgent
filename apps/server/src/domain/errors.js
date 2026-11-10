export class DomainError extends Error {
  constructor(message, code = 'DOMAIN_ERROR', status = 500) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
  }
}

export class ValidationError extends DomainError {
  constructor(message, details = null) {
    super(message, 'VALIDATION_ERROR', 400);
    this.details = details;
  }
}

export class NotFoundError extends DomainError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 'NOT_FOUND', 404);
  }
}

export class RateLimitError extends DomainError {
  constructor(message = 'Rate limit exceeded. Please wait a moment.') {
    super(message, 'RATE_LIMIT_EXCEEDED', 429);
  }
}

