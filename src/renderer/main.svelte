<script lang="ts">
  import "./app.css";
  import AppSidebar from "$lib/components/app-sidebar.svelte";
  import TitleBar from "$lib/components/title-bar.svelte";
  import { router } from "$lib/router";
  import { Toaster } from "$lib/components/ui/sonner/index.js";

  const currentPage = $derived($router.currentPage);
</script>

<Toaster />
<main class="w-full h-screen flex flex-col overflow-hidden">
  <TitleBar />
  <div class="flex flex-1 min-h-0">
    <AppSidebar />
    {#key currentPage.path}
      <div class="flex-1 min-w-0 min-h-0 overflow-auto">
        <currentPage.component />
      </div>
    {/key}
  </div>
</main>
