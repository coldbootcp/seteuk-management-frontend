"use client";

import { useEffect } from "react";
import { initAnalytics } from "../lib/analytics";

/** 브라우저에서 한 번만 Amplitude를 켠다. 키가 없으면 아무것도 하지 않는다. */
export function AnalyticsInit() {
  useEffect(() => {
    initAnalytics();
  }, []);
  return null;
}
