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

let lastAvatarId: string | null = null;
let lastUserId: string | null = null;

export const avatarOSC = {
  parameters: parametersStore,
  schema: schemaStore,
  get lastAvatarId() {
    return lastAvatarId;
  },
  get lastUserId() {
    return lastUserId;
  }
}

window.ADVOSCNative.osc.onMessage((message) => {
  if (message.address === "/avatar/change") {
    const avatarId = message.args[0];
    console.log("Avatar changed:", avatarId);
    lastAvatarId = avatarId as string;
    updateOSCSchema();
    return;
  }
  if (message.address.startsWith("/avatar/")) {
    let value = message.args[0] as number;
    const schema = get(schemaStore);
    const parameter = schema?.parameters.find(p => p.input?.address === message.address);
    if (parameter) {
      if (parameter.input.type === "Bool") {
        value = value !== 0 ? 1 : 0;
      } else if (parameter.input.type === "Int") {
        value = Math.floor(value);
      } else if (parameter.input.type === "Float") {
        if (value <= 0) value = 0.001;
        if (value > 1) value = 1;
      }
    }
    parametersStore.update(prev => ({ ...prev, [message.address]: value }));
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
    await new Promise(resolve => setTimeout(resolve, 100)); // wait a bit for file to be fully written

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