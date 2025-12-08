<script lang="ts">
  import "./app.css";
  import { Maximize, Minus, X } from "@lucide/svelte";
  import RouteLink from "$lib/components/route-link.svelte";
  import { router } from "$lib/router";
  import { Toaster } from "$lib/components/ui/sonner/index.js";

  const currentPage = $derived($router.currentPage);

  const routes = [
    {
      name: "Chatbox Editor",
      to: "/tools/chatbox-editor",
    },
    {
      name: "Avatar OSC",
      to: "/tools/avatar-osc",
    },
    {
      name: "Translator",
      to: "/tools/translator",
    },
  ];
</script>

<Toaster />
<main class="w-full h-full flex flex-col">
  <nav
    class="w-full h-12 bg-black/95 flex items-center pl-4 border-b justify-between fixed"
    style="-webkit-app-region: drag;"
  >
    <div class="flex items-center gap-4 h-12">
      <h1 class="text-lg font-semibold">ADVOSC</h1>
      <div class="flex items-center h-12 gap-2">
        {#each routes as route}
          <RouteLink
            to={route.to}
            class="px-4 hover:bg-white/5 data-[active=true]:bg-white/10 border rounded-md flex items-center h-8 transition-colors"
            >{route.name}</RouteLink
          >
        {/each}
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
  <div class="w-full flex-1 flex pt-12">
    <currentPage.component />
  </div>
</main>
