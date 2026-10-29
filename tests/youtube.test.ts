import { describe, it, expect } from 'vitest';
import { defaults, type AppEntry } from '../src/lib/types';
import { isVacuumTube, registerYouTube, showYouTubeSuggestion } from '../src/lib/youtube';
const detected: AppEntry = {id:'canapey-vacuumtube',name:'YouTube',theme:'youtube',target:{kind:'executable',value:'C:\\Apps\\VacuumTube\\VacuumTube.exe',args:['--fullscreen'],workingDir:'C:\\Apps\\VacuumTube'},card:null,background:null,icon:null,source:'Application Windows'};
describe('YouTube catalog and installation registration',()=>{
 it('recognizes executable identity, not a label or unrelated web shortcut',()=>{
  expect(isVacuumTube(detected)).toBe(true);
  expect(isVacuumTube({...detected,target:{...detected.target,value:'C:/Apps/VACUUMTUBE.EXE'}})).toBe(true);
  expect(isVacuumTube({...detected,target:{...detected.target,value:'C:\\Apps\\not-vacuumtube.exe'}})).toBe(false);
  expect(isVacuumTube({...detected,target:{...detected.target,kind:'uri'}})).toBe(false);
 });
 it('offers installation in the full library and video category even with existing apps',()=>{
  const other={...detected,target:{...detected.target,value:'C:/Other.exe'}};
  expect(showYouTubeSuggestion([other],'you','all')).toBe(true);
  expect(showYouTubeSuggestion([other],'vacuum','video')).toBe(true);
  expect(showYouTubeSuggestion([other],'','favorites')).toBe(false);
  expect(showYouTubeSuggestion([other],'','music')).toBe(false);
  expect(showYouTubeSuggestion([detected],'','all')).toBe(false);
 });
 it('adds a detected installation once and preserves web shortcuts',()=>{
  const initial=defaults();initial.apps=[{...detected,id:'web',target:{...detected.target,kind:'uri',value:'https://youtube.com'}}];
  const first=registerYouTube(initial,detected);
  expect(first.config.apps).toHaveLength(2);
  expect(first.app.name).toBe('YouTube');
  expect(first.app.target.args).toEqual(['--fullscreen']);
  expect(registerYouTube(first.config,detected).config.apps).toHaveLength(2);
  expect(initial.apps).toHaveLength(1);
 });
 it('repairs a moved installation without losing artwork, favorites or its ID',()=>{
  const initial=defaults();
  initial.apps=[{...detected,id:'existing',name:'VacuumTube',theme:'home',card:'/custom.webp',target:{...detected.target,value:'C:/old/VacuumTube.exe',args:['--width=1280']}}];
  initial.settings.library.favorites=['existing'];
  initial.settings.library.categories.existing='video';
  const result=registerYouTube(initial,detected);
  expect(result.app.id).toBe('existing');expect(result.app.name).toBe('YouTube');expect(result.app.card).toBe('/custom.webp');
  expect(result.app.target.value).toBe(detected.target.value);
  expect(result.app.target.args).toEqual(['--width=1280','--fullscreen']);
  expect(result.config.settings.library).toEqual(initial.settings.library);
 });
 it('refuses an unexpected executable or a full library without losing data',()=>{
  const initial=defaults();initial.apps=Array.from({length:250},(_,i)=>({...detected,id:String(i),target:{...detected.target,value:`C:/${i}.exe`}}));
  expect(()=>registerYouTube(initial,detected)).toThrow('full');
  expect(()=>registerYouTube(defaults(),{...detected,target:{...detected.target,value:'C:/other.exe'}})).toThrow('Unexpected');
  expect(initial.apps).toHaveLength(250);
 });
});
