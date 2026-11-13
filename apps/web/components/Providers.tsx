"use client";
import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

// reducedMotion="user": Framer drops transform animations when the OS asks for reduced motion,
// while the server/client markup stays identical (no hydration mismatch, no stuck opacity:0).
export default function Providers({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
