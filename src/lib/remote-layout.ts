import type { RemoteAction, RemoteBinding, RemoteShortcut } from './types';
export interface RemoteButton { id: string; label: string; x: number; y: number; w: number; h: number; action: RemoteAction; hardware?: string; color?: string }
// Centres and hit areas on the original 1000 × 1000 product photo, cropped in CSS.
const b = (id: string, label: string, x: number, y: number, action: RemoteAction = 'home', w = 44, h = 44): RemoteButton => ({ id, label, x, y, w, h, action });
export const remoteButtons: RemoteButton[] = [
  b('power', 'Marche / arrêt', 500, 112, 'power'),
  ...['A', 'B', 'C'].map((s, i) => ({ ...b(`activity${s}`, `Activité ${s}`, 437 + i * 63, 175), hardware: `Le bouton ${s} sélectionne une activité de la Skip 1s. Configurez les activités dans Skip App, puis associez ici les boutons de commande qui envoient des touches via Flirc.` })),
  b('previous', 'Précédent', 437, 228, 'previousTrack'), b('play', 'Lecture / pause', 500, 228, 'playPause'), b('next', 'Suivant', 563, 228, 'nextTrack'),
  b('home', 'Home', 437, 290, 'home'), b('info', 'Informations', 563, 290, 'options'),
  b('up', 'Haut', 500, 329, 'up', 55, 40), b('left', 'Gauche', 444, 385, 'left', 40, 55), b('ok', 'OK', 500, 385, 'accept', 60, 60), b('right', 'Droite', 556, 385, 'right', 40, 55), b('down', 'Bas', 500, 441, 'down', 55, 40),
  b('menu', 'Menu', 437, 481, 'menu'), b('back', 'Retour', 563, 481, 'back'),
  b('volumeUp', 'Volume +', 437, 543, 'volumeUp', 42, 42), b('volumeDown', 'Volume −', 437, 594, 'volumeDown', 42, 42),
  { ...b('colors', 'Mode couleurs', 500, 542), hardware: 'Ce bouton bascule la couronne en mode couleurs. Choisissez le mode Couleurs au-dessus de la photo pour associer Rouge, Vert, Bleu et Jaune.' },
  b('mute', 'Muet', 500, 594, 'mute'), b('channelUp', 'Chaîne +', 563, 543, 'up', 42, 42), b('channelDown', 'Chaîne −', 563, 594, 'down', 42, 42),
  ...Array.from({length:9}, (_, i) => b(`digit${i+1}`, `${i+1}`, 437 + (i%3)*63, 657 + Math.floor(i/3)*53, 'launch')),
  b('record', 'Enregistrer', 437, 815, 'options'), b('digit0', '0', 500, 815, 'launch'), b('stop', 'Stop', 563, 815, 'stop'),
  { ...b('red', 'Rouge', 500, 329, 'launch', 55, 40), color:'red' },
  { ...b('green', 'Vert', 444, 385, 'launch', 40, 55), color:'green' },
  { ...b('yellow', 'Jaune', 556, 385, 'launch', 40, 55), color:'yellow' },
  { ...b('blue', 'Bleu', 500, 441, 'launch', 55, 40), color:'blue' },
];
export const remoteActions: {id: RemoteAction; label: string; group: string; global?: boolean}[] = [
  {id:'home',label:'Revenir à Canapey',group:'Canapey',global:true},
  {id:'launch',label:'Ouvrir / reprendre une application',group:'Canapey',global:true},
  {id:'library',label:'Afficher la bibliothèque',group:'Canapey'},
  {id:'menu',label:'Ouvrir les paramètres',group:'Canapey'},
  {id:'options',label:'Actions de la carte',group:'Canapey'},
  {id:'audio',label:'Commandes rapides',group:'Canapey'},
  {id:'power',label:'Menu d’alimentation',group:'Canapey'},
  {id:'desktop',label:'Afficher le bureau Windows',group:'Canapey'},
  ...(['up','down','left','right','accept','back'] as const).map((id,i) => ({ id, label:['Haut','Bas','Gauche','Droite','Valider / OK','Retour'][i]!, group:'Navigation' })),
  ...(['volumeUp','volumeDown','mute','playPause','previousTrack','nextTrack','stop'] as const).map((id,i) => ({ id, label:['Volume +','Volume −','Activer / couper le son','Lecture / pause','Piste précédente','Piste suivante','Arrêter la lecture'][i]!, group:'Son et lecture', global:true })),
];
export function sameShortcut(a: RemoteShortcut, b: RemoteShortcut) {
  return a.code === b.code && a.ctrl === b.ctrl && a.alt === b.alt && a.shift === b.shift;
}
export function findRemoteBinding(bindings: RemoteBinding[], key: RemoteShortcut) { return bindings.find(b => sameShortcut(b.key, key)); }
export function actionLabel(action: RemoteAction) { return remoteActions.find(a => a.id === action)?.label ?? action; }
