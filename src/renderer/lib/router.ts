// @ts-nocheck
import HomePage from './pages/home-page.svelte';
import ChatboxEditorPage from './pages/chatbox-editor-page.svelte';
import AvatarOSCPage from './pages/avatar-osc-page.svelte';
import AvatarProfilesPage from './pages/avatar-profiles-page.svelte';
import AboutPage from './pages/about-page.svelte';
import SettingsPage from './pages/settings-page.svelte';

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

const initial: RouterState = {
  routes: {
    '/': HomePage,
    '/tools/chatbox-editor': ChatboxEditorPage,
    '/tools/avatar-osc': AvatarOSCPage,
    '/tools/avatar-profiles': AvatarProfilesPage,
    '/about': AboutPage,
    '/settings': SettingsPage,
  },
  currentPage: {
    path: '/tools/chatbox-editor',
    component: HomePage,
    query: {},
  },
};

export const router = writable<RouterState>(initial);

let lastPath = '';
function onHashChange() {
  const hash = window.location.hash.slice(1);
  const [pathPart, queryString = ''] = hash.split('?');

  router.update((state) => {
    const next: RouterState = {
      ...state,
      currentPage: { ...state.currentPage },
    };

    if (pathPart && pathPart !== lastPath) {
      const component = state.routes[pathPart];
      if (component) {
        next.currentPage.path = pathPart;
        next.currentPage.component = component;
        lastPath = pathPart;
      }
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