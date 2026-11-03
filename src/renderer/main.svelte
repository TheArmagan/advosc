<script lang="ts">
  import "./app.css";
  import AppSidebar from "$lib/components/app-sidebar.svelte";
  import BundleReviewDrawer from "$lib/components/automations/bundle-review-drawer.svelte";
  import TitleBar from "$lib/components/title-bar.svelte";
  import { router } from "$lib/router";
  import { Toaster } from "$lib/components/ui/sonner/index.js";

  const currentPage = $derived($router.currentPage);
</script>

<Toaster />
<BundleReviewDrawer />
<main class="w-full h-screen flex flex-col overflow-hidden">
  <TitleBar />
  <div class="flex flex-1 min-h-0">
    <AppSidebar />
    {#key currentPage.path}
      <!-- `relative` keeps absolutely positioned bits (sr-only inputs) inside the scroll area. -->
      <div class="relative flex-1 min-w-0 min-h-0 overflow-auto">
        <currentPage.component />
      </div>
    {/key}
  </div>
</main>
