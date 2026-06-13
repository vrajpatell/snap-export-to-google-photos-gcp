declare module "@zip.js/zip.js" {
  export class BlobReader {
    constructor(blob: Blob);
  }

  export class BlobWriter {
    constructor(mimeType?: string);
  }

  export interface Entry {
    filename: string;
    directory?: boolean;
    uncompressedSize?: number;
    lastModDate?: Date;
    getData?: (writer: BlobWriter) => Promise<Blob>;
  }

  export class ZipReader<TReader = BlobReader> {
    constructor(reader: TReader);
    getEntries(): Promise<Entry[]>;
    close(): Promise<void>;
  }
}
