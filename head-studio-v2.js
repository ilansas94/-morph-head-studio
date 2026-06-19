import * as THREE from 'https://esm.sh/three@0.160.1';
import { OrbitControls } from 'https://esm.sh/three@0.160.1/examples/jsm/controls/OrbitControls.js?deps=three@0.160.1';
import { GLTFLoader } from 'https://esm.sh/three@0.160.1/examples/jsm/loaders/GLTFLoader.js?deps=three@0.160.1';

const STUDY_B64_URL = './assets/models/study-planes-head.glb.b64?v=study-v2';
const MPFB_URL = './assets/morph-loomis-head/mpfb.glb?v=study-v2';
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

let scene, camera, renderer, controls, modelRoot, loomisGroup, labelGroup;
let studyRoot = null;
let activeRoot = null;
let activeModel = 'study';
let activeMode = 'Loomis';
let activeCamera = 'front';
let showEdges = true;
let showLabels = true;
let showMarks = true;
let loadingMpfb = false;
let mapped = {};
let morphMeshes = [];
let morphNames = [];

const headCenter = new THREE.Vector3(0, 1.18, 0);
const values = { yaw:0, pitch:0, roll:0, browHeight:0, browAngle:0, eyeOpen:0, eyeSlant:0, noseLength:0, noseWidth:0, cheekWidth:0, mouthWidth:0, mouthSmile:0, jawWidth:0, chinLength:0, neckWidth:0 };

const modes = [
  ['Loomis','Loomis Head','real Loomis marks on the physical study model: cranial ball, side plane, brow, nose, mouth and chin.'],
  ['Asaro','Asaro Planes','low-poly value planes for light, shadow and major facial structure.'],
  ['Planes','Planes & Form','clean faceted model for studying skull, brow, cheek, jaw and neck masses.'],
  ['Sculpt','Modify Facial Features','modify the physical study model with simple controls.']
];
const categories = [
  ['Brows','Eyebrows', [['browHeight','Height',-1,1,.01],['browAngle','Angle',-1,1,.01]]],
  ['Eyes','Eyes', [['eyeOpen','Open / Close',-1,1,.01],['eyeSlant','Slant',-1,1,.01]]],
  ['Nose','Nose', [['noseLength','Length',-1,1,.01],['noseWidth','Width',-1,1,.01]]],
  ['Cheek','Cheek', [['cheekWidth','Width',-1,1,.01]]],
  ['Mouth','Mouth', [['mouthWidth','Width',-1,1,.01],['mouthSmile','Smile / Frown',-1,1,.01]]],
  ['Jaw','Jaw', [['jawWidth','Width',-1,1,.01],['chinLength','Chin Length',-1,1,.01]]],
  ['Head','Tilt Head', [['pitch','Forward / Backward',-45,45,1],['roll','Tilt',-35,35,1],['yaw','Turn',-60,60,1]]]
];

main().catch(err => showFatal(err));

async function main(){
  initThree();
  buildUi();
  showLoader('Loading physical study-head GLB from repo...');
  studyRoot = await loadStudyPhysical();
  prepareStudy(studyRoot);
  setActiveRoot(studyRoot, 'study');
  hideLoader();
  setMode('Loomis');
  animate();
}

function initThree(){
  renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x202026);
  camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, .01, 100);
  scene.add(new THREE.AmbientLight(0xffffff, 1.85));
  const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(2,4,5); scene.add(key);
  const fill = new THREE.DirectionalLight(0x9edcff, 1.2); fill.position.set(-3,2,-2); scene.add(fill);
  modelRoot = new THREE.Group(); scene.add(modelRoot);
  loomisGroup = new THREE.Group(); scene.add(loomisGroup);
  labelGroup = new THREE.Group(); scene.add(labelGroup);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 1.1;
  controls.maxDistance = 7;
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
}

function animate(){ requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); }

function buildUi(){
  $('gearBtn').onclick = renderSettings;
  $('camBtn').onclick = cycleCamera;
  $('modelBtn').onclick = () => activeModel === 'study' ? loadMpfb() : loadStudy();
  modeTabs.innerHTML = '';
  modes.forEach(([id]) => { const b = document.createElement('button'); b.className = 'pill'; b.textContent = id; b.onclick = () => setMode(id); modeTabs.appendChild(b); });
  buildActions();
}

function buildActions(){
  actionRow.innerHTML = '';
  [['Reload', reloadCurrent], ['Info', renderInfo], ['Loomis marks', () => { showMarks = !showMarks; refreshVisibility(); buildActions(); }]].forEach(([label, fn]) => {
    const b = document.createElement('button'); b.className = 'outline'; b.textContent = label; b.onclick = fn;
    if(label === 'Loomis marks' && showMarks) b.classList.add('on');
    actionRow.appendChild(b);
  });
}

async function loadStudyPhysical(){
  const res = await fetch(STUDY_B64_URL, { cache:'reload' });
  if(!res.ok) throw new Error('study model file missing: HTTP ' + res.status);
  const text = (await res.text()).trim();
  if(text.length < 1000) throw new Error('study model file is too small');
  const bin = atob(text);
  const bytes = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return await parseGlb(bytes.buffer);
}

function parseGlb(buffer){
  return new Promise((resolve, reject) => new GLTFLoader().parse(buffer, '', gltf => resolve(gltf.scene), reject));
}

function prepareStudy(root){
  mapped = { brows:[], eyes:[], nose:[], cheeks:[], mouth:[], jaw:[], neck:[] };
  root.name = 'Physical_Study_Planes_Head';
  root.traverse(o => {
    if(!o.isMesh) return;
    o.visible = true;
    o.frustumCulled = false;
    if(o.material){ o.material.flatShading = true; o.material.needsUpdate = true; o.material.side = THREE.DoubleSide; }
    o.userData.basePosition = o.position.clone();
    o.userData.baseScale = o.scale.clone();
    o.userData.baseRotation = o.rotation.clone();
    const n = o.name.toLowerCase();
    if(n.includes('brow')) mapped.brows.push(o);
    if(n.includes('eye')) mapped.eyes.push(o);
    if(n.includes('nose')) mapped.nose.push(o);
    if(n.includes('cheek')) mapped.cheeks.push(o);
    if(n.includes('lip')) mapped.mouth.push(o);
    if(n.includes('jaw')) mapped.jaw.push(o);
    if(n.includes('neck')) mapped.neck.push(o);
    addEdges(o);
  });
}

function addEdges(mesh){
  if(mesh.userData.hasEdges) return;
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 12), new THREE.LineBasicMaterial({ color:0x050506, transparent:true, opacity:.95 }));
  e.userData.edge = true;
  mesh.add(e);
  mesh.userData.hasEdges = true;
}

function setActiveRoot(root, kind){
  activeModel = kind;
  modelName.textContent = kind === 'study' ? 'STUDY' : 'MPFB';
  modelRoot.clear();
  activeRoot = root;
  modelRoot.add(root);
  applySculpt();
  buildLoomisOverlay();
  refreshVisibility();
  setCamera(activeCamera);
}

function setMode(id){
  activeMode = id;
  [...modeTabs.children].forEach(b => b.classList.toggle('on', b.textContent === id));
  const m = modes.find(x => x[0] === id);
  sheetTitle.textContent = m[1];
  sheetDesc.textContent = m[2];
  if(id === 'Sculpt') renderSculptHome(); else renderStudyText(id);
  refreshVisibility();
}

function refreshVisibility(){
  const guideOn = activeModel === 'study' && activeMode === 'Loomis' && showMarks;
  loomisGroup.visible = guideOn;
  labelGroup.visible = guideOn && showLabels;
  modelRoot.traverse(o => { if(o.userData.edge) o.visible = showEdges; });
}

function buildLoomisOverlay(){
  loomisGroup.clear(); labelGroup.clear();
  const y = 1.28, rx = .82, ry = .96, rz = .52, front = .62;
  const blue = lm(0x52adff), green = lm(0x4ee982), yellow = lm(0xffd76d), pink = lm(0xff5f9e);
  loomisGroup.add(ellipse(rx, ry, 0, 0, y, blue, 'xy'));
  loomisGroup.add(ellipse(rx, rz, 0, 0, y, blue, 'xz'));
  loomisGroup.add(ellipse(rz*.76, ry*.92, rx*.78, 0, y, blue, 'zy'));
  loomisGroup.add(line([[0,y+ry*.78,front],[0,y-ry*1.16,front]], pink));
  [['hair',y+ry*.38,green],['brow',y+ry*.08,green],['eye',y-ry*.03,yellow],['nose',y-ry*.35,green],['mouth',y-ry*.58,yellow],['chin',y-ry*.82,green]].forEach(([name, yy, mat]) => { loomisGroup.add(faceLine(rx*.68, yy, front, mat)); addLabel(name, -rx*1.05, yy, front+.03, mat.color); });
  addLabel('cranial ball', rx*.48, y+ry*.45, .08, blue.color);
  addLabel('side plane', rx*.86, y-ry*.10, .06, blue.color);
}

function lm(color){ return new THREE.LineBasicMaterial({ color, transparent:true, opacity:.95, depthTest:false }); }
function line(points, mat){ return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p))), mat); }
function ellipse(a,b,x,z,y,mat,plane){ const pts=[]; for(let i=0;i<=128;i++){ const t=Math.PI*2*i/128; let px=x,py=y,pz=z; if(plane==='xy'){px=x+Math.cos(t)*a;py=y+Math.sin(t)*b;} if(plane==='xz'){px=x+Math.cos(t)*a;pz=z+Math.sin(t)*b;} if(plane==='zy'){px=x;py=y+Math.sin(t)*b;pz=z+Math.cos(t)*a;} pts.push(new THREE.Vector3(px,py,pz)); } return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat); }
function faceLine(width, yy, front, mat){ const pts=[]; for(let i=0;i<=40;i++){ const u=-1+2*i/40; pts.push(new THREE.Vector3(u*width, yy, front-Math.abs(u)*.035)); } return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat); }
function addLabel(text,x,y,z,color){ const c=document.createElement('canvas'); c.width=260; c.height=80; const ctx=c.getContext('2d'); ctx.font='bold 32px Arial'; ctx.lineWidth=8; ctx.strokeStyle='#07070a'; ctx.strokeText(text,8,48); ctx.fillStyle='#'+color.getHexString(); ctx.fillText(text,8,48); const tex=new THREE.CanvasTexture(c); const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false})); s.position.set(x,y,z); s.scale.set(.26,.08,1); labelGroup.add(s); }

function renderStudyText(id){
  sheetBody.innerHTML = '';
  const div = document.createElement('div'); div.className = 'study-card';
  div.innerHTML = id === 'Loomis'
    ? '<b>How to study Loomis:</b><br>1. Start from the cranial ball. 2. Check the side plane in profile and 3/4. 3. Use brow / nose / mouth / chin as construction marks, not decoration.'
    : id === 'Asaro'
      ? '<b>Asaro study:</b><br>Use the light and dark planes to understand major value groups across the brow, cheek, nose, mouth and jaw.'
      : '<b>Planes study:</b><br>Rotate the model and look for the big masses: skull, brow block, cheek wedge, jaw block and neck cylinder.';
  sheetBody.appendChild(div);
}

function renderSculptHome(){
  sheetBody.innerHTML = '';
  categories.forEach(([id,label]) => { const b=document.createElement('button'); b.className='big-row'; b.innerHTML = `<span>${label}</span><span>›</span>`; b.onclick=()=>renderCategory(id); sheetBody.appendChild(b); });
}
function renderCategory(id){
  const cat = categories.find(c => c[0] === id);
  sheetTitle.innerHTML = `<button class="back" id="backBtn">‹</button>${cat[1]}`;
  $('backBtn').onclick = () => { sheetTitle.textContent = 'Modify Facial Features'; sheetDesc.textContent = 'modify the physical study model with simple controls.'; renderSculptHome(); };
  sheetDesc.textContent = id === 'Head' ? 'Tilt and turn the head for drawing angles.' : 'Modify this part of the physical study model.';
  sheetBody.innerHTML = '';
  cat[2].forEach(([key,label,min,max,step]) => sheetBody.appendChild(makeSlider(key,label,min,max,step)));
}
function makeSlider(key,label,min,max,step){
  const row=document.createElement('div'); row.className='slider-row';
  row.innerHTML = `<div class="slider-top"><span>${label}</span><span class="val">${values[key]}</span></div><div class="range-wrap"><span>-</span><input type="range" min="${min}" max="${max}" step="${step}" value="${values[key]}"><span>+</span></div>`;
  const input=row.querySelector('input'), val=row.querySelector('.val');
  input.oninput = () => { values[key] = Number(input.value); val.textContent = values[key]; applySculpt(); };
  return row;
}

function resetMeshTransforms(){
  if(activeModel !== 'study') return;
  Object.values(mapped).flat().forEach(o => { o.position.copy(o.userData.basePosition); o.scale.copy(o.userData.baseScale); o.rotation.copy(o.userData.baseRotation); });
}
function applySculpt(){
  if(!activeRoot) return;
  activeRoot.rotation.set(THREE.MathUtils.degToRad(values.pitch), THREE.MathUtils.degToRad(values.yaw), THREE.MathUtils.degToRad(values.roll));
  if(activeModel !== 'study') return;
  resetMeshTransforms();
  mapped.brows.forEach(o => { o.position.y += values.browHeight*.12; o.rotation.z += values.browAngle*.16 * (o.name.includes('_L') ? -1 : 1); });
  mapped.eyes.forEach(o => { o.scale.y *= Math.max(.35, 1 + values.eyeOpen*.5); o.rotation.z += values.eyeSlant*.12 * (o.name.includes('_L') ? -1 : 1); });
  mapped.nose.forEach(o => { o.scale.x *= 1 + values.noseWidth*.22; o.scale.z *= 1 + values.noseLength*.35; });
  mapped.cheeks.forEach(o => { o.scale.x *= 1 + values.cheekWidth*.22; });
  mapped.mouth.forEach(o => { o.scale.x *= 1 + values.mouthWidth*.35; o.position.y += values.mouthSmile*.05; });
  mapped.jaw.forEach(o => { o.scale.x *= 1 + values.jawWidth*.28; o.scale.y *= 1 + values.chinLength*.22; });
  mapped.neck.forEach(o => { o.scale.x *= 1 + values.neckWidth*.25; });
}

function renderSettings(){
  sheetTitle.textContent = 'Settings';
  sheetDesc.textContent = 'Choose model and overlays.';
  sheetBody.innerHTML = '';
  row('Study planes model', activeModel === 'study', loadStudy);
  row('Real MPFB model', activeModel === 'mpfb', () => loadMpfb());
  row('Toggle edges', showEdges, () => { showEdges=!showEdges; refreshVisibility(); renderSettings(); });
  row('Toggle labels', showLabels, () => { showLabels=!showLabels; refreshVisibility(); renderSettings(); });
  row('Toggle Loomis marks', showMarks, () => { showMarks=!showMarks; refreshVisibility(); renderSettings(); buildActions(); });
}
function row(label, active, fn){ const b=document.createElement('button'); b.className='big-row'; if(active) b.classList.add('active'); b.innerHTML=`<span>${label}</span><span>${active?'✓':'›'}</span>`; b.onclick=fn; sheetBody.appendChild(b); }
function renderInfo(){ sheetTitle.textContent='Info'; sheetDesc.textContent=''; sheetBody.innerHTML = `<div class="study-card"><b>Current model:</b> ${activeModel === 'study' ? 'Physical study GLB' : 'Real MPFB'}<br><b>Mode:</b> ${activeMode}<br><br>The study head is a physical GLB file inside the repo at <code>assets/models/study-planes-head.glb.b64</code>. The realistic MPFB model is still available, but Loomis/Asaro marks are meant for the study planes head.</div>`; }
function reloadCurrent(){ activeModel === 'study' ? loadStudy() : loadMpfb(true); }
function loadStudy(){ setActiveRoot(studyRoot, 'study'); setMode(activeMode); }

function loadMpfb(force=false){
  if(loadingMpfb) return;
  loadingMpfb = true; showLoader('Loading real MPFB model...');
  new GLTFLoader().load(MPFB_URL + (force ? '&r='+Date.now() : ''), gltf => {
    loadingMpfb = false; hideLoader();
    const root = gltf.scene;
    prepareMpfb(root);
    setActiveRoot(root, 'mpfb');
    setMode('Sculpt');
  }, e => { const total=e.total||36815920; loaderText.textContent = `Loading MPFB: ${Math.round((e.loaded||0)/total*100)}%`; }, err => { loadingMpfb=false; hideLoader(); showFatal(err); });
}
function prepareMpfb(root){
  morphMeshes=[]; morphNames=[];
  const mat = new THREE.MeshStandardMaterial({color:0xe6b9a2,roughness:.75,metalness:0,side:THREE.DoubleSide});
  root.traverse(o => { if(o.isMesh){ o.frustumCulled=false; o.material=mat.clone(); addEdges(o); if(o.morphTargetDictionary){ morphMeshes.push(o); Object.keys(o.morphTargetDictionary).forEach(k=>morphNames.push(k)); } } });
  fitRoot(root);
}
function fitRoot(root){
  root.updateMatrixWorld(true); const box=new THREE.Box3().setFromObject(root); const size=new THREE.Vector3(), center=new THREE.Vector3(); box.getSize(size); box.getCenter(center); const maxDim=Math.max(size.x,size.y,size.z)||1; const scale=2.35/maxDim; root.scale.multiplyScalar(scale); root.position.x-=center.x*scale; root.position.y+=1.05-center.y*scale; root.position.z-=center.z*scale;
}

function cycleCamera(){ const cams=['front','threeq','profile','up','down']; setCamera(cams[(cams.indexOf(activeCamera)+1)%cams.length]); }
function setCamera(name){
  activeCamera = name;
  const t = activeModel === 'study' ? headCenter : new THREE.Vector3(0,1.05,0);
  const d = activeModel === 'study' ? 4.1 : 3.2;
  const map = { front:[0,t.y,d], threeq:[-1.45,t.y+.02,3.25], profile:[-d,t.y,.02], up:[0,t.y+.85,2.85], down:[0,t.y-.75,2.85] };
  camera.position.set(...(map[name] || map.front)); controls.target.copy(t); controls.update();
}
function showLoader(msg){ loader.classList.remove('hide'); loaderText.textContent = msg; }
function hideLoader(){ loader.classList.add('hide'); }
function showFatal(err){ hideLoader(); sheetTitle.textContent='Load error'; sheetDesc.textContent = err?.message || String(err); sheetBody.innerHTML='<div class="study-card err">The model did not load. This is an app error, not your phone.</div>'; }
