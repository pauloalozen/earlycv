export type StorageObject = {
  body: Buffer | Uint8Array;
  contentType: string;
  key: string;
  size: number;
};

export type StoragePutInput = {
  body: Buffer | Uint8Array;
  contentType: string;
  key: string;
};

export type StoragePutResult = {
  contentType: string;
  key: string;
  size: number;
  url?: string;
};

export interface StorageDriver {
  deleteObject(key: string): Promise<void>;
  getObject(key: string): Promise<StorageObject | null>;
  putObject(input: StoragePutInput): Promise<StoragePutResult>;
}
