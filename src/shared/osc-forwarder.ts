export type ForwardType = "Int" | "Float" | "Bool" | "String";

export interface OscForwarderEntry {
  id: string;
  enabled: boolean;
  oscPath: string;
  valueTemplate: string;
  forwardType: ForwardType;
  intervalMs: number;
  enableMapping: boolean;
  inputMin: number;
  inputMax: number;
  outputMin: number;
  outputMax: number;
}

export function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function defaultEntry(): OscForwarderEntry {
  return {
    id: makeId(),
    enabled: true,
    oscPath: "",
    valueTemplate: "",
    forwardType: "Float",
    intervalMs: 2200,
    enableMapping: false,
    inputMin: 0,
    inputMax: 1,
    outputMin: 0,
    outputMax: 255,
  };
}
