import type { ModuleOptions } from "../module-base";

export const exprOptions: ModuleOptions = {
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
};
