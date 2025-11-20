import { chatbox } from "..";
import { ChatboxModule } from "../chatbox-module";

export class ChatboxConditionModule extends ChatboxModule {
  constructor() {
    super({
      id: "Condition",
      name: "Condition",
      description: "Provides raw OSC data received by the application.",
      examplePlaceholders: {
        "==": {
          value: "trueValue",
          description: "Equality check between two values. Usage: {{Condition;==;value1;value2;trueValue;falseValue}}",
          fillText: "Condition;==;${0:value1};${1:value2};${2:trueValue};${3:falseValue}"
        },
        "!=": {
          value: "trueValue",
          description: "Inequality check between two values. Usage: {{Condition;!=;value1;value2;trueValue;falseValue}}",
          fillText: "Condition;!=;${0:value1};${1:value2};${2:trueValue};${3:falseValue}"
        },
        ">": {
          value: "trueValue",
          description: "Greater than check between two numeric values. Usage: {{Condition;>;value1;value2;trueValue;falseValue}}",
          fillText: "Condition;>;${0:value1};${1:value2};${2:trueValue};${3:falseValue}"
        },
        "<": {
          value: "trueValue",
          description: "Less than check between two numeric values. Usage: {{Condition;<;value1;value2;trueValue;falseValue}}",
          fillText: "Condition;<;${0:value1};${1:value2};${2:trueValue};${3:falseValue}"
        },
        ">=": {
          value: "trueValue",
          description: "Greater than or equal check between two numeric values. Usage: {{Condition;>=;value1;value2;trueValue;falseValue}}",
          fillText: "Condition;>=;${0:value1};${1:value2};${2:trueValue};${3:falseValue}"
        },
        "<=": {
          value: "trueValue",
          description: "Less than or equal check between two numeric values. Usage: {{Condition;<=;value1;value2;trueValue;falseValue}}",
          fillText: "Condition;<=;${0:value1};${1:value2};${2:trueValue};${3:falseValue}"
        },
        "&&": {
          value: "trueValue",
          description: "Logical AND between two boolean values. Usage: {{Condition;&&;value1;value2;trueValue;falseValue}}",
          fillText: "Condition;&&;${0:value1};${1:value2};${2:trueValue};${3:falseValue}"
        },
        "||": {
          value: "trueValue",
          description: "Logical OR between two boolean values. Usage: {{Condition;||;value1;value2;trueValue;falseValue}}",
          fillText: "Condition;||;${0:value1};${1:value2};${2:trueValue};${3:falseValue}"
        },
      }
    });
  }

  async getPlaceholderValue(...params: string[]): Promise<string> {
    const key = params.shift();
    const [a, b, trueValue = "", falseValue = ""] = await chatbox.fillTemplates(params, "[[:]]");

    switch (key) {
      case "==": return a === b ? trueValue : falseValue;
      case "!=": return a !== b ? trueValue : falseValue;
      case ">": return Number(a) > Number(b) ? trueValue : falseValue;
      case "<": return Number(a) < Number(b) ? trueValue : falseValue;
      case ">=": return Number(a) >= Number(b) ? trueValue : falseValue;
      case "<=": return Number(a) <= Number(b) ? trueValue : falseValue;
      case "&&": return a && b ? trueValue : falseValue;
      case "||": return a || b ? trueValue : falseValue;
    }

    return "";
  }
}