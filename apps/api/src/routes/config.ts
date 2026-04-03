import express, { Request, Response } from 'express';
import type { ApiResponse, FeatureFlags } from '@restropulse/shared';

const router = express.Router();

router.get('/features', (_req: Request, res: Response<ApiResponse<FeatureFlags>>) => {
  res.json({
    success: true,
    data: { deleteAccount: process.env.FEATURE_DELETE_ACCOUNT === 'true' },
  });
});

export default router;
