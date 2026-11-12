import express from 'express';
import { z } from 'zod';
import { NotFoundError, ValidationError } from '../../../domain/errors.js';

const patchSchema = z.object({
  title: z.string().min(1).max(120)
});

import { seedDemoHistory } from '../../../domain/demoSeed.js';

export function createSessionsRouter({ sessionRepository, messageRepository }) {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      let sessions = await sessionRepository.getSessions(req.userId);
      if (sessions.length === 0 && messageRepository) {
        await seedDemoHistory(sessionRepository, messageRepository, req.userId);
        sessions = await sessionRepository.getSessions(req.userId);
      }
      res.json(sessions);
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const session = await sessionRepository.getSession(req.params.id, req.userId);
      if (!session) {
        return next(new NotFoundError('Session'));
      }
      res.json(session);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const parsed = patchSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(new ValidationError('Invalid session update payload', parsed.error.format()));
      }
      const updated = await sessionRepository.renameSession(req.params.id, req.userId, parsed.data.title);
      if (!updated) {
        return next(new NotFoundError('Session'));
      }
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const deleted = await sessionRepository.deleteSession(req.params.id, req.userId);
      if (!deleted) {
        return next(new NotFoundError('Session'));
      }
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

