export interface AuthConfig {
  type: "bearer" | "apiKey" | "basic" | "none";
  value: string;
  headerName?: string;
}

export interface AuthProfile {
  type: AuthConfig["type"];
  value: string;
  headerName?: string;
}

export interface AuthStore {
  profiles: Record<string, AuthProfile>;
}
