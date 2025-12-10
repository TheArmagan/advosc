<script lang="ts">
  import { Button, type ButtonProps } from "$lib/components/ui/button/index.js";
  import { cn } from "$lib/utils.js";

  interface Props
    extends Omit<
      ButtonProps,
      "onclick" | "onkeydown" | "onkeyup" | "onblur" | "onchange"
    > {
    value?: string;
    onRecord?: (accelerator: string) => void;
    placeholder?: string;
    allowEmpty?: boolean;
  }

  let {
    value = $bindable(""),
    onRecord,
    placeholder = "Click to record",
    allowEmpty = true,
    class: className,
    variant = "outline",
    size = "default",
    disabled,
    ...restProps
  }: Props = $props();

  let isRecording = $state(false);
  let currentKeys = $state<Set<string>>(new Set());
  let buttonRef = $state<HTMLButtonElement | null>(null);

  // Modifier key mappings
  const MODIFIER_MAP: Record<string, string> = {
    Control: "Ctrl",
    Meta: "Super",
    Alt: "Alt",
    Shift: "Shift",
  };

  // Key mappings for special keys
  const KEY_MAP: Record<string, string> = {
    " ": "Space",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Escape: "Esc",
    Delete: "Delete",
    Backspace: "Backspace",
    Enter: "Enter",
    Tab: "Tab",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    Insert: "Insert",
  };

  // Order for modifiers in the accelerator string
  const MODIFIER_ORDER = ["Ctrl", "Alt", "Shift", "Super"];

  function normalizeKey(key: string): string {
    // Check if it's a modifier
    if (MODIFIER_MAP[key]) {
      return MODIFIER_MAP[key];
    }
    // Check if it's a special key
    if (KEY_MAP[key]) {
      return KEY_MAP[key];
    }
    // Function keys
    if (/^F\d+$/.test(key)) {
      return key;
    }
    // Single character keys (letters, numbers)
    if (key.length === 1) {
      return key.toUpperCase();
    }
    return key;
  }

  function buildAccelerator(keys: Set<string>): string {
    const modifiers: string[] = [];
    let mainKey = "";

    for (const key of keys) {
      if (MODIFIER_ORDER.includes(key)) {
        modifiers.push(key);
      } else {
        mainKey = key;
      }
    }

    // Sort modifiers in standard order
    modifiers.sort(
      (a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b)
    );

    if (mainKey) {
      return [...modifiers, mainKey].join("+");
    }
    return modifiers.join("+");
  }

  function isOnlyModifiers(keys: Set<string>): boolean {
    return [...keys].every((key) => MODIFIER_ORDER.includes(key));
  }

  function startRecording() {
    if (disabled) return;
    isRecording = true;
    currentKeys.clear();
  }

  function stopRecording() {
    if (!isRecording) return;

    const accelerator = buildAccelerator(currentKeys);

    // Only update if we have a valid shortcut (not just modifiers)
    if (accelerator && !isOnlyModifiers(currentKeys)) {
      value = accelerator;
      onRecord?.(accelerator);
    } else if (allowEmpty && currentKeys.size === 0) {
      // Allow clearing the shortcut
      value = "";
      onRecord?.("");
    }

    isRecording = false;
    currentKeys.clear();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (!isRecording) return;

    event.preventDefault();
    event.stopPropagation();

    const key = normalizeKey(event.key);

    // Escape cancels recording without saving
    if (event.key === "Escape") {
      isRecording = false;
      currentKeys.clear();
      buttonRef?.blur();
      return;
    }

    currentKeys.add(key);
    currentKeys = new Set(currentKeys); // Trigger reactivity
  }

  function handleKeyUp(event: KeyboardEvent) {
    if (!isRecording) return;

    event.preventDefault();
    event.stopPropagation();

    const key = normalizeKey(event.key);

    // If a non-modifier key was released, finalize the shortcut
    if (!MODIFIER_ORDER.includes(key) && currentKeys.has(key)) {
      stopRecording();
      buttonRef?.blur();
    }
  }

  function handleBlur() {
    if (isRecording) {
      stopRecording();
    }
  }

  function handleClick() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  // Display value
  const displayValue = $derived(() => {
    if (isRecording) {
      const preview = buildAccelerator(currentKeys);
      return preview || "Press keys...";
    }
    return value || placeholder;
  });

  const isEmpty = $derived(!value && !isRecording);
</script>

<Button
  bind:ref={buttonRef}
  {variant}
  {size}
  {disabled}
  class={cn(
    "font-mono transition-all duration-200",
    isRecording &&
      "ring-2 ring-red-500 ring-offset-2 ring-offset-background shadow-[0_0_10px_rgba(239,68,68,0.5)] border-red-500",
    isEmpty && "text-muted-foreground",
    className
  )}
  onclick={handleClick}
  onkeydown={handleKeyDown}
  onkeyup={handleKeyUp}
  onblur={handleBlur}
  {...restProps}
>
  {displayValue()}
</Button>
