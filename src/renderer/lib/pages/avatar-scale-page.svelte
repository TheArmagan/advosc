<script lang="ts">
  import {
    avatarOSC,
    avatarScale,
    clampEyeHeight,
    EYE_HEIGHT_ADDRESS,
    EYE_HEIGHT_MAX,
    EYE_HEIGHT_MIN,
    DEFAULT_FORWARD_ADDRESS,
  } from "$lib/api/vrc-osc";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Item from "$lib/components/ui/item/index.js";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Slider } from "$lib/components/ui/slider/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { toast } from "svelte-sonner";
  import {
    BookmarkIcon,
    PlusIcon,
    RotateCcwIcon,
    SaveIcon,
    SendIcon,
    TrashIcon,
  } from "@lucide/svelte";

  const schema = avatarOSC.schema;
  const settings = avatarScale.settings;
  const presets = avatarScale.presets;
  const perAvatar = avatarScale.perAvatar;
  const currentHeight = avatarScale.currentHeight;
  const currentAvatarId = avatarScale.currentAvatarId;

  // Local editing value, only pushed to VRChat when the user releases /
  // commits it, so dragging the slider does not flood the OSC socket.
  let sliderValue = $state($currentHeight);
  let directValue = $state(String($currentHeight));

  let newPresetName = $state("");

  const savedAvatarIds = $derived(Object.keys($perAvatar));
  const avatarId = $derived($currentAvatarId ?? avatarOSC.lastAvatarId);

  // Keep the controls in sync when the height is changed elsewhere
  // (parameter forwarding, per-avatar restore).
  $effect(() => {
    const height = $currentHeight;
    sliderValue = height;
    directValue = height.toFixed(2);
  });

  function apply(value: number) {
    const applied = avatarScale.setHeight(value);
    sliderValue = applied;
    directValue = applied.toFixed(2);
    return applied;
  }
</script>

<div class="p-4 w-full">
  <Tabs.Root value="scale">
    <div class="flex items-center gap-2 justify-between">
      <Tabs.List>
        <Tabs.Trigger value="scale">Scale</Tabs.Trigger>
        <Tabs.Trigger value="presets">Presets</Tabs.Trigger>
        <Tabs.Trigger value="settings">Settings</Tabs.Trigger>
      </Tabs.List>
      <div class="flex items-center gap-2">
        <span class="text-xs text-muted-foreground font-mono">
          {EYE_HEIGHT_ADDRESS}
        </span>
        <Button
          variant="outline"
          size="sm"
          onclick={() => {
            avatarScale.reapply();
            toast.success("Eye Height Re-sent");
          }}
        >
          <SendIcon />
          Re-send
        </Button>
      </div>
    </div>

    <Tabs.Content value="scale" class="flex flex-col gap-2">
      <Card.Root>
        <Card.Header>
          <Card.Title>Eye Height</Card.Title>
          <Card.Description>
            Scales your avatar by sending an eye height in meters to VRChat.
            Range is {EYE_HEIGHT_MIN} - {EYE_HEIGHT_MAX} meters.
          </Card.Description>
        </Card.Header>
        <Card.Content class="flex flex-col gap-4">
          <div class="flex items-center justify-center">
            <span class="text-4xl font-mono font-semibold">
              {sliderValue.toFixed(2)}<span
                class="text-lg text-muted-foreground ml-1">m</span
              >
            </span>
          </div>

          <div class="flex flex-col gap-1">
            <Slider
              type="single"
              min={EYE_HEIGHT_MIN}
              max={EYE_HEIGHT_MAX}
              step={0.01}
              value={sliderValue}
              onValueChange={(v) => {
                sliderValue = v as number;
                directValue = (v as number).toFixed(2);
              }}
              onValueCommit={(v) => apply(v as number)}
            />
            <div class="flex justify-between text-xs text-muted-foreground">
              <span>{EYE_HEIGHT_MIN}m</span>
              <span>{EYE_HEIGHT_MAX}m</span>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <InputGroup.Root class="flex-1">
              <InputGroup.Input
                type="number"
                min={EYE_HEIGHT_MIN}
                max={EYE_HEIGHT_MAX}
                step="0.01"
                class="font-mono"
                bind:value={directValue}
                onkeydown={(e: KeyboardEvent) => {
                  if (e.key === "Enter") apply(parseFloat(directValue));
                }}
              />
              <InputGroup.Addon align="inline-end">
                <span class="text-xs text-muted-foreground">meters</span>
              </InputGroup.Addon>
            </InputGroup.Root>
            <Button
              variant="secondary"
              onclick={() => {
                apply(parseFloat(directValue));
                toast.success("Eye Height Updated");
              }}
            >
              Apply
            </Button>
            <Button
              variant="outline"
              size="icon"
              title="Reset to 1.50m"
              onclick={() => apply(1.5)}
            >
              <RotateCcwIcon />
            </Button>
          </div>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title>Quick Presets</Card.Title>
          <Card.Description>
            Click a preset to apply it instantly. Manage them in the Presets
            tab.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          {#if $presets.length === 0}
            <div class="p-4 text-center text-muted-foreground">
              No presets saved.
            </div>
          {:else}
            <div class="flex flex-wrap gap-2">
              {#each $presets as preset (preset.id)}
                <Button
                  variant="outline"
                  class="flex flex-col h-auto py-2 px-4 gap-0.5"
                  onclick={() => {
                    apply(preset.value);
                    toast.success(`Applied "${preset.name}"`);
                  }}
                >
                  <span class="font-medium">{preset.name}</span>
                  <span class="text-xs font-mono text-muted-foreground">
                    {preset.value.toFixed(2)}m
                  </span>
                </Button>
              {/each}
            </div>
          {/if}
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title>Current Avatar</Card.Title>
          <Card.Description>
            {#if avatarId}
              <span class="font-medium">{$schema?.name || "Unknown Avatar"}</span>
              <span
                class="font-mono text-[10px] bg-black/50 px-1 py-0.5 rounded text-foreground/70 ml-1"
              >
                {avatarId}
              </span>
            {:else}
              No avatar detected yet. Change your avatar in VRChat once.
            {/if}
          </Card.Description>
        </Card.Header>
        <Card.Content class="flex items-center gap-2">
          <Button
            variant="secondary"
            disabled={!avatarId}
            onclick={() => {
              if (avatarScale.saveForCurrentAvatar()) {
                toast.success("Eye Height Saved for This Avatar");
              } else {
                toast.error("No Avatar Detected");
              }
            }}
          >
            <BookmarkIcon />
            Save For This Avatar
          </Button>
          {#if avatarId && $perAvatar[avatarId] !== undefined}
            <span class="text-sm text-muted-foreground">
              Stored: <span class="font-mono"
                >{$perAvatar[avatarId].toFixed(2)}m</span
              >
            </span>
          {/if}
        </Card.Content>
      </Card.Root>
    </Tabs.Content>

    <Tabs.Content value="presets" class="flex flex-col gap-2">
      <Card.Root>
        <Card.Header>
          <Card.Title>Add Preset</Card.Title>
          <Card.Description>
            Saves the current eye height ({sliderValue.toFixed(2)}m) under a
            name.
          </Card.Description>
        </Card.Header>
        <Card.Content class="flex items-center gap-2">
          <Input
            placeholder="Preset name"
            class="flex-1"
            bind:value={newPresetName}
            onkeydown={(e: KeyboardEvent) => {
              if (e.key !== "Enter") return;
              avatarScale.addPreset(newPresetName, sliderValue);
              newPresetName = "";
              toast.success("Preset Added");
            }}
          />
          <Button
            variant="secondary"
            onclick={() => {
              avatarScale.addPreset(newPresetName, sliderValue);
              newPresetName = "";
              toast.success("Preset Added");
            }}
          >
            <PlusIcon />
            Add
          </Button>
          <Button
            variant="outline"
            onclick={() => {
              avatarScale.resetPresets();
              toast.success("Presets Reset to Defaults");
            }}
          >
            <RotateCcwIcon />
            Reset
          </Button>
        </Card.Content>
      </Card.Root>

      <Card.Root class="p-1 bg-transparent border">
        {#if $presets.length === 0}
          <div class="p-4 text-center text-muted-foreground">
            No presets saved.
          </div>
        {:else}
          <div class="flex flex-col gap-1">
            {#each $presets as preset (preset.id)}
              <Item.Root class="p-2 border rounded-md" variant="muted">
                <div class="flex justify-between items-center w-full gap-2">
                  <Input
                    class="max-w-[240px]"
                    value={preset.name}
                    oninput={(e: Event) =>
                      avatarScale.updatePreset(preset.id, {
                        name: (e.currentTarget as HTMLInputElement).value,
                      })}
                  />
                  <div class="flex items-center gap-2">
                    <InputGroup.Root>
                      <InputGroup.Input
                        type="number"
                        min={EYE_HEIGHT_MIN}
                        max={EYE_HEIGHT_MAX}
                        step="0.01"
                        class="w-24 text-xs font-mono text-center"
                        value={preset.value}
                        oninput={(e: Event) =>
                          avatarScale.updatePreset(preset.id, {
                            value: parseFloat(
                              (e.currentTarget as HTMLInputElement).value
                            ),
                          })}
                      />
                      <InputGroup.Addon align="inline-end">
                        <InputGroup.Button
                          onclick={() => {
                            apply(preset.value);
                            toast.success(`Applied "${preset.name}"`);
                          }}>Apply</InputGroup.Button
                        >
                      </InputGroup.Addon>
                      <InputGroup.Addon align="inline-end">
                        <InputGroup.Button
                          onclick={() => {
                            avatarScale.updatePreset(preset.id, {
                              value: sliderValue,
                            });
                            toast.success("Preset Updated");
                          }}
                        >
                          <SaveIcon />
                        </InputGroup.Button>
                      </InputGroup.Addon>
                    </InputGroup.Root>
                    <Button
                      variant="destructive"
                      size="icon"
                      onclick={() => {
                        avatarScale.removePreset(preset.id);
                        toast.success("Preset Removed");
                      }}
                    >
                      <TrashIcon />
                    </Button>
                  </div>
                </div>
              </Item.Root>
            {/each}
          </div>
        {/if}
      </Card.Root>
    </Tabs.Content>

    <Tabs.Content value="settings" class="flex flex-col gap-2">
      <Card.Root>
        <Card.Header>
          <Card.Title>Per-Avatar Eye Height</Card.Title>
          <Card.Description>
            Remembers the eye height you set for each avatar and restores it
            automatically when you switch avatars or join an instance.
          </Card.Description>
        </Card.Header>
        <Card.Content class="flex flex-col gap-3">
          <div class="flex items-center gap-2">
            <Checkbox
              id="per-avatar-enabled"
              checked={$settings.perAvatarEnabled}
              onCheckedChange={(v) =>
                avatarScale.updateSettings({ perAvatarEnabled: v })}
            />
            <Label for="per-avatar-enabled">
              Save eye height per avatar and restore it automatically
            </Label>
          </div>
          <div class="flex flex-col gap-1">
            <Label>Restore Delay (ms)</Label>
            <InputGroup.Root class="max-w-[200px]">
              <InputGroup.Input
                type="number"
                min="0"
                step="100"
                class="font-mono"
                value={$settings.restoreDelayMs}
                oninput={(e: Event) =>
                  avatarScale.updateSettings({
                    restoreDelayMs:
                      parseInt((e.currentTarget as HTMLInputElement).value) || 0,
                  })}
              />
            </InputGroup.Root>
            <span class="text-xs text-muted-foreground">
              Gives the avatar time to load before the eye height is sent.
            </span>
          </div>
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title>Avatar Parameter Forwarding</Card.Title>
          <Card.Description>
            Forwards an avatar parameter to {EYE_HEIGHT_ADDRESS}, so a radial
            puppet or slider inside your avatar can drive your size.
          </Card.Description>
        </Card.Header>
        <Card.Content class="flex flex-col gap-3">
          <div class="flex items-center gap-2">
            <Checkbox
              id="forwarding-enabled"
              checked={$settings.forwardingEnabled}
              onCheckedChange={(v) =>
                avatarScale.updateSettings({ forwardingEnabled: v })}
            />
            <Label for="forwarding-enabled">Enable parameter forwarding</Label>
          </div>
          <div class="flex flex-col gap-1">
            <Label>Source Address</Label>
            <div class="flex items-center gap-2">
              <InputGroup.Root class="flex-1">
                <InputGroup.Input
                  placeholder={DEFAULT_FORWARD_ADDRESS}
                  class="font-mono text-xs"
                  value={$settings.forwardAddress}
                  oninput={(e: Event) =>
                    avatarScale.updateSettings({
                      forwardAddress: (e.currentTarget as HTMLInputElement)
                        .value,
                    })}
                />
              </InputGroup.Root>
              <Button
                variant="outline"
                size="sm"
                onclick={() =>
                  avatarScale.updateSettings({
                    forwardAddress: DEFAULT_FORWARD_ADDRESS,
                  })}
              >
                Default
              </Button>
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <Label>Mode</Label>
            <Select.Root
              type="single"
              value={$settings.forwardMode}
              onValueChange={(v) =>
                avatarScale.updateSettings({
                  forwardMode: v as "normalized" | "direct",
                })}
            >
              <Select.Trigger class="w-full">
                {$settings.forwardMode === "normalized"
                  ? "Normalized (0..1 mapped to range)"
                  : "Direct (value is already in meters)"}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="normalized">
                  Normalized (0..1 mapped to range)
                </Select.Item>
                <Select.Item value="direct">
                  Direct (value is already in meters)
                </Select.Item>
              </Select.Content>
            </Select.Root>
          </div>
          {#if $settings.forwardMode === "normalized"}
            <div class="flex items-center gap-2">
              <div class="flex flex-col gap-1 flex-1">
                <Label>Min Height (0.0)</Label>
                <InputGroup.Root>
                  <InputGroup.Input
                    type="number"
                    min={EYE_HEIGHT_MIN}
                    max={EYE_HEIGHT_MAX}
                    step="0.01"
                    class="font-mono"
                    value={$settings.forwardMin}
                    oninput={(e: Event) =>
                      avatarScale.updateSettings({
                        forwardMin: clampEyeHeight(
                          parseFloat((e.currentTarget as HTMLInputElement).value)
                        ),
                      })}
                  />
                </InputGroup.Root>
              </div>
              <div class="flex flex-col gap-1 flex-1">
                <Label>Max Height (1.0)</Label>
                <InputGroup.Root>
                  <InputGroup.Input
                    type="number"
                    min={EYE_HEIGHT_MIN}
                    max={EYE_HEIGHT_MAX}
                    step="0.01"
                    class="font-mono"
                    value={$settings.forwardMax}
                    oninput={(e: Event) =>
                      avatarScale.updateSettings({
                        forwardMax: clampEyeHeight(
                          parseFloat((e.currentTarget as HTMLInputElement).value)
                        ),
                      })}
                  />
                </InputGroup.Root>
              </div>
            </div>
          {/if}
        </Card.Content>
      </Card.Root>

      <Card.Root>
        <Card.Header>
          <Card.Title>Saved Avatars</Card.Title>
          <Card.Description>
            {savedAvatarIds.length} avatar{savedAvatarIds.length === 1
              ? ""
              : "s"} with a stored eye height.
          </Card.Description>
        </Card.Header>
        <Card.Content class="flex flex-col gap-1">
          {#if savedAvatarIds.length === 0}
            <div class="p-4 text-center text-muted-foreground">
              Nothing saved yet.
            </div>
          {:else}
            {#each savedAvatarIds as savedId (savedId)}
              <Item.Root class="p-2 border rounded-md" variant="muted">
                <div class="flex justify-between items-center w-full gap-2">
                  <span
                    class="font-mono text-xs bg-black/50 px-2 py-1 rounded text-foreground/70 truncate"
                  >
                    {savedId}
                  </span>
                  <div class="flex items-center gap-2">
                    <span class="font-mono text-sm">
                      {$perAvatar[savedId].toFixed(2)}m
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onclick={() => {
                        apply($perAvatar[savedId]);
                        toast.success("Eye Height Applied");
                      }}
                    >
                      Apply
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon"
                      onclick={() => {
                        avatarScale.forgetAvatar(savedId);
                        toast.success("Saved Eye Height Removed");
                      }}
                    >
                      <TrashIcon />
                    </Button>
                  </div>
                </div>
              </Item.Root>
            {/each}
            <div class="flex justify-end pt-1">
              <Button
                variant="destructive"
                size="sm"
                onclick={() => {
                  avatarScale.forgetAllAvatars();
                  toast.success("All Saved Eye Heights Cleared");
                }}
              >
                <TrashIcon />
                Clear All
              </Button>
            </div>
          {/if}
        </Card.Content>
      </Card.Root>
    </Tabs.Content>
  </Tabs.Root>
</div>
