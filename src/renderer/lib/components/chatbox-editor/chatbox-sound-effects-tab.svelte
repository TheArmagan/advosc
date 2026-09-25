<script lang="ts">
  import { onMount } from "svelte";
  import { avatarOSC } from "$lib/api/vrc-osc";
  import { soundEffects, type SoundOscType } from "$lib/api/sound-effects";
  import ShortcutRecorder from "$lib/components/shortcut-recorder.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Slider } from "$lib/components/ui/slider/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import * as Drawer from "$lib/components/ui/drawer/index.js";
  import {
    PlusIcon,
    Trash2Icon,
    Volume2Icon,
    VolumeXIcon,
    PlayIcon,
    SquareIcon,
    RefreshCwIcon,
    ListIcon,
    InfoIcon,
    ZapIcon,
    MicOffIcon,
    TriangleAlertIcon,
  } from "@lucide/svelte";

  const sounds = soundEffects.sounds;
  const rules = soundEffects.rules;
  const settings = soundEffects.settings;
  const errors = soundEffects.errors;
  const playing = soundEffects.playing;
  const lastResults = soundEffects.lastResults;
  const vrcMuted = soundEffects.vrcMuted;

  let outputs = $state<{ deviceId: string; label: string }[]>([]);

  async function refreshOutputs() {
    outputs = await soundEffects.listAudioOutputs();
  }

  onMount(() => {
    refreshOutputs();
    navigator.mediaDevices?.addEventListener("devicechange", refreshOutputs);
    return () =>
      navigator.mediaDevices?.removeEventListener(
        "devicechange",
        refreshOutputs,
      );
  });

  const outputLabel = $derived(
    $settings.outputDeviceId
      ? (outputs.find((o) => o.deviceId === $settings.outputDeviceId)?.label ??
          "Device not found, using default")
      : "Windows default",
  );

  function togglePreview(id: string) {
    if ($playing[id]) soundEffects.stop(id);
    else soundEffects.play(id);
  }

  function soundNames(ids: string[]) {
    const names = ids
      .map((id) => $sounds.find((s) => s.id === id)?.name)
      .filter(Boolean);
    return names.length ? names.join(", ") : "Pick sounds";
  }

  const oscTypeOptions: SoundOscType[] = ["Bool", "Int", "Float"];

  // Avatar schema for the OSC path picker
  const schemaStore = avatarOSC.schema;
  let schemaPickerOpen = $state(false);
  let schemaPickerTargetId = $state<string | null>(null);
  let schemaFilter = $state("");

  $effect(() => {
    if (!schemaPickerOpen) {
      schemaFilter = "";
      schemaPickerTargetId = null;
    }
  });

  function openSchemaPicker(soundId: string) {
    schemaPickerTargetId = soundId;
    schemaPickerOpen = true;
  }

  function pickSchemaPath(address: string) {
    if (!schemaPickerTargetId) return;
    soundEffects.updateSound(schemaPickerTargetId, { oscPath: address });
    schemaPickerOpen = false;
  }

  const filteredParams = $derived(
    (() => {
      const schema = $schemaStore;
      if (!schema) return [];
      const f = schemaFilter.toLowerCase();
      return schema.parameters.filter(
        (p) =>
          !f ||
          p.name.toLowerCase().includes(f) ||
          (p.input?.address ?? "").toLowerCase().includes(f),
      );
    })(),
  );
</script>

<div class="flex flex-col gap-4 p-2 h-[calc(100vh-8rem)] overflow-auto">
  <!-- Output -->
  <section class="flex flex-col gap-2">
    <div class="flex items-center gap-2">
      <Volume2Icon class="size-4 text-muted-foreground" />
      <span class="text-sm text-muted-foreground flex-1">
        Play sounds from your library with the soundboard, hotkeys, trigger
        rules or the Sound placeholder.
      </span>
      <Button
        variant="destructive"
        size="sm"
        onclick={() => soundEffects.stopAll()}
      >
        <SquareIcon class="size-4" />
        Stop all
      </Button>
    </div>

    <Card.Root class="p-3">
      <div class="flex flex-col gap-3">
        <div class="flex gap-3 flex-wrap items-end">
          <div class="flex flex-col gap-1 min-w-56 flex-1">
            <Label class="text-xs">Output device</Label>
            <div class="flex gap-2">
              <Select.Root
                type="single"
                value={$settings.outputDeviceId || "default"}
                onValueChange={(v) =>
                  soundEffects.updateSettings({
                    outputDeviceId: !v || v === "default" ? "" : v,
                  })}
              >
                <Select.Trigger class="h-8 text-xs flex-1 min-w-0">
                  <span class="truncate">{outputLabel}</span>
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="default">Windows default</Select.Item>
                  {#each outputs as output (output.deviceId)}
                    <Select.Item value={output.deviceId}>
                      {output.label}
                    </Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
              <Button
                variant="outline"
                size="icon"
                class="size-8 shrink-0"
                title="Refresh devices"
                onclick={refreshOutputs}
              >
                <RefreshCwIcon class="size-4" />
              </Button>
            </div>
          </div>

          <div class="flex flex-col gap-1 w-56">
            <Label class="text-xs">
              Master volume: {$settings.masterVolume}%
            </Label>
            <div class="flex items-center gap-2 h-8">
              <Button
                variant="ghost"
                size="icon"
                class="size-7 shrink-0"
                title={$settings.muted ? "Unmute" : "Mute"}
                onclick={() =>
                  soundEffects.updateSettings({ muted: !$settings.muted })}
              >
                {#if $settings.muted}
                  <VolumeXIcon class="size-4 text-destructive" />
                {:else}
                  <Volume2Icon class="size-4" />
                {/if}
              </Button>
              <Slider
                type="single"
                min={0}
                max={100}
                step={1}
                value={$settings.masterVolume}
                onValueChange={(v: number) => soundEffects.setMasterVolume(v)}
              />
            </div>
          </div>

          <div class="flex flex-col gap-1">
            <Label class="text-xs">Stop all hotkey</Label>
            <ShortcutRecorder
              size="sm"
              class="h-8 text-xs"
              placeholder="None"
              clearOnEscape
              title="Click to record, Esc to clear"
              value={$settings.stopAllHotkey}
              onRecord={(acc) =>
                soundEffects.updateSettings({ stopAllHotkey: acc })}
            />
          </div>
        </div>

        <label class="flex items-center gap-2 cursor-pointer select-none">
          <Checkbox
            checked={$settings.stopOnVrcMute}
            onCheckedChange={(v) =>
              soundEffects.updateSettings({ stopOnVrcMute: !!v })}
          />
          <span class="text-xs">
            Stop sounds when you mute in VRChat, and don't play new ones until
            you unmute
          </span>
          {#if $settings.stopOnVrcMute && $vrcMuted}
            <span
              class="flex items-center gap-1 text-xs text-destructive shrink-0"
            >
              <MicOffIcon class="size-3" />
              Muted in VRChat
            </span>
          {/if}
        </label>
      </div>
    </Card.Root>
  </section>

  <!-- Library -->
  <section class="flex flex-col gap-2">
    <div class="flex items-center justify-between">
      <span class="text-sm font-medium">Library</span>
      <Button variant="outline" size="sm" onclick={soundEffects.pickFiles}>
        <PlusIcon class="size-4" />
        Add sounds
      </Button>
    </div>

    {#if $sounds.length === 0}
      <div
        class="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground"
      >
        <Volume2Icon class="size-10 opacity-30" />
        <p class="text-sm">
          No sounds yet. Click "Add sounds" and pick some audio files.
        </p>
      </div>
    {/if}

    {#each $sounds as sound (sound.id)}
      <Card.Root class="p-3">
        <div class="flex flex-col gap-3">
          <div class="flex items-center gap-2">
            <Button
              variant={$playing[sound.id] ? "default" : "outline"}
              size="icon"
              class="size-8 shrink-0"
              title={$playing[sound.id] ? "Stop" : "Play"}
              onclick={() => togglePreview(sound.id)}
            >
              {#if $playing[sound.id]}
                <SquareIcon class="size-4" />
              {:else}
                <PlayIcon class="size-4" />
              {/if}
            </Button>
            <Input
              class="h-8 text-sm w-48"
              placeholder="Name"
              value={sound.name}
              oninput={(e) =>
                soundEffects.updateSound(sound.id, {
                  name: (e.target as HTMLInputElement).value,
                })}
            />
            <span
              class="text-xs text-muted-foreground font-mono flex-1 truncate"
              title={sound.path}
            >
              {sound.path}
            </span>
            {#if $errors[sound.id]}
              <span
                class="flex items-center gap-1 text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded shrink-0"
                title={$errors[sound.id]}
              >
                <TriangleAlertIcon class="size-3" />
                {$errors[sound.id]}
              </span>
            {/if}
            <Button
              variant="ghost"
              size="icon"
              class="size-7"
              title="Reload file"
              onclick={() => soundEffects.reload(sound.id)}
            >
              <RefreshCwIcon class="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="size-7 text-destructive hover:text-destructive"
              onclick={() => soundEffects.removeSound(sound.id)}
            >
              <Trash2Icon class="size-4" />
            </Button>
          </div>

          <div class="flex gap-3 flex-wrap items-end">
            <div class="flex flex-col gap-1 w-48">
              <Label class="text-xs">Volume: {sound.volume}%</Label>
              <Slider
                class="h-8"
                type="single"
                min={0}
                max={100}
                step={1}
                value={sound.volume}
                onValueChange={(v: number) =>
                  soundEffects.updateSound(sound.id, { volume: v })}
              />
            </div>
            <div class="flex flex-col gap-1">
              <Label class="text-xs">Cooldown (ms)</Label>
              <Input
                type="number"
                class="h-8 w-28 text-xs"
                min={0}
                step={100}
                value={sound.cooldownMs}
                oninput={(e) => {
                  const v = parseInt((e.target as HTMLInputElement).value);
                  soundEffects.updateSound(sound.id, {
                    cooldownMs: isNaN(v) || v < 0 ? 0 : v,
                  });
                }}
              />
            </div>
            <div class="flex flex-col gap-1">
              <Label class="text-xs">Hotkey</Label>
              <ShortcutRecorder
                size="sm"
                class="h-8 text-xs"
                placeholder="None"
                clearOnEscape
                title="Click to record, Esc to clear"
                value={sound.hotkey}
                onRecord={(acc) =>
                  soundEffects.updateSound(sound.id, { hotkey: acc })}
              />
            </div>
          </div>

          <div class="flex flex-col gap-2 border rounded-md p-2">
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox
                checked={sound.oscEnabled}
                onCheckedChange={(v) =>
                  soundEffects.updateSound(sound.id, { oscEnabled: !!v })}
              />
              <span class="text-xs font-medium">Send OSC while playing</span>
              <Tooltip.Provider>
                <Tooltip.Root>
                  <Tooltip.Trigger>
                    <InfoIcon class="size-3 text-muted-foreground cursor-help" />
                  </Tooltip.Trigger>
                  <Tooltip.Content>
                    <p class="text-xs max-w-60">
                      Sends the start value when the sound starts and the end
                      value once the last copy of it finishes. Handy for
                      syncing an avatar animation.
                    </p>
                  </Tooltip.Content>
                </Tooltip.Root>
              </Tooltip.Provider>
            </label>

            {#if sound.oscEnabled}
              <div class="flex gap-2 flex-wrap items-end">
                <div class="flex flex-col gap-1 flex-1 min-w-56">
                  <Label class="text-xs">OSC Path</Label>
                  <div class="flex gap-2">
                    <Input
                      class="font-mono text-xs h-8 flex-1"
                      placeholder="/avatar/parameters/SoundPlaying"
                      value={sound.oscPath}
                      oninput={(e) =>
                        soundEffects.updateSound(sound.id, {
                          oscPath: (e.target as HTMLInputElement).value,
                        })}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      class="h-8 shrink-0"
                      onclick={() => openSchemaPicker(sound.id)}
                    >
                      <ListIcon class="size-3" />
                      Avatar
                    </Button>
                  </div>
                </div>
                <div class="flex flex-col gap-1">
                  <Label class="text-xs">Type</Label>
                  <Select.Root
                    type="single"
                    value={sound.oscType}
                    onValueChange={(v) => {
                      if (v)
                        soundEffects.updateSound(sound.id, {
                          oscType: v as SoundOscType,
                        });
                    }}
                  >
                    <Select.Trigger class="h-8 w-24 text-xs">
                      {sound.oscType}
                    </Select.Trigger>
                    <Select.Content>
                      {#each oscTypeOptions as opt}
                        <Select.Item value={opt}>{opt}</Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                </div>
                <div class="flex flex-col gap-1">
                  <Label class="text-xs">Start value</Label>
                  <Input
                    class="h-8 w-24 text-xs font-mono"
                    value={sound.oscOnValue}
                    oninput={(e) =>
                      soundEffects.updateSound(sound.id, {
                        oscOnValue: (e.target as HTMLInputElement).value,
                      })}
                  />
                </div>
                <div class="flex flex-col gap-1">
                  <Label class="text-xs">End value</Label>
                  <Input
                    class="h-8 w-24 text-xs font-mono"
                    value={sound.oscOffValue}
                    oninput={(e) =>
                      soundEffects.updateSound(sound.id, {
                        oscOffValue: (e.target as HTMLInputElement).value,
                      })}
                  />
                </div>
              </div>
            {/if}
          </div>
        </div>
      </Card.Root>
    {/each}
  </section>

  <!-- Triggers -->
  <section class="flex flex-col gap-2">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium">Triggers</span>
        <span class="text-xs text-muted-foreground">
          Plays a random pick from the chosen sounds when the template result
          starts matching. By default the sound plays to the end.
        </span>
      </div>
      <Button variant="outline" size="sm" onclick={soundEffects.addRule}>
        <PlusIcon class="size-4" />
        Add trigger
      </Button>
    </div>

    {#if $rules.length === 0}
      <div
        class="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground"
      >
        <ZapIcon class="size-10 opacity-30" />
        <p class="text-sm">
          No triggers yet. Add one to play a sound when an avatar parameter
          changes.
        </p>
      </div>
    {/if}

    {#each $rules as rule (rule.id)}
      <Card.Root class="p-3">
        <div class="flex flex-col gap-3">
          <div class="flex items-center gap-2">
            <Checkbox
              checked={rule.enabled}
              onCheckedChange={(v) =>
                soundEffects.updateRule(rule.id, { enabled: !!v })}
            />
            <span
              class="text-xs text-muted-foreground font-mono flex-1 truncate"
            >
              {rule.template || "(no template)"}
            </span>
            {#if $lastResults[rule.id] !== undefined}
              <span
                class="text-xs font-mono bg-muted px-1.5 py-0.5 rounded shrink-0 max-w-32 truncate"
                title={$lastResults[rule.id]}
              >
                {$lastResults[rule.id] || '""'}
              </span>
            {/if}
            <Button
              variant="ghost"
              size="icon"
              class="size-7 text-destructive hover:text-destructive"
              onclick={() => soundEffects.removeRule(rule.id)}
            >
              <Trash2Icon class="size-4" />
            </Button>
          </div>

          <div class="flex gap-2 flex-wrap items-end">
            <div class="flex flex-col gap-1 flex-1 min-w-64">
              <div class="flex items-center gap-1">
                <Label class="text-xs">Template</Label>
                <Tooltip.Provider>
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      <InfoIcon
                        class="size-3 text-muted-foreground cursor-help"
                      />
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                      <p class="text-xs max-w-64">
                        Any placeholders, like <span class="font-mono"
                          >{"[[OSCData:/avatar/parameters/Booped]]"}</span
                        >. It's checked every time OSC comes in and a few
                        times a second otherwise.
                      </p>
                    </Tooltip.Content>
                  </Tooltip.Root>
                </Tooltip.Provider>
              </div>
              <Input
                class="font-mono text-xs h-8"
                placeholder={"[[OSCData:/avatar/parameters/Booped]]"}
                value={rule.template}
                oninput={(e) =>
                  soundEffects.updateRule(rule.id, {
                    template: (e.target as HTMLInputElement).value,
                  })}
              />
            </div>
            <div class="flex flex-col gap-1">
              <div class="flex items-center gap-1">
                <Label class="text-xs">Match</Label>
                <Tooltip.Provider>
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      <InfoIcon
                        class="size-3 text-muted-foreground cursor-help"
                      />
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                      <p class="text-xs max-w-64">
                        A value like <span class="font-mono">1</span> or
                        <span class="font-mono">true</span>, or an operator
                        first: <span class="font-mono">&gt; 0.5</span>,
                        <span class="font-mono">!= idle</span>,
                        <span class="font-mono">&lt;= 3</span>. true and false
                        count as 1 and 0, text ignores case.
                      </p>
                    </Tooltip.Content>
                  </Tooltip.Root>
                </Tooltip.Provider>
              </div>
              <Input
                class="font-mono text-xs h-8 w-32"
                placeholder="1, > 0.5, != idle"
                value={rule.match}
                oninput={(e) =>
                  soundEffects.updateRule(rule.id, {
                    match: (e.target as HTMLInputElement).value,
                  })}
              />
            </div>
            <div class="flex flex-col gap-1 min-w-48 max-w-72">
              <Label class="text-xs">Sounds</Label>
              <Select.Root
                type="multiple"
                value={rule.soundIds}
                onValueChange={(v) =>
                  soundEffects.updateRule(rule.id, { soundIds: v ?? [] })}
              >
                <Select.Trigger class="h-8 text-xs">
                  <span class="truncate">{soundNames(rule.soundIds)}</span>
                </Select.Trigger>
                <Select.Content>
                  {#each $sounds as sound (sound.id)}
                    <Select.Item value={sound.id}>{sound.name}</Select.Item>
                  {/each}
                  {#if $sounds.length === 0}
                    <p class="text-xs text-muted-foreground p-2">
                      Add sounds to the library first.
                    </p>
                  {/if}
                </Select.Content>
              </Select.Root>
            </div>
          </div>

          <div class="flex gap-4 flex-wrap">
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox
                checked={rule.loop}
                onCheckedChange={(v) =>
                  soundEffects.updateRule(rule.id, { loop: !!v })}
              />
              <span class="text-xs">Loop while it matches</span>
            </label>
            <label
              class="flex items-center gap-2 select-none"
              class:cursor-pointer={!rule.loop}
              class:opacity-50={rule.loop}
            >
              <Checkbox
                checked={rule.loop || rule.stopOnUnmatch}
                disabled={rule.loop}
                onCheckedChange={(v) =>
                  soundEffects.updateRule(rule.id, { stopOnUnmatch: !!v })}
              />
              <span class="text-xs">Stop right away when it stops matching</span>
            </label>
          </div>
        </div>
      </Card.Root>
    {/each}
  </section>
</div>

<!-- Avatar schema path picker drawer -->
<Drawer.Root bind:open={schemaPickerOpen}>
  <Drawer.Content class="flex flex-col gap-2 p-3 max-h-[70vh]">
    <Drawer.Header>
      <Drawer.Title>Select Avatar Parameter</Drawer.Title>
      <Drawer.Description>
        Choose a parameter from the current avatar's OSC schema.
      </Drawer.Description>
    </Drawer.Header>

    {#if !$schemaStore}
      <p class="text-sm text-muted-foreground text-center py-6">
        No avatar schema loaded. Join a world with an avatar that has OSC
        parameters.
      </p>
    {:else}
      <Input
        class="h-8 text-sm"
        placeholder="Filter parameters..."
        bind:value={schemaFilter}
      />
      <div class="flex flex-col gap-1 overflow-auto flex-1 min-h-0 max-h-80">
        {#each filteredParams as param}
          <Button
            variant="ghost"
            class="justify-start h-auto py-1.5 px-2 font-mono text-xs"
            onclick={() =>
              pickSchemaPath(
                param.input?.address ?? param.output?.address ?? "",
              )}
          >
            <div class="flex flex-col items-start">
              <span class="font-semibold">{param.name}</span>
              <span class="text-muted-foreground">
                {param.input?.address ?? param.output?.address}
                <span class="ml-1 text-xs opacity-70"
                  >({param.input?.type ?? param.output?.type})</span
                >
              </span>
            </div>
          </Button>
        {/each}
        {#if filteredParams.length === 0}
          <p class="text-xs text-muted-foreground text-center py-4">
            No parameters match your filter.
          </p>
        {/if}
      </div>
    {/if}

    <Drawer.Footer>
      <Drawer.Close>Cancel</Drawer.Close>
    </Drawer.Footer>
  </Drawer.Content>
</Drawer.Root>
