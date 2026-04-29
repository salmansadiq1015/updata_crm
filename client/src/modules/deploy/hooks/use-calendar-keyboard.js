'use client';

import { useEffect } from 'react';
import { CALENDAR_VIEWS } from '../constants/deploy-constants';

export function useCalendarKeyboard({ goNext, goPrev, goToday, setView }) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

      switch (e.key) {
        case 'ArrowLeft':
          if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); goPrev(); }
          break;
        case 'ArrowRight':
          if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); goNext(); }
          break;
        case 't':
        case 'T':
          if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); goToday(); }
          break;
        case 'd':
        case 'D':
          if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); setView(CALENDAR_VIEWS.DAY); }
          break;
        case 'w':
        case 'W':
          if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); setView(CALENDAR_VIEWS.WEEK); }
          break;
        case 'm':
        case 'M':
          if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); setView(CALENDAR_VIEWS.MONTH); }
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev, goToday, setView]);
}
