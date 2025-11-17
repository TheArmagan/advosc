import threeDots from "stuffs/lib/threeDots";

let lastTypingState = false;

function send(message: string, egg: boolean = false) {
  window.ADVOSCNative.osc.send("/chatbox/input", threeDots(message, egg ? 142 : 144) + (egg ? "\u0003\u001f" : ""), true);
}

function fill(message: string) {
  window.ADVOSCNative.osc.send("/chatbox/input", message, false);
}

function toggleTyping(state: boolean) {
  lastTypingState = state;
  window.ADVOSCNative.osc.send("/chatbox/typing", state);
}

export const chatboxOSC = {
  send,
  fill,
  toggleTyping,
  get lastTypingState() {
    return lastTypingState;
  }
};