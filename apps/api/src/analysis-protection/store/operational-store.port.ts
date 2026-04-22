export const ANALYSIS_OPERATIONAL_STORE = "ANALYSIS_OPERATIONAL_STORE";

export interface OperationalStorePort {
  incrWindow(key: string, ttlMs: number): Promise<number>;
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  setNx(key: string, value: string, ttlMs: number): Promise<boolean>;
  compareAndDelete(key: string, expectedValue: string): Promise<boolean>;
  del(key: string): Promise<void>;
}
