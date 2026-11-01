import { generateProfileId, type AvatarProfile } from "$shared/avatar-osc";
import { get } from "$shared/store";
import { call, fire, synced } from "../engine";

const STORAGE_KEY = "AvatarProfiles";

const profilesStore = synced<AvatarProfile[]>(STORAGE_KEY, []);

export const avatarProfiles = {
  profiles: profilesStore,

  /** Needs the live parameter values, which only the engine holds. */
  saveCurrentProfile(name: string): Promise<AvatarProfile | null> {
    return call("avatarProfiles.saveCurrentProfile", name);
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
    if (!get(profilesStore).some((p) => p.id === id)) return false;
    fire("avatarProfiles.loadProfile", id);
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
        id: generateProfileId(),
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
          id: generateProfileId(),
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
