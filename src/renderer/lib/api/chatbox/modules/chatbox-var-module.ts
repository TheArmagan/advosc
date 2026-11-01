import { VarConfig } from "$shared/chatbox/modules/var";
import { call } from "../../engine";
import { moduleValues } from "../module-client";

export class VarModule extends VarConfig {
  constructor() {
    super(moduleValues("Var"));
  }

  setVariable(name: string, value: string): Promise<void> {
    return call("module.input", "Var", "set", { name, value });
  }

  clearVariable(name: string): Promise<void> {
    return call("module.input", "Var", "clear", { name });
  }
}
