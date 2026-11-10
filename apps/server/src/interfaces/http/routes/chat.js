import express from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { EventType } from '@chatagent/shared';
import { ValidationError } from '../../../domain/errors.js';
import { rateLimitMiddleware } from '../middleware/rateLimiter.js';

const chatSchema = z.object({
  sessionId: z.string().uuid().optional(),
  message: z.string().min(1, 'Message cannot be empty').max(4000, 'Message is too long')
});

export function createChatRouter({ chatTurnUseCase, sessionRepository }) {
  const router = express.Router();

  router.post('/', rateLimitMiddleware, async (req, res, next) => {
    const parseResult = chatSchema.safeParse(req.body);
    if (!parseResult.success) {
      return next(new ValidationError('Invalid chat request body', parseResult.error.format()));
    }

    const { message } = parseResult.data;
    const userId = req.userId;
    const sessionId = parseResult.data.sessionId || crypto.randomUUID();

    // Ensure session exists
    await sessionRepository.createSession(
      sessionId,
      userId,
      message.slice(0, 36) + (message.length > 36 ? '...' : '')
    );

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    const abortController = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) {
        abortController.abort();
      }
    });

    const sendEvent = (event) => {
      if (!res.writableEnded) {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`);
      }
    };

    try {
      await chatTurnUseCase.execute({
        userId,
        sessionId,
        message,
        onEvent: sendEvent,
        signal: abortController.signal
      });
    } catch (err) {
      if (!abortController.signal.aborted && !res.writableEnded) {
        sendEvent({
          type: EventType.ERROR,
          payload: { message: err.message }
        });
      }
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  });

  return router;
}

