// @ts-nocheck
import { DEFAULT_PATH, PATH_ALIASES, isNavItemVisible, navItems } from './nav';

import type { Component } from 'svelte';
import { get, writable } from 'svelte/store';

export type RouterState = {
  routes: Record<string, Component>;
  currentPage: {
    path: string;
    component?: Component;
    query: Record<string, string>;
  };
};

const routes: Record<string, Component> = Object.fromEntries(
  navItems.map((item) => [item.path, item.page]),
);

const initial: RouterState = {
  routes,
  currentPage: {
    path: DEFAULT_PATH,
    component: routes[DEFAULT_PATH],
    query: {},
  },
};

export const router = writable<RouterState>(initial);

// Follows aliases, and sends unknown or hidden paths to the default page.
function resolvePath(path: string): string {
  const target = PATH_ALIASES[path] ?? path;
  const item = navItems.find((entry) => entry.path === target);
  return item && isNavItemVisible(item) ? target : DEFAULT_PATH;
}

let lastPath = '';
function onHashChange() {
  const hash = window.location.hash.slice(1);
  const [pathPart, queryString = ''] = hash.split('?');
  const path = resolvePath(pathPart);

  if (path !== pathPart) {
    // Rewrites the URL without adding a history entry or firing hashchange again.
    window.history.replaceState(null, '', `#${queryString ? `${path}?${queryString}` : path}`);
  }

  router.update((state) => {
    const next: RouterState = {
      ...state,
      currentPage: { ...state.currentPage },
    };

    if (path !== lastPath) {
      next.currentPage.path = path;
      next.currentPage.component = state.routes[path];
      lastPath = path;
    }

    const query: Record<string, string> = {};
    if (queryString) {
      for (const pair of queryString.split('&')) {
        if (!pair) continue;
        const [key, value] = pair.split('=');
        if (key) query[decodeURIComponent(key)] = decodeURIComponent(value || '');
      }
    }
    next.currentPage.query = query;
    return next;
  });
}

window.location.hash = window.location.hash.replace(/^#/, "") || get(router).currentPage.path;
window.addEventListener('hashchange', onHashChange);
onHashChange();

export function navigateTo(path: string, query: Record<string, string> = {}) {
  const queryString = Object.entries(query)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  const fullPath = queryString ? `${path}?${queryString}` : path;
  window.location.hash = fullPath;
}

export function changeQuery(newQuery: Record<string, string>) {
  let currentPath = '/';
  router.update((state) => {
    currentPath = state.currentPage.path;
    return state;
  });
  navigateTo(currentPath, newQuery);
}
