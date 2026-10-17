"use client";

import { useEffect } from "react";

// Registers a minimal service worker so the site can be installed to the home screen.
export default function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
