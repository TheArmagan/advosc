<script>
  import { chatbox } from "$lib/api/chatbox";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Label } from "$lib/components/ui/label/index.js";

  const settings = chatbox.settings;
</script>

<div class="flex flex-col gap-2">
  <div class="flex max-w-[600px]">
    <Label
      class="hover:bg-accent/50 flex items-start gap-3 rounded-lg border p-3 has-[[aria-checked=true]]:border-blue-600 has-[[aria-checked=true]]:bg-blue-50 dark:has-[[aria-checked=true]]:border-blue-900 dark:has-[[aria-checked=true]]:bg-blue-950"
    >
      <Checkbox
        id="auto-send"
        bind:checked={$settings.autoSend}
        class="data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white dark:data-[state=checked]:border-blue-700 dark:data-[state=checked]:bg-blue-700"
      />
      <div class="grid gap-1.5 font-normal">
        <p class="text-sm font-medium leading-none">Enable auto send</p>
        <p class="text-muted-foreground text-sm">
          This will automatically send the generated OSC messages to the VRChat
          every 2.2 seconds. This is the rate-limit
        </p>
      </div>
    </Label>
  </div>
  <div class="flex max-w-[600px]">
    <Label
      class="hover:bg-accent/50 flex items-start gap-3 rounded-lg border p-3 has-[[aria-checked=true]]:border-blue-600 has-[[aria-checked=true]]:bg-blue-50 dark:has-[[aria-checked=true]]:border-blue-900 dark:has-[[aria-checked=true]]:bg-blue-950"
    >
      <Checkbox
        id="egg-mode"
        bind:checked={$settings.eggMode}
        class="data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600 data-[state=checked]:text-white dark:data-[state=checked]:border-blue-700 dark:data-[state=checked]:bg-blue-700"
      />
      <div class="grid gap-1.5 font-normal">
        <p class="text-sm font-medium leading-none">Enable Egg Mode</p>
        <p class="text-muted-foreground text-sm">
          This makes the chatbox messages background transparent in VRChat.
        </p>
      </div>
    </Label>
  </div>
</div>
