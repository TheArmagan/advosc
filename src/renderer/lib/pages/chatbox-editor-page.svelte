<script lang="ts">
  import ChatboxMonacoEditor from "$lib/components/chatbox-monaco-editor.svelte";
  import { chatboxModules } from "../api/chatbox";

  // @ts-ignore
  window.chatboxModules = chatboxModules;
</script>

<ChatboxMonacoEditor />
