import * as THREE from 'https://esm.sh/three@0.160.1';
import { OrbitControls } from 'https://esm.sh/three@0.160.1/examples/jsm/controls/OrbitControls.js?deps=three@0.160.1';
import { GLTFLoader } from 'https://esm.sh/three@0.160.1/examples/jsm/loaders/GLTFLoader.js?deps=three@0.160.1';

const MPFB_URL = './assets/morph-loomis-head/mpfb.glb?study-v1';

const $ = id => document.getElementById(id);
const canvas = $('view');
const loader = $('loader');
const loaderText = $('loaderText');
const modelName = $('modelName');
const sheetTitle = $('sheetTitle');
const sheetDesc = $('sheetDesc');
const modeTabs = $('modeTabs');
const actionRow = $('actionRow');
const sheetBody = $('sheetBody');
const camBtn = $('camBtn');
const modelBtn = $('modelBtn');
const gearBtn = $('gearBtn');

let scene, camera, renderer, controls;
let modelRoot, studyRoot, activeRoot, loomisGroup, labelGroup;
let morphMeshes = [];
let morphNames = [];
let activeModel = 'study';
let activeMode = 'Loomis';
let activeMenu = 'home';
let activeCamera = 'front';
let showGuides = true;
let showLabels = true;
let showEdges = true;
let showMarks = true;
let isLoadingMpfb = false;

const headCenter = new THREE.Vector3(0, 1.28, 0);
const values = {
  yaw: 0, pitch: 0, roll: 0,
  browHeight: 0, browAngle: 0, eyeOpen: 0, eyeSlant: 0,
  noseLength: 0, noseWidth: 0, cheekWidth: 0,
  mouthWidth: 0, mouthSmile: 0, jawWidth: 0, chinLength: 0,
  neckWidth: 0
};
const parts = {};

const modes = [
  { id: 'Loomis', title: 'Loomis Head', desc: 'Planes and essential construction marks. Use the marks to understand the skull, side plane, brow, nose, mouth and chin.' },
  { id: 'Asaro', title: 'Asaro Planes', desc: 'A simplified planes head for value, edge and facial structure study.' },
  { id: 'Planes', title: 'Planes & Form', desc: 'Clean low-poly head with edges and major form breaks.' },
  { id: 'Sculpt', title: 'Modify Facial Features', desc: 'Change the study model like a simple head-model app.' }
];

const categories = [
  { id:'Brows', label:'Eyebrows', sliders:[['browHeight','Height',-1,1,.01],['browAngle','Angle',-1,1,.01]] },
  { id:'Eyes', label:'Eyes', sliders:[['eyeOpen','Open / Close',-1,1,.01],['eyeSlant','Slant',-1,1,.01]] },
  { id:'Nose', label:'Nose', sliders:[['noseLength','Length',-1,1,.01],['noseWidth','Width',-1,1,.01]] },
  { id:'Cheek', label:'Cheek', sliders:[['cheekWidth','Width',-1,1,.01]] },
  { id:'Mouth', label:'Mouth', sliders:[['mouthWidth','Width',-1,1,.01],['mouthSmile','Smile / Frown',-1,1,.01]] },
  { id:'Jaw', label:'Jaw', sliders:[['jawWidth','Jaw Width',-1,1,.01],['chinLength','Chin Length',-1,1,.01]] },
  { id:'Head', label:'Tilt Head', sliders:[['pitch','Forward / Backward',-45,45,1],['roll','Tilt',-35,35,1],['yaw','Turn',-60,60,1]] }
];

boot();

function boot(){
  initThree();
  studyRoot = createStudyHead();
  setActiveRoot(studyRoot);
  buildLoomisOverlay();
  buildTopActions();
  buildModeTabs();
  setMode('Loomis');
  animate();
}

function initThree(){
  renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x202026);
  camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.01, 100);
  camera.position.set(0, 1.25, 4.2);
  scene.add(new THREE.AmbientLight(0xffffff, 1.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(2,4,5); scene.add(key);
  const fill = new THREE.DirectionalLight(0x98d8ff, 1.1); fill.position.set(-4,2,-2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, .7); rim.position.set(0,3,-5); scene.add(rim);
  modelRoot = new THREE.Group(); scene.add(modelRoot);
  loomisGroup = new THREE.Group(); scene.add(loomisGroup);
  labelGroup = new THREE.Group(); scene.add(labelGroup);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.copy(headCenter);
  controls.minDistance = 1.4;
  controls.maxDistance = 7;
  window.addEventListener('resize', onResize);
  camBtn.addEventListener('click', cycleCamera);
  modelBtn.addEventListener('click', toggleModel);
  gearBtn.addEventListener('click', () => renderSettings());
}

function animate(){
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

function onResize(){
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function setActiveRoot(root){
  modelRoot.clear();
  activeRoot = root;
  modelRoot.add(root);
  applySculpt();
  setCamera(activeCamera);
}

function createStudyHead(){
  const root = new THREE.Group();
  root.name = 'Study_Planes_Head';
  const skin = new THREE.MeshStandardMaterial({ color:0x5c6370, roughness:.76, metalness:0, flatShading:true, side:THREE.DoubleSide });
  const light = new THREE.MeshStandardMaterial({ color:0xdbe1e8, roughness:.66, metalness:0, flatShading:true, side:THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color:0x303137, roughness:.8, metalness:0, flatShading:true, side:THREE.DoubleSide });
  const mid = new THREE.MeshStandardMaterial({ color:0x8b949f, roughness:.76, metalness:0, flatShading:true, side:THREE.DoubleSide });
  const brown = new THREE.MeshStandardMaterial({ color:0x4b4037, roughness:.8, metalness:0, flatShading:true, side:THREE.DoubleSide });
  parts.head = new THREE.Group(); root.add(parts.head);

  const skull = mesh(new THREE.SphereGeometry(.82, 9, 7), skin, 'cranium');
  skull.scale.set(.78, 1.03, .62); skull.position.set(0, 1.55, 0); parts.head.add(skull);
  const face = mesh(new THREE.ConeGeometry(.64, 1.08, 7, 2), skin, 'face planes');
  face.rotation.y = Math.PI / 7; face.position.set(0, .86, .03); face.scale.set(.92, 1.08, .72); parts.head.add(face);
  parts.jaw = mesh(new THREE.BoxGeometry(.78, .42, .48, 2, 1, 1), skin, 'jaw block');
  parts.jaw.position.set(0, .50, .01); parts.jaw.scale.set(1, .78, .82); parts.head.add(parts.jaw);

  parts.brows = new THREE.Group(); parts.head.add(parts.brows);
  const browL = mesh(new THREE.BoxGeometry(.38,.10,.12), dark, 'left brow plane'); browL.position.set(-.25,1.35,.46); browL.rotation.z = -.07; parts.brows.add(browL);
  const browR = mesh(new THREE.BoxGeometry(.38,.10,.12), dark, 'right brow plane'); browR.position.set(.25,1.35,.46); browR.rotation.z = .07; parts.brows.add(browR);

  parts.eyes = new THREE.Group(); parts.head.add(parts.eyes);
  const eyeL = mesh(new THREE.BoxGeometry(.38,.12,.08), light, 'left eye plane'); eyeL.position.set(-.25,1.18,.50); parts.eyes.add(eyeL);
  const eyeR = mesh(new THREE.BoxGeometry(.38,.12,.08), light, 'right eye plane'); eyeR.position.set(.25,1.18,.50); parts.eyes.add(eyeR);

  parts.nose = new THREE.Group(); parts.head.add(parts.nose);
  const nose = mesh(new THREE.ConeGeometry(.16,.55,4,1), light, 'nose wedge');
  nose.rotation.x = Math.PI/2; nose.rotation.z = Math.PI/4; nose.position.set(0, .98, .58); nose.scale.set(.72,1,1); parts.nose.add(nose);
  const noseUnder = mesh(new THREE.BoxGeometry(.25,.10,.12), brown, 'nose bottom'); noseUnder.position.set(0,.83,.55); parts.nose.add(noseUnder);

  parts.cheeks = new THREE.Group(); parts.head.add(parts.cheeks);
  const cheekL = mesh(new THREE.BoxGeometry(.32,.34,.10), mid, 'left cheek plane'); cheekL.position.set(-.34,.95,.48); cheekL.rotation.z = .18; parts.cheeks.add(cheekL);
  const cheekR = mesh(new THREE.BoxGeometry(.32,.34,.10), mid, 'right cheek plane'); cheekR.position.set(.34,.95,.48); cheekR.rotation.z = -.18; parts.cheeks.add(cheekR);

  parts.mouth = new THREE.Group(); parts.head.add(parts.mouth);
  const upper = mesh(new THREE.BoxGeometry(.44,.06,.09), brown, 'upper lip'); upper.position.set(0,.61,.48); parts.mouth.add(upper);
  const lower = mesh(new THREE.BoxGeometry(.36,.08,.09), brown, 'lower lip'); lower.position.set(0,.44,.44); parts.mouth.add(lower);

  parts.ears = new THREE.Group(); parts.head.add(parts.ears);
  const earL = mesh(new THREE.TorusGeometry(.17,.035,6,16), skin, 'left ear'); earL.rotation.y = Math.PI/2; earL.position.set(-.72,1.06,.02); parts.ears.add(earL);
  const earR = mesh(new THREE.TorusGeometry(.17,.035,6,16), skin, 'right ear'); earR.rotation.y = Math.PI/2; earR.position.set(.72,1.06,.02); parts.ears.add(earR);

  parts.neck = mesh(new THREE.CylinderGeometry(.34,.50,.80,6,1), skin, 'neck planes'); parts.neck.position.set(0,.04,0); root.add(parts.neck);
  const shoulders = mesh(new THREE.CylinderGeometry(.92,1.12,.28,6,1), skin, 'shoulder base'); shoulders.position.set(0,-.42,0); shoulders.scale.set(1.18,.55,.80); root.add(shoulders);

  root.traverse(o => { if(o.isMesh) addEdge(o); });
  return root;
}

function mesh(geo, mat, name){
  const m = new THREE.Mesh(geo, mat.clone());
  m.name = name;
  return m;
}

function addEdge(m){
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 18), new THREE.LineBasicMaterial({ color:0x050608, transparent:true, opacity:.95 }));
  e.name = 'edge'; e.userData.edge = true; m.add(e);
}

function buildLoomisOverlay(){
  loomisGroup.clear(); labelGroup.clear();
  const y = 1.28, rx = .82, ry = .96, rz = .52, front = .62;
  const blue = lineMat(0x52adff, .95), green = lineMat(0x4ee982, .95), yellow = lineMat(0xffd76d, .95), pink = lineMat(0xff5f9e, .95);
  loomisGroup.add(ellipse(rx, ry, 0, 0, y, blue, 'xy'));
  loomisGroup.add(ellipse(rx, rz, 0, 0, y, blue, 'xz'));
  loomisGroup.add(ellipse(rz*.76, ry*.92, rx*.78, 0, y, blue, 'zy'));
  loomisGroup.add(line([[0,y+ry*.75,front],[0,y-ry*1.15,front]], pink));
  const marks = [
    ['hair', y+ry*.38, green], ['brow', y+ry*.08, green], ['eye', y-ry*.03, yellow],
    ['nose', y-ry*.35, green], ['mouth', y-ry*.58, yellow], ['chin', y-ry*.82, green]
  ];
  marks.forEach(([name, yy, mat]) => {
    loomisGroup.add(faceLine(rx*.68, yy, front, mat));
    addLabel(name, -rx*1.04, yy, front+.02, mat.color);
  });
  addLabel('cranial ball', rx*.55, y+ry*.46, .1, 0x52adff);
  addLabel('side plane', rx*.88, y-ry*.12, .05, 0x52adff);
}

function lineMat(color, opacity=.9){ return new THREE.LineBasicMaterial({ color, transparent:true, opacity, depthTest:false }); }
function line(points, mat){ return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))), mat); }
function ellipse(a,b,x,z,y,mat,plane){
  const pts=[];
  for(let i=0;i<=128;i++){
    const t=Math.PI*2*i/128; let px=x,py=y,pz=z;
    if(plane==='xy'){ px=x+Math.cos(t)*a; py=y+Math.sin(t)*b; }
    if(plane==='xz'){ px=x+Math.cos(t)*a; pz=z+Math.sin(t)*b; }
    if(plane==='zy'){ px=x; py=y+Math.sin(t)*b; pz=z+Math.cos(t)*a; }
    pts.push(new THREE.Vector3(px,py,pz));
  }
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
}
function faceLine(width, yy, front, mat){
  const pts=[];
  for(let i=0;i<=40;i++){ const u=-1+2*i/40; pts.push(new THREE.Vector3(u*width, yy, front-Math.abs(u)*.035)); }
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
}
function addLabel(text,x,y,z,color){
  const c=document.createElement('canvas'); c.width=256; c.height=80;
  const ctx=c.getContext('2d'); ctx.font='bold 32px Arial'; ctx.lineWidth=8; ctx.strokeStyle='#050608'; ctx.strokeText(text, 8, 48); ctx.fillStyle='#'+color.getHexString(); ctx.fillText(text, 8, 48);
  const tex=new THREE.CanvasTexture(c);
  const spr=new THREE.Sprite(new THREE.SpriteMaterial({ map:tex, transparent:true, depthTest:false }));
  spr.position.set(x,y,z); spr.scale.set(.26,.08,1); labelGroup.add(spr);
}

function buildModeTabs(){
  modeTabs.innerHTML = '';
  modes.forEach(m => {
    const b = document.createElement('button');
    b.className = 'pill'; b.textContent = m.id;
    b.onclick = () => setMode(m.id);
    modeTabs.appendChild(b);
  });
}

function buildTopActions(){
  actionRow.innerHTML = '';
  const items = [
    ['Reload', () => reloadCurrent()],
    ['Info', () => renderInfo()],
    ['Loomis marks', () => { showMarks=!showMarks; refreshVisibility(); buildTopActions(); }]
  ];
  items.forEach(([label, fn]) => {
    const b=document.createElement('button'); b.className='outline'; b.textContent=label; b.onclick=fn;
    if(label==='Loomis marks' && showMarks) b.classList.add('on');
    actionRow.appendChild(b);
  });
}

function setMode(id){
  activeMode = id; activeMenu = 'home';
  [...modeTabs.children].forEach(b => b.classList.toggle('on', b.textContent === id));
  const m = modes.find(x=>x.id===id);
  sheetTitle.textContent = m.title;
  sheetDesc.textContent = m.desc;
  if(id === 'Loomis'){ showGuides = true; showLabels = true; showEdges = true; }
  if(id === 'Asaro'){ showGuides = false; showLabels = false; showEdges = true; }
  if(id === 'Planes'){ showGuides = false; showLabels = true; showEdges = true; }
  if(id === 'Sculpt'){ showGuides = false; showLabels = false; showEdges = true; }
  refreshVisibility();
  renderBody();
}

function refreshVisibility(){
  const guides = activeMode === 'Loomis' && showMarks && showGuides && activeModel === 'study';
  loomisGroup.visible = guides;
  labelGroup.visible = guides && showLabels;
  modelRoot.traverse(o => { if(o.userData.edge) o.visible = showEdges; });
}

function renderBody(){
  if(activeMode === 'Sculpt') return renderSculptHome();
  sheetBody.innerHTML = '';
  const p = document.createElement('div');
  p.className = 'study-card';
  p.innerHTML = activeMode === 'Loomis'
    ? '<b>How to study:</b><br>1. Start with the cranial ball and side plane. 2. Use brow / nose / mouth / chin marks as reference, not decoration. 3. Rotate to profile and 3/4 to check if the marks still make sense.'
    : activeMode === 'Asaro'
      ? '<b>Asaro mode:</b><br>Use the dark and light planes to study value groups. Keep edges on, rotate slowly, and compare each plane to the next.'
      : '<b>Planes mode:</b><br>Use the polygon breaks to see the large forms of skull, brow, cheek, jaw and neck.';
  sheetBody.appendChild(p);
}

function renderSculptHome(){
  sheetBody.innerHTML = '';
  categories.forEach(cat => {
    const b=document.createElement('button'); b.className='big-row'; b.innerHTML = `<span>${cat.label}</span><span>›</span>`;
    b.onclick = () => renderCategory(cat.id);
    sheetBody.appendChild(b);
  });
}

function renderCategory(id){
  const cat = categories.find(c=>c.id===id);
  activeMenu = id;
  sheetTitle.innerHTML = `<button class="back" id="backBtn">‹</button>${cat.label}`;
  $('backBtn').onclick = () => { sheetTitle.textContent = 'Modify Facial Features'; renderSculptHome(); };
  sheetDesc.textContent = id === 'Head' ? 'Tilt and turn the head for drawing angles.' : 'Modify the simplified study model.';
  sheetBody.innerHTML = '';
  cat.sliders.forEach(([key,label,min,max,step]) => sheetBody.appendChild(slider(key,label,min,max,step)));
}

function slider(key,label,min,max,step){
  const wrap=document.createElement('div'); wrap.className='slider-row';
  wrap.innerHTML = `<div class="slider-top"><span>${label}</span><span class="val">${values[key]}</span></div><div class="range-wrap"><span>-</span><input type="range" min="${min}" max="${max}" step="${step}" value="${values[key]}"><span>+</span></div>`;
  const input=wrap.querySelector('input'), val=wrap.querySelector('.val');
  input.oninput = () => { values[key] = Number(input.value); val.textContent = values[key]; applySculpt(); };
  return wrap;
}

function applySculpt(){
  if(!activeRoot) return;
  activeRoot.rotation.set(THREE.MathUtils.degToRad(values.pitch), THREE.MathUtils.degToRad(values.yaw), THREE.MathUtils.degToRad(values.roll));
  if(activeModel !== 'study') return;
  parts.brows.position.y = values.browHeight * .12;
  parts.brows.rotation.z = values.browAngle * .16;
  parts.eyes.scale.y = Math.max(.35, 1 + values.eyeOpen * .45);
  parts.eyes.rotation.z = values.eyeSlant * .10;
  parts.nose.scale.set(1 + values.noseWidth*.22, 1, 1 + values.noseLength*.35);
  parts.cheeks.scale.x = 1 + values.cheekWidth*.22;
  parts.mouth.scale.x = 1 + values.mouthWidth*.35;
  parts.mouth.position.y = values.mouthSmile * .05;
  parts.mouth.rotation.z = values.mouthSmile * .04;
  parts.jaw.scale.x = 1 + values.jawWidth*.28;
  parts.jaw.scale.y = .78 + values.chinLength*.18;
  parts.neck.scale.x = 1 + values.neckWidth*.25;
}

function renderSettings(){
  sheetTitle.textContent = 'Settings';
  sheetDesc.textContent = 'Choose which model to study and what overlays are visible.';
  sheetBody.innerHTML = '';
  const make = (label, active, fn) => { const b=document.createElement('button'); b.className='big-row'; if(active) b.classList.add('active'); b.innerHTML=`<span>${label}</span><span>${active?'✓':'›'}</span>`; b.onclick=fn; sheetBody.appendChild(b); };
  make('Study planes model', activeModel==='study', () => loadStudy());
  make('Real MPFB model', activeModel==='mpfb', () => loadMpfb());
  make('Toggle edges', showEdges, () => { showEdges=!showEdges; refreshVisibility(); renderSettings(); });
  make('Toggle labels', showLabels, () => { showLabels=!showLabels; refreshVisibility(); renderSettings(); });
  make('Toggle Loomis marks', showMarks, () => { showMarks=!showMarks; refreshVisibility(); renderSettings(); buildTopActions(); });
}

function renderInfo(){
  sheetTitle.textContent = 'Info';
  sheetDesc.textContent = activeModel === 'study' ? 'This is the study model built for Loomis / Asaro / planes practice.' : 'This is the external MPFB GLB model loaded from the repo.';
  sheetBody.innerHTML = `<div class="study-card"><b>Current model:</b> ${activeModel === 'study' ? 'Study planes head' : 'Real MPFB'}<br><b>Current mode:</b> ${activeMode}<br><b>Edges:</b> ${showEdges ? 'on' : 'off'}<br><b>Loomis marks:</b> ${showMarks ? 'on' : 'off'}<br><br>The Loomis overlay is intended for the study planes model. It is not forced onto the realistic MPFB face because it becomes misleading.</div>`;
}

function reloadCurrent(){ activeModel === 'study' ? loadStudy() : loadMpfb(true); }
function loadStudy(){ activeModel='study'; modelName.textContent='STUDY'; setActiveRoot(studyRoot); buildLoomisOverlay(); setMode(activeMode); }

function loadMpfb(force=false){
  if(isLoadingMpfb) return;
  isLoadingMpfb = true;
  loader.classList.remove('hide'); loaderText.textContent = 'Loading real MPFB model...';
  new GLTFLoader().load(MPFB_URL + (force ? '&r=' + Date.now() : ''), gltf => {
    isLoadingMpfb = false;
    loader.classList.add('hide');
    const root = gltf.scene;
    root.name = 'Real_MPFB';
    prepareMpfb(root);
    activeModel='mpfb'; modelName.textContent='MPFB';
    setActiveRoot(root); showGuides=false; setMode('Sculpt');
  }, e => {
    const total = e.total || 36815920; const pct = Math.round((e.loaded||0)/total*100);
    loaderText.textContent = `Loading MPFB: ${pct}%`;
  }, err => {
    isLoadingMpfb=false; loader.classList.add('hide');
    sheetTitle.textContent = 'MPFB failed'; sheetDesc.textContent = err?.message || String(err);
  });
}

function prepareMpfb(root){
  morphMeshes=[]; morphNames=[];
  const mat = new THREE.MeshStandardMaterial({ color:0xe6b9a2, roughness:.75, metalness:0, side:THREE.DoubleSide });
  root.traverse(o=>{
    if(o.isMesh){
      o.visible=true; o.frustumCulled=false; o.material=mat.clone();
      if(o.morphTargetDictionary && o.morphTargetInfluences){ morphMeshes.push(o); Object.keys(o.morphTargetDictionary).forEach(k=>morphNames.push(k)); }
    }
  });
  fitRoot(root);
}

function fitRoot(root){
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3(), center = new THREE.Vector3(); box.getSize(size); box.getCenter(center);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = 2.5 / maxDim;
  root.scale.multiplyScalar(scale);
  root.position.x -= center.x * scale;
  root.position.y += 1.05 - center.y * scale;
  root.position.z -= center.z * scale;
}

function toggleModel(){ activeModel === 'study' ? loadMpfb() : loadStudy(); }
function cycleCamera(){
  const cams = ['front','threeq','profile','up','down'];
  activeCamera = cams[(cams.indexOf(activeCamera)+1) % cams.length];
  setCamera(activeCamera);
}
function setCamera(name){
  activeCamera = name;
  const t = activeModel === 'study' ? headCenter : new THREE.Vector3(0,1.05,0);
  const d = 4.0;
  const map = { front:[0,t.y,d], threeq:[-1.45,t.y+.02,3.25], profile:[-d,t.y,.02], up:[0,t.y+.85,2.75], down:[0,t.y-.75,2.75] };
  camera.position.set(...(map[name] || map.front)); controls.target.copy(t); controls.update();
}

window.setCamera = setCamera;
window.setMode = setMode;
