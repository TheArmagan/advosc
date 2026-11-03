import type { Component } from "svelte";
import type { BlockEditorKind } from "$shared/simple-editor/types";

export type * from "$shared/simple-editor/types";

export type BlockMeta = {
  label: string;
  desc: string;
  /** Tailwind classes for the tinted icon square (background and text color). */
  color: string;
  icon: Component<any>;
  editor: BlockEditorKind;
  /** Extra words the block library search matches. */
  keywords?: string;
};
