"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics-tracking";

export function RadarViewTracker() {
  useEffect(() => {
    void trackEvent({ eventName: "radar_view", eventVersion: 1 });
  }, []);

  return null;
}
