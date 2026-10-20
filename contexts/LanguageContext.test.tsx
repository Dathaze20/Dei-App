// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { LanguageProvider, translations } from './LanguageContext';
import { useTranslation } from '../hooks/useTranslation';

const Show: React.FC = () => {
  const { t } = useTranslation();
  return <p>{t('convertToItemsConfirm', { quantity: 3 })}</p>;
};

describe('translations', () => {
  it('fills in a value used twice in one sentence (it used to show "{quantity}")', () => {
    render(<LanguageProvider><Show /></LanguageProvider>);
    expect(screen.getByText('Change this line from 3 case(s) to 3 item(s)?')).toBeTruthy();
  });

  it('Spanish and Arabic have every English word', () => {
    const english = Object.keys(translations.en);
    for (const language of ['es', 'ar'] as const) {
      const missing = english.filter(key => !(key in translations[language]));
      expect(missing, language).toEqual([]);
    }
  });
});
