import { Component } from "svelte";

type PlaceholdersRecord = Record<string, {
  value: string;
  description: string;
  fillText?: string;
}>;
export interface ChatboxModuleOptions {
  id: string;
  name: string;
  description: string;
  examplePlaceholders: PlaceholdersRecord;
  editorComponent?: Component;
  constants?: Record<string, any>;
}

export class ChatboxModule {
  values: Record<string, any> = {};

  constructor(public options: ChatboxModuleOptions) { }

  handleValueChange(key: string, value: any) {
    this.values[key] = value;
  }

  getPlaceholderValue(...params: string[]): Promise<string> | string {
    return "";
  }

  getPreCalculatedPlaceholders(): PlaceholdersRecord {
    return {};
  }
}