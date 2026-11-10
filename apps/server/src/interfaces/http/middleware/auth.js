import { z } from 'zod';
import { CLIENT_ID_HEADER } from '@chatagent/shared';
import { ValidationError } from '../../../domain/errors.js';

const uuidSchema = z.string().uuid();

export function clientAuthMiddleware(req, res, next) {
  const rawId = req.headers[CLIENT_ID_HEADER] || req.headers['x-client-id'];
  if (!rawId) {
    // Generate fallback or throw validation error
    return next(new ValidationError('Missing required X-Client-Id header.'));
  }

  const parsed = uuidSchema.safeParse(rawId);
  if (!parsed.success) {
    return next(new ValidationError('Invalid X-Client-Id format. Must be a valid UUID.'));
  }

  req.userId = parsed.data;
  next();
}

