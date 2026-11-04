"use client";
/* R-020: any avatar or name opens that person's page */
import Link from "next/link";
import React from "react";
import type { UserId } from "@/lib/types";

export const profileHref = (id: UserId) => `/u/${encodeURIComponent(id)}`;

/** wraps an avatar or a name so it opens that person's page */
export function ProfileLink({ id, children, className = "", label }: { id: UserId | undefined | null; children: React.ReactNode; className?: string; label?: string }) {
  if (!id) return <>{children}</>;
  return <Link href={profileHref(id)} className={`plink ${className}`} aria-label={label} title={label}>{children}</Link>;
}
