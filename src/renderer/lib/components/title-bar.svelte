<script lang="ts">
  import { Maximize, Minus, X } from "@lucide/svelte";

  const buttonClass = "w-11 h-full flex items-center justify-center transition-colors";
</script>

<header
  class="h-8 shrink-0 bg-black/95 flex items-center justify-between pl-3 border-b select-none"
  style="-webkit-app-region: drag;"
>
  <h1 class="text-sm font-semibold">ADVOSC</h1>
  <div class="flex h-full">
    <button
      class="{buttonClass} hover:bg-white/25"
      aria-label="Minimize"
      onclick={() => window.ADVOSCNative.frame.minimize()}
      style="-webkit-app-region: no-drag;"
    >
      <Minus class="size-4" />
    </button>
    <button
      class="{buttonClass} hover:bg-white/25"
      aria-label="Maximize"
      onclick={() => window.ADVOSCNative.frame.maximize()}
      style="-webkit-app-region: no-drag;"
    >
      <Maximize class="size-3.5" />
    </button>
    <button
      class="{buttonClass} hover:bg-red-500/75"
      aria-label="Close"
      onclick={() => window.ADVOSCNative.frame.close()}
      style="-webkit-app-region: no-drag;"
    >
      <X class="size-4" />
    </button>
  </div>
</header>
