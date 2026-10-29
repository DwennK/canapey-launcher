import { computed } from 'vue';
import { t } from './i18n';
import { canonicalCode } from './remote-home';
import type { RemoteAction, RemoteBinding, RemoteShortcut } from './types';
export interface RemoteButton { id: string; label: string; x: number; y: number; w: number; h: number; action: RemoteAction; hardware?: string; color?: string }
// Centres and hit areas on the original 1000 × 1000 product photo, cropped in CSS.
const b = (id: string, label: string, x: number, y: number, action: RemoteAction = 'home', w = 44, h = 44): RemoteButton => ({ id, label, x, y, w, h, action });
function buttonDefinitions(): RemoteButton[] { return [
  b('power', t('Power'), 500, 112, 'power'),
  ...['A', 'B', 'C'].map((s, i) => ({ ...b(`activity${s}`, t('Activity {0}', [s]), 437 + i * 63, 175), hardware: t('Button {0} selects a Skip 1s activity. Configure activities in Skip App, then map the control buttons that send keys through Flirc here.', [s]) })),
  b('previous', t('Previous'), 437, 228, 'previousTrack'), b('play', t('Play / pause'), 500, 228, 'playPause'), b('next', t('Next'), 563, 228, 'nextTrack'),
  b('home', 'Home', 437, 290, 'home'), b('info', t('Info'), 563, 290, 'options'),
  b('up', t('Up'), 500, 329, 'up', 55, 40), b('left', t('Left'), 444, 385, 'left', 40, 55), b('ok', 'OK', 500, 385, 'accept', 60, 60), b('right', t('Right'), 556, 385, 'right', 40, 55), b('down', t('Down'), 500, 441, 'down', 55, 40),
  b('menu', t('Menu'), 437, 481, 'menu'), b('back', t('Back'), 563, 481, 'back'),
  b('volumeUp', 'Volume +', 437, 543, 'volumeUp', 42, 42), b('volumeDown', 'Volume −', 437, 594, 'volumeDown', 42, 42),
  { ...b('colors', t('Color mode'), 500, 542), get hardware() { return t('This button switches the ring to color mode. Choose Colors above the photo to map Red, Green, Blue and Yellow.'); } },
  b('mute', t('Mute'), 500, 594, 'mute'), b('channelUp', t('Channel +'), 563, 543, 'up', 42, 42), b('channelDown', t('Channel −'), 563, 594, 'down', 42, 42),
  ...Array.from({length:9}, (_, i) => b(`digit${i+1}`, `${i+1}`, 437 + (i%3)*63, 657 + Math.floor(i/3)*53, 'launch')),
  b('record', t('Record'), 437, 815, 'options'), b('digit0', '0', 500, 815, 'launch'), b('stop', 'Stop', 563, 815, 'stop'),
  { ...b('red', t('Red'), 500, 329, 'launch', 55, 40), color:'red' },
  { ...b('green', t('Green'), 444, 385, 'launch', 40, 55), color:'green' },
  { ...b('yellow', t('Yellow'), 556, 385, 'launch', 40, 55), color:'yellow' },
  { ...b('blue', t('Blue'), 500, 441, 'launch', 55, 40), color:'blue' },
]; }
const translatedButtons = computed(buttonDefinitions);
export const remoteButtons: RemoteButton[] = translatedButtons.value.map((button, index) => ({ ...button, get label() { return translatedButtons.value[index]!.label; }, get hardware() { return translatedButtons.value[index]!.hardware; } }));
export const remoteActions: {id: RemoteAction; label: string; group: string; global: boolean}[] = [
  {id:'home',get label() { return t('Return to Canapey'); },group:'Canapey',global:true},
  {id:'launch',get label() { return t('Open / resume an app'); },group:'Canapey',global:true},
  {id:'library',get label() { return t('Show library'); },group:'Canapey',global:true},
  {id:'menu',get label() { return t('Open settings'); },group:'Canapey',global:true},
  {id:'options',get label() { return t('Card actions'); },group:'Canapey',global:true},
  {id:'audio',get label() { return t('Quick controls'); },group:'Canapey',global:true},
  {id:'power',get label() { return t('Power menu'); },group:'Canapey',global:true},
  {id:'desktop',get label() { return t('Show Windows desktop'); },group:'Windows',global:true},
  {id:'taskView',get label() { return t('Task View (Windows + Tab)'); },group:'Windows',global:true},
  {id:'closeWindow',get label() { return t('Close active window'); },group:'Windows',global:true},
  {id:'escape',get label() { return t('Escape'); },group:'Windows',global:true},
  ...(['up','down','left','right','accept','back'] as const).map((id,i) => ({ id, get label() { return [t('Up'),t('Down'),t('Left'),t('Right'),t('Confirm / OK'),t('Back')][i]!; }, group:'Navigation',global:true })),
  ...(['volumeUp','volumeDown','mute','playPause','previousTrack','nextTrack','stop'] as const).map((id,i) => ({ id, get label() { return ['Volume +','Volume −',t('Mute / unmute'),t('Play / pause'),t('Previous track'),t('Next track'),t('Stop playback')][i]!; }, get group() { return t('Sound and playback'); }, global:true })),
];
export function sameShortcut(a: RemoteShortcut, b: RemoteShortcut) {
  return canonicalCode(a.code) === canonicalCode(b.code) && a.ctrl === b.ctrl && a.alt === b.alt && a.shift === b.shift;
}
export function findRemoteBinding(bindings: RemoteBinding[], key: RemoteShortcut) { return bindings.find(b => sameShortcut(b.key, key)); }
export function actionLabel(action: RemoteAction) { return remoteActions.find(a => a.id === action)?.label ?? action; }
