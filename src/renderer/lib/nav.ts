import {
  BlocksIcon,
  BookUserIcon,
  MessageSquareTextIcon,
  RadioIcon,
  RulerIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  VibrateIcon,
  Volume2Icon,
  ZapIcon,
} from '@lucide/svelte';
import type { Component } from 'svelte';

import { toyStatus } from './api/toys/status.svelte';
import AutomationsPage from './pages/automations-page.svelte';
import AvatarOSCPage from './pages/avatar-osc-page.svelte';
import AvatarProfilesPage from './pages/avatar-profiles-page.svelte';
import AvatarScalePage from './pages/avatar-scale-page.svelte';
import ChatboxEditorPage from './pages/chatbox-editor-page.svelte';
import LovensePage from './pages/lovense-page.svelte';
import ModulesPage from './pages/modules-page.svelte';
import OscForwarderPage from './pages/osc-forwarder-page.svelte';
import SettingsPage from './pages/settings-page.svelte';
import SoundEffectsPage from './pages/sound-effects-page.svelte';

export type NavGroup = 'main' | 'avatar' | 'bottom';

export type NavItem = {
  label: string;
  icon: Component;
  path: string;
  page: Component;
  group: NavGroup;
  /**
   * Hides the entry from the sidebar. Its route redirects to the default page. Read runes state
   * here, because the sidebar won't update from a plain `get(store)`.
   */
  visible?: () => boolean;
};

/** Headings for the groups that show one. */
export const NAV_GROUP_LABELS: Partial<Record<NavGroup, string>> = {
  avatar: 'Avatar',
};

export const navItems: NavItem[] = [
  { label: 'Chatbox', icon: MessageSquareTextIcon, path: '/chatbox', page: ChatboxEditorPage, group: 'main' },
  { label: 'Modules', icon: BlocksIcon, path: '/modules', page: ModulesPage, group: 'main' },
  { label: 'Automations', icon: ZapIcon, path: '/automations', page: AutomationsPage, group: 'main' },
  { label: 'OSC Forwarder', icon: RadioIcon, path: '/osc-forwarder', page: OscForwarderPage, group: 'main' },
  { label: 'Sound Effects', icon: Volume2Icon, path: '/sound-effects', page: SoundEffectsPage, group: 'main' },
  { label: 'Lovense', icon: VibrateIcon, path: '/lovense', page: LovensePage, group: 'main', visible: () => toyStatus.enabled },
  { label: 'OSC', icon: SlidersHorizontalIcon, path: '/tools/avatar-osc', page: AvatarOSCPage, group: 'avatar' },
  { label: 'Profiles', icon: BookUserIcon, path: '/tools/avatar-profiles', page: AvatarProfilesPage, group: 'avatar' },
  { label: 'Scale', icon: RulerIcon, path: '/tools/avatar-scale', page: AvatarScalePage, group: 'avatar' },
  { label: 'Settings', icon: SettingsIcon, path: '/settings', page: SettingsPage, group: 'bottom' },
];

export const DEFAULT_PATH = '/chatbox';

/** Old paths that still resolve, mapped to where the page lives now. */
export const PATH_ALIASES: Record<string, string> = {
  '/tools/chatbox-editor': DEFAULT_PATH,
};

export function isNavItemVisible(item: NavItem): boolean {
  return item.visible?.() ?? true;
}

export function getNavItems(group: NavGroup): NavItem[] {
  return navItems.filter((item) => item.group === group && isNavItemVisible(item));
}

/** The full name, for places that can't show the group heading next to the label. */
export function getNavTitle(item: NavItem): string {
  const groupLabel = NAV_GROUP_LABELS[item.group];
  return groupLabel ? `${groupLabel} ${item.label}` : item.label;
}
