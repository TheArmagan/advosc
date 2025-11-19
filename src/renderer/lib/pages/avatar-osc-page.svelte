<script lang="ts">
  import { avatarOSC } from "$lib/api/vrc-osc";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import * as Item from "$lib/components/ui/item/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Progress } from "$lib/components/ui/progress/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import {
    EqualIcon,
    FastForwardIcon,
    LinkIcon,
    LockIcon,
    LockOpenIcon,
    PlayIcon,
    RotateCcwIcon,
    SearchIcon,
    SquareIcon,
    UnlinkIcon,
  } from "@lucide/svelte";
  import * as Select from "$lib/components/ui/select/index.js";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import gsap from "gsap";
  import * as Drawer from "$lib/components/ui/drawer/index.js";

  const schema = avatarOSC.schema;
  const parameters = avatarOSC.parameters;
  const lockedParameterAddresses = avatarOSC.lockedParameterAddresses;

  let inputParameters = $state<Record<string, number>>({});

  let showOnlyDefined = $state(false);
  let searchQuery = $state("");

  let selectedRawInputType = $state<"listed" | "direct">("listed");
  let rawInputAddress = $state("");
  let rawInputValue = $state("0");

  let gsapTimelines = $state<Record<string, GSAPTimeline | undefined>>({});
  let targetTimelineData = $state({
    drawerOpen: false,
    address: "",
    from: 0,
    to: 0,
    duration: 1,
    repeat: 0,
    ease: "none" as
      | "none"
      | "power1.inOut"
      | "power2.inOut"
      | "power3.inOut"
      | "bounce.inOut",
    yoyo: false,
  });

  let linkedParameters = $state<Record<string, string>>({});
  let targetLinkedParameter = $state({
    drawerOpen: false,
    fromAddress: "",
    toAddress: "",
  });

  onMount(() => {
    inputParameters = { ...$parameters };

    const unsubParams = avatarOSC.onParameterChange((address, value) => {
      if (linkedParameters[address]) {
        const linkedAddress = linkedParameters[address];
        inputParameters[linkedAddress] = value;
        avatarOSC.setParameter(linkedAddress, value, false);
      }
    });

    return () => {
      unsubParams();
      // Cleanup GSAP timelines on unmount
      Object.values(gsapTimelines).forEach((tl) => tl?.kill());
    };
  });
</script>

<!-- <pre>{JSON.stringify($schema, null, 2)}</pre>
<pre>{JSON.stringify($parameters, null, 2)}</pre> -->

<div class="p-4 w-full">
  <Tabs.Root
    value="parameters"
    onValueChange={(v) => {
      if (v === "input") {
        selectedRawInputType = $schema?.parameters?.length
          ? "listed"
          : "direct";
      }
    }}
  >
    <div class="flex items-centet gap-2 justify-between">
      <Tabs.List>
        <Tabs.Trigger value="parameters">Parameters</Tabs.Trigger>
        <Tabs.Trigger value="schema">Schema</Tabs.Trigger>
        <Tabs.Trigger value="input">Input</Tabs.Trigger>
      </Tabs.List>

      <div class="flex items-center">
        <Tabs.Content value="parameters" class="flex items-center gap-2">
          <div class="flex items-center gap-2">
            <Label
              for="only-show-valid-names"
              class="text-xs text-muted-foreground"
            >
              Show Only Defined Names
            </Label>
            <Checkbox
              id="only-show-valid-names"
              checked={showOnlyDefined}
              onCheckedChange={(v) => (showOnlyDefined = v)}
            />
          </div>
          <div class="flex items-center gap-2">
            <InputGroup.Root>
              <InputGroup.Input
                placeholder="Search..."
                bind:value={searchQuery}
              />
              <InputGroup.Addon>
                <SearchIcon />
              </InputGroup.Addon>
            </InputGroup.Root>
          </div>
        </Tabs.Content>
        <Tabs.Content value="schema">
          <Button
            variant="outline"
            size="sm"
            onclick={() => {
              avatarOSC.updateOSCSchema();
              toast.success("Schema Refreshed");
            }}
          >
            Refresh Schema
          </Button>
          <Button
            variant="outline"
            size="sm"
            onclick={() => {
              navigator.clipboard.writeText(
                JSON.stringify($schema, null, 2) || ""
              );
              toast.success("Schema Copied to Clipboard");
            }}
          >
            Copy to Clipboard
          </Button>
        </Tabs.Content>
        <Tabs.Content value="input">
          <Button
            variant="outline"
            size="sm"
            onclick={() => {
              avatarOSC.updateOSCSchema();
              selectedRawInputType = $schema?.parameters?.length
                ? "listed"
                : "direct";
              toast.success("Schema Refreshed");
            }}
          >
            Refresh Schema
          </Button>
        </Tabs.Content>
      </div>
    </div>
    <Tabs.Content value="parameters" class="flex flex-col gap-1">
      <Card.Root class="p-1 bg-transparent border">
        <div class="flex flex-col gap-1">
          {#each Object.entries($parameters) as [key, paramValue]}
            {@const keyCleaned = key.replace("/avatar/parameters/", "")}
            {@const paramSchema = $schema?.parameters.find((i) => {
              return (
                i.input?.address.includes(keyCleaned) ||
                i.output?.address.includes(keyCleaned)
              );
            })}
            {@const displayName = paramSchema?.name || keyCleaned}
            {@const type = avatarOSC.getParameterType(key) || "Unk"}
            {@const matchesSearch =
              searchQuery.trim().length === 0 ||
              displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
              keyCleaned.toLowerCase().includes(searchQuery.toLowerCase()) ||
              searchQuery === type}

            {#if matchesSearch && (showOnlyDefined ? !!paramSchema?.name : true)}
              <Item.Root
                class="p-2 border rounded-md {$lockedParameterAddresses.includes(
                  key
                )
                  ? 'border border-red-500'
                  : ''} {gsapTimelines[key]
                  ? 'bg-green-500/10'
                  : ''} {linkedParameters[key]
                  ? 'border border-orange-500'
                  : ''}"
                variant="muted"
              >
                <div class="flex justify-between items-center w-full">
                  <div class="flex flex-col gap-2">
                    <div class="flex items-center gap-2">
                      <div class="px-2 py-1 border w-12 text-center rounded">
                        {type}
                      </div>
                      <div class="font-medium">
                        {displayName}
                      </div>
                      {#if displayName != keyCleaned}
                        <div
                          class="font-mono text-xs bg-black/50 px-2 py-1 rounded text-foreground/70 truncate"
                        >
                          {keyCleaned}
                        </div>
                      {/if}
                    </div>
                    <div
                      class="text-sm text-muted-foreground flex-col flex gap-1 w-[200px]"
                    >
                      <Progress
                        value={type !== "Int" ? paramValue * 255 : paramValue}
                        min={0}
                        max={255}
                        transitionDuration={50}
                      />
                      <span
                        class="font-mono text-xs bg-black/50 px-2 py-1 rounded w-full truncate"
                      >
                        {paramValue}
                      </span>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <InputGroup.Root>
                      {#if type === "Bool"}
                        <Checkbox
                          checked={inputParameters[key] === 1}
                          onCheckedChange={(v) => {
                            inputParameters[key] = v ? 1 : 0;
                          }}
                        />
                      {:else if type === "Int"}
                        <InputGroup.Input
                          type="number"
                          min="0"
                          max="255"
                          step="1"
                          class="w-24 text-xs font-mono text-center"
                          bind:value={inputParameters[key]}
                        />
                      {:else}
                        <InputGroup.Input
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          class="w-24 text-xs font-mono text-center"
                          bind:value={inputParameters[key]}
                        />
                      {/if}
                      <InputGroup.Addon align="inline-start">
                        <InputGroup.Button
                          onclick={() => {
                            inputParameters[key] = $parameters[key];
                            toast.success("Parameter Refreshed");
                          }}>Refresh</InputGroup.Button
                        >
                      </InputGroup.Addon>
                      <InputGroup.Addon align="inline-end">
                        <InputGroup.Button
                          onclick={() => {
                            if (inputParameters[key] === undefined)
                              inputParameters[key] = 0;
                            avatarOSC.setParameter(
                              key,
                              inputParameters[key] || 0
                            );
                            toast.success("Parameter Updated");
                          }}>Update</InputGroup.Button
                        >
                      </InputGroup.Addon>
                      <InputGroup.Addon align="inline-end">
                        {#if $lockedParameterAddresses.includes(key)}
                          <InputGroup.Button
                            onclick={() => {
                              if (inputParameters[key] === undefined)
                                inputParameters[key] = 0;
                              avatarOSC.setParameter(
                                key,
                                inputParameters[key] || 0,
                                false
                              );
                              toast.success("Parameter Unlocked");
                            }}
                            class="text-red-500"
                          >
                            <LockIcon />
                          </InputGroup.Button>
                        {:else}
                          <InputGroup.Button
                            onclick={() => {
                              if (inputParameters[key] === undefined)
                                inputParameters[key] = 0;
                              avatarOSC.setParameter(
                                key,
                                inputParameters[key] || 0,
                                true
                              );
                              toast.success("Parameter Locked");
                            }}
                          >
                            <LockOpenIcon />
                          </InputGroup.Button>
                        {/if}
                      </InputGroup.Addon>
                      <InputGroup.Addon align="inline-end">
                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger>
                            <InputGroup.Button>⋮</InputGroup.Button>
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Content align="end">
                            <DropdownMenu.Group>
                              <DropdownMenu.Item
                                onclick={() => {
                                  targetTimelineData.address = key;
                                  targetTimelineData.from = $parameters[key];
                                  targetTimelineData.to = $parameters[key];
                                  targetTimelineData.duration = 1;
                                  targetTimelineData.repeat = 0;
                                  targetTimelineData.yoyo = false;
                                  targetTimelineData.drawerOpen = true;
                                }}
                              >
                                <FastForwardIcon />
                                Animate Parameter
                              </DropdownMenu.Item>
                              <DropdownMenu.Item
                                onclick={() => {
                                  targetLinkedParameter.fromAddress = key;
                                  targetLinkedParameter.toAddress = "";
                                  targetLinkedParameter.drawerOpen = true;
                                }}
                              >
                                <EqualIcon />
                                Link Parameter
                              </DropdownMenu.Item>
                            </DropdownMenu.Group>
                          </DropdownMenu.Content>
                        </DropdownMenu.Root>
                      </InputGroup.Addon>
                    </InputGroup.Root>
                  </div>
                </div>
              </Item.Root>
            {/if}
          {/each}
        </div>
      </Card.Root>
    </Tabs.Content>
    <Tabs.Content value="schema" class="flex flex-col gap-1">
      <Card.Root class="p-1 bg-transparent border">
        {#if !$schema}
          <div class="p-4 text-center text-muted-foreground">
            No schema loaded.
          </div>
        {:else}
          <pre class="text-xs">{JSON.stringify($schema, null, 2)}</pre>
        {/if}
      </Card.Root>
    </Tabs.Content>
    <Tabs.Content value="input" class="flex flex-col gap-1">
      <Card.Root>
        <Card.Header>
          <Card.Title>OSC Raw Input</Card.Title>
          <Card.Description>
            Using this section you can send raw OSC messages to the Avatar OSC
            receiver.
          </Card.Description>
        </Card.Header>
        <Card.Content class="flex flex-col gap-2">
          <div class="flex gap-2 items-center">
            <Select.Root
              type="single"
              onValueChange={(v) => {
                selectedRawInputType = v as "listed" | "direct";
              }}
              value={selectedRawInputType}
            >
              <Select.Trigger class="w-[100px] min-w-[100px]">
                {selectedRawInputType === "listed" ? "Listed" : "Direct"}
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="listed" disabled={!$schema}
                  >Listed Input</Select.Item
                >
                <Select.Item value="direct">Direct Input</Select.Item>
              </Select.Content>
            </Select.Root>
            {#if selectedRawInputType === "listed"}
              <Select.Root
                type="single"
                value={rawInputAddress}
                onValueChange={(v) => {
                  rawInputAddress = v as string;
                }}
              >
                <Select.Trigger class="w-full">
                  <div class="w-full items-center flex gap-1">
                    {#if rawInputAddress}
                      <span class="font-medium">
                        {$schema?.parameters.find(
                          (p) => p.input?.address === rawInputAddress
                        )?.name}
                      </span>
                      <span
                        class="font-mono text-[10px] bg-black/50 px-1 py-0.5 rounded text-foreground/70 truncate"
                        >{rawInputAddress}</span
                      >
                    {:else}
                      Select Address
                    {/if}
                  </div>
                </Select.Trigger>
                <Select.Content>
                  {#if selectedRawInputType === "listed"}
                    {#each $schema?.parameters || [] as param}
                      {#if param.input}
                        <Select.Item
                          value={param.input.address}
                          class="flex items-center gap-2"
                        >
                          <div
                            class="px-2 py-1 border w-12 text-center rounded"
                          >
                            {param.input.type}
                          </div>
                          <div class="flex flex-col gap-1">
                            <span>{param.name}</span>
                            <span
                              class="font-mono text-[10px] bg-black/50 px-1 py-0.5 rounded text-foreground/70 truncate"
                              >{param.input.address}</span
                            >
                          </div>
                        </Select.Item>
                      {/if}
                    {/each}
                  {/if}
                </Select.Content>
              </Select.Root>
            {:else}
              <InputGroup.Root class="flex-1">
                <InputGroup.Input
                  placeholder="/avatar/parameters/your_parameter"
                  bind:value={rawInputAddress}
                />
              </InputGroup.Root>
            {/if}
            <div
              class="w-[100px] min-w-[100px] flex items-center justify-center"
            >
              <div class="px-2 py-1 border w-full text-center rounded">
                {avatarOSC.getParameterType(rawInputAddress) || "Unknown"}
              </div>
            </div>
          </div>
          <div class="flex gap-2 items-center">
            <Button
              class="w-[100px] min-w-[100px]"
              variant="outline"
              disabled={!rawInputAddress}
              onclick={() => {
                rawInputValue = $parameters[rawInputAddress]?.toString() || "0";
                toast.success("Parameter Updated");
              }}>Refresh</Button
            >
            <InputGroup.Root class="flex-1">
              <InputGroup.Input
                type="number"
                step="0.0001"
                placeholder="/avatar/parameters/your_parameter"
                disabled={!rawInputAddress}
                bind:value={rawInputValue}
              />
            </InputGroup.Root>
            <Button
              class="w-[100px] min-w-[100px]"
              variant="outline"
              disabled={!rawInputAddress}
              onclick={() => {
                avatarOSC.setParameter(
                  rawInputAddress,
                  parseFloat(rawInputValue) || 0
                );
                toast.success("Parameter Updated");
              }}>Update</Button
            >
          </div>
        </Card.Content>
      </Card.Root>
    </Tabs.Content>
  </Tabs.Root>
</div>
<Drawer.Root
  open={targetTimelineData.drawerOpen}
  onOpenChange={(v) => (targetTimelineData.drawerOpen = v)}
>
  <Drawer.Content class="flex items-center justify-center">
    <div class="w-96 flex flex-col gap-4 p-4">
      <Drawer.Header class="flex items-center flex-col gap-2">
        <Drawer.Title class="text-center">Animate Parameter</Drawer.Title>
        <Drawer.Description>
          <div
            class="font-mono w-fit text-sm bg-black/50 px-2 py-1 rounded truncate text-center"
          >
            {targetTimelineData.address}
          </div>
        </Drawer.Description>
      </Drawer.Header>
      <div class="flex flex-col gap-2">
        <div class="flex flex-col gap-1">
          <Label>From Value</Label>
          <InputGroup.Root>
            <InputGroup.Input
              type="number"
              step="0.0001"
              bind:value={targetTimelineData.from}
            />
          </InputGroup.Root>
        </div>
        <div class="flex flex-col gap-1">
          <Label>To Value</Label>
          <InputGroup.Root>
            <InputGroup.Input
              type="number"
              step="0.0001"
              bind:value={targetTimelineData.to}
            />
          </InputGroup.Root>
        </div>
        <div class="flex flex-col gap-1">
          <Label>Duration (seconds)</Label>
          <InputGroup.Root>
            <InputGroup.Input
              type="number"
              step="0.1"
              min="0.1"
              bind:value={targetTimelineData.duration}
            />
          </InputGroup.Root>
        </div>
        <div class="flex flex-col gap-1">
          <Label>Repeat Count (-1 for infinite)</Label>
          <InputGroup.Root>
            <InputGroup.Input
              type="number"
              step="1"
              min="-1"
              bind:value={targetTimelineData.repeat}
            />
          </InputGroup.Root>
        </div>
        <div class="flex flex-col gap-1">
          <Label>Ease</Label>
          <Select.Root
            type="single"
            value={targetTimelineData.ease}
            onValueChange={(v) => {
              targetTimelineData.ease = v as
                | "none"
                | "power1.inOut"
                | "power2.inOut"
                | "power3.inOut"
                | "bounce.inOut";
            }}
          >
            <Select.Trigger class="w-full">
              <div class="w-full items-center flex gap-1">
                <span class="font-medium">
                  {targetTimelineData.ease}
                </span>
              </div>
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="none">none</Select.Item>
              <Select.Item value="power1.inOut">power1.inOut</Select.Item>
              <Select.Item value="power2.inOut">power2.inOut</Select.Item>
              <Select.Item value="power3.inOut">power3.inOut</Select.Item>
              <Select.Item value="bounce.inOut">bounce.inOut</Select.Item>
            </Select.Content>
          </Select.Root>
        </div>
        <div class="flex items-center gap-2">
          <Checkbox
            id="yoyo-checkbox"
            checked={targetTimelineData.yoyo}
            onCheckedChange={(v) => (targetTimelineData.yoyo = v)}
          />
          <Label for="yoyo-checkbox">Yoyo</Label>
        </div>
      </div>
      <Drawer.Footer class="flex items-center justify-between">
        <div class="flex gap-2 items-center">
          <Button
            variant="destructive"
            size="icon"
            disabled={!gsapTimelines[targetTimelineData.address]}
            onclick={() => {
              const address = targetTimelineData.address;
              if (gsapTimelines[address]) {
                gsapTimelines[address]?.kill();
                delete gsapTimelines[address];
                toast.success("Animation Stopped");
              }
              targetTimelineData.drawerOpen = false;
            }}
          >
            <SquareIcon />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            disabled={!!gsapTimelines[targetTimelineData.address]}
            onclick={() => {
              const { address, from, to, duration, repeat, yoyo } =
                targetTimelineData;
              if (!address) return;

              // Kill existing timeline if any
              if (gsapTimelines[address]) {
                gsapTimelines[address].kill();
              }

              const tl = gsap.timeline({ repeat, yoyo });
              tl.to(
                {},
                {
                  duration,
                  onUpdate: () => {
                    const progress = tl.progress();
                    const newValue = from + (to - from) * progress;
                    avatarOSC.setParameter(address, newValue);
                  },
                  onComplete: () => {
                    if (repeat === -1) return;
                    gsapTimelines[address]?.kill();
                    delete gsapTimelines[address];
                  },
                }
              );

              gsapTimelines[address] = tl;
              toast.success("Animation Started");
              targetTimelineData.drawerOpen = false;
            }}
          >
            <PlayIcon />
          </Button>
        </div>
        <Drawer.Close>
          <Button variant="outline">Close</Button>
        </Drawer.Close>
      </Drawer.Footer>
    </div>
  </Drawer.Content>
</Drawer.Root>
<Drawer.Root
  open={targetLinkedParameter.drawerOpen}
  onOpenChange={(v) => (targetLinkedParameter.drawerOpen = v)}
>
  <Drawer.Content class="flex items-center justify-center">
    <div class="w-96 flex flex-col gap-4 p-4">
      <Drawer.Header class="flex items-center flex-col gap-2">
        <Drawer.Title class="text-center">Link Parameter</Drawer.Title>
        <Drawer.Description>
          <div
            class="font-mono w-fit text-sm bg-black/50 px-2 py-1 rounded truncate text-center"
          >
            {targetLinkedParameter.fromAddress}
          </div>
        </Drawer.Description>
      </Drawer.Header>
      <div class="flex flex-col gap-2">
        <div class="flex flex-col gap-1">
          <Label>To Address</Label>
          <Select.Root
            type="single"
            value={targetLinkedParameter.toAddress}
            onValueChange={(v) => {
              targetLinkedParameter.toAddress = v as string;
            }}
          >
            <Select.Trigger class="w-full">
              <div class="w-full items-center flex gap-1">
                <span class="font-medium">
                  {targetLinkedParameter.toAddress}
                </span>
              </div>
            </Select.Trigger>
            <Select.Content>
              {#each Object.keys($parameters) as paramAddress}
                {#if paramAddress !== targetLinkedParameter.fromAddress}
                  <Select.Item
                    value={paramAddress}
                    class="flex items-center gap-2"
                  >
                    <div class="px-2 py-1 border w-12 text-center rounded">
                      {avatarOSC.getParameterType(paramAddress) || "Unknown"}
                    </div>
                    <div class="flex flex-col gap-1">
                      <span
                        class="font-mono text-[10px] bg-black/50 px-1 py-0.5 rounded text-foreground/70 truncate"
                        >{paramAddress}</span
                      >
                    </div>
                  </Select.Item>
                {/if}
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
      </div>
      <Drawer.Footer class="flex items-center justify-between">
        <div class="flex gap-2 items-center">
          <Button
            variant="destructive"
            size="icon"
            disabled={!linkedParameters[targetLinkedParameter.fromAddress]}
            onclick={() => {
              const fromAddress = targetLinkedParameter.fromAddress;
              if (linkedParameters[fromAddress]) {
                delete linkedParameters[fromAddress];
                toast.success("Properties Unlinked");
              }
              targetLinkedParameter.drawerOpen = false;
            }}
          >
            <UnlinkIcon />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            disabled={!!linkedParameters[targetLinkedParameter.fromAddress]}
            onclick={() => {
              const { fromAddress, toAddress } = targetLinkedParameter;
              if (!fromAddress || !toAddress) return;

              linkedParameters[fromAddress] = toAddress;
              toast.success("Properties Linked");
              targetLinkedParameter.drawerOpen = false;
            }}
          >
            <LinkIcon />
          </Button>
        </div>
        <Drawer.Close>
          <Button variant="outline">Close</Button>
        </Drawer.Close>
      </Drawer.Footer>
    </div>
  </Drawer.Content>
</Drawer.Root>
