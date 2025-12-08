import { writable, get } from "svelte/store";
import { localData } from "$lib/api/local-data";
import { avatarOSC } from "./avatar-osc";

export type AvatarProfile = {
  id: string;
  name: string;
  avatarId: string;
  avatarName: string;
  parameters: Record<string, number>;
  createdAt: number;
  updatedAt: number;
};

const STORAGE_KEY = "AvatarProfiles";

const profilesStore = writable<AvatarProfile[]>(localData.get(STORAGE_KEY, []));

profilesStore.subscribe((profiles) => {
  localData.set(STORAGE_KEY, profiles);
});

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export const avatarProfiles = {
  profiles: profilesStore,

  saveCurrentProfile(name: string): AvatarProfile | null {
    const schema = get(avatarOSC.schema);
    const parameters = get(avatarOSC.parameters);
    const avatarId = avatarOSC.lastAvatarId;

    if (!avatarId) {
      return null;
    }

    const profile: AvatarProfile = {
      id: generateId(),
      name,
      avatarId,
      avatarName: schema?.name || "Unknown Avatar",
      parameters: { ...parameters },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    profilesStore.update((profiles) => [...profiles, profile]);
    return profile;
  },

  updateProfile(id: string, updates: Partial<Pick<AvatarProfile, "name" | "parameters">>): boolean {
    let found = false;
    profilesStore.update((profiles) => {
      return profiles.map((profile) => {
        if (profile.id === id) {
          found = true;
          return {
            ...profile,
            ...updates,
            updatedAt: Date.now(),
          };
        }
        return profile;
      });
    });
    return found;
  },

  deleteProfile(id: string): boolean {
    let found = false;
    profilesStore.update((profiles) => {
      const filtered = profiles.filter((profile) => {
        if (profile.id === id) {
          found = true;
          return false;
        }
        return true;
      });
      return filtered;
    });
    return found;
  },

  loadProfile(id: string): boolean {
    const profiles = get(profilesStore);
    const profile = profiles.find((p) => p.id === id);

    if (!profile) {
      return false;
    }

    // Apply all parameters from the profile
    for (const [address, value] of Object.entries(profile.parameters)) {
      avatarOSC.setParameter(address, value);
    }

    return true;
  },

  getProfile(id: string): AvatarProfile | undefined {
    return get(profilesStore).find((p) => p.id === id);
  },

  getProfilesForAvatar(avatarId: string): AvatarProfile[] {
    return get(profilesStore).filter((p) => p.avatarId === avatarId);
  },

  exportProfile(id: string): string | null {
    const profile = get(profilesStore).find((p) => p.id === id);
    if (!profile) return null;
    return JSON.stringify(profile, null, 2);
  },

  importProfile(jsonString: string): AvatarProfile | null {
    try {
      const parsed = JSON.parse(jsonString);

      // Validate required fields
      if (!parsed.name || !parsed.avatarId || !parsed.parameters) {
        return null;
      }

      const profile: AvatarProfile = {
        id: generateId(),
        name: parsed.name,
        avatarId: parsed.avatarId,
        avatarName: parsed.avatarName || "Unknown Avatar",
        parameters: parsed.parameters,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      profilesStore.update((profiles) => [...profiles, profile]);
      return profile;
    } catch {
      return null;
    }
  },

  exportAllProfiles(): string {
    return JSON.stringify(get(profilesStore), null, 2);
  },

  importAllProfiles(jsonString: string): boolean {
    try {
      const parsed = JSON.parse(jsonString);
      if (!Array.isArray(parsed)) return false;

      const validProfiles: AvatarProfile[] = parsed
        .filter((p) => p.name && p.avatarId && p.parameters)
        .map((p) => ({
          id: generateId(),
          name: p.name,
          avatarId: p.avatarId,
          avatarName: p.avatarName || "Unknown Avatar",
          parameters: p.parameters,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }));

      profilesStore.update((profiles) => [...profiles, ...validProfiles]);
      return true;
    } catch {
      return false;
    }
  },

  clearAllProfiles(): void {
    profilesStore.set([]);
  },
};
