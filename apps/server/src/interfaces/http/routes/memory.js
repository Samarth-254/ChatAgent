import express from 'express';

export function createMemoryRouter({ messageRepository }) {
  const router = express.Router();

  router.get('/timeline', async (req, res, next) => {
    try {
      const timeline = await messageRepository.getTimeline(req.userId);
      res.json(timeline);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

