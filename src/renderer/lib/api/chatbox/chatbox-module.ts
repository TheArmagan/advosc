import { Component } from "svelte";

export interface ChatboxModuleOptions {
  id: string;
  name: string;
  description: string;
  examplePlaceholders: Record<string, {
    value: string;
    description: string;
  }>;
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
}