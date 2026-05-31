// @ts-nocheck

import { mount } from 'svelte';
import App from './main.svelte';
import './lib/api/osc-forwarder'; // start background OSC forwarder service

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
