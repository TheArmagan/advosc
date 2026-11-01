<script lang="ts">
  import { backup, type BackupEntry, type BackupResult } from "$lib/api/backup";
  import ConfirmDrawer from "$lib/components/confirm-drawer.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import {
    DownloadIcon,
    HistoryIcon,
    RotateCcwIcon,
    UploadIcon,
  } from "@lucide/svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  type PendingAction = {
    title: string;
    description: string;
    confirmLabel: string;
    run: () => Promise<BackupResult>;
  };

  const restartNeeded = backup.restartNeeded;

  let entries = $state<BackupEntry[]>([]);
  let loading = $state(true);
  let loadFailed = $state(false);
  let busy = $state(false);
  let pending = $state<PendingAction | null>(null);
  let confirmOpen = $state(false);

  /** The engine lists these with the daily ones, but they're a different thing to go back to. */
  const SAFETY_LABELS: [prefix: string, label: string][] = [
    ["before-restore-", "Before a restore"],
    ["before-reimport-", "Before a re-import"],
  ];

  function safetyLabel(entry: BackupEntry) {
    return SAFETY_LABELS.find(([prefix]) => entry.name.startsWith(prefix))?.[1];
  }

  const daily = $derived(entries.filter((entry) => !safetyLabel(entry)));
  const safetyCopies = $derived(entries.filter((entry) => safetyLabel(entry)));

  // Nothing saves between a restore and the restart, so starting another one here would be lost.
  const locked = $derived(busy || $restartNeeded);

  async function loadEntries() {
    loading = true;
    try {
      entries = await backup.list();
      loadFailed = false;
    } catch {
      loadFailed = true;
    } finally {
      loading = false;
    }
  }

  onMount(loadEntries);

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function run(action: () => Promise<BackupResult>, doneMessage: string) {
    busy = true;
    try {
      const result = await action();
      if (result.cancelled) return;
      if (!result.ok) {
        toast.error(result.error ?? "That didn't work.");
        return;
      }
      if (result.restartNeeded) {
        restartNeeded.set(true);
        return;
      }
      toast.success(doneMessage);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      busy = false;
    }
  }

  function askFirst(action: PendingAction) {
    pending = action;
    confirmOpen = true;
  }

  async function confirm() {
    const action = pending;
    confirmOpen = false;
    if (action) await run(action.run, "Done.");
  }

  function restoreFromFile() {
    askFirst({
      title: "Restore from a file?",
      description:
        "You'll pick a backup file next. It replaces everything in ADVOSC. Your current data is kept as a backup first.",
      confirmLabel: "Choose file",
      run: backup.restoreFile,
    });
  }

  function restoreDaily(entry: BackupEntry) {
    askFirst({
      title: `Restore the backup from ${entry.date}?`,
      description:
        "This replaces everything in ADVOSC with that backup. Your current data is kept as a safety copy first.",
      confirmLabel: "Restore",
      run: () => backup.restoreDaily(entry.name),
    });
  }

  function reimportLegacy() {
    askFirst({
      title: "Re-import from the old version?",
      description:
        "ADVOSC copies your data from the old version again the next time it starts. That replaces everything here now, and your current data is kept as a safety copy first.",
      confirmLabel: "Re-import",
      run: backup.reimportLegacy,
    });
  }
</script>

{#snippet backupRow(entry: BackupEntry, label?: string)}
  <Card.Root class="flex-row items-center gap-3 px-3 py-2">
    <span class="min-w-0 flex-1 truncate text-sm">
      {entry.date}
      {#if label}
        <span class="ml-1 text-xs text-muted-foreground">{label}</span>
      {/if}
    </span>
    <span class="shrink-0 text-xs text-muted-foreground">{formatSize(entry.sizeBytes)}</span>
    <Button
      variant="outline"
      size="sm"
      class="h-7"
      disabled={locked}
      onclick={() => restoreDaily(entry)}
    >
      Restore
    </Button>
  </Card.Root>
{/snippet}

<div class="flex flex-col gap-4 p-2">
  {#if $restartNeeded}
    <div
      role="status"
      class="flex items-center gap-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-400"
    >
      <span class="min-w-0 flex-1">
        Restart ADVOSC to finish this. Nothing you change now gets saved until you do.
      </span>
      <Button variant="outline" size="sm" onclick={() => window.ADVOSCNative.startup.restart()}>
        <RotateCcwIcon class="size-4" />
        Restart
      </Button>
    </div>
  {/if}

  <Card.Root class="gap-3 p-3">
    <div class="flex flex-col gap-1">
      <span class="text-sm font-medium">Backup file</span>
      <span class="text-xs text-muted-foreground">
        A full copy of your ADVOSC data. It includes saved keys and passwords, so keep the file
        private.
      </span>
    </div>
    <div class="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={locked}
        onclick={() => run(backup.exportFile, "Backup saved.")}
      >
        <DownloadIcon class="size-4" />
        Export to file
      </Button>
      <Button variant="outline" size="sm" disabled={locked} onclick={restoreFromFile}>
        <UploadIcon class="size-4" />
        Restore from file
      </Button>
    </div>
  </Card.Root>

  <section class="flex flex-col gap-2">
    <div class="flex flex-col">
      <span class="text-sm font-medium">Daily backups</span>
      <span class="text-xs text-muted-foreground">
        ADVOSC keeps one a day for the last 7 days.
      </span>
    </div>

    {#if loading}
      <p class="py-4 text-center text-sm text-muted-foreground">Loading backups...</p>
    {:else if loadFailed}
      <p class="py-4 text-center text-sm text-muted-foreground">
        The backup list isn't available right now.
      </p>
    {:else if daily.length === 0}
      <div class="flex flex-col items-center gap-2 py-6 text-muted-foreground">
        <HistoryIcon class="size-8 opacity-30" />
        <p class="text-sm">No daily backups yet. The first one is made after a day of use.</p>
      </div>
    {/if}

    {#each daily as entry (entry.name)}
      {@render backupRow(entry)}
    {/each}
  </section>

  {#if safetyCopies.length}
    <section class="flex flex-col gap-2">
      <div class="flex flex-col">
        <span class="text-sm font-medium">Safety copies</span>
        <span class="text-xs text-muted-foreground">
          Saved right before a restore or re-import replaced your data.
        </span>
      </div>

      {#each safetyCopies as entry (entry.name)}
        {@render backupRow(entry, safetyLabel(entry))}
      {/each}
    </section>
  {/if}

  <Card.Root class="gap-3 p-3">
    <div class="flex flex-col gap-1">
      <span class="text-sm font-medium">Old version data</span>
      <span class="text-xs text-muted-foreground">
        ADVOSC copied your data over when you updated to this version. If something went missing,
        you can run that copy again.
      </span>
    </div>
    <div>
      <Button variant="outline" size="sm" disabled={locked} onclick={reimportLegacy}>
        <HistoryIcon class="size-4" />
        Re-import from old version
      </Button>
    </div>
  </Card.Root>
</div>

{#if pending}
  <ConfirmDrawer
    bind:open={confirmOpen}
    title={pending.title}
    description={pending.description}
    confirmLabel={pending.confirmLabel}
    {busy}
    onConfirm={confirm}
  />
{/if}
