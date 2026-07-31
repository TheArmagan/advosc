<script lang="ts">
  import type { ChatboxWeatherModule } from "$lib/api/chatbox/modules/chatbox-weather-module";
  import {
    precipitationUnitLabels,
    searchLocations,
    temperatureUnitLabels,
    windSpeedUnitLabels,
    parseCoordinates,
    type GeocodingResult,
    type PrecipitationUnit,
    type TemperatureUnit,
    type WeatherLocation,
    type WindSpeedUnit,
  } from "$lib/api/chatbox/modules/weather/open-meteo";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Item from "$lib/components/ui/item/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as Drawer from "$lib/components/ui/drawer/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import {
    CloudSunIcon,
    CopyIcon,
    MapPinIcon,
    PlusIcon,
    RefreshCwIcon,
    SearchIcon,
    StarIcon,
    Trash2Icon,
  } from "@lucide/svelte";
  import { toast } from "svelte-sonner";
  import { onMount, onDestroy } from "svelte";

  const {
    module,
  }: {
    module: ChatboxWeatherModule;
  } = $props();

  const values = module.values;

  interface LocationEntry {
    name: string;
    location: WeatherLocation;
  }

  interface PreviewState {
    temperature?: string;
    condition?: string;
    emoji?: string;
    error?: string;
  }

  let locations = $state<LocationEntry[]>([]);
  let defaultName = $state("");
  let temperatureUnit = $state<TemperatureUnit>("celsius");
  let windSpeedUnit = $state<WindSpeedUnit>("kmh");
  let precipitationUnit = $state<PrecipitationUnit>("mm");
  let refreshMinutes = $state(10);

  let previews = $state<Map<string, PreviewState>>(new Map());
  let previewInterval: ReturnType<typeof setInterval> | null = null;

  let searchQuery = $state("");
  let searchResults = $state<GeocodingResult[]>([]);
  let searching = $state(false);
  let searched = $state(false);

  let editorOpen = $state(false);
  let draftName = $state("");
  let draftLatitude = $state("");
  let draftLongitude = $state("");
  let draftLabel = $state("");

  function loadSettings() {
    locations = Object.entries(module.getLocations()).map(([name, location]) => ({
      name,
      location: location as WeatherLocation,
    }));
    defaultName = module.getDefaultLocationName();

    const units = module.getUnits();
    temperatureUnit = units.temperature;
    windSpeedUnit = units.windSpeed;
    precipitationUnit = units.precipitation;
    refreshMinutes = module.getRefreshMinutes();
  }

  async function refreshPreviews() {
    const next = new Map<string, PreviewState>();
    for (const entry of locations) {
      try {
        const status = await module.getStatus(entry.location);
        if (status.snapshot) {
          next.set(entry.name, {
            temperature: await module.getPlaceholderValue("Temperature", entry.name),
            condition: await module.getPlaceholderValue("Condition", entry.name),
            emoji: await module.getPlaceholderValue("Emoji", entry.name),
            error: status.error,
          });
        } else {
          next.set(entry.name, { error: status.error ?? "No data yet" });
        }
      } catch (e) {
        next.set(entry.name, { error: String(e) });
      }
    }
    previews = next;
  }

  async function runSearch() {
    const query = searchQuery.trim();
    if (!query) return;

    searching = true;
    searched = false;
    try {
      const coordinates = parseCoordinates(query);
      searchResults = coordinates
        ? [{ ...coordinates }]
        : await searchLocations(query, 8);
      searched = true;
      if (searchResults.length === 0) {
        toast.info(`No place found for "${query}".`);
      }
    } catch (e) {
      toast.error("Location search failed: " + (e as Error).message);
      searchResults = [];
    } finally {
      searching = false;
    }
  }

  function uniqueName(base: string) {
    const cleaned = base.replace(/[;:]/g, "").trim() || "Location";
    const existing = module.getLocations();
    if (!existing[cleaned]) return cleaned;
    let index = 2;
    while (existing[`${cleaned}${index}`]) index++;
    return `${cleaned}${index}`;
  }

  function openAddDrawer(result?: GeocodingResult) {
    draftName = uniqueName(result ? result.label.split(",")[0] : "Home");
    draftLatitude = result ? String(result.latitude) : "";
    draftLongitude = result ? String(result.longitude) : "";
    draftLabel = result?.label ?? "";
    editorOpen = true;
  }

  function saveDraft() {
    const name = draftName.trim();
    if (!name) {
      toast.error("Please give the location a name.");
      return;
    }
    if (name.includes(";") || name.includes(":")) {
      toast.error("Location names cannot contain ';' or ':'.");
      return;
    }

    const latitude = Number(draftLatitude);
    const longitude = Number(draftLongitude);
    if (!isFinite(latitude) || Math.abs(latitude) > 90) {
      toast.error("Latitude must be a number between -90 and 90.");
      return;
    }
    if (!isFinite(longitude) || Math.abs(longitude) > 180) {
      toast.error("Longitude must be a number between -180 and 180.");
      return;
    }

    module.setLocation(name, {
      latitude,
      longitude,
      label: draftLabel.trim() || name,
    });

    toast.success(`Location "${name}" saved!`);
    editorOpen = false;
    searchResults = [];
    searchQuery = "";
    searched = false;
    loadSettings();
    refreshPreviews();
  }

  function removeLocation(name: string) {
    module.removeLocation(name);
    toast.success(`Location "${name}" removed!`);
    loadSettings();
    refreshPreviews();
  }

  function makeDefault(name: string) {
    module.setDefaultLocationName(name);
    loadSettings();
  }

  function copyPlaceholder(name: string) {
    navigator.clipboard.writeText(`{{Weather;Temperature;${name}}}`);
    toast.success("Placeholder copied to clipboard!");
  }

  function applyUnits() {
    module.setUnits({
      temperature: temperatureUnit,
      windSpeed: windSpeedUnit,
      precipitation: precipitationUnit,
    });
    // Cached responses carry the old units, so they have to go.
    module.invalidateCache();
    refreshPreviews();
  }

  function applyRefreshMinutes(raw: string) {
    const minutes = parseInt(raw);
    if (!isFinite(minutes)) return;
    module.setRefreshMinutes(minutes);
    refreshMinutes = module.getRefreshMinutes();
  }

  function forceRefresh() {
    module.invalidateCache();
    refreshPreviews();
    toast.success("Weather data refreshed!");
  }

  onMount(() => {
    loadSettings();
    refreshPreviews();

    const unsubscribe = values.subscribe(() => {
      loadSettings();
    });

    previewInterval = setInterval(refreshPreviews, 30000);

    return () => {
      unsubscribe();
    };
  });

  onDestroy(() => {
    if (previewInterval) clearInterval(previewInterval);
  });
</script>

<div class="flex flex-col gap-3 items-start justify-start">
  <div class="flex gap-2 w-full items-center">
    <Input
      class="max-w-80"
      bind:value={searchQuery}
      placeholder="Search a city, or type lat,lon"
      onkeydown={(e: KeyboardEvent) => {
        if (e.key === "Enter") runSearch();
      }}
    />
    <Button variant="outline" onclick={runSearch} disabled={searching}>
      <SearchIcon class={searching ? "animate-pulse" : ""} />
      Search
    </Button>
    <Button variant="outline" onclick={() => openAddDrawer()}>
      <PlusIcon />
      Add Manually
    </Button>
    <Button variant="ghost" onclick={forceRefresh} title="Refetch weather data now">
      <RefreshCwIcon />
      Refresh
    </Button>
  </div>

  {#if searchResults.length > 0}
    <div class="flex flex-col gap-2 w-full">
      {#each searchResults as result (`${result.latitude},${result.longitude}`)}
        <Item.Root class="w-full">
          <Item.Media>
            <MapPinIcon class="w-5 h-5" />
          </Item.Media>
          <Item.Content>
            <Item.Title>{result.label}</Item.Title>
            <Item.Description class="text-xs">
              {result.latitude}, {result.longitude}
              {#if result.timezone}
                • {result.timezone}
              {/if}
            </Item.Description>
          </Item.Content>
          <Item.Actions>
            <Button variant="outline" size="sm" onclick={() => openAddDrawer(result)}>
              <PlusIcon class="w-4 h-4" />
              Add
            </Button>
          </Item.Actions>
        </Item.Root>
      {/each}
    </div>
  {:else if searched && !searching}
    <div class="text-sm text-muted-foreground">No results for that search.</div>
  {/if}

  <Drawer.Root bind:open={editorOpen}>
    <Drawer.Content class="flex items-center justify-center w-full">
      <div class="w-96 flex flex-col gap-4 p-4">
        <div class="flex flex-col gap-2">
          <Label>Location Name</Label>
          <Input bind:value={draftName} placeholder="Name used in placeholders (e.g. Home)" />
        </div>
        <div class="flex gap-2">
          <div class="flex flex-col gap-2 flex-1">
            <Label>Latitude</Label>
            <Input bind:value={draftLatitude} placeholder="52.52" />
          </div>
          <div class="flex flex-col gap-2 flex-1">
            <Label>Longitude</Label>
            <Input bind:value={draftLongitude} placeholder="13.41" />
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <Label>Display Label (optional)</Label>
          <Input bind:value={draftLabel} placeholder="Shown by {'{{Weather;Location}}'}" />
        </div>
        <Drawer.Footer>
          <Button onclick={saveDraft}>
            <PlusIcon />
            Save Location
          </Button>
          <Drawer.Close>Cancel</Drawer.Close>
        </Drawer.Footer>
      </div>
    </Drawer.Content>
  </Drawer.Root>

  {#if locations.length === 0}
    <div class="text-muted-foreground text-sm py-4">
      No locations saved yet. Search for a city above, then add it. The first location
      you add becomes the default one used by placeholders without a location.
    </div>
  {:else}
    <div class="flex flex-col gap-2 w-full">
      {#each locations as entry (entry.name)}
        {@const preview = previews.get(entry.name)}
        <Item.Root class="flex items-center gap-2">
          <Item.Media>
            {#if preview?.emoji}
              <span class="text-xl">{preview.emoji}</span>
            {:else}
              <CloudSunIcon class="w-5 h-5" />
            {/if}
          </Item.Media>
          <Item.Content>
            <Item.Title class="flex items-center gap-2">
              <span class="font-mono">{entry.name}</span>
              {#if entry.name === defaultName}
                <span class="text-xs text-amber-500">default</span>
              {/if}
            </Item.Title>
            <Item.Description class="flex items-center gap-2 text-xs">
              <span>{entry.location.label}</span>
              {#if preview?.temperature}
                <span class="text-sky-500">
                  {preview.temperature}{temperatureUnitLabels[temperatureUnit]}
                  {#if preview.condition}
                    • {preview.condition}
                  {/if}
                </span>
              {:else if preview?.error}
                <span class="text-red-500">{preview.error}</span>
              {:else}
                <span class="text-muted-foreground">Loading…</span>
              {/if}
            </Item.Description>
          </Item.Content>
          <Item.Actions>
            <Button
              variant="ghost"
              size="icon-sm"
              onclick={() => makeDefault(entry.name)}
              title="Use as default location"
              disabled={entry.name === defaultName}
            >
              <StarIcon
                class={entry.name === defaultName ? "w-4 h-4 text-amber-500" : "w-4 h-4"}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onclick={() => copyPlaceholder(entry.name)}
              title="Copy Weather placeholder"
            >
              <CopyIcon class="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onclick={() => removeLocation(entry.name)}
              title="Remove location"
            >
              <Trash2Icon class="w-4 h-4" />
            </Button>
          </Item.Actions>
        </Item.Root>
      {/each}
    </div>
  {/if}

  <div class="flex flex-wrap gap-4 w-full pt-2">
    <div class="flex flex-col gap-2 w-40">
      <Label>Temperature</Label>
      <Select.Root
        type="single"
        value={temperatureUnit}
        onValueChange={(v) => {
          temperatureUnit = (v as TemperatureUnit) ?? "celsius";
          applyUnits();
        }}
      >
        <Select.Trigger class="w-full">
          {temperatureUnitLabels[temperatureUnit]}
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="celsius">Celsius (°C)</Select.Item>
          <Select.Item value="fahrenheit">Fahrenheit (°F)</Select.Item>
        </Select.Content>
      </Select.Root>
    </div>

    <div class="flex flex-col gap-2 w-40">
      <Label>Wind Speed</Label>
      <Select.Root
        type="single"
        value={windSpeedUnit}
        onValueChange={(v) => {
          windSpeedUnit = (v as WindSpeedUnit) ?? "kmh";
          applyUnits();
        }}
      >
        <Select.Trigger class="w-full">
          {windSpeedUnitLabels[windSpeedUnit]}
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="kmh">km/h</Select.Item>
          <Select.Item value="ms">m/s</Select.Item>
          <Select.Item value="mph">mph</Select.Item>
          <Select.Item value="kn">Knots</Select.Item>
        </Select.Content>
      </Select.Root>
    </div>

    <div class="flex flex-col gap-2 w-40">
      <Label>Precipitation</Label>
      <Select.Root
        type="single"
        value={precipitationUnit}
        onValueChange={(v) => {
          precipitationUnit = (v as PrecipitationUnit) ?? "mm";
          applyUnits();
        }}
      >
        <Select.Trigger class="w-full">
          {precipitationUnitLabels[precipitationUnit]}
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="mm">Millimeter (mm)</Select.Item>
          <Select.Item value="inch">Inch (in)</Select.Item>
        </Select.Content>
      </Select.Root>
    </div>

    <div class="flex flex-col gap-2 w-40">
      <Label>Refresh (minutes)</Label>
      <Input
        type="number"
        min="1"
        max="180"
        value={refreshMinutes}
        onchange={(e: Event) => applyRefreshMinutes((e.target as HTMLInputElement).value)}
      />
    </div>
  </div>

  <div class="text-xs text-muted-foreground mt-2 p-3 bg-muted/30 rounded-md w-full">
    <p class="font-medium mb-1">Usage:</p>
    <ul class="list-disc list-inside space-y-0.5">
      <li>
        <code class="bg-muted px-1 rounded">{"{{Weather;Temperature}}"}</code> - Default location
      </li>
      <li>
        <code class="bg-muted px-1 rounded">{"{{Weather;Emoji;Home}}"}</code> - Saved location by name
      </li>
      <li>
        <code class="bg-muted px-1 rounded">{"{{Weather;Condition;Tokyo}}"}</code> - Any place name, looked up automatically
      </li>
      <li>
        <code class="bg-muted px-1 rounded">{"{{Weather;High;52.52,13.41;1}}"}</code> - Coordinates, tomorrow's high
      </li>
      <li>
        <code class="bg-muted px-1 rounded">{"{{Time;Timestamp;[[Weather:Sunset]];HH:mm}}"}</code> - Format sunset time
      </li>
    </ul>
    <p class="mt-2">
      Weather data by <span class="font-medium">Open-Meteo.com</span>, free for
      non-commercial use and no API key required.
    </p>
  </div>
</div>
