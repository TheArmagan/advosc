import { toast } from "svelte-sonner";
import { chatbox } from "..";
import { ChatboxModule } from "../chatbox-module";
import simpleEval from 'simple-eval';

export class ChatboxExpressionModule extends ChatboxModule {
  constructor() {
    super({
      id: "Expr",
      name: "Expression",
      description: "Allows evaluating math expressions, conditions.",
      examplePlaceholders: {
        "Expression": {
          value: "True",
          description: "Evaluates the given expression and returns the corresponding value. Example: '5 > 3' or '[[Number;RandomInt;1;100]] >= 50'.",
          fillText: "Expr;${1:expression};${2:trueValue};${3:falseValue}"
        },
        "MathExpression": {
          value: "3.14",
          description: "Evaluates a mathematical expression using the Math object or direct math. Example: 'Math.sin(Math.PI / 2)' or 'Math.sqrt(16)'.",
          fillText: "Expr;${1:mathExpression}"
        }
      }
    });
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
      return typeof result !== "undefined" && result ? (trueValue || String(result)) : falseValue;
    } catch (e) {
      console.error("Chatbox", "Failed to evaluate expression", expr, e);
      if (chatbox.getSettings().debugMode) {
        toast.error("Chatbox > Expr Module", {
          description: `Failed to evaluate expression "${expr}": ${(e as Error).message}`,
          duration: 1000,
        });
      }
      return '';
    }
  }
}