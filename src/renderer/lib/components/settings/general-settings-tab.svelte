<script lang="ts">
  import type { OSCSourceConfig, OSCSourceStatus } from "../../../../main/preload";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import {
    PlusIcon,
    Trash2Icon,
    RadioIcon,
    SaveIcon,
    RotateCcwIcon,
    InfoIcon,
    ExternalLinkIcon,
  } from "@lucide/svelte";
  import { toast } from "svelte-sonner";

  let sources = $state<OSCSourceConfig[]>([]);
  let status = $state<OSCSourceStatus[]>([]);
  let loading = $state(true);
  let saving = $state(false);

  const version = window.ADVOSCNative.version;

  const links = [
    { label: "GitHub Repository", url: "https://github.com/TheArmagan/advosc" },
    { label: "Latest Releases", url: "https://github.com/TheArmagan/advosc/releases/latest" },
    { label: "Discord Community", url: "https://discord.gg/spfmB7S78n" },
  ];

  async function refreshStatus() {
    status = await window.ADVOSCNative.osc.getStatus();
  }

  async function load() {
    loading = true;
    sources = await window.ADVOSCNative.osc.getSources();
    await refreshStatus();
    loading = false;
  }

  load();

  function newId() {
    return `source-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  function addSource() {
    sources = [
      ...sources,
      {
        id: newId(),
        name: `Custom Source ${sources.length + 1}`,
        enabled: true,
        local: { address: "0.0.0.0", port: 9100 },
        remote: { address: "127.0.0.1", port: 9101 },
      },
    ];
  }

  function removeSource(id: string) {
    sources = sources.filter((source) => source.id !== id);
  }

  function updateSource(id: string, patch: Partial<OSCSourceConfig>) {
    sources = sources.map((source) =>
      source.id === id ? { ...source, ...patch } : source,
    );
  }

  function toggleEndpoint(
    source: OSCSourceConfig,
    kind: "local" | "remote",
    enabled: boolean,
  ) {
    if (!enabled) {
      updateSource(source.id, { [kind]: undefined } as Partial<OSCSourceConfig>);
      return;
    }
    const defaults =
      kind === "local"
        ? { address: "0.0.0.0", port: 9100 }
        : { address: "127.0.0.1", port: 9101 };
    updateSource(source.id, { [kind]: defaults } as Partial<OSCSourceConfig>);
  }

  function updateEndpoint(
    source: OSCSourceConfig,
    kind: "local" | "remote",
    patch: { address?: string; port?: number },
  ) {
    const current = source[kind];
    if (!current) return;
    updateSource(source.id, {
      [kind]: { ...current, ...patch },
    } as Partial<OSCSourceConfig>);
  }

  /** Mirrors the main-process validation so problems surface before applying. */
  function validate(): string | null {
    if (sources.length === 0) return "Add at least one OSC source.";

    const usedLocalPorts = new Map<string, string>();

    for (const source of sources) {
      const label = source.name || source.id;
      if (!source.local && !source.remote) {
        return `"${label}" needs a listen and/or a send endpoint.`;
      }
      for (const kind of ["local", "remote"] as const) {
        const endpoint = source[kind];
        if (!endpoint) continue;
        if (!endpoint.address.trim()) {
          return `"${label}" has an empty ${kind === "local" ? "listen" : "send"} address.`;
        }
        if (
          !Number.isInteger(endpoint.port) ||
          endpoint.port < 1 ||
          endpoint.port > 65535
        ) {
          return `"${label}" has an invalid ${kind === "local" ? "listen" : "send"} port (1-65535).`;
        }
      }
      if (source.local && source.enabled) {
        const key = `${source.local.address}:${source.local.port}`;
        const owner = usedLocalPorts.get(key);
        if (owner) {
          return `"${label}" listens on ${key}, which "${owner}" already uses.`;
        }
        usedLocalPorts.set(key, label);
      }
    }

    return null;
  }

  /**
   * $state proxies cannot cross the context bridge, so rebuild the list as plain
   * objects and drop the endpoint keys that are turned off entirely.
   */
  function toPlainSources(): OSCSourceConfig[] {
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      enabled: source.enabled,
      ...(source.local
        ? { local: { address: source.local.address, port: source.local.port } }
        : {}),
      ...(source.remote
        ? {
            remote: {
              address: source.remote.address,
              port: source.remote.port,
            },
          }
        : {}),
    }));
  }

  async function save() {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }

    saving = true;
    const result = await window.ADVOSCNative.osc.setSources(toPlainSources());
    saving = false;

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    sources = result.sources;
    status = result.status;
    toast.success("OSC sources applied.");
    // Binding resolves asynchronously; re-read once sockets settled.
    setTimeout(refreshStatus, 300);
  }

  async function resetToDefaults() {
    saving = true;
    const result = await window.ADVOSCNative.osc.resetSources();
    saving = false;

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    sources = result.sources;
    status = result.status;
    toast.success("OSC sources reset to defaults.");
    setTimeout(refreshStatus, 300);
  }

  function statusFor(source: OSCSourceConfig) {
    if (!source.enabled) return null;
    return status.find(
      (entry) =>
        entry.local?.address === source.local?.address &&
        entry.local?.port === source.local?.port &&
        entry.remote?.address === source.remote?.address &&
        entry.remote?.port === source.remote?.port,
    );
  }

  async function openLink(url: string) {
    const result = await window.ADVOSCNative.shell.openExternal(url);
    if (!result.success) toast.error(result.error ?? "Could not open the link.");
  }
</script>

<div class="flex flex-col gap-6 p-2 h-[calc(100vh-8rem)] overflow-auto">
  <!-- OSC Sources -->
  <section class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <RadioIcon class="size-4 text-muted-foreground" />
        <div class="flex flex-col">
          <span class="text-sm font-medium">OSC Sources</span>
          <span class="text-xs text-muted-foreground">
            Listen and send addresses ADVOSC uses. Incoming messages from every
            source are merged; outgoing messages go to every send endpoint.
          </span>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" onclick={addSource} disabled={loading}>
          <PlusIcon class="size-4" />
          Add Source
        </Button>
        <Button
          variant="outline"
          size="sm"
          onclick={resetToDefaults}
          disabled={loading || saving}
        >
          <RotateCcwIcon class="size-4" />
          Reset
        </Button>
        <Button size="sm" onclick={save} disabled={loading || saving}>
          <SaveIcon class="size-4" />
          {saving ? "Applying..." : "Save & Apply"}
        </Button>
      </div>
    </div>

    {#if loading}
      <p class="text-sm text-muted-foreground py-6 text-center">
        Loading OSC sources...
      </p>
    {:else if sources.length === 0}
      <div
        class="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground"
      >
        <RadioIcon class="size-10 opacity-30" />
        <p class="text-sm">
          No OSC sources configured. Add one or reset to defaults.
        </p>
      </div>
    {/if}

    {#each sources as source (source.id)}
      {@const sourceStatus = statusFor(source)}
      <Card.Root class="p-3">
        <div class="flex flex-col gap-3">
          <!-- Header row -->
          <div class="flex items-center gap-2">
            <Checkbox
              checked={source.enabled}
              onCheckedChange={(v) => updateSource(source.id, { enabled: !!v })}
            />
            <Input
              class="h-8 text-sm flex-1"
              placeholder="Source name"
              value={source.name}
              oninput={(e) =>
                updateSource(source.id, {
                  name: (e.target as HTMLInputElement).value,
                })}
            />
            {#if source.enabled && source.local}
              <span
                class="text-xs px-1.5 py-0.5 rounded shrink-0 {sourceStatus?.isOpen
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-muted text-muted-foreground'}"
              >
                {sourceStatus?.isOpen ? "Listening" : "Not bound"}
              </span>
            {/if}
            <Button
              variant="ghost"
              size="icon"
              class="size-7 text-destructive hover:text-destructive"
              onclick={() => removeSource(source.id)}
            >
              <Trash2Icon class="size-4" />
            </Button>
          </div>

          <div class="flex gap-3 flex-wrap">
            <!-- Local (listen) -->
            <div class="flex flex-col gap-2 border rounded-md p-2 flex-1 min-w-72">
              <label class="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox
                  checked={!!source.local}
                  onCheckedChange={(v) => toggleEndpoint(source, "local", !!v)}
                />
                <span class="text-xs font-medium">Local (Listen)</span>
                <Tooltip.Provider>
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      <InfoIcon class="size-3 text-muted-foreground cursor-help" />
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                      <p class="text-xs max-w-60">
                        The address and port ADVOSC binds to for incoming OSC
                        messages. Use <span class="font-mono">0.0.0.0</span> to accept
                        messages from any interface.
                      </p>
                    </Tooltip.Content>
                  </Tooltip.Root>
                </Tooltip.Provider>
              </label>

              {#if source.local}
                <div class="flex gap-2">
                  <div class="flex flex-col gap-1 flex-1">
                    <Label class="text-xs">Address</Label>
                    <Input
                      class="h-8 text-xs font-mono"
                      placeholder="0.0.0.0"
                      value={source.local.address}
                      oninput={(e) =>
                        updateEndpoint(source, "local", {
                          address: (e.target as HTMLInputElement).value,
                        })}
                    />
                  </div>
                  <div class="flex flex-col gap-1">
                    <Label class="text-xs">Port</Label>
                    <Input
                      type="number"
                      class="h-8 w-24 text-xs font-mono"
                      min={1}
                      max={65535}
                      value={source.local.port}
                      oninput={(e) =>
                        updateEndpoint(source, "local", {
                          port: parseInt((e.target as HTMLInputElement).value),
                        })}
                    />
                  </div>
                </div>
              {:else}
                <p class="text-xs text-muted-foreground">
                  Send-only source; it does not receive OSC messages.
                </p>
              {/if}
            </div>

            <!-- Remote (send) -->
            <div class="flex flex-col gap-2 border rounded-md p-2 flex-1 min-w-72">
              <label class="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox
                  checked={!!source.remote}
                  onCheckedChange={(v) => toggleEndpoint(source, "remote", !!v)}
                />
                <span class="text-xs font-medium">Remote (Send)</span>
                <Tooltip.Provider>
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      <InfoIcon class="size-3 text-muted-foreground cursor-help" />
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                      <p class="text-xs max-w-60">
                        Where outgoing OSC messages are delivered. VRChat listens
                        on <span class="font-mono">127.0.0.1:9000</span> by default.
                      </p>
                    </Tooltip.Content>
                  </Tooltip.Root>
                </Tooltip.Provider>
              </label>

              {#if source.remote}
                <div class="flex gap-2">
                  <div class="flex flex-col gap-1 flex-1">
                    <Label class="text-xs">Address</Label>
                    <Input
                      class="h-8 text-xs font-mono"
                      placeholder="127.0.0.1"
                      value={source.remote.address}
                      oninput={(e) =>
                        updateEndpoint(source, "remote", {
                          address: (e.target as HTMLInputElement).value,
                        })}
                    />
                  </div>
                  <div class="flex flex-col gap-1">
                    <Label class="text-xs">Port</Label>
                    <Input
                      type="number"
                      class="h-8 w-24 text-xs font-mono"
                      min={1}
                      max={65535}
                      value={source.remote.port}
                      oninput={(e) =>
                        updateEndpoint(source, "remote", {
                          port: parseInt((e.target as HTMLInputElement).value),
                        })}
                    />
                  </div>
                </div>
              {:else}
                <p class="text-xs text-muted-foreground">
                  Receive-only source; nothing is sent to it.
                </p>
              {/if}
            </div>
          </div>
        </div>
      </Card.Root>
    {/each}

    {#if !loading}
      <p class="text-xs text-muted-foreground">
        Changes take effect as soon as you press "Save &amp; Apply". Sockets are
        rebound without restarting ADVOSC.
      </p>
    {/if}
  </section>

  <!-- About -->
  <section class="flex flex-col gap-3">
    <div class="flex items-center gap-2">
      <span class="text-sm font-medium">About</span>
      <div class="flex-1 border-t"></div>
    </div>

    <Card.Root class="p-4">
      <div class="flex flex-col gap-3">
        <div class="flex items-baseline gap-2">
          <h2 class="text-lg font-semibold">ADVOSC</h2>
          <span class="text-xs text-muted-foreground font-mono">v{version}</span>
        </div>
        <p class="text-sm text-muted-foreground">
          Advanced OSC tools for VRChat: chatbox editor, avatar profiles, raw OSC
          editor and more.
        </p>
        <div class="flex flex-col gap-1 text-xs text-muted-foreground">
          <span>Author: Kıraç Armağan Önal</span>
          <span>License: GPL-3.0-only</span>
        </div>
        <div class="flex gap-2 flex-wrap">
          {#each links as link}
            <Button
              variant="outline"
              size="sm"
              onclick={() => openLink(link.url)}
            >
              <ExternalLinkIcon class="size-3" />
              {link.label}
            </Button>
          {/each}
        </div>
      </div>
    </Card.Root>
  </section>
</div>
