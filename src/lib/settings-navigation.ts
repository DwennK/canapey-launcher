// A single route tree drives the settings menu, breadcrumbs and Back behavior.
export const settingsPages = {
  display: { title: 'Display', description: 'Screen, interface size and language.', icon: 'monitor', parent: 'appearance' },
  ambience: { title: 'Ambience', description: 'Backgrounds, brightness and motion.', icon: 'ambiance', parent: 'appearance' },
  sound: { title: 'Sound', description: 'Navigation sounds and volume.', icon: 'volume', parent: 'appearance' },
  apps: { title: 'Apps', description: 'Add, arrange and customize your library.', icon: 'grid', parent: 'root' },
  controls: { title: 'Controllers', description: 'Home shortcut, sticks and controller test.', icon: 'controller', parent: 'devices' },
  remote: { title: 'Remote', description: 'Set up buttons on your Skip 1s or Flirc remote.', icon: 'remote', parent: 'devices' },
  iphone: { title: 'iPhone', description: 'Connect Apple TV Remote from Control Center.', icon: 'remote', parent: 'devices' },
  tv: { title: 'TV', description: 'Connect your TV and manage automatic power.', icon: 'monitor', parent: 'devices' },
  system: { title: 'Startup and system', description: 'Windows startup, full screen and power.', icon: 'power', parent: 'root' },
  updates: { title: 'Updates', description: 'Check and install Canapey updates.', icon: 'update', parent: 'help' },
  diagnostic: { title: 'Diagnostics', description: 'Running apps, controller status and logs.', icon: 'info', parent: 'help' },
} as const;
export type SettingsPage = keyof typeof settingsPages;
export const settingsGroups = {
  root: { title: 'Settings', description: 'Preferences, devices and system.', icon: 'settings', children: ['appearance', 'apps', 'devices', 'system', 'help'] },
  appearance: { title: 'Display and ambience', description: 'Adjust the display, backgrounds and sounds.', icon: 'ambiance', children: ['display', 'ambience', 'sound'] },
  devices: { title: 'Controls', description: 'Choose what you use from the sofa.', icon: 'controller', children: ['controls', 'remote', 'iphone', 'tv'] },
  help: { title: 'Help and updates', description: 'Keep Canapey up to date and find connection details.', icon: 'info', children: ['updates', 'diagnostic'] },
} as const;
export type SettingsGroup = keyof typeof settingsGroups;
export type SettingsRoute = SettingsPage | SettingsGroup;
export function isSettingsPage(route: string): route is SettingsPage { return Object.hasOwn(settingsPages, route); }
export function settingsEntry(route: SettingsRoute) { return isSettingsPage(route) ? settingsPages[route] : settingsGroups[route]; }
export function settingsParent(route: SettingsRoute): SettingsGroup | null {
  return route === 'root' ? null : isSettingsPage(route) ? settingsPages[route].parent : 'root';
}
export function settingsChildren(route: SettingsRoute): readonly SettingsRoute[] {
  return isSettingsPage(route) ? [] : settingsGroups[route].children;
}
export function settingsBranch(page: string): SettingsRoute {
  if (!isSettingsPage(page)) return 'appearance';
  return settingsPages[page].parent === 'root' ? page : settingsPages[page].parent;
}
