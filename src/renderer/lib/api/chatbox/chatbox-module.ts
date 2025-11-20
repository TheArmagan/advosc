import { Component } from "svelte";
import { localData } from "../local-data";

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

  constructor(public options: ChatboxModuleOptions) {
    this.values = localData.get(`ChatboxModuleValues;${this.options.id}`, {});
  }

  handleValueChange(key: string, value: any) {
    this.values = value;
    localData.update(`ChatboxModuleValues;${this.options.id}`, (val) => {
      return { ...(val || {}), [key]: value };
    });
  }

  getPlaceholderValue(...params: string[]): Promise<string> | string {
    return "";
  }

  getPreCalculatedPlaceholders(): PlaceholdersRecord {
    return {};
  }
}