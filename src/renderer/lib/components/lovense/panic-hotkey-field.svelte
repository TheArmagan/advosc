<script lang="ts">
  import { panic } from "$lib/api/toys";
  import ShortcutRecorder from "$lib/components/shortcut-recorder.svelte";
  import { CircleCheckIcon, TriangleAlertIcon } from "@lucide/svelte";

  let {
    onRegistered,
  }: { onRegistered?: (accelerator: string) => void } = $props();

  const panicState = panic.state;

  let message = $state<{ ok: boolean; text: string } | null>(null);
  let busy = $state(false);
  // Remounts the recorder, because it keeps what it recorded even when that didn't register.
  let attempt = $state(0);

  /** A bare letter would fire while typing, and global hotkeys swallow the key everywhere. */
  function isReachable(accelerator: string) {
    const parts = accelerator.split("+");
    const key = parts[parts.length - 1];
    if (/^F\d+$/.test(key)) return true;
    return parts.some((part) => part === "Ctrl" || part === "Alt" || part === "Super");
  }

  async function record(accelerator: string) {
    message = null;

    if (!isReachable(accelerator)) {
      message = {
        ok: false,
        text: "Use Ctrl or Alt with a key, or an F key, so it can't fire while you're typing.",
      };
      attempt++;
      return;
    }

    busy = true;
    try {
      const result = await panic.setHotkey(accelerator);
      if (result.ok) {
        message = { ok: true, text: `${accelerator} is set. It works from any app, even in VR.` };
        onRegistered?.(accelerator);
      } else {
        message = {
          ok: false,
          text: result.error ?? "That hotkey didn't register. Try a different one.",
        };
        attempt++;
      }
    } catch (error) {
      message = { ok: false, text: (error as Error).message };
      attempt++;
    } finally {
      busy = false;
    }
  }
</script>

<div class="flex flex-col gap-1">
  {#key attempt}
    <ShortcutRecorder
      size="sm"
      class="h-8 w-fit min-w-40 text-xs"
      placeholder="Click, then press keys"
      title="Click to record"
      allowEmpty={false}
      disabled={busy}
      value={$panicState.hotkey}
      onRecord={record}
    />
  {/key}
  {#if message}
    <p
      role="status"
      class="flex items-start gap-1.5 text-xs {message.ok ? 'text-emerald-400' : 'text-destructive'}"
    >
      {#if message.ok}
        <CircleCheckIcon class="mt-0.5 size-3 shrink-0" />
      {:else}
        <TriangleAlertIcon class="mt-0.5 size-3 shrink-0" />
      {/if}
      {message.text}
    </p>
  {/if}
</div>
