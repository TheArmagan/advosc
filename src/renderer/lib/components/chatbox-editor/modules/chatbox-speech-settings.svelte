<script lang="ts">
  import type { ChatboxSpeechModule } from "$lib/api/chatbox/modules/chatbox-speech-module";
  import {
    recognitionLanguages,
    translationLanguages,
  } from "$lib/api/chatbox/modules/speech/languages";
  import {
    getProviderInfo,
    translationProviders,
    type TranslationProviderId,
  } from "$lib/api/chatbox/modules/speech/translate";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Textarea } from "$lib/components/ui/textarea/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as Item from "$lib/components/ui/item/index.js";
  import {
    CopyIcon,
    ExternalLinkIcon,
    LanguagesIcon,
    MicIcon,
    MicOffIcon,
    PlayIcon,
    SquareIcon,
    Trash2Icon,
  } from "@lucide/svelte";
  import { toast } from "svelte-sonner";
  import { onMount } from "svelte";

  const {
    module,
  }: {
    module: ChatboxSpeechModule;
  } = $props();

  const values = module.values;
  const live = module.live;

  let language = $state("en-US");
  let port = $state(7274);
  let autoStart = $state(true);
  let interimResults = $state(true);
  let clearAfterSeconds = $state(15);
  let clearWhenMuted = $state(false);
  let sentenceCount = $state(1);
  let maxLength = $state(0);

  let translationEnabled = $state(false);
  let provider = $state<TranslationProviderId>("google");
  let targetLanguage = $state("en");
  let sourceLanguage = $state("");
  let translateInterim = $state(false);
  let apiKey = $state("");
  let model = $state("");
  let instructions = $state("");

  let testInput = $state("");
  let testOutput = $state("");
  let testing = $state(false);

  const providerInfo = $derived(getProviderInfo(provider));

  function loadSettings() {
    language = module.getLanguage();
    port = module.getPort();
    autoStart = module.getAutoStart();
    interimResults = module.getInterimResults();
    clearAfterSeconds = module.getClearAfterSeconds();
    clearWhenMuted = module.getClearWhenMuted();
    sentenceCount = module.getSentenceCount();
    maxLength = module.getMaxLength();

    const translation = module.getTranslation();
    translationEnabled = translation.enabled;
    provider = translation.provider;
    targetLanguage = translation.targetLanguage;
    sourceLanguage = translation.sourceLanguage;
    translateInterim = translation.translateInterim;
    apiKey = translation.keys[translation.provider] || "";
    model = translation.models[translation.provider] || getProviderInfo(translation.provider).defaultModel || "";
    instructions = translation.instructions;
  }

  async function startServer() {
    const result = await module.startServer();
    if (result.success) {
      toast.success("Speech server started. Open the page in Chrome to start talking.");
      port = module.getPort();
    } else {
      toast.error("Could not start the speech server: " + (result.error ?? "unknown error"));
    }
  }

  async function stopServer() {
    await module.stopServer();
    toast.success("Speech server stopped.");
  }

  async function openPage() {
    const result = await module.openPage();
    if (!result.success) {
      toast.error(result.error ?? "Could not open the page.");
    }
  }

  function copyUrl() {
    const url = $live.serverUrl;
    if (!url) {
      toast.error("Start the server first.");
      return;
    }
    navigator.clipboard.writeText(url);
    toast.success("Page address copied. Paste it into Chrome.");
  }

  function copyPlaceholder(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Placeholder copied to clipboard!");
  }

  function applyPort(raw: string) {
    const next = parseInt(raw);
    if (!isFinite(next)) return;
    module.setPort(next);
    port = module.getPort();
    if ($live.serverRunning) {
      toast.info("Restart the server for the new port to take effect.");
    }
  }

  function changeProvider(next: TranslationProviderId) {
    provider = next;
    const translation = module.getTranslation();
    apiKey = translation.keys[next] || "";
    model = translation.models[next] || getProviderInfo(next).defaultModel || "";
    module.setTranslation({ provider: next });
  }

  async function runTest() {
    const text = testInput.trim();
    if (!text) {
      toast.error("Type something to translate first.");
      return;
    }
    testing = true;
    testOutput = "";
    try {
      testOutput = await module.translateText(text);
    } catch (error) {
      testOutput = "";
      toast.error("Translation failed: " + ((error as Error)?.message ?? String(error)));
    } finally {
      testing = false;
    }
  }

  onMount(() => {
    loadSettings();
    const unsubscribe = values.subscribe(() => loadSettings());
    return () => unsubscribe();
  });
</script>

<div class="flex flex-col gap-4 items-start justify-start w-full">
  <!-- Server + page status -->
  <Item.Root class="w-full">
    <Item.Media>
      {#if $live.listening}
        <MicIcon class="w-5 h-5 text-green-500 animate-pulse" />
      {:else}
        <MicOffIcon class="w-5 h-5" />
      {/if}
    </Item.Media>
    <Item.Content>
      <Item.Title>
        {#if !$live.serverRunning}
          Speech server is stopped
        {:else if !$live.pageConnected}
          Waiting for the browser page
        {:else if clearWhenMuted && $live.muted}
          Paused, you are muted in VRChat
        {:else if $live.listening}
          Listening
        {:else}
          Page connected, mic is off
        {/if}
      </Item.Title>
      <Item.Description class="text-xs">
        {#if !$live.serverRunning}
          Start the server, then open the page in Chrome and allow the microphone.
        {:else if !$live.pageConnected}
          Open the page in Chrome. Recognition runs there, because Electron has no Web Speech API.
        {:else}
          Keep the tab open while you use the chatbox. Closing it stops recognition.
        {/if}
      </Item.Description>
    </Item.Content>
    <Item.Actions>
      {#if $live.serverRunning}
        <Button variant="outline" size="sm" onclick={openPage}>
          <ExternalLinkIcon class="w-4 h-4" />
          Open Page
        </Button>
        <Button variant="ghost" size="icon-sm" onclick={copyUrl} title="Copy the page address">
          <CopyIcon class="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" onclick={stopServer}>
          <SquareIcon class="w-4 h-4" />
          Stop
        </Button>
      {:else}
        <Button size="sm" onclick={startServer}>
          <PlayIcon class="w-4 h-4" />
          Start Server
        </Button>
      {/if}
    </Item.Actions>
  </Item.Root>

  {#if $live.pageError}
    <div class="text-sm text-amber-500 w-full">{$live.pageError}</div>
  {/if}

  <!-- Live transcript -->
  <div class="w-full rounded-md border bg-muted/30 p-3 flex flex-col gap-1 min-h-24">
    <div class="text-xs text-muted-foreground flex items-center gap-2">
      <span>Live transcript</span>
      {#if $live.translating}
        <span class="text-sky-500">translating…</span>
      {/if}
      <Button
        variant="ghost"
        size="icon-sm"
        class="ml-auto"
        onclick={() => module.clearTranscript()}
        title="Clear the current text"
      >
        <Trash2Icon class="w-4 h-4" />
      </Button>
    </div>
    {#if $live.finals.length || $live.interim}
      <div class="text-sm">
        {$live.finals.join(" ")}
        {#if $live.interim}
          <span class="text-muted-foreground">{$live.interim}</span>
        {/if}
      </div>
      {#if translationEnabled && $live.translatedText}
        <div class="text-sm text-sky-500 flex items-start gap-2">
          <LanguagesIcon class="w-4 h-4 mt-0.5 shrink-0" />
          <span>{$live.translatedText}</span>
        </div>
      {/if}
    {:else}
      <div class="text-sm text-muted-foreground italic">
        Nothing heard yet. Anything you say on the browser page shows up here.
      </div>
    {/if}
  </div>

  <!-- Recognition settings -->
  <div class="flex flex-wrap gap-4 w-full">
    <div class="flex flex-col gap-2 w-64">
      <Label>Recognition Language</Label>
      <Select.Root
        type="single"
        value={language}
        onValueChange={(v) => {
          if (!v) return;
          language = v;
          module.setLanguage(v);
        }}
      >
        <Select.Trigger class="w-full">
          {recognitionLanguages.find((l) => l.tag === language)?.label ?? language}
        </Select.Trigger>
        <Select.Content>
          {#each recognitionLanguages as entry (entry.tag)}
            <Select.Item value={entry.tag}>{entry.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    </div>

    <div class="flex flex-col gap-2 w-32">
      <Label>Server Port</Label>
      <Input
        type="number"
        min="1024"
        max="65535"
        value={port}
        onchange={(e: Event) => applyPort((e.target as HTMLInputElement).value)}
      />
    </div>

    <div class="flex flex-col gap-2 w-40">
      <Label>Clear After (seconds)</Label>
      <Input
        type="number"
        min="0"
        max="600"
        value={clearAfterSeconds}
        onchange={(e: Event) => {
          const next = parseInt((e.target as HTMLInputElement).value);
          if (!isFinite(next)) return;
          module.setClearAfterSeconds(next);
        }}
      />
    </div>

    <div class="flex flex-col gap-2 w-32">
      <Label>Sentences Kept</Label>
      <Input
        type="number"
        min="1"
        max="10"
        value={sentenceCount}
        onchange={(e: Event) => {
          const next = parseInt((e.target as HTMLInputElement).value);
          if (!isFinite(next)) return;
          module.setSentenceCount(next);
        }}
      />
    </div>

    <div class="flex flex-col gap-2 w-36">
      <Label>Max Characters</Label>
      <Input
        type="number"
        min="0"
        max="4096"
        value={maxLength}
        onchange={(e: Event) => {
          const next = parseInt((e.target as HTMLInputElement).value);
          if (!isFinite(next)) return;
          module.setMaxLength(next);
        }}
      />
    </div>
  </div>

  <div class="flex flex-col gap-2 w-full">
    <div class="flex items-center gap-2">
      <Checkbox
        checked={interimResults}
        onCheckedChange={(checked) => {
          interimResults = !!checked;
          module.setInterimResults(!!checked);
        }}
      />
      <span class="text-sm">Show words while they are still being spoken</span>
    </div>
    <div class="flex items-center gap-2">
      <Checkbox
        checked={clearWhenMuted}
        onCheckedChange={(checked) => {
          clearWhenMuted = !!checked;
          module.setClearWhenMuted(!!checked);
        }}
      />
      <span class="text-sm">
        Clear and stop capturing while muted in VRChat
        <span class="text-muted-foreground">
          (follows MuteSelf, and reopens the mic when you unmute)
        </span>
      </span>
    </div>
    <div class="flex items-center gap-2">
      <Checkbox
        checked={autoStart}
        onCheckedChange={(checked) => {
          autoStart = !!checked;
          module.setAutoStart(!!checked);
        }}
      />
      <span class="text-sm">Start the speech server when ADVOSC opens</span>
    </div>
  </div>

  <!-- Translation -->
  <div class="w-full border-t pt-4 flex flex-col gap-4">
    <div class="flex items-center gap-2">
      <Checkbox
        checked={translationEnabled}
        onCheckedChange={(checked) => {
          translationEnabled = !!checked;
          module.setTranslation({ enabled: !!checked });
        }}
      />
      <span class="text-sm font-medium">Translate what I say</span>
    </div>

    {#if translationEnabled}
      <div class="flex flex-wrap gap-4 w-full">
        <div class="flex flex-col gap-2 w-52">
          <Label>Provider</Label>
          <Select.Root
            type="single"
            value={provider}
            onValueChange={(v) => v && changeProvider(v as TranslationProviderId)}
          >
            <Select.Trigger class="w-full">{providerInfo.name}</Select.Trigger>
            <Select.Content>
              {#each translationProviders as entry (entry.id)}
                <Select.Item value={entry.id}>{entry.name}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>

        <div class="flex flex-col gap-2 w-52">
          <Label>Translate Into</Label>
          <Select.Root
            type="single"
            value={targetLanguage}
            onValueChange={(v) => {
              if (!v) return;
              targetLanguage = v;
              module.setTranslation({ targetLanguage: v });
            }}
          >
            <Select.Trigger class="w-full">
              {translationLanguages.find((l) => l.code === targetLanguage)?.label ?? targetLanguage}
            </Select.Trigger>
            <Select.Content>
              {#each translationLanguages as entry (entry.code)}
                <Select.Item value={entry.code}>{entry.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>

        <div class="flex flex-col gap-2 w-52">
          <Label>Source Language</Label>
          <Select.Root
            type="single"
            value={sourceLanguage}
            onValueChange={(v) => {
              sourceLanguage = v ?? "";
              module.setTranslation({ sourceLanguage: v ?? "" });
            }}
          >
            <Select.Trigger class="w-full">
              {sourceLanguage === ""
                ? "Match recognition"
                : sourceLanguage === "auto"
                  ? "Detect automatically"
                  : (translationLanguages.find((l) => l.code === sourceLanguage)?.label ?? sourceLanguage)}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="">Match recognition</Select.Item>
              <Select.Item value="auto">Detect automatically</Select.Item>
              {#each translationLanguages as entry (entry.code)}
                <Select.Item value={entry.code}>{entry.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      </div>

      <div class="text-xs text-muted-foreground">{providerInfo.description}</div>

      <div class="flex flex-wrap gap-4 w-full">
        {#if providerInfo.needsApiKey || provider === "google"}
          <div class="flex flex-col gap-2 flex-1 min-w-64">
            <Label>
              API Key
              {#if !providerInfo.needsApiKey}
                <span class="text-muted-foreground font-normal">(optional)</span>
              {/if}
            </Label>
            <Input
              type="password"
              value={apiKey}
              placeholder={providerInfo.needsApiKey ? "Required" : "Leave empty to use the free endpoint"}
              onchange={(e: Event) => {
                apiKey = (e.target as HTMLInputElement).value;
                module.setTranslationKey(provider, apiKey);
              }}
            />
          </div>
        {/if}

        {#if providerInfo.needsModel}
          <div class="flex flex-col gap-2 flex-1 min-w-64">
            <Label>Model</Label>
            <Input
              value={model}
              placeholder={providerInfo.defaultModel}
              onchange={(e: Event) => {
                model = (e.target as HTMLInputElement).value;
                module.setTranslationModel(provider, model);
              }}
            />
          </div>
        {/if}
      </div>

      {#if providerInfo.needsModel}
        <div class="flex flex-col gap-2 w-full">
          <Label>Extra Instructions <span class="text-muted-foreground font-normal">(optional)</span></Label>
          <Textarea
            value={instructions}
            rows={2}
            placeholder="For example: keep it casual, and leave game names in English."
            onchange={(e: Event) => {
              instructions = (e.target as HTMLTextAreaElement).value;
              module.setTranslation({ instructions });
            }}
          />
        </div>
      {/if}

      <div class="flex items-center gap-2">
        <Checkbox
          checked={translateInterim}
          onCheckedChange={(checked) => {
            translateInterim = !!checked;
            module.setTranslation({ translateInterim: !!checked });
          }}
        />
        <span class="text-sm">
          Translate while I am still talking
          <span class="text-muted-foreground">(much faster on screen, many more API calls)</span>
        </span>
      </div>

      <div class="flex gap-2 w-full items-end">
        <div class="flex flex-col gap-2 flex-1">
          <Label>Test Translation</Label>
          <Input
            bind:value={testInput}
            placeholder="Type a sentence to check your provider setup"
            onkeydown={(e: KeyboardEvent) => {
              if (e.key === "Enter") runTest();
            }}
          />
        </div>
        <Button variant="outline" onclick={runTest} disabled={testing}>
          <LanguagesIcon class={testing ? "animate-pulse" : ""} />
          Translate
        </Button>
      </div>
      {#if testOutput}
        <div class="text-sm text-sky-500 -mt-2">{testOutput}</div>
      {/if}
    {/if}
  </div>

  <div class="text-xs text-muted-foreground mt-2 p-3 bg-muted/30 rounded-md w-full">
    <p class="font-medium mb-1">How it works:</p>
    <p class="mb-2">
      Electron has no speech recognition of its own, so ADVOSC serves a small page on your own
      machine and Chrome does the listening. Start the server, open the page, allow the mic, and
      whatever you say lands in these placeholders.
    </p>
    <p class="font-medium mb-1">Usage:</p>
    <ul class="list-disc list-inside space-y-0.5">
      <li>
        <code class="bg-muted px-1 rounded">{"{{Speech;Text}}"}</code> - What you are saying right now
      </li>
      <li>
        <code class="bg-muted px-1 rounded">{"{{Speech;Translated}}"}</code> - The translation of it
      </li>
      <li>
        <code class="bg-muted px-1 rounded">{"{{Speech;Both; | }}"}</code> - Both, separated by ' | '
      </li>
      <li>
        <code class="bg-muted px-1 rounded">{"{{Expr;[[Speech:HasText]]=='true';🎤 [[Speech:Text]]}}"}</code>
        - Only show the line while there is speech
      </li>
    </ul>
    <div class="flex gap-2 mt-2">
      <Button variant="ghost" size="sm" onclick={() => copyPlaceholder("{{Speech;Text}}")}>
        <CopyIcon class="w-4 h-4" />
        Copy Text placeholder
      </Button>
      <Button variant="ghost" size="sm" onclick={() => copyPlaceholder("{{Speech;Both; | }}")}>
        <CopyIcon class="w-4 h-4" />
        Copy Both placeholder
      </Button>
    </div>
  </div>
</div>
