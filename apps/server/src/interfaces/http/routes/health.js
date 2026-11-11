import express from 'express';
import { config } from '../../../config/index.js';

export function createHealthRouter({ db }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json({
      status: 'ok',
      db: db ? db.type : 'in-memory',
      models: {
        fast: config.llm.fastModel,
        deep: config.llm.deepModel
      },
      version: '1.0.0'
    });
  });

  return router;
}

