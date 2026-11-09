"use client";
import { createBrowserClient } from "@supabase/ssr";

export function supabaseBrowser(url: string, key: string) {
  return createBrowserClient(url, key);
}
