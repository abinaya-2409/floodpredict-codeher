import { describe, expect, it } from 'vitest';
import {
  CITY_LANGUAGE,
  LANGUAGES,
  Language,
  TRANSLATIONS,
  t,
} from '../utils/translations';
import { CITIES } from '../data/mockData';

const englishKeys = Object.keys(TRANSLATIONS.en) as (keyof typeof TRANSLATIONS.en)[];

describe('translation completeness', () => {
  it('covers every key in every language', () => {
    const missing: string[] = [];
    for (const { id } of LANGUAGES) {
      const table = TRANSLATIONS[id] as Record<string, string>;
      for (const key of englishKeys) {
        if (!table[key]) missing.push(`${id}.${String(key)}`);
      }
    }
    // A blank label in an emergency interface is a failure, not a cosmetic gap.
    expect(missing).toEqual([]);
  });

  it('has no language carrying an untranslated copy of the English string', () => {
    // Proper nouns and codes legitimately match; prose should not.
    const proseKeys: (keyof typeof TRANSLATIONS.en)[] = [
      'tagline',
      'criticalZones',
      'atRiskCitizens',
      'searchPlaceholder',
      'sheltersTitle',
    ];
    const copied: string[] = [];
    for (const { id } of LANGUAGES) {
      if (id === 'en') continue;
      for (const key of proseKeys) {
        const other = (TRANSLATIONS[id] as Record<string, string>)[key];
        if (other === String(TRANSLATIONS.en[key])) copied.push(`${id}.${key}`);
      }
    }
    expect(copied).toEqual([]);
  });

  it('lists each language in its own script', () => {
    for (const l of LANGUAGES) {
      expect(l.endonym.length).toBeGreaterThan(0);
      expect(l.english.length).toBeGreaterThan(0);
      if (l.id !== 'en') {
        // An endonym written in Latin script defeats the point of the list.
        expect(/^[\x20-\x7E]+$/.test(l.endonym)).toBe(false);
      }
    }
  });
});

describe('city to language mapping', () => {
  it('maps every modelled city to a language we actually ship', () => {
    const supported = new Set(LANGUAGES.map((l) => l.id));
    for (const city of CITIES) {
      const lang = CITY_LANGUAGE[city.id];
      expect(lang, `no language mapped for ${city.id}`).toBeTruthy();
      expect(supported.has(lang)).toBe(true);
    }
  });
});

describe('t()', () => {
  it('returns the translated string when present', () => {
    expect(t('ta', 'rainfall')).toBe(TRANSLATIONS.ta.rainfall);
  });

  it('falls back to English rather than rendering blank', () => {
    expect(t('zz' as Language, 'rainfall')).toBe(TRANSLATIONS.en.rainfall);
  });
});
