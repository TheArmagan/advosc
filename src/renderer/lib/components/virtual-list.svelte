<script lang="ts" generics="T">
  import type { Snippet } from "svelte";

  /**
   * Renders only the rows near the viewport. It scrolls with its nearest scrollable ancestor
   * instead of its own box, because pages scroll in the shell's content area. Row heights are
   * given up front, so a row has to fit the height it's given.
   */
  let {
    items,
    height,
    key,
    row,
    overscan = 6,
  }: {
    items: T[];
    height: number | ((item: T) => number);
    key: (item: T) => string;
    row: Snippet<[item: T, index: number]>;
    overscan?: number;
  } = $props();

  let root = $state<HTMLDivElement | null>(null);
  let scroller: HTMLElement | null = null;
  let viewTop = $state(0);
  let viewBottom = $state(0);

  const heightOf = (item: T) => (typeof height === "function" ? height(item) : height);

  // offsets[i] is the top of row i, and the extra last entry is the total height.
  const offsets = $derived.by(() => {
    const result = new Float64Array(items.length + 1);
    for (let i = 0; i < items.length; i++) result[i + 1] = result[i] + heightOf(items[i]);
    return result;
  });
  const total = $derived(offsets[items.length]);

  function rowAt(y: number) {
    let low = 0;
    let high = items.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (offsets[middle + 1] <= y) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  const start = $derived(Math.max(0, rowAt(viewTop) - overscan));
  const end = $derived(Math.min(items.length, rowAt(viewBottom) + 1 + overscan));

  function measure() {
    if (!root || !scroller) return;
    // Against the scroller's own edge, so anything above the list is already accounted for.
    viewTop = scroller.getBoundingClientRect().top - root.getBoundingClientRect().top;
    viewBottom = viewTop + scroller.clientHeight;
  }

  function findScroller(element: HTMLElement) {
    for (let node = element.parentElement; node; node = node.parentElement) {
      const { overflowY } = getComputedStyle(node);
      if (overflowY === "auto" || overflowY === "scroll") return node;
    }
    return document.documentElement;
  }

  /** Scrolls just far enough to show the row. */
  export function scrollToIndex(index: number) {
    if (!root || !scroller) return;
    const listTop = root.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    const top = listTop + offsets[index];
    const bottom = listTop + offsets[index + 1];
    if (top < scroller.scrollTop) scroller.scrollTop = top;
    else if (bottom > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = bottom - scroller.clientHeight;
  }

  $effect(() => {
    if (!root) return;
    const target = findScroller(root);
    scroller = target;
    measure();

    // Watching the list too catches a hidden tab being shown.
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(target);
    target.addEventListener("scroll", measure, { passive: true });

    return () => {
      observer.disconnect();
      target.removeEventListener("scroll", measure);
      scroller = null;
    };
  });

  // A shorter list can clamp the scroll position before the scroll event arrives.
  $effect(() => {
    total;
    measure();
  });
</script>

<!-- Chromium's scroll anchoring would fight the top padding changing as rows swap in and out. -->
<div
  bind:this={root}
  class="[overflow-anchor:none]"
  style:height="{total}px"
  style:padding-top="{offsets[start]}px"
>
  {#each items.slice(start, end) as item, i (key(item))}
    <div style:height="{heightOf(item)}px">
      {@render row(item, start + i)}
    </div>
  {/each}
</div>
