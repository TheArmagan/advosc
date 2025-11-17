// @ts-nocheck

import { mount } from 'svelte';
import App from './main.svelte';

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
