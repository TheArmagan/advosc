<script lang="ts">
  import "./app.css";
  import { onMount } from "svelte";
  import { Maximize, Minus, X } from "@lucide/svelte";
  import RouteLink from "$lib/components/route-link.svelte";
  import { router } from "$lib/router";

  onMount(() => {
    document.documentElement.classList.toggle(
      "dark",
      window.ADVOSCNative.theme.current() === "dark"
    );
    return window.ADVOSCNative.theme.onChange((theme) => {
      document.documentElement.classList.toggle("dark", theme === "dark");
    });
  });

  const currentPage = $derived($router.currentPage);
</script>

<main class="w-full h-full flex flex-col">
  <nav
    class="w-full h-12 bg-black/75 flex items-center pl-4 border-b justify-between"
    style="-webkit-app-region: drag;"
  >
    <div class="flex items-center gap-4 h-12">
      <h1 class="text-lg font-semibold">ADVOSC</h1>
      <div class="flex items-center h-12 gap-2">
        <RouteLink
          to="/tools/chatbox-editor"
          class="px-4 hover:bg-white/5 data-[active=true]:bg-white/10 border rounded-md flex items-center h-8 transition-colors"
          >Chatbox Editor</RouteLink
        >
        <RouteLink
          to="/tools/avatar-osc"
          class="px-4 hover:bg-white/5 data-[active=true]:bg-white/10 border rounded-md flex items-center h-8 transition-colors"
          >Avatar OSC</RouteLink
        >
        <RouteLink
          to="/tools/avatar-profiles"
          class="px-4 hover:bg-white/5 data-[active=true]:bg-white/10 border rounded-md flex items-center h-8 transition-colors"
          >Avatar Profiles</RouteLink
        >
        <RouteLink
          to="/settings"
          class="px-4 hover:bg-white/5 data-[active=true]:bg-white/10 border rounded-md flex items-center h-8 transition-colors"
          >Settings</RouteLink
        >
        <RouteLink
          to="/about"
          class="px-4 hover:bg-white/5 data-[active=true]:bg-white/10 border rounded-md flex items-center h-8 transition-colors"
          >About</RouteLink
        >
      </div>
    </div>
    <div class="flex h-12">
      <button
        class="w-12 h-12 flex items-center justify-center hover:bg-white/25"
        onclick={() => window.ADVOSCNative.frame.minimize()}
        style="-webkit-app-region: no-drag;"
      >
        <Minus class="size-4" />
      </button>
      <button
        class="w-12 h-12 flex items-center justify-center hover:bg-white/25"
        onclick={() => window.ADVOSCNative.frame.maximize()}
        style="-webkit-app-region: no-drag;"
      >
        <Maximize class="size-4" />
      </button>
      <button
        class="w-12 h-12 flex items-center justify-center hover:bg-red-500/75"
        onclick={() => window.ADVOSCNative.frame.close()}
        style="-webkit-app-region: no-drag;"
      >
        <X class="size-4" />
      </button>
    </div>
  </nav>
  <currentPage.component class="flex-1 w-full h-full overflow-auto" />
</main>
