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
        "Expression": {
          value: "True",
          description: "Evaluates the given expression and returns the corresponding value. Example: '5 > 3' or '[[Number;RandomInt;1;100]] >= 50'.",
          fillText: "Expr;${1:expression};${2:trueValue};${3:falseValue}"
        }
      }
    });
  }

  async getPlaceholderValue(expr: string, ...params: string[]): Promise<string> {
    expr = await chatbox.fillTemplate(expr, "[[:]]", true);
    const [trueValue = "", falseValue = ""] = (await chatbox.fillTemplates(params, "[[:]]"));

    try {
      return simpleEval(expr) ? trueValue : falseValue;
    } catch (e) {
      console.error("Chatbox", "Failed to evaluate expression", expr, e);
      return '';
    }
  }
}