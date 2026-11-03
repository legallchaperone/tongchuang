"use client";
import React from "react";
import { AppProvider } from "@/lib/store";
import { FocusProvider } from "@/lib/focus";
import { ReflectionSheet, Toasts } from "@/components/Overlays";
import { UpdateWatcher, WhatsNew } from "@/components/Updates";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <FocusProvider>
        {children}
        <ReflectionSheet />
        <Toasts />
        <UpdateWatcher />
        <WhatsNew />
      </FocusProvider>
    </AppProvider>
  );
}
