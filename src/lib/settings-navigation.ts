export const settingsPages = {
  display: { title: 'Display', description: 'Screen, interface size and language.', icon: 'monitor' },
  ambience: { title: 'Ambience', description: 'Backgrounds, brightness and motion.', icon: 'ambiance' },
  sound: { title: 'Sound', description: 'Navigation sounds and volume.', icon: 'volume' },
  apps: { title: 'Apps', description: 'Add, arrange and customize your library.', icon: 'grid' },
  controls: { title: 'Controllers', description: 'Home shortcut, sticks and controller test.', icon: 'controller' },
  remote: { title: 'Remote', description: 'Set up buttons on your Skip 1s or Flirc remote.', icon: 'remote' },
  iphone: { title: 'iPhone', description: 'Connect Apple TV Remote from Control Center.', icon: 'phone' },
  tv: { title: 'TV', description: 'Connect your TV and manage automatic power.', icon: 'monitor' },
  system: { title: 'Startup and system', description: 'Windows startup, full screen and power.', icon: 'power' },
  updates: { title: 'Updates', description: 'Check and install Canapey updates.', icon: 'update' },
  diagnostic: { title: 'Diagnostics', description: 'Running apps, controller status and logs.', icon: 'info' },
} as const;
export type SettingsPage = keyof typeof settingsPages;
export const settingsSections = [
  { title: 'Preferences', pages: ['display', 'ambience', 'sound', 'apps'] },
  { title: 'Devices', pages: ['controls', 'remote', 'iphone', 'tv'] },
  { title: 'System', pages: ['system', 'updates', 'diagnostic'] },
] as const satisfies readonly { title: string; pages: readonly SettingsPage[] }[];

export function isSettingsPage(route: string): route is SettingsPage {
  return Object.hasOwn(settingsPages, route);
}

const searchTerms: Record<SettingsPage, string> = {
  display: 'monitor screen zoom scaling language', ambience: 'wallpaper artwork brightness blur motion',
  sound: 'volume audio navigation mute', apps: 'library favorites cards shortcuts import remove',
  controls: 'gamepad controller Xbox PlayStation deadzone', remote: 'Flirc Skip buttons bindings',
  iphone: 'Apple iOS keyboard pairing', tv: 'HDMI input wake standby pairing television',
  system: 'sleep shutdown login autostart desktop', updates: 'download release version install',
  diagnostic: 'sessions logs running windows',
};
export function findSettings(query: string): SettingsPage[] {
  const words = query.trim().toLowerCase().split(/\s+/);
  return (Object.keys(settingsPages) as SettingsPage[]).filter(page => {
    const { title, description } = settingsPages[page];
    const text = [title, description, searchTerms[page]].join(' ').toLowerCase();
    return words.every(word => text.includes(word));
  });
}
