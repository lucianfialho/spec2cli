export interface Manifest {
  name: string;
  version: string;
  description: string;
  groups: ManifestGroup[];
  _meta: {
    protocol: string;
    total_commands: number;
  };
}

export interface ManifestGroup {
  name: string;
  description: string;
  commands: number;
}

export interface GroupDetail {
  group: string;
  commands: GroupCommand[];
}

export interface GroupCommand {
  name: string;
  description: string;
  method: string;
  hint: "read-only" | "write" | "destructive";
  args?: string[];
}

export interface CommandSchema {
  command: string;
  description: string;
  params: CommandParam[];
  auth: { required: boolean; scheme: string };
}

export interface CommandParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
  enum?: string[];
  default?: unknown;
}
