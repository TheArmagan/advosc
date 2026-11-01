<script lang="ts" module>
  let nextId = 0;
</script>

<script lang="ts">
  import { automations } from "$lib/api/automations";
  import { chatbox } from "$lib/api/chatbox";
  import { LOVENSE_MODULE_ID } from "$lib/api/toys";
  import { toyStatus } from "$lib/api/toys/status.svelte";
  import { avatarOSC } from "$lib/api/vrc-osc";
  import TypeBadge from "$lib/components/avatar-osc/type-badge.svelte";
  import { buildParameterList, sortParameters } from "$lib/components/avatar-osc/parameter-search";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { cn } from "$lib/utils";
  import { ListIcon } from "@lucide/svelte";
  import { tick } from "svelte";
  import {
    applySuggestion,
    filterSuggestions,
    findToken,
    hasPlaceholders,
    parameterSuggestions,
    placeholderSuggestions,
    type ValueSuggestion,
    type ValueToken,
  } from "./value-suggestions";

  const PREVIEW_DEBOUNCE_MS = 300;
  /** Values like the time keep moving after you stop typing, so this repeats while you're here. */
  const PREVIEW_REFRESH_MS = 1000;
  const POPUP_GAP = 4;
  const POPUP_MIN_WIDTH = 320;
  const POPUP_MAX_HEIGHT = 256;

  let {
    label,
    value,
    placeholder = "42, /avatar/parameters/HP, [[MediaInfo:Duration]], {{Shortcut;Time}}",
    widthClass = "w-full",
    onChange,
    showHint = false,
    hint,
    preview = true,
    rawAddress = false,
    inputClass,
    ariaLabel,
  }: {
    label?: string;
    value: string;
    placeholder?: string;
    widthClass?: string;
    onChange: (value: string) => void;
    showHint?: boolean;
    hint?: string;
    preview?: boolean;
    /** The field takes a bare `/avatar/...` address, so parameters don't need wrapping. */
    rawAddress?: boolean;
    inputClass?: string;
    ariaLabel?: string;
  } = $props();

  const id = `value-picker-${nextId++}`;
  const listId = `${id}-list`;

  const placeholders = chatbox.placeholders;
  const schemaIndex = avatarOSC.schemaIndex;

  let root = $state<HTMLDivElement | null>(null);
  let input = $state<HTMLInputElement | null>(null);

  let open = $state(false);
  let browsing = $state(false);
  let token = $state<ValueToken | null>(null);
  let highlighted = $state(-1);
  let popupStyle = $state("");

  // This stream runs at 30 Hz, so a picker only listens while its list is showing.
  let parameters = $state<Record<string, number>>({});
  let changedAt = $state<Record<string, number>>({});

  $effect(() => {
    if (!open) return;
    const stopParameters = avatarOSC.parameters.subscribe((v) => (parameters = v));
    const stopChangedAt = avatarOSC.changedAt.subscribe((v) => (changedAt = v));
    return () => {
      stopParameters();
      stopChangedAt();
    };
  });

  const parameterItems = $derived(
    open
      ? sortParameters(
          buildParameterList(parameters, $schemaIndex, avatarOSC.getParameterType),
          "name",
          changedAt,
        )
      : [],
  );

  const moduleList = $derived(
    open
      ? placeholderSuggestions(
          $placeholders.filter(
            (placeholder) => toyStatus.enabled || placeholder.params[0] !== LOVENSE_MODULE_ID,
          ),
        )
      : [],
  );
  const parameterList = $derived(parameterSuggestions(parameterItems, rawAddress));

  const results = $derived(
    open ? filterSuggestions(token, moduleList, parameterList, parameterItems) : [],
  );

  const showList = $derived(open && results.length > 0);

  function firstIndexOf(group: ValueSuggestion["group"]) {
    return results.findIndex((item) => item.group === group);
  }

  function reposition() {
    if (!input) return;
    const box = input.getBoundingClientRect();
    const width = Math.max(box.width, POPUP_MIN_WIDTH);
    const left = Math.min(box.left, window.innerWidth - width - POPUP_GAP);
    const below = window.innerHeight - box.bottom - POPUP_GAP;
    const above = box.top - POPUP_GAP;
    const placeBelow = below >= POPUP_MAX_HEIGHT || below >= above;
    const height = Math.min(POPUP_MAX_HEIGHT, (placeBelow ? below : above) - POPUP_GAP);
    const vertical = placeBelow
      ? `top: ${box.bottom + POPUP_GAP}px;`
      : `bottom: ${window.innerHeight - box.top + POPUP_GAP}px;`;
    popupStyle = `${vertical} left: ${left}px; width: ${width}px; max-height: ${height}px;`;
  }

  // Fixed, so the list isn't cut off by the page's scroll area or a card edge.
  $effect(() => {
    if (!showList) return;
    reposition();
    const follow = () => reposition();
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  });

  function refreshToken() {
    const caret = input?.selectionStart ?? value.length;
    token = findToken(value, caret);
    if (token) {
      browsing = false;
      open = true;
      // A bare word could be a value on its own, so Enter shouldn't complete it unasked.
      highlighted = token.kind === "word" ? -1 : 0;
    } else if (!browsing) {
      open = false;
    }
  }

  function close() {
    open = false;
    browsing = false;
    token = null;
    highlighted = -1;
  }

  function toggleBrowse() {
    if (open && browsing) {
      close();
    } else {
      token = null;
      browsing = true;
      open = true;
      highlighted = 0;
    }
    input?.focus();
  }

  async function pick(suggestion: ValueSuggestion) {
    const caret = input?.selectionStart ?? value.length;
    const next = applySuggestion(value, caret, token, suggestion);
    close();
    onChange(next.value);
    await tick();
    input?.focus();
    input?.setSelectionRange(next.selectStart, next.selectEnd);
  }

  function scrollHighlightedIntoView() {
    root?.querySelector(`#${id}-option-${highlighted}`)?.scrollIntoView({ block: "nearest" });
  }

  function onkeydown(e: KeyboardEvent) {
    if (!showList) {
      if (e.key === "ArrowDown" && !open) {
        e.preventDefault();
        toggleBrowse();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        highlighted = Math.min(highlighted + 1, results.length - 1);
        tick().then(scrollHighlightedIntoView);
        break;
      case "ArrowUp":
        e.preventDefault();
        highlighted = Math.max(highlighted - 1, 0);
        tick().then(scrollHighlightedIntoView);
        break;
      case "Enter":
      case "Tab":
        if (highlighted >= 0 && results[highlighted]) {
          e.preventDefault();
          pick(results[highlighted]);
        } else {
          close();
        }
        break;
      case "Escape":
        // The list is what Esc is closing here, not a drawer around it.
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
    }
  }

  // ------------------------------------------------------------------ preview

  let previewText = $state<string | null>(null);
  let previewFailed = $state(false);
  let onScreen = $state(false);
  // Keeps a preview from polling while the window is minimized.
  let pageVisible = $state(!document.hidden);

  const wantsPreview = $derived(preview && hasPlaceholders(value));

  $effect(() => {
    if (!root || !preview) return;
    const observer = new IntersectionObserver(([entry]) => (onScreen = entry.isIntersecting));
    observer.observe(root);
    return () => observer.disconnect();
  });

  $effect(() => {
    if (!preview) return;
    const update = () => (pageVisible = !document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  });

  $effect(() => {
    if (!wantsPreview) {
      previewText = null;
      previewFailed = false;
      return;
    }
    if (!onScreen) return;

    const template = value;
    const repeat = pageVisible;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    async function run() {
      try {
        const result = await automations.preview(template);
        if (stopped) return;
        previewText = result;
        previewFailed = false;
      } catch {
        if (stopped) return;
        previewFailed = true;
      }
      if (repeat) timer = setTimeout(run, PREVIEW_REFRESH_MS);
    }

    timer = setTimeout(run, PREVIEW_DEBOUNCE_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  });
</script>

<div bind:this={root} class={cn("flex min-w-0 flex-col gap-0.5", widthClass)}>
  {#if label}
    <Label for={id} class="text-xs text-muted-foreground">{label}</Label>
  {/if}

  <div class="relative">
    <Input
      {id}
      bind:ref={input}
      {value}
      {placeholder}
      class={cn("pr-8", inputClass)}
      role="combobox"
      autocomplete="off"
      spellcheck={false}
      aria-label={label ? undefined : ariaLabel}
      aria-autocomplete="list"
      aria-expanded={showList}
      aria-controls={listId}
      aria-activedescendant={showList && highlighted >= 0
        ? `${id}-option-${highlighted}`
        : undefined}
      oninput={(e) => {
        onChange((e.target as HTMLInputElement).value);
        // The parent's update lands on `value` before this runs, since stores are synchronous.
        tick().then(refreshToken);
      }}
      onblur={() => setTimeout(close, 120)}
      {onkeydown}
    />
    <button
      type="button"
      class="absolute inset-y-0 right-0 flex w-8 items-center justify-center rounded-r-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      title="Browse modules and avatar parameters"
      aria-label="Browse modules and avatar parameters"
      onmousedown={(e) => e.preventDefault()}
      onclick={toggleBrowse}
    >
      <ListIcon class="size-3.5" />
    </button>

    {#if showList}
      <div
        id={listId}
        role="listbox"
        aria-label="Suggestions"
        class="fixed z-50 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
        style={popupStyle}
      >
        {#each results as item, i (item.id)}
          {#if i === firstIndexOf(item.group)}
            <div
              role="presentation"
              class="px-2 pt-1.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              {item.group}
            </div>
          {/if}
          <button
            id="{id}-option-{i}"
            type="button"
            role="option"
            tabindex={-1}
            aria-selected={i === highlighted}
            class={cn(
              "flex w-full flex-col rounded px-2 py-1 text-left",
              i === highlighted ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
            )}
            onmousedown={(e) => {
              e.preventDefault();
              pick(item);
            }}
            onmouseenter={() => (highlighted = i)}
          >
            <span class="flex w-full min-w-0 items-center gap-2">
              {#if item.group === "Avatar parameters"}
                <TypeBadge type={item.type ?? null} />
              {/if}
              <span class="truncate font-mono text-xs">{item.label}</span>
            </span>
            {#if item.detail}
              <span class="w-full truncate text-[11px] text-muted-foreground">
                {item.detail}
              </span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  {#if showHint && hint}
    <p class="text-[10px] leading-tight text-muted-foreground">{hint}</p>
  {/if}

  {#if wantsPreview}
    <p class="flex min-w-0 items-baseline gap-1 text-[11px] text-muted-foreground">
      <span class="shrink-0">Preview:</span>
      {#if previewFailed}
        <span>not available right now</span>
      {:else if previewText === null}
        <span>...</span>
      {:else if previewText === ""}
        <span class="italic">empty</span>
      {:else}
        <span class="truncate font-mono text-foreground" title={previewText}>{previewText}</span>
      {/if}
    </p>
  {/if}
</div>
