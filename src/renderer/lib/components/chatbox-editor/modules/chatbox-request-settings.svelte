<script lang="ts">
  import type { ChatboxRequestModule } from "$lib/api/chatbox/modules/chatbox-request-module";
  import {
    createDefaultSource,
    isSourceConfigured,
    requestMethods,
    DEFAULT_KEEPALIVE_SECONDS,
    DEFAULT_REFRESH_SECONDS,
    type RequestMethod,
    type RequestSource,
    type RequestSourceKind,
  } from "$lib/api/chatbox/modules/request/types";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Item from "$lib/components/ui/item/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as Drawer from "$lib/components/ui/drawer/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import {
    CopyIcon,
    DownloadIcon,
    GlobeIcon,
    PencilIcon,
    PlayIcon,
    PlugIcon,
    PlusIcon,
    RefreshCwIcon,
    Trash2Icon,
    UploadIcon,
    WifiIcon,
    WifiOffIcon,
  } from "@lucide/svelte";
  import { toast } from "svelte-sonner";
  import ChatboxMonacoEditor from "../chatbox-monaco-editor.svelte";
  import { onMount, onDestroy } from "svelte";

  const {
    module,
  }: {
    module: ChatboxRequestModule;
  } = $props();

  const values = module.values;

  interface SourceEntry {
    name: string;
    source: RequestSource;
  }

  interface StatusState {
    connected: boolean;
    error?: string;
    count: number;
    lastUpdate?: number;
    status?: number;
    preview?: string;
  }

  let sources = $state<SourceEntry[]>([]);
  let statuses = $state<Map<string, StatusState>>(new Map());

  let editorOpen = $state(false);
  /** Name being edited, or null when adding a new source. */
  let editingName = $state<string | null>(null);
  let draftName = $state("");
  let draftSource = $state<RequestSource>(createDefaultSource());
  let testing = $state(false);
  let testOutput = $state("");

  let bulkImportOpen = $state(false);
  let bulkImportValue = $state("");

  let refreshInterval: ReturnType<typeof setInterval> | null = null;

  function loadSources() {
    sources = Object.entries(module.getSources()).map(([name, source]) => ({
      name,
      source: source as RequestSource,
    }));
  }

  function refreshStatuses() {
    const next = new Map<string, StatusState>();
    for (const entry of sources) {
      // Keep the source live while this tab is open so the status means something.
      module.keepAlive(entry.name);
      next.set(entry.name, module.getStatus(entry.name) as StatusState);
    }
    statuses = next;
  }

  function openAddDrawer() {
    editingName = null;
    draftName = `Request${sources.length + 1}`;
    draftSource = createDefaultSource("http");
    testOutput = "";
    editorOpen = true;
  }

  function openEditDrawer(entry: SourceEntry) {
    editingName = entry.name;
    draftName = entry.name;
    draftSource = {
      ...createDefaultSource(entry.source.kind),
      ...entry.source,
      headers: [...(entry.source.headers ?? [])],
    };
    testOutput = "";
    editorOpen = true;
  }

  function setKind(kind: RequestSourceKind) {
    // The two kinds share almost no fields, so start from a clean default.
    draftSource = { ...createDefaultSource(kind), url: draftSource.url };
    testOutput = "";
  }

  function addHeader() {
    draftSource = {
      ...draftSource,
      headers: [...(draftSource.headers ?? []), { key: "", value: "" }],
    };
  }

  function updateHeader(index: number, field: "key" | "value", value: string) {
    const headers = [...(draftSource.headers ?? [])];
    headers[index] = { ...headers[index], [field]: value };
    draftSource = { ...draftSource, headers };
  }

  function removeHeader(index: number) {
    const headers = [...(draftSource.headers ?? [])];
    headers.splice(index, 1);
    draftSource = { ...draftSource, headers };
  }

  function saveDraft() {
    const name = draftName.trim();
    if (!name) {
      toast.error("Please give the source a name.");
      return;
    }
    if (name.includes(";") || name.includes(":")) {
      toast.error("Source names cannot contain ';' or ':'.");
      return;
    }
    if (name !== editingName && module.getSources()[name]) {
      toast.error(`A source named "${name}" already exists.`);
      return;
    }
    if (!isSourceConfigured(draftSource)) {
      toast.error("Please fill in the URL.");
      return;
    }

    if (editingName && editingName !== name) module.removeSource(editingName);
    module.setSource(name, { ...draftSource });

    toast.success(`Request source "${name}" saved!`);
    editorOpen = false;
    loadSources();
  }

  async function testDraft() {
    if (!isSourceConfigured(draftSource)) {
      toast.error("Please fill in the URL first.");
      return;
    }
    testing = true;
    testOutput = "";
    try {
      const outcome = await module.testSource({ ...draftSource });
      if (outcome.websocket) {
        testOutput = `WebSocket URL resolves to:\n${outcome.url}\n\nSave the source to connect and watch its status in the list.`;
        return;
      }
      const { resolved, result } = outcome as any;
      const lines = [
        `${resolved.method} ${resolved.url}`,
        ...Object.entries(resolved.headers as Record<string, string>).map(
          ([key, value]) => `${key}: ${value}`,
        ),
      ];
      if (resolved.body) lines.push("", String(resolved.body));
      lines.push("", "─".repeat(40), "");
      if (!result) {
        lines.push(outcome.error ?? "No response.");
      } else if (result.error) {
        lines.push(`Failed: ${result.error}`);
      } else {
        lines.push(`${result.status} ${result.statusText} (${result.durationMs}ms)`);
        lines.push("");
        lines.push(result.body.slice(0, 4000) || "(empty body)");
        if (result.truncated) lines.push("", "… body truncated");
      }
      testOutput = lines.join("\n");
    } catch (error) {
      testOutput = `Failed: ${(error as Error).message}`;
    } finally {
      testing = false;
    }
  }

  function removeSource(name: string) {
    module.removeSource(name);
    toast.success(`Request source "${name}" removed!`);
    loadSources();
  }

  function copyPlaceholder(name: string) {
    navigator.clipboard.writeText(`{{Request;Value;${name};}}`);
    toast.success("Placeholder copied to clipboard!");
  }

  function refreshSource(name: string) {
    module.refresh(name);
    toast.success(`"${name}" will be fetched again.`);
  }

  function handleBulkExport() {
    navigator.clipboard.writeText(JSON.stringify(module.getSources(), null, 2));
    toast.success("Request sources exported to clipboard!");
  }

  function handleBulkImport() {
    try {
      const { imported, failed } = module.importSources(JSON.parse(bulkImportValue));
      loadSources();
      toast.success(`Imported ${imported} sources${failed > 0 ? `, ${failed} failed` : ""}!`);
      bulkImportOpen = false;
      bulkImportValue = "";
    } catch (error) {
      toast.error("Import failed: " + (error as Error).message);
    }
  }

  function describeSource(source: RequestSource): string {
    if (source.kind === "websocket") return `WebSocket · ${source.url}`;
    return `${source.method || "GET"} · every ${source.refreshSeconds ?? DEFAULT_REFRESH_SECONDS}s · ${source.url}`;
  }

  onMount(() => {
    loadSources();
    refreshStatuses();

    const unsubscribe = values.subscribe(() => {
      loadSources();
    });

    refreshInterval = setInterval(refreshStatuses, 1000);

    return () => {
      unsubscribe();
    };
  });

  onDestroy(() => {
    if (refreshInterval) clearInterval(refreshInterval);
  });
</script>

<div class="flex flex-col gap-2 items-start justify-start">
  <div class="flex gap-2">
    <Button variant="outline" onclick={openAddDrawer}>
      <PlusIcon />
      Add Source
    </Button>

    <Button variant="outline" onclick={handleBulkExport}>
      <DownloadIcon />
      Bulk Export
    </Button>

    <Drawer.Root bind:open={bulkImportOpen}>
      <Drawer.Trigger>
        <Button variant="outline">
          <UploadIcon />
          Bulk Import
        </Button>
      </Drawer.Trigger>
      <Drawer.Content class="flex flex-col gap-2 w-full p-2">
        <Label class="text-lg">Bulk Import Request Sources (JSON)</Label>
        <div class="flex w-full items-center justify-center">
          <ChatboxMonacoEditor
            width={Math.floor(window.innerWidth * 0.98)}
            height={250}
            language="json"
            onLoad={(editor) => {
              editor.setValue(bulkImportValue);
            }}
            onChange={(newValue) => {
              bulkImportValue = newValue;
            }}
          />
        </div>
        <Drawer.Footer>
          <Button onclick={handleBulkImport}>
            <UploadIcon />
            Import
          </Button>
          <Drawer.Close>Cancel</Drawer.Close>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer.Root>
  </div>

  <Drawer.Root bind:open={editorOpen}>
    <Drawer.Content class="flex items-center justify-center w-full">
      <div class="w-[42rem] max-w-full flex flex-col gap-4 p-4 max-h-[80vh] overflow-y-auto">
        <div class="flex gap-2">
          <div class="flex flex-col gap-2 flex-1">
            <Label>Source Name</Label>
            <Input
              bind:value={draftName}
              placeholder="Name used in placeholders (e.g. MyApi)"
            />
          </div>

          <div class="flex flex-col gap-2 w-44">
            <Label>Type</Label>
            <Select.Root
              type="single"
              value={draftSource.kind}
              onValueChange={(v) => setKind((v as RequestSourceKind) ?? "http")}
            >
              <Select.Trigger class="w-full">
                {draftSource.kind === "websocket" ? "WebSocket" : "HTTP Request"}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="http">HTTP Request</Select.Item>
                <Select.Item value="websocket">WebSocket</Select.Item>
              </Select.Content>
            </Select.Root>
          </div>
        </div>

        <div class="flex gap-2">
          {#if draftSource.kind === "http"}
            <div class="flex flex-col gap-2 w-32">
              <Label>Method</Label>
              <Select.Root
                type="single"
                value={draftSource.method ?? "GET"}
                onValueChange={(v) =>
                  (draftSource = { ...draftSource, method: (v as RequestMethod) ?? "GET" })}
              >
                <Select.Trigger class="w-full">{draftSource.method ?? "GET"}</Select.Trigger>
                <Select.Content>
                  {#each requestMethods as method}
                    <Select.Item value={method}>{method}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
            </div>
          {/if}

          <div class="flex flex-col gap-2 flex-1">
            <Label>URL</Label>
            <Input
              value={draftSource.url}
              placeholder={draftSource.kind === "websocket"
                ? "wss://example.com/feed"
                : "https://api.example.com/status"}
              oninput={(e) =>
                (draftSource = {
                  ...draftSource,
                  url: (e.target as HTMLInputElement).value,
                })}
            />
          </div>
        </div>

        <p class="text-xs text-muted-foreground">
          The URL, headers and body can contain placeholders, e.g.
          <code>{"https://api.example.com/user/{{Text;Get;UserId}}"}</code>. They are
          filled in right before the request goes out.
        </p>

        {#if draftSource.kind === "http"}
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between">
              <Label>Headers</Label>
              <Button variant="ghost" size="sm" onclick={addHeader}>
                <PlusIcon class="w-4 h-4" />
                Add Header
              </Button>
            </div>
            {#each draftSource.headers ?? [] as header, index (index)}
              <div class="flex gap-2 items-center">
                <Input
                  class="w-1/3"
                  placeholder="Authorization"
                  value={header.key}
                  oninput={(e) =>
                    updateHeader(index, "key", (e.target as HTMLInputElement).value)}
                />
                <Input
                  class="flex-1"
                  placeholder="Bearer …"
                  value={header.value}
                  oninput={(e) =>
                    updateHeader(index, "value", (e.target as HTMLInputElement).value)}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onclick={() => removeHeader(index)}
                  title="Remove header"
                >
                  <Trash2Icon class="w-4 h-4" />
                </Button>
              </div>
            {/each}
          </div>

          {#if draftSource.method && draftSource.method !== "GET" && draftSource.method !== "HEAD"}
            <div class="flex flex-col gap-2">
              <Label>Body</Label>
              <Textarea
                class="font-mono text-xs min-h-24"
                placeholder={'{"message": "hello"}'}
                value={draftSource.body ?? ""}
                oninput={(e) =>
                  (draftSource = {
                    ...draftSource,
                    body: (e.target as HTMLTextAreaElement).value,
                  })}
              />
            </div>
          {/if}

          <div class="flex gap-2">
            <div class="flex flex-col gap-2 flex-1">
              <Label>Refresh Interval (seconds)</Label>
              <Input
                type="number"
                min="1"
                max="3600"
                value={draftSource.refreshSeconds ?? DEFAULT_REFRESH_SECONDS}
                oninput={(e) =>
                  (draftSource = {
                    ...draftSource,
                    refreshSeconds: Number((e.target as HTMLInputElement).value),
                  })}
              />
            </div>
            <div class="flex flex-col gap-2 flex-1">
              <Label>Timeout (ms)</Label>
              <Input
                type="number"
                min="1000"
                max="60000"
                value={draftSource.timeoutMs ?? 10000}
                oninput={(e) =>
                  (draftSource = {
                    ...draftSource,
                    timeoutMs: Number((e.target as HTMLInputElement).value),
                  })}
              />
            </div>
          </div>
        {:else}
          <div class="flex flex-col gap-2">
            <Label>Message On Connect (optional)</Label>
            <Textarea
              class="font-mono text-xs min-h-20"
              placeholder={'{"op": "subscribe", "channel": "status"}'}
              value={draftSource.openMessage ?? ""}
              oninput={(e) =>
                (draftSource = {
                  ...draftSource,
                  openMessage: (e.target as HTMLTextAreaElement).value,
                })}
            />
            <p class="text-xs text-muted-foreground">
              Sent once as soon as the socket opens. Use it for subscribe or auth frames.
            </p>
          </div>

          <div class="flex gap-2">
            <div class="flex flex-col gap-2 flex-1">
              <Label>Keepalive Message (optional)</Label>
              <Input
                placeholder="ping"
                value={draftSource.keepaliveMessage ?? ""}
                oninput={(e) =>
                  (draftSource = {
                    ...draftSource,
                    keepaliveMessage: (e.target as HTMLInputElement).value,
                  })}
              />
            </div>
            <div class="flex flex-col gap-2 w-40">
              <Label>Every (seconds)</Label>
              <Input
                type="number"
                min="1"
                max="600"
                value={draftSource.keepaliveSeconds ?? DEFAULT_KEEPALIVE_SECONDS}
                oninput={(e) =>
                  (draftSource = {
                    ...draftSource,
                    keepaliveSeconds: Number((e.target as HTMLInputElement).value),
                  })}
              />
            </div>
          </div>
        {/if}

        {#if testOutput}
          <div class="flex flex-col gap-2">
            <Label>Test Result</Label>
            <pre
              class="text-xs font-mono bg-muted rounded-md p-2 max-h-56 overflow-auto whitespace-pre-wrap">{testOutput}</pre>
          </div>
        {/if}

        <Drawer.Footer>
          <div class="flex gap-2">
            <Button variant="outline" onclick={testDraft} disabled={testing}>
              <PlayIcon />
              {testing ? "Testing…" : "Test"}
            </Button>
            <Button class="flex-1" onclick={saveDraft}>
              <PlusIcon />
              {editingName ? "Save Changes" : "Add Source"}
            </Button>
          </div>
          <Drawer.Close>Cancel</Drawer.Close>
        </Drawer.Footer>
      </div>
    </Drawer.Content>
  </Drawer.Root>

  {#if sources.length === 0}
    <div class="text-muted-foreground text-sm py-4">
      No request sources configured. Click "Add Source" to poll a web API or subscribe to
      a WebSocket feed, then read values out of its JSON with
      <code>{"{{Request;Value;Name;path.to.value}}"}</code>.
    </div>
  {:else}
    <div class="flex flex-col gap-2 w-full">
      {#each sources as entry (entry.name)}
        {@const status = statuses.get(entry.name) ?? { connected: false, count: 0 }}
        <Item.Root class="flex items-center gap-2">
          <Item.Media>
            {#if entry.source.kind === "websocket"}
              <PlugIcon class={status.connected ? "w-5 h-5 text-green-500" : "w-5 h-5"} />
            {:else}
              <GlobeIcon class={status.connected ? "w-5 h-5 text-green-500" : "w-5 h-5"} />
            {/if}
          </Item.Media>
          <Item.Content class="min-w-0">
            <Item.Title class="font-mono">{entry.name}</Item.Title>
            <Item.Description class="flex items-center gap-2 flex-wrap">
              <span class="text-xs truncate max-w-[28rem]">{describeSource(entry.source)}</span>
              {#if status.connected}
                <span class="flex items-center gap-1 text-green-500 text-xs">
                  <WifiIcon class="w-4 h-4" />
                  {entry.source.kind === "websocket"
                    ? `Connected · ${status.count} messages`
                    : `${status.status ?? "OK"} · ${status.count} responses`}
                </span>
              {:else}
                <span class="flex items-center gap-1 text-muted-foreground text-xs">
                  <WifiOffIcon class="w-4 h-4" />
                  {status.error ?? "Waiting…"}
                </span>
              {/if}
            </Item.Description>
          </Item.Content>
          <Item.Actions>
            <Button
              variant="ghost"
              size="icon-sm"
              onclick={() => copyPlaceholder(entry.name)}
              title="Copy Value placeholder"
            >
              <CopyIcon class="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onclick={() => refreshSource(entry.name)}
              title="Fetch again now"
            >
              <RefreshCwIcon class="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onclick={() => openEditDrawer(entry)}
              title="Edit source"
            >
              <PencilIcon class="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onclick={() => removeSource(entry.name)}
              title="Remove source"
            >
              <Trash2Icon class="w-4 h-4" />
            </Button>
          </Item.Actions>
        </Item.Root>
      {/each}
    </div>
  {/if}
</div>
