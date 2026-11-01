import { generateProfileId, type AvatarProfile } from "$shared/avatar-osc";
import { get } from "$shared/store";
import { synced } from "../sync/hub";
import { avatarOSC } from "./avatar-osc";

export type { AvatarProfile };

/** Editing the list happens in the renderer's client. These two need live avatar state. */
const profilesStore = synced<AvatarProfile[]>("AvatarProfiles", []);

export const avatarProfiles = {
  profiles: profilesStore,

  saveCurrentProfile(name: string): AvatarProfile | null {
    const avatarId = avatarOSC.lastAvatarId;
    if (!avatarId) return null;

    const profile: AvatarProfile = {
      id: generateProfileId(),
      name,
      avatarId,
      avatarName: get(avatarOSC.schema)?.name || "Unknown Avatar",
      parameters: { ...avatarOSC.getParameters() },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    profilesStore.update((profiles) => [...profiles, profile]);
    return profile;
  },

  loadProfile(id: string): boolean {
    const profile = get(profilesStore).find((p) => p.id === id);
    if (!profile) return false;

    // Apply all parameters from the profile
    for (const [address, value] of Object.entries(profile.parameters)) {
      avatarOSC.setParameter(address, value);
    }

    return true;
  },
};
