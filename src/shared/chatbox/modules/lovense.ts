import type { ChatboxModuleOptions } from "../module-base";

export const lovenseOptions: ChatboxModuleOptions = {
  id: "Lovense",
  name: "Lovense",
  description: "Shows your connected toys and their battery, and lets rules hit panic from VR. Reading these never starts a toy.",
  examplePlaceholders: {
    "Connected": {
      value: "true",
      description: "Returns 'true' if at least one toy is connected.",
      fillText: "Lovense;Connected",
    },
    "ToyCount": {
      value: "1",
      description: "Returns how many toys are connected.",
      fillText: "Lovense;ToyCount",
    },
    "Toys": {
      value: "Lush, Hush",
      description: "Returns the names of the connected toys.",
      fillText: "Lovense;Toys",
    },
    "Battery": {
      value: "80",
      description: "Returns a toy's battery percentage, or the lowest one if you don't name a toy.",
      fillText: "Lovense;Battery;${1:toyName}",
    },
    "Status": {
      value: "Ready",
      description: "Returns Ready, Paused, or Panic. Empty while toy control is off.",
      fillText: "Lovense;Status",
    },
  },
  inputs: [
    {
      id: "Panic",
      label: "Panic",
      description: "Stops every toy and keeps them stopped until you re-arm.",
      params: [],
    },
    {
      id: "Stop",
      label: "Stop",
      description: "Stops every toy, without latching.",
      params: [],
    },
  ],
};
