import type { ChatboxModuleOptions } from "../module-base";

export const numberOptions: ChatboxModuleOptions = {
  id: "Number",
  name: "Number",
  description: "Provides various number manipulation functions.",
  examplePlaceholders: {
    "Random;Int;Min;Max": {
      value: "42",
      description: "Generates a random integer between Min and Max (inclusive).",
      fillText: "Number;Random;Int;${1:Min};${2:Max}"
    },
    "Random;Float;Min;Max": {
      value: "3.14",
      description: "Generates a random float between Min and Max.",
      fillText: "Number;Random;Float;${1:Min};${2:Max}"
    },
    "Clamp;Value;Min;Max": {
      value: "10",
      description: "Clamps the Value between Min and Max.",
      fillText: "Number;Clamp;${1:Value};${2:Min};${3:Max}"
    },
    "Map;Value;InMin;InMax;OutMin;OutMax": {
      value: "0.5",
      description: "Maps the Value from the range InMin-InMax to the range OutMin-OutMax.",
      fillText: "Number;Map;${1:Value};${2:InMin};${3:InMax};${4:OutMin};${5:OutMax}"
    },
    "Floor;Value": {
      value: "3",
      description: "Returns the largest integer less than or equal to Value.",
      fillText: "Number;Floor;${1:Value}"
    },
    "Ceil;Value": {
      value: "4",
      description: "Returns the smallest integer greater than or equal to Value.",
      fillText: "Number;Ceil;${1:Value}"
    },
    "Round;Value": {
      value: "3",
      description: "Rounds Value to the nearest integer.",
      fillText: "Number;Round;${1:Value}"
    },
    "Abs;Value": {
      value: "5",
      description: "Returns the absolute value of Value.",
      fillText: "Number;Abs;${1:Value}"
    }
  }
};
