import express, { Request, Response } from 'express';
import type { ApiResponse, FeatureFlags } from '@restropulse/shared';

const router = express.Router();

router.get('/features', (_req: Request, res: Response<ApiResponse<FeatureFlags>>) => {
  res.json({
    success: true,
    data: {
      deleteAccount: process.env.FEATURE_DELETE_ACCOUNT === 'true',
      topupCredits: process.env.FEATURE_TOPUP_CREDITS === 'true',
      updatesSection: process.env.FEATURE_UPDATES_SECTION === 'true',
    },
  });
});

export default router;
