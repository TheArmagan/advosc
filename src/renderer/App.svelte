<script lang="ts">
  import "./app.css";
  import { Button } from "$lib/components/ui/button";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import { onMount } from "svelte";

  let count = $state(0);

  function increment() {
    count++;
  }

  onMount(() => {
    document.documentElement.classList.toggle(
      "dark",
      window.electronAPI.theme.current() === "dark"
    );
    return window.electronAPI.theme.onChange((theme) => {
      document.documentElement.classList.toggle("dark", theme === "dark");
    });
  });
</script>

<main class="container mx-auto p-8">
  <Card class="max-w-md mx-auto mt-8">
    <CardHeader>
      <CardTitle>Electron + Svelte 5 + shadcn-svelte</CardTitle>
      <CardDescription>lesgooo</CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="text-center">
        <p class="text-2xl font-bold mb-4">Count: {count}</p>
        <Button onclick={increment}>Go Up!</Button>
      </div>
    </CardContent>
  </Card>
</main>
