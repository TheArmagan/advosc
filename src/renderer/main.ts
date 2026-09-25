// @ts-nocheck

import { mount } from 'svelte';
import App from './main.svelte';
import './lib/api/osc-forwarder'; // start background OSC forwarder service
import './lib/api/sound-effects'; // start sound effect trigger rules

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
