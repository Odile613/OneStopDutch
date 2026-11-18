import { useEffect, useRef } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

const PREFIX = "onestopdutch-";
const CHANGE_EVENT = "onestopdutch-storage-change";

const originalSetItem = Storage.prototype.setItem;
const originalRemoveItem = Storage.prototype.removeItem;
let patched = false;

function patchStorage() {
  if (patched || typeof window === "undefined") return;
  patched = true;

  Storage.prototype.setItem = function setItem(key: string, value: string) {
    originalSetItem.call(this, key, value);
    if (key.startsWith(PREFIX)) window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  Storage.prototype.removeItem = function removeItem(key: string) {
    originalRemoveItem.call(this, key);
    if (key.startsWith(PREFIX)) window.dispatchEvent(new Event(CHANGE_EVENT));
  };
}

export function captureLocalData(): Record<string, string> {
  const data: Record<string, string> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !key.startsWith(PREFIX)) continue;
    data[key] = localStorage.getItem(key) ?? "";
  }
  return data;
}

export function applyLocalData(data: Record<string, string>) {
  patchStorage();
  const existing: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(PREFIX)) existing.push(key);
  }
  existing.forEach((key) => originalRemoveItem.call(localStorage, key));
  Object.entries(data).forEach(([key, value]) =>
    originalSetItem.call(localStorage, key, value),
  );
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Syncs all onestopdutch-* localStorage values for the signed-in user. */
export function useCloudSync(user: User | null, onRemoteData: () => void) {
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    patchStorage();
    if (!supabase || !user) {
      loadedFor.current = null;
      return;
    }

    let active = true;
    let timer = 0;

    async function upload() {
      if (!supabase || !user) return;
      const data = captureLocalData();
      await supabase.from("user_data").upsert({
        user_id: user.id,
        data,
        updated_at: new Date().toISOString(),
      });
    }

    function scheduleUpload() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void upload(), 600);
    }

    async function load() {
      if (!supabase || !user) return;
      const { data, error } = await supabase
        .from("user_data")
        .select("data")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!active || error) return;

      const remote = data?.data as Record<string, string> | null;
      if (remote && Object.keys(remote).length > 0) {
        applyLocalData(remote);
        loadedFor.current = user.id;
        onRemoteData();
      } else {
        await upload();
        loadedFor.current = user.id;
      }
    }

    window.addEventListener(CHANGE_EVENT, scheduleUpload);
    void load();

    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener(CHANGE_EVENT, scheduleUpload);
    };
  }, [user?.id, onRemoteData]);
}
