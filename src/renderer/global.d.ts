// Global type declarations for the preload-exposed API

import type { PreloadElectronAPI } from "../main/preload";

declare global {
  interface Window {
    electronAPI: PreloadElectronAPI;
  }
}

export { }; // Ensure this file is treated as a module
