export interface OutputOptions {
  format: "json" | "pretty" | "envelope" | "table" | "quiet";
  maxItems?: number;
}

export interface Envelope {
  summary: string;
  data: unknown;
  _meta: {
    count?: number;
    total?: number;
    truncated: boolean;
  };
}
