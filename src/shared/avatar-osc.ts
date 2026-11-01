export type AvatarParameterType = "Float" | "Int" | "Bool";
export type OSCSendType = AvatarParameterType | "String";

export type AvatarOSCSchema = {
  id: string,
  name: string,
  hash: number,
  parameters: {
    name: string,
    input?: {
      address: string,
      type: AvatarParameterType,
    },
    output?: {
      address: string,
      type: AvatarParameterType,
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

export type SchemaEntry = {
  name: string,
  type: AvatarParameterType,
  writable: boolean,
  readable: boolean,
}

export type AnimationEase = "none" | "power1.inOut" | "power2.inOut" | "power3.inOut" | "sine.inOut" | "bounce.inOut" | "elastic.out";

export type ParameterAnimation = {
  address: string,
  from: number,
  to: number,
  duration: number,
  repeat: number,
  yoyo: boolean,
  ease: AnimationEase,
}

export type SentHistoryEntry = {
  address: string,
  value: number | string | boolean,
  type: OSCSendType,
  at: number,
}

/** Parameters VRChat drives on every avatar. Useful to hide when hunting for your own. */
export const VRCHAT_BUILTIN_PARAMETERS = new Set([
  "IsLocal", "PreviewMode", "Viseme", "Voice", "GestureLeft", "GestureRight",
  "GestureLeftWeight", "GestureRightWeight", "AngularY", "VelocityX", "VelocityY",
  "VelocityZ", "VelocityMagnitude", "Upright", "Grounded", "Seated", "AFK",
  "TrackingType", "VRMode", "MuteSelf", "InStation", "Earmuffs", "IsOnFriendsList",
  "AvatarVersion", "IsAnimatorEnabled", "ScaleModified", "ScaleFactor",
  "ScaleFactorInverse", "EyeHeightAsMeters", "EyeHeightAsPercent",
]);

export const AVATAR_PARAMETER_PREFIX = "/avatar/parameters/";

export function isBuiltinParameter(address: string) {
  return address.startsWith(AVATAR_PARAMETER_PREFIX)
    && VRCHAT_BUILTIN_PARAMETERS.has(address.slice(AVATAR_PARAMETER_PREFIX.length));
}

/** Coerce a number into what a parameter of `type` can actually hold. */
export function coerceParameterValue(value: number, type: AvatarParameterType | null) {
  if (!Number.isFinite(value)) value = 0;
  switch (type) {
    case "Bool": return value ? 1 : 0;
    case "Int": return Math.round(value);
    default: return value;
  }
}

export function guessParameterType(value: number): AvatarParameterType {
  if (value % 1 !== 0) return "Float";
  if (value === 0 || value === 1) return "Bool";
  return "Int";
}

export type AvatarProfile = {
  id: string;
  name: string;
  avatarId: string;
  avatarName: string;
  parameters: Record<string, number>;
  createdAt: number;
  updatedAt: number;
};

export function generateProfileId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export const EYE_HEIGHT_ADDRESS = "/avatar/eyeheight";
export const EYE_HEIGHT_MIN = 0.01;
export const EYE_HEIGHT_MAX = 10.0;

export const DEFAULT_FORWARD_ADDRESS = "/avatar/parameters/advosc_eyeheight";

export type AvatarScalePreset = {
  id: string;
  name: string;
  value: number;
};

export type AvatarScaleSettings = {
  /** Re-apply the stored eye height whenever the avatar changes / an instance is joined. */
  perAvatarEnabled: boolean;
  /** Delay before re-applying after an avatar change, avatars need a moment to load. */
  restoreDelayMs: number;
  /** Listen for an avatar parameter and forward it to /avatar/eyeheight. */
  forwardingEnabled: boolean;
  forwardAddress: string;
  /**
   * `normalized` treats the incoming value as 0..1 and maps it onto
   * [forwardMin, forwardMax]; `direct` uses the value as meters as-is.
   */
  forwardMode: "normalized" | "direct";
  forwardMin: number;
  forwardMax: number;
};

export const defaultAvatarScaleSettings: AvatarScaleSettings = {
  perAvatarEnabled: false,
  restoreDelayMs: 2000,
  forwardingEnabled: false,
  forwardAddress: DEFAULT_FORWARD_ADDRESS,
  forwardMode: "normalized",
  forwardMin: EYE_HEIGHT_MIN,
  forwardMax: 3,
};

export function clampEyeHeight(value: number): number {
  if (!Number.isFinite(value)) return EYE_HEIGHT_MIN;
  return Math.min(EYE_HEIGHT_MAX, Math.max(EYE_HEIGHT_MIN, value));
}
