import type { StorageDriver } from "./types.js";

export function defineStorageDriver<TDriver extends StorageDriver>(
  driver: TDriver,
) {
  return driver;
}

export type {
  StorageDriver,
  StorageObject,
  StoragePutInput,
  StoragePutResult,
} from "./types.js";
