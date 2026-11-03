/** Links the app opens in the browser, kept in one place so they match the README. */
export const PATREON_URL = "https://patreon.com/armagan";
export const RELEASES_URL = "https://github.com/TheArmagan/advosc/releases";

export function openLink(url: string) {
  window.ADVOSCNative.shell.openExternal(url);
}
