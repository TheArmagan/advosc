import { Component } from "svelte";
import { localData } from "../local-data";
import { writable } from "svelte/store";

export type PlaceholdersRecord = Record<string, {
  value: string;
  description: string;
  fillText?: string;
}>;
export interface ChatboxModuleOptions {
  id: string;
  name: string;
  description: string;
  examplePlaceholders: PlaceholdersRecord;
  Component?: Component;
  constants?: Record<string, any>;
}

export class ChatboxModule {
  values = writable<Record<string, any>>({});

  constructor(public options: ChatboxModuleOptions) {
    this.values.set(localData.get(`ChatboxModuleValues;${this.options.id}`, {}));
    this.values.subscribe((val) => {
      localData.set(`ChatboxModuleValues;${this.options.id}`, val);
      this.onValuesChanged?.(val);
    });
  }

  onValuesChanged?: (values: Record<string, any>) => void;

  getValues(): Record<string, any> {
    let currentValues: Record<string, any>;
    this.values.subscribe((val) => {
      currentValues = val;
    });
    return currentValues!;
  }

  getPlaceholderValue(...params: string[]): Promise<string> | string {
    return "";
  }

  getPreCalculatedPlaceholders(): PlaceholdersRecord {
    return {};
  }
}