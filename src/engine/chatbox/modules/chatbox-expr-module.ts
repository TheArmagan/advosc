import { moduleValues } from "../module-values";
import { exprOptions } from "$shared/chatbox/modules/expr";
import { notify } from "../../runtime/notify";
import { chatbox } from "..";
import { AppModule } from "$shared/chatbox/module-base";
import simpleEval from 'simple-eval';

export class ExpressionModule extends AppModule {
  constructor() {
    super(exprOptions, moduleValues("Expr"));
  }

  async getPlaceholderValue(expr: string, ...params: string[]): Promise<string> {
    const instanceKey = chatbox.getInstanceKey();
    expr = await chatbox.fillTemplate(expr, "[[:]]", true, instanceKey);
    const [trueValue = "", falseValue = ""] = (await chatbox.fillTemplates(params, "[[:]]", false, `${instanceKey}:args`));

    try {
      const result = await simpleEval(expr, {
        Math,
        parseInt,
        parseFloat,
        isNaN,
        isFinite
      });
      // No branches: show the result itself, including a 0 from a math expression.
      if (params.length === 0) {
        if (typeof result === "number") return String(result);
        return typeof result !== "undefined" && result ? String(result) : "";
      }
      return result ? trueValue : falseValue;
    } catch (e) {
      console.error("Chatbox", "Failed to evaluate an expression:", (e as Error).message);
      if (chatbox.getSettings().debugMode) {
        notify.error("Chatbox > Expr Module", {
          description: `Failed to evaluate expression "${expr}": ${(e as Error).message}`,
          duration: 1000,
        });
      }
      return '';
    }
  }
}