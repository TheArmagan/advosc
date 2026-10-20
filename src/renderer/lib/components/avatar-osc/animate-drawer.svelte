<script lang="ts">
  import { avatarOSC, type AnimationEase } from "$lib/api/vrc-osc";
  import * as Drawer from "$lib/components/ui/drawer/index.js";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { PlayIcon, SquareIcon } from "@lucide/svelte";
  import { toast } from "svelte-sonner";
  import { untrack } from "svelte";

  let { open = $bindable(false), address }: { open?: boolean; address: string } = $props();

  const parameters = avatarOSC.parameters;
  const animations = avatarOSC.animations;

  const EASES: { value: AnimationEase; label: string }[] = [
    { value: "none", label: "Linear" },
    { value: "sine.inOut", label: "Sine" },
    { value: "power1.inOut", label: "Smooth" },
    { value: "power2.inOut", label: "Smoother" },
    { value: "power3.inOut", label: "Smoothest" },
    { value: "bounce.inOut", label: "Bounce" },
    { value: "elastic.out", label: "Elastic" },
  ];

  let from = $state(0);
  let to = $state(1);
  let duration = $state(1);
  let repeat = $state(0);
  let forever = $state(false);
  let yoyo = $state(false);
  let ease = $state<AnimationEase>("none");

  const running = $derived(!!$animations[address]);
  const type = $derived(avatarOSC.getParameterType(address));

  // Prefill from the running animation, or from the current value.
  // Only reruns when the drawer opens, so live values don't overwrite what you type.
  $effect(() => {
    if (!open) return;
    const target = address;
    untrack(() => {
      const existing = $animations[target];
      if (existing) {
        ({ from, to, duration, yoyo, ease } = existing);
        forever = existing.repeat === -1;
        repeat = forever ? 0 : existing.repeat;
        return;
      }
      const current = $parameters[target] ?? 0;
      from = current;
      to = type === "Int" ? Math.round(current) : current >= 0.5 ? 0 : 1;
    });
  });

  function start() {
    avatarOSC.animate({
      address,
      from: Number(from) || 0,
      to: Number(to) || 0,
      duration: Number(duration) || 1,
      repeat: forever ? -1 : Math.max(0, Math.floor(Number(repeat) || 0)),
      yoyo,
      ease,
    });
    toast.success("Animation started");
    open = false;
  }
</script>

<Drawer.Root bind:open>
  <Drawer.Content class="flex items-center justify-center">
    <div class="flex w-96 flex-col gap-4 p-4">
      <Drawer.Header class="flex flex-col items-center gap-2">
        <Drawer.Title class="text-center">Animate parameter</Drawer.Title>
        <Drawer.Description>
          <span class="rounded bg-muted px-2 py-1 font-mono text-xs">{address}</span>
        </Drawer.Description>
      </Drawer.Header>

      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-1">
          <Label>From</Label>
          <InputGroup.Root>
            <InputGroup.Input type="number" step={type === "Int" ? 1 : 0.01} bind:value={from} />
            <InputGroup.Addon align="inline-end">
              <InputGroup.Button onclick={() => (from = $parameters[address] ?? 0)}>Now</InputGroup.Button>
            </InputGroup.Addon>
          </InputGroup.Root>
        </div>
        <div class="flex flex-col gap-1">
          <Label>To</Label>
          <InputGroup.Root>
            <InputGroup.Input type="number" step={type === "Int" ? 1 : 0.01} bind:value={to} />
            <InputGroup.Addon align="inline-end">
              <InputGroup.Button onclick={() => (to = $parameters[address] ?? 0)}>Now</InputGroup.Button>
            </InputGroup.Addon>
          </InputGroup.Root>
        </div>
        <div class="flex flex-col gap-1">
          <Label>Duration (seconds)</Label>
          <InputGroup.Root>
            <InputGroup.Input type="number" step="0.1" min="0.05" bind:value={duration} />
          </InputGroup.Root>
        </div>
        <div class="flex flex-col gap-1">
          <Label>Ease</Label>
          <Select.Root type="single" value={ease} onValueChange={(v) => (ease = v as AnimationEase)}>
            <Select.Trigger class="w-full">
              {EASES.find((e) => e.value === ease)?.label}
            </Select.Trigger>
            <Select.Content>
              {#each EASES as e (e.value)}
                <Select.Item value={e.value}>{e.label}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <div class="flex flex-col gap-1">
          <Label>Repeat</Label>
          <InputGroup.Root>
            <InputGroup.Input type="number" step="1" min="0" disabled={forever} bind:value={repeat} />
          </InputGroup.Root>
        </div>
        <div class="flex flex-col justify-end gap-2 pb-1">
          <div class="flex items-center gap-2">
            <Checkbox id="anim-forever" checked={forever} onCheckedChange={(v) => (forever = v)} />
            <Label for="anim-forever">Loop forever</Label>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox id="anim-yoyo" checked={yoyo} onCheckedChange={(v) => (yoyo = v)} />
            <Label for="anim-yoyo">Go back and forth</Label>
          </div>
        </div>
      </div>

      <Drawer.Footer class="flex flex-row items-center justify-between px-0">
        <div class="flex items-center gap-2">
          <Button
            variant="destructive"
            disabled={!running}
            onclick={() => {
              avatarOSC.stopAnimation(address);
              toast.success("Animation stopped");
              open = false;
            }}
          >
            <SquareIcon /> Stop
          </Button>
          <Button onclick={start}>
            <PlayIcon />
            {running ? "Restart" : "Start"}
          </Button>
        </div>
        <Drawer.Close>
          {#snippet child({ props })}
            <Button {...props} variant="outline">Close</Button>
          {/snippet}
        </Drawer.Close>
      </Drawer.Footer>
    </div>
  </Drawer.Content>
</Drawer.Root>
