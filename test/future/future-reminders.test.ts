import { describe, expect, it } from 'vitest';
import { buildNotifications } from '@/lib/family/notifications';
import { reminderStep } from '@/lib/family/future-reminders';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';

describe('reminder steps', () => {
  it('30, 7 and 1 days: the smallest step that covers the days left', () => {
    expect(reminderStep(40)).toBeNull();
    expect(reminderStep(31)).toBeNull();
    expect(reminderStep(30)).toBe(30);
    expect(reminderStep(8)).toBe(30);
    expect(reminderStep(7)).toBe(7);
    expect(reminderStep(2)).toBe(7);
    expect(reminderStep(1)).toBe(1);
    expect(reminderStep(0)).toBe(1);
    expect(reminderStep(-1)).toBeNull();
    expect(reminderStep(null)).toBeNull();
  });
});

describe('the notifications centre and the words', () => {
  it('lists a Future item with the Future page as its link', () => {
    const items = buildNotifications({ news: null, tonight: [], requests: [], future: [{ id: 'deadline.x:7', future: 'deadline', titleEn: 'A form', titleHi: null, left: 5 }] });
    expect(items).toEqual([{ id: 'future.deadline.x:7', kind: 'future', future: 'deadline', titleEn: 'A form', titleHi: null, left: 5, href: '/family/future' }]);
  });
  it('every Future string exists in English and Hindi, and the Hindi is Hindi', () => {
    const keys = Object.keys(en).filter((k) => /^(fam\.future\.|control\.future\.|fam\.notify\.future|fam\.notify\.center\.future)/.test(k));
    expect(keys.length).toBeGreaterThan(100);
    for (const k of keys) {
      expect(hi[k as keyof typeof hi], k).toBeTruthy();
      // The Hindi differs from the English and holds Devanagari, except strings that are only a symbol or code.
      if (!/^\{\w+\}$/.test(en[k as keyof typeof en])) expect(hi[k as keyof typeof hi], k).toMatch(/[ऀ-ॿ]/);
    }
  });
});
