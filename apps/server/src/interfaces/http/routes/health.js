import express from 'express';

export function createHealthRouter({ db }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json({
      status: 'ok',
      db: db.type,
      models: {
        fast: process.env.FAST_MODEL || 'gemini-2.5-flash',
        deep: process.env.DEEP_MODEL || 'gemini-2.5-flash'
      },
      version: '1.0.0'
    });
  });

  return router;
}

