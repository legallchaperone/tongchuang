"use client";
import React from "react";
import { AppProvider } from "@/lib/store";
import { FocusProvider } from "@/lib/focus";
import { ReflectionSheet, Toasts } from "@/components/Overlays";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <FocusProvider>
        {children}
        <ReflectionSheet />
        <Toasts />
      </FocusProvider>
    </AppProvider>
  );
}
