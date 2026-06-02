import { describe, it, expect } from 'vitest';
import { requireSecrets } from '../../helpers/secrets.js';

const secrets = requireSecrets('google-calendar', ['GOOGLE_CALENDAR_API_KEY']);

describe('Google Calendar API — India holidays', () => {
  it('fetches India public holidays for the next 30 days', async () => {
    const { GoogleCalendarClient } = await import('../../../../apps/content-engine/src/services/content-generator/backends/ai/current-affairs/clients/google-calendar-client.js');
    const client = new GoogleCalendarClient({ apiKey: secrets.GOOGLE_CALENDAR_API_KEY });
    const now = new Date();
    const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const holidays = await client.listHolidays(now, future);
    expect(Array.isArray(holidays)).toBe(true);
    for (const h of holidays) {
      expect(typeof h.name).toBe('string');
      expect(h.date).toBeInstanceOf(Date);
    }
  }, 15000);
});
