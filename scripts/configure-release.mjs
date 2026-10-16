import fs from 'node:fs';
const publicKey=process.env.TAURI_UPDATER_PUBLIC_KEY?.trim();
const repository=process.env.GITHUB_REPOSITORY?.trim();
if(!publicKey||!repository||!/^[-\w.]+\/[-\w.]+$/.test(repository))throw new Error('Configure TAURI_UPDATER_PUBLIC_KEY and GITHUB_REPOSITORY (owner/repository).');
let decoded='';try{decoded=Buffer.from(publicKey,'base64').toString()}catch{}
if(!decoded.startsWith('untrusted comment:')||!decoded.includes('\nRW'))throw new Error('TAURI_UPDATER_PUBLIC_KEY must contain the complete base64 Tauri public key, not a path.');
const config={bundle:{createUpdaterArtifacts:true},plugins:{updater:{pubkey:publicKey,endpoints:[`https://github.com/${repository}/releases/latest/download/latest.json`],windows:{installMode:'passive'}}}};
fs.writeFileSync('src-tauri/tauri.release.conf.json',JSON.stringify(config,null,2)+'\n');
console.log('Release configuration ready for '+repository+'.');
