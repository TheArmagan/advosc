import { chatbox } from "..";
import { ChatboxModule } from "../chatbox-module";
import simpleEval from 'simple-eval';

export class ChatboxExpressionModule extends ChatboxModule {
  constructor() {
    super({
      id: "Expr",
      name: "Expression",
      description: "Allows evaluating basic expressions and conditions.",
      examplePlaceholders: {
        "AnyExpression": {
          value: "True",
          description: "Evaluates the given expression and returns the corresponding value.",
          fillText: "Expr;${1:expression};${2:trueValue};${3:falseValue}"
        }
      }
    });
  }

  async getPlaceholderValue(...params: string[]): Promise<string> {
    const [expr, trueValue = "", falseValue = ""] = (await chatbox.fillTemplates(params, "[[:]]"));

    try {
      return simpleEval(expr) ? trueValue : falseValue;
    } catch (e) {
      return `(Error evaluating expression: ${e})`;
    }
  }
}