import _ from "lodash"
import { writable, get } from "svelte/store"

export type AvatarOSCSchema = {
  id: string,
  name: string,
  hash: number,
  parameters: {
    name: string,
    input: {
      address: string,
      type: "Float" | "Int" | "Bool",
    },
    output: {
      address: string,
      type: "Float" | "Int" | "Bool",
    }
  }[]
}

export type AvatarData = {
  eyeHeight: number,
  legacyFingers: boolean,
  animationParameters: {
    name: string,
    value: number
  }[]
}

const VRChatOSCBaseDir = window.ADVOSCNative.path.join(window.ADVOSCNative.env.get("APPDATA")!, "../LocalLow/VRChat/VRChat/OSC");
const VRChatLocalAvatarDataDir = window.ADVOSCNative.path.join(window.ADVOSCNative.env.get("APPDATA")!, "../LocalLow/VRChat/VRChat/LocalAvatarData");

const schemaStore = writable<AvatarOSCSchema | null>(null);
const parametersStore = writable<Record<string, number>>({});

let lockedParameters: Record<string, number> = {};
const lockedParameterAddresses = writable<string[]>([]);

let cachedTypes: Record<string, "Float" | "Int" | "Bool"> = {};
let lastAvatarId: string | null = null;
let lastUserId: string | null = null;

let allLastParameters: Record<string, any[]> = {};

let onParameterChangeCallbacks: ((address: string, value: number) => void)[] = [];

export const avatarOSC = {
  parameters: parametersStore,
  schema: schemaStore,
  lockedParameterAddresses,
  get allLastParameters() {
    return allLastParameters;
  },
  getParameterType(address: string): "Float" | "Int" | "Bool" | null {
    if (cachedTypes[address]) return cachedTypes[address];
    const schema = get(schemaStore);
    const parameter = schema?.parameters.find(p => p.input?.address === address || p.output?.address === address);
    if (parameter) {
      const type = parameter.input?.address === address ? parameter.input?.type : parameter.output?.type;
      cachedTypes[address] = type;
      return type;
    }
    return null;
  },
  setParameter(address: string, value: number, locked: boolean = false) {
    parametersStore.update(prev => ({ ...prev, [address]: value }));
    if (locked) {
      lockedParameters[address] = value;
    } else {
      delete lockedParameters[address];
    }
    lockedParameterAddresses.set(Object.keys(lockedParameters));
    window.ADVOSCNative.osc.send(address, value);
  },
  setAllParameters(params: Record<string, number>) {
    for (const address in params) {
      this.setParameter(address, params[address]);
    }
  },
  get lastAvatarId() {
    return lastAvatarId;
  },
  get lastUserId() {
    return lastUserId;
  },
  onParameterChange(callback: (address: string, value: number) => void) {
    onParameterChangeCallbacks.push(callback);
    return () => {
      onParameterChangeCallbacks = onParameterChangeCallbacks.filter(cb => cb !== callback);
    };
  },
  updateOSCSchema,
}


let lastMessageUpdates: Record<string, number> = {};

const updateLastestUpdates = () => { };

setInterval(() => {
  const updates = lastMessageUpdates;
  let hasUpdates = false;
  for (const _ in updates) {
    hasUpdates = true;
    break;
  }
  if (!hasUpdates) return;

  lastMessageUpdates = {};

  if (onParameterChangeCallbacks.length > 0) {
    for (const address in updates) {
      const value = updates[address];
      for (const cb of onParameterChangeCallbacks) {
        cb(address, value);
      }
    }
  }

  parametersStore.update((existingParameters) => ({ ...existingParameters, ...updates }));
}, 33);

let pauseUntil = 0;

window.ADVOSCNative.osc.onMessage((message) => {
  allLastParameters[message.address] = message.args;

  if (message.address === "/avatar/change") {
    const avatarId = message.args[0];
    console.log("Avatar changed:", avatarId);
    lastAvatarId = avatarId as string;
    parametersStore.set({});
    lastMessageUpdates = {};
    lockedParameters = {};
    lockedParameterAddresses.set([]);
    cachedTypes = {};
    allLastParameters = {
      [message.address]: message.args
    };
    updateLastestUpdates();
    pauseUntil = Date.now() + 1000; // pause updates for 500ms to allow file writes
    updateOSCSchema();
    return;
  }
  if (message.address.startsWith("/avatar/") && Date.now() > pauseUntil) {
    let value = message.args[0] as number;

    if (lockedParameters[message.address] !== undefined) {
      value = lockedParameters[message.address];
      window.ADVOSCNative.osc.send(message.address, value);
    }

    let type = avatarOSC.getParameterType(message.address);

    let estimatedType: "Float" | "Int" | "Bool" | null = type;
    if (!estimatedType) {
      if (value >= 0 && value <= 1 && (Number(value) === value && value % 1 !== 0)) {
        estimatedType = "Float";
      } else if (value === 0 || value === 1) {
        estimatedType = "Bool";
      } else {
        estimatedType = "Int";
      }
      cachedTypes[message.address] = estimatedType;
      type = estimatedType;
    }

    switch (type) {
      case "Bool": value = value ? 1 : 0; break;
      case "Int": value = Math.floor(value); break;
      case "Float":
        if (value <= 0) value = 0.0001;
        if (value > 1) value = 0.9999;
        break;
    }

    lastMessageUpdates[message.address] = value;
    updateLastestUpdates();
    // console.log("Avatar parameter updated:", message.address, value);
  }
});

const PathVerifiers = {
  "VRChatOSCBaseDir": `VRChat${window.ADVOSCNative.path.sep}OSC`,
  "VRChatLocalAvatarDataDir": `VRChat${window.ADVOSCNative.path.sep}LocalAvatarData`
};

async function updateOSCSchema() {
  const oscFilePath = window.ADVOSCNative.path.join(
    VRChatOSCBaseDir,
    lastUserId || "Unk",
    "Avatars",
    `${lastAvatarId}.json`
  );
  const oscData = await window.ADVOSCNative.files.readJSON(oscFilePath);
  if (!oscData) return;
  schemaStore.set(oscData as AvatarOSCSchema);
  console.log("Avatar OSC schema loaded from existing file:", oscData);
}

window.ADVOSCNative.files.watch(
  [VRChatOSCBaseDir, VRChatLocalAvatarDataDir],
  async (eventName, path) => {
    if (eventName !== "change" && eventName !== "add") return;
    await new Promise(resolve => setTimeout(resolve, 500)); // wait a bit for file to be fully written

    if (path.includes(PathVerifiers.VRChatLocalAvatarDataDir)) {
      const pathSplit = path.split(window.ADVOSCNative.path.sep);
      const userId = pathSplit[pathSplit.lastIndexOf("LocalAvatarData") + 1];
      lastUserId = userId;
    }

    if (path.includes(PathVerifiers.VRChatOSCBaseDir)) {
      const pathSplit = path.split(window.ADVOSCNative.path.sep);
      const userId = pathSplit[pathSplit.lastIndexOf("OSC") + 1];
      lastUserId = userId;
    }

    if (lastAvatarId && path.includes(lastAvatarId)) {
      const data = await window.ADVOSCNative.files.readJSON(path);
      if (data && path.includes(PathVerifiers.VRChatLocalAvatarDataDir)) {
        const existingParameters = (data as AvatarData).animationParameters || [];
        const schema = get(schemaStore);
        const updates: Record<string, number> = {};
        existingParameters.forEach(param => {
          const schemaParam = schema?.parameters.find(p => p.name === param.name);
          if (schemaParam) {
            updates[schemaParam.input.address] = param.value;
          }
        });
        if (Object.keys(updates).length) {
          parametersStore.update(prev => ({ ...prev, ...updates }));
        }
        console.log("Avatar data updated:", data);
      }

      updateOSCSchema();
    }
  }
)