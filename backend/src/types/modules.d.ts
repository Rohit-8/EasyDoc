declare module 'pdf-parse' {
  interface PDFInfo {
    PDFFormatVersion?: string;
    IsAcroFormPresent?: boolean;
    Title?: string;
    Author?: string;
    Creator?: string;
    Producer?: string;
    CreationDate?: string;
    ModDate?: string;
  }

  interface PDFData {
    numpages: number;
    numrender: number;
    info: PDFInfo;
    metadata: unknown;
    text: string;
    version: string;
  }

  function pdfParse(dataBuffer: Buffer, options?: Record<string, unknown>): Promise<PDFData>;
  export = pdfParse;
}

declare module 'opossum' {
  interface CircuitBreakerOptions {
    timeout?: number;
    errorThresholdPercentage?: number;
    resetTimeout?: number;
    volumeThreshold?: number;
    [key: string]: unknown;
  }

  class CircuitBreaker<T extends (...args: unknown[]) => unknown = (...args: unknown[]) => unknown> {
    constructor(action: T, options?: CircuitBreakerOptions);
    fire(...args: Parameters<T>): Promise<ReturnType<T>>;
    on(event: string, callback: (...args: unknown[]) => void): this;
    close(): void;
    open(): void;
    halfOpen(): void;
    readonly opened: boolean;
    readonly closed: boolean;
    readonly halfOpen: boolean;
    readonly name: string;
    readonly stats: Record<string, number>;
  }

  export = CircuitBreaker;
}

declare module 'clamscan' {
  interface ClamScanOptions {
    clamdscan?: {
      host?: string;
      port?: number;
      timeout?: number;
      [key: string]: unknown;
    };
    preference?: string;
    [key: string]: unknown;
  }

  interface ScanResult {
    isInfected: boolean;
    viruses: string[];
  }

  class NodeClam {
    init(options?: ClamScanOptions): Promise<{
      isInfected(filePath: string): Promise<ScanResult>;
    }>;
  }

  export = NodeClam;
}

declare module 'adm-zip' {
  interface ZipEntry {
    entryName: string;
    header: {
      size: number;
      compressedSize: number;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  }

  class AdmZip {
    constructor(fileNameOrRawData?: string | Buffer);
    getEntries(): ZipEntry[];
  }

  export = AdmZip;
}
