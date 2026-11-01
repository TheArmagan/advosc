import { AppModule, type ModuleOptions } from "../module-base";
import type { Writable } from "../../store";

export const varOptions: ModuleOptions = {
  id: "Var",
  name: "Variables",
  description: "Named values you can read anywhere and change from an automation. They're saved, so they're still there after a restart.",
  examplePlaceholders: {
    "VariableName": {
      value: "hello",
      description: "The variable's value, or nothing if it isn't set.",
      fillText: "Var;${1:name}"
    },
    "VariableName;Default": {
      value: "hello",
      description: "The variable's value, or the default if it isn't set.",
      fillText: "Var;${1:name};${2:default}"
    }
  },
  inputs: [
    {
      id: "set",
      label: "Set",
      description: "Sets a variable, creating it if it doesn't exist yet.",
      params: [
        { id: "name", label: "Name", type: "text", placeholder: "name" },
        { id: "value", label: "Value", type: "text", placeholder: "value", optional: true },
      ],
    },
    {
      id: "clear",
      label: "Clear",
      description: "Removes a variable, so reading it gives its default again.",
      params: [{ id: "name", label: "Name", type: "text", placeholder: "name" }],
    },
  ],
};

/** Metadata and pure settings access, shared by the engine module and its renderer client. */
export class VarConfig extends AppModule {
  constructor(values: Writable<Record<string, any>>) {
    super(varOptions, values);
  }

  getVariables(): Record<string, string> {
    return this.getValues().variables || {};
  }
}
