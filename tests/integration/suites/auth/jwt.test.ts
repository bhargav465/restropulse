import { describe, it, expect } from 'vitest';
import { requireSecrets } from '../../helpers/secrets.js';

const secrets = requireSecrets('auth-jwt', ['JWT_SECRET']);

describe('JWT sign / verify', () => {
  it('signs and verifies an access token', async () => {
    process.env.JWT_SECRET = secrets.JWT_SECRET;
    const { generateTokens, verifyAccessToken } = await import('../../../../apps/api/src/services/jwt.js');
    const userId = 'u_integration_test';
    const { accessToken } = generateTokens(userId, undefined);
    const payload = verifyAccessToken(accessToken);
    expect(payload.userId).toBe(userId);
  });

  it('generates a non-empty refresh token', async () => {
    process.env.JWT_SECRET = secrets.JWT_SECRET;
    const { generateTokens } = await import('../../../../apps/api/src/services/jwt.js');
    const { refreshToken } = generateTokens('u_test', undefined);
    expect(typeof refreshToken).toBe('string');
    expect(refreshToken.length).toBeGreaterThan(20);
  });
});
