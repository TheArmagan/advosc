import type { ChatboxModuleOptions } from "../module-base";

export const oscDataOptions: ChatboxModuleOptions = {
  id: "OSCData",
  name: "OSC Data",
  description: "Provides raw OSC data received by the application.",
  examplePlaceholders: {
    "/avatar/parameters/SomeParameter": {
      value: "1",
      description: "The value of the OSC parameter at address /avatar/parameters/SomeParameter.",
      fillText: "OSCData;${1:/avatar/parameters/SomeParameter};${2:optionalIndex}"
    }
  }
};
