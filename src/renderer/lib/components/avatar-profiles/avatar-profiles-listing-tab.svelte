<script lang="ts">
  import { avatarProfiles, type AvatarProfile } from "$lib/api/vrc-osc";
  import { avatarOSC } from "$lib/api/vrc-osc";
  import * as Item from "$lib/components/ui/item/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Drawer from "$lib/components/ui/drawer/index.js";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { toast } from "svelte-sonner";
  import ChatboxMonacoEditor from "$lib/components/chatbox-editor/chatbox-monaco-editor.svelte";
  import {
    CopyIcon,
    DownloadIcon,
    PlayIcon,
    PlusIcon,
    SaveIcon,
    SearchIcon,
    Trash2Icon,
    UploadIcon,
    EditIcon,
  } from "@lucide/svelte";

  const profiles = avatarProfiles.profiles;
  const schema = avatarOSC.schema;

  let searchQuery = $state("");
  let showOnlyCurrentAvatar = $state(false);

  // Save new profile drawer state
  let saveDrawerOpen = $state(false);
  let newProfileName = $state("");

  // Import profile drawer state
  let importDrawerOpen = $state(false);
  let importJsonValue = $state("");

  // Edit profile drawer state
  let editDrawerOpen = $state(false);
  let editingProfile = $state<AvatarProfile | null>(null);
  let editProfileName = $state("");

  function handleSaveProfile() {
    if (!newProfileName.trim()) {
      toast.error("Please enter a profile name");
      return;
    }

    const profile = avatarProfiles.saveCurrentProfile(newProfileName.trim());
    if (profile) {
      toast.success(`Profile "${profile.name}" saved!`);
      saveDrawerOpen = false;
      newProfileName = "";
    } else {
      toast.error("Failed to save profile. Make sure an avatar is loaded.");
    }
  }

  function handleLoadProfile(profile: AvatarProfile) {
    const currentAvatarId = avatarOSC.lastAvatarId;
    if (currentAvatarId && currentAvatarId !== profile.avatarId) {
      toast.warning(
        "This profile was saved for a different avatar. Some parameters may not work correctly."
      );
    }

    avatarProfiles.loadProfile(profile.id);
    toast.success(`Profile "${profile.name}" loaded!`);
  }

  function handleDeleteProfile(profile: AvatarProfile) {
    avatarProfiles.deleteProfile(profile.id);
    toast.success(`Profile "${profile.name}" deleted!`);
  }

  function handleExportProfile(profile: AvatarProfile) {
    const json = avatarProfiles.exportProfile(profile.id);
    if (json) {
      navigator.clipboard.writeText(json);
      toast.success(`Profile "${profile.name}" exported to clipboard!`);
    }
  }

  function handleImportProfile() {
    if (!importJsonValue.trim()) {
      toast.error("Please enter valid JSON");
      return;
    }

    const profile = avatarProfiles.importProfile(importJsonValue.trim());
    if (profile) {
      toast.success(`Profile "${profile.name}" imported!`);
      importDrawerOpen = false;
      importJsonValue = "";
    } else {
      toast.error("Failed to import profile. Invalid JSON format.");
    }
  }

  function handleEditProfile(profile: AvatarProfile) {
    editingProfile = profile;
    editProfileName = profile.name;
    editDrawerOpen = true;
  }

  function handleSaveEditProfile() {
    if (!editingProfile) return;

    if (!editProfileName.trim()) {
      toast.error("Please enter a profile name");
      return;
    }

    avatarProfiles.updateProfile(editingProfile.id, {
      name: editProfileName.trim(),
    });
    toast.success(`Profile renamed to "${editProfileName.trim()}"!`);
    editDrawerOpen = false;
    editingProfile = null;
    editProfileName = "";
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
  }

  $effect(() => {
    // Filter profiles based on search query and current avatar filter
    const currentAvatarId = avatarOSC.lastAvatarId;
    filteredProfiles = $profiles.filter((profile) => {
      const matchesSearch =
        searchQuery.trim().length === 0 ||
        profile.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        profile.avatarName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        profile.avatarId.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesAvatar =
        !showOnlyCurrentAvatar || profile.avatarId === currentAvatarId;

      return matchesSearch && matchesAvatar;
    });
  });

  let filteredProfiles = $state<AvatarProfile[]>([]);
</script>

<div class="flex flex-col gap-2">
  <div class="flex items-center justify-between gap-2">
    <div class="flex items-center gap-2">
      <InputGroup.Root class="w-64">
        <InputGroup.Input
          placeholder="Search profiles..."
          bind:value={searchQuery}
        />
        <InputGroup.Addon>
          <SearchIcon class="w-4 h-4" />
        </InputGroup.Addon>
      </InputGroup.Root>
      <Button
        variant={showOnlyCurrentAvatar ? "default" : "outline"}
        size="sm"
        onclick={() => (showOnlyCurrentAvatar = !showOnlyCurrentAvatar)}
      >
        Current Avatar Only
      </Button>
    </div>
    <div class="flex items-center gap-2">
      <Drawer.Root bind:open={importDrawerOpen}>
        <Drawer.Trigger>
          <Button variant="outline" size="sm">
            <UploadIcon class="w-4 h-4" />
            Import Profile
          </Button>
        </Drawer.Trigger>
        <Drawer.Content class="flex flex-col gap-2 w-full p-2">
          <Label class="text-lg">Import Profile (JSON)</Label>
          <div class="flex w-full items-center justify-center">
            <ChatboxMonacoEditor
              width={Math.floor(window.innerWidth * 0.98)}
              height={250}
              language="json"
              onLoad={(editor) => {
                editor.setValue(importJsonValue);
              }}
              onChange={(newValue) => {
                importJsonValue = newValue;
              }}
            />
          </div>
          <Drawer.Footer>
            <Button onclick={handleImportProfile}>
              <UploadIcon class="w-4 h-4" />
              Import
            </Button>
            <Drawer.Close>Cancel</Drawer.Close>
          </Drawer.Footer>
        </Drawer.Content>
      </Drawer.Root>

      <Drawer.Root bind:open={saveDrawerOpen}>
        <Drawer.Trigger disabled={!avatarOSC.lastAvatarId}>
          <Button
            variant="default"
            size="sm"
            disabled={!avatarOSC.lastAvatarId}
          >
            <PlusIcon class="w-4 h-4" />
            Save Current
          </Button>
        </Drawer.Trigger>
        <Drawer.Content class="flex items-center justify-center">
          <div class="w-96 flex flex-col gap-4 p-4">
            <Drawer.Header class="flex items-center flex-col gap-2">
              <Drawer.Title class="text-center"
                >Save Current Parameters</Drawer.Title
              >
              <Drawer.Description class="text-center">
                {#if $schema}
                  Saving parameters for <span
                    class="font-mono bg-black/50 px-2 py-0.5 rounded"
                    >{$schema.name}</span
                  >
                {:else}
                  No avatar schema loaded
                {/if}
              </Drawer.Description>
            </Drawer.Header>
            <div class="flex flex-col gap-2">
              <Label>Profile Name</Label>
              <InputGroup.Root>
                <InputGroup.Input
                  placeholder="My Awesome Profile"
                  bind:value={newProfileName}
                />
              </InputGroup.Root>
            </div>
            <Drawer.Footer class="flex items-center justify-between">
              <Button onclick={handleSaveProfile}>
                <SaveIcon class="w-4 h-4" />
                Save Profile
              </Button>
              <Drawer.Close>
                <Button variant="outline">Cancel</Button>
              </Drawer.Close>
            </Drawer.Footer>
          </div>
        </Drawer.Content>
      </Drawer.Root>
    </div>
  </div>

  <Card.Root class="p-1 bg-transparent border">
    {#if filteredProfiles.length === 0}
      <div class="p-4 text-center text-muted-foreground">
        {#if $profiles.length === 0}
          No profiles saved yet. Click "Save Current" to save your first
          profile.
        {:else}
          No profiles match your search criteria.
        {/if}
      </div>
    {:else}
      <div class="flex flex-col gap-1">
        {#each filteredProfiles as profile (profile.id)}
          <Item.Root class="p-2 border rounded-md" variant="muted">
            <div class="flex justify-between items-center w-full">
              <div class="flex flex-col gap-1 flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-medium truncate">{profile.name}</span>
                  <span
                    class="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded"
                  >
                    {Object.keys(profile.parameters).length} params
                  </span>
                </div>
                <div
                  class="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <span class="truncate">{profile.avatarName}</span>
                  <span>•</span>
                  <span
                    class="font-mono truncate max-w-[150px]"
                    title={profile.avatarId}
                  >
                    {profile.avatarId.substring(0, 20)}...
                  </span>
                </div>
                <div class="text-xs text-muted-foreground">
                  Created: {formatDate(profile.createdAt)}
                </div>
              </div>
              <div class="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onclick={() => handleLoadProfile(profile)}
                  title="Load Profile"
                >
                  <PlayIcon class="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onclick={() => handleEditProfile(profile)}
                  title="Edit Profile"
                >
                  <EditIcon class="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onclick={() => handleExportProfile(profile)}
                  title="Export to Clipboard"
                >
                  <CopyIcon class="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onclick={() => handleDeleteProfile(profile)}
                  title="Delete Profile"
                  class="text-destructive hover:text-destructive"
                >
                  <Trash2Icon class="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Item.Root>
        {/each}
      </div>
    {/if}
  </Card.Root>
</div>

<!-- Edit Profile Drawer -->
<Drawer.Root bind:open={editDrawerOpen}>
  <Drawer.Content class="flex items-center justify-center">
    <div class="w-96 flex flex-col gap-4 p-4">
      <Drawer.Header class="flex items-center flex-col gap-2">
        <Drawer.Title class="text-center">Edit Profile</Drawer.Title>
        <Drawer.Description class="text-center">
          Update profile details
        </Drawer.Description>
      </Drawer.Header>
      <div class="flex flex-col gap-2">
        <Label>Profile Name</Label>
        <InputGroup.Root>
          <InputGroup.Input
            placeholder="My Awesome Profile"
            bind:value={editProfileName}
          />
        </InputGroup.Root>
      </div>
      <Drawer.Footer class="flex items-center justify-between">
        <Button onclick={handleSaveEditProfile}>
          <SaveIcon class="w-4 h-4" />
          Save Changes
        </Button>
        <Drawer.Close>
          <Button variant="outline">Cancel</Button>
        </Drawer.Close>
      </Drawer.Footer>
    </div>
  </Drawer.Content>
</Drawer.Root>
