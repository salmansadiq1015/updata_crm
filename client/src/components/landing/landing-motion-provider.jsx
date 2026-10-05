'use client';

import { MotionConfig } from 'framer-motion';

export function LandingMotionProvider({ children }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
