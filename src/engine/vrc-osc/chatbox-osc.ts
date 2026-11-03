import threeDots from "stuffs/lib/threeDots";
import { native } from "../native";

let lastTypingState = false;

function send(message: string) {
  native.osc.send("/chatbox/input", threeDots(message, 144), true);
}

function fill(message: string) {
  native.osc.send("/chatbox/input", message, false);
}

function toggleTyping(state: boolean) {
  lastTypingState = state;
  native.osc.send("/chatbox/typing", state);
}

export const chatboxOSC = {
  send,
  fill,
  toggleTyping,
  get lastTypingState() {
    return lastTypingState;
  }
};