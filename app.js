import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/environments/RoomEnvironment.js';

const LOCAL_GLB = './assets/morph-loomis-head/morph_loomis_head_arkit_oculus.glb?v=external-v4';

const canvas = document.getElementById('view');
const loader = document.getElementById('loader');
const loaderText = document.getElementById('loaderText');
const statusEl = document.getElementById('status');
const poseEl = document.getElementById('poseSliders');
const morphEl = document.getElementById('morphSliders');
const catsEl = document.getElementById('cats');
const guidesBtn = document.getElementById('guidesBtn');
const edgeBtn = document.getElementById('edgeBtn');
const labelBtn = document.getElementById('labelBtn');

let scene, camera, renderer, controls, rig, modelRoot, guideGroup, labelGroup;
let morphMeshes = [], morphNames = [], activeCat = 'All';
let edgesOn = true, guidesOn = true, labelsOn = true;
let pose = { yaw:0, pitch:0, roll:0 };

const cats = {
  All: null,
  Brows: ['brow'],
  Eyes: ['eye','blink','squint','look','wide'],
  Nose: ['nose','sneer'],
  Mouth: ['mouth','jaw','lip','smile','pucker','funnel','viseme'],
  Cheek: ['cheek']
};

init();
loadExternalGLB();

function init(){
  renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111318);
  camera = new THREE.PerspectiveCamera(34, innerWidth/innerHeight, 0.01, 100);
  camera.position.set(0, 1.05, 3.0);

  try {
    const env = new RoomEnvironment(renderer);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(env, .04).texture;
  } catch(e) {}

  scene.add(new THREE.HemisphereLight(0xffffff, 0x263040, 2.0));
  const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(2,3,4); scene.add(key);
  const rim = new THREE.DirectionalLight(0x8edfff, 1.3); rim.position.set(-3,2,-2); scene.add(rim);

  rig = new THREE.Group(); scene.add(rig);
  modelRoot = new THREE.Group(); rig.add(modelRoot);
  guideGroup = new THREE.Group(); rig.add(guideGroup);
  labelGroup = new THREE.Group(); rig.add(labelGroup);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, .95, 0);
  controls.minDistance = 1.0;
  controls.maxDistance = 6;

  addEventListener('resize', () => {
    camera.aspect = innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  document.querySelectorAll('[data-camera]').forEach(b=>b.onclick=()=>setCamera(b.dataset.camera));
  document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>preset(b.dataset.preset));
  document.getElementById('resetBtn').onclick = resetAll;
  guidesBtn.onclick = () => { guidesOn=!guidesOn; guideGroup.visible=guidesOn; guidesBtn.classList.toggle('on', guidesOn); };
  edgeBtn.onclick = () => { edgesOn=!edgesOn; edgeBtn.classList.toggle('on', edgesOn); setEdges(edgesOn); };
  labelBtn.onclick = () => { labelsOn=!labelsOn; labelGroup.visible=labelsOn; labelBtn.classList.toggle('on', labelsOn); };
  guidesBtn.classList.add('on'); edgeBtn.classList.add('on'); labelBtn.classList.add('on');

  buildPoseSliders();
  buildCats();
  animate();
}

function animate(){ requestAnimationFrame(animate); controls.update(); renderer.render(scene,camera); }

async function loadExternalGLB(){
  loader.classList.remove('hide');
  loaderText.textContent = 'טוען את קובץ ה־GLB החיצוני מהריפו...';
  try {
    const arrayBuffer = await fetchArrayBufferWithTimeout(LOCAL_GLB, 12000);
    loaderText.textContent = `ה־GLB ירד (${Math.round(arrayBuffer.byteLength/1024)}KB), מפענח morph targets...`;
    const gltf = await parseGLBWithTimeout(arrayBuffer, 12000);
    setupModel(gltf.scene, arrayBuffer.byteLength);
    loader.classList.add('hide');
  } catch (err) {
    console.error(err);
    loader.classList.add('hide');
    statusEl.innerHTML = `<span class="err">ה־GLB החיצוני לא נטען: ${escapeHtml(err.message || String(err))}</span><br><span class="status">קובץ שנבדק: assets/morph-loomis-head/morph_loomis_head_arkit_oculus.glb</span>`;
  }
}

async function fetchArrayBufferWithTimeout(url, ms){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { cache:'no-store', signal: controller.signal });
    if(!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.arrayBuffer();
  } finally {
    clearTimeout(timer);
  }
}

function parseGLBWithTimeout(arrayBuffer, ms){
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('GLTFLoader parse timeout')), ms);
    const gltfLoader = new GLTFLoader();
    gltfLoader.parse(arrayBuffer, '', gltf => { clearTimeout(timer); resolve(gltf); }, err => { clearTimeout(timer); reject(err); });
  });
}

function setupModel(root, byteLength){
  modelRoot.clear(); guideGroup.clear(); labelGroup.clear(); morphMeshes=[]; morphNames=[];

  root.traverse(o=>{
    if(o.isMesh){
      o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m=>{ if(m){ if('roughness' in m) m.roughness=.72; if('metalness' in m) m.metalness=0; m.side = THREE.DoubleSide; } });
      if(o.morphTargetDictionary && o.morphTargetInfluences){
        morphMeshes.push(o);
        Object.keys(o.morphTargetDictionary).forEach(k=>morphNames.push(k));
      }
    }
  });

  morphNames = [...new Set(morphNames)].sort((a,b)=>clean(a).localeCompare(clean(b)));
  modelRoot.add(root);
  normalizeToView(root);

  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3(); box.getSize(size);
  const headY = box.min.y + size.y * .62;
  const headH = size.y * .62;
  buildLoomisGuides(headY, headH);
  setEdges(true);
  buildMorphSliders();
  setCamera('front');

  statusEl.innerHTML = morphNames.length
    ? `<span class="ok">נטען GLB חיצוני מהריפו (${Math.round(byteLength/1024)}KB). נמצאו ${morphNames.length} morph targets.</span>`
    : `<span class="err">ה־GLB החיצוני נטען, אבל לא נמצאו morph targets.</span>`;
}

function normalizeToView(root){
  let box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3(); box.getSize(size);
  if(!Number.isFinite(size.y) || size.y <= 0.0001) throw new Error('empty GLB bounds');
  const scale = 2.25 / size.y;
  root.scale.multiplyScalar(scale);
  box = new THREE.Box3().setFromObject(root);
  const center = new THREE.Vector3(); box.getCenter(center);
  root.position.x -= center.x;
  root.position.y += .95 - center.y;
  root.position.z -= center.z;
}

function buildLoomisGuides(y, h){
  guideGroup.clear(); labelGroup.clear();
  const rx=h*.46, ry=h*.56, rz=h*.34, front=rz*.92;
  const matG = mat(0x5af096), matY=mat(0xffd66f), matB=mat(0x57c9ff), matP=mat(0xff78a0);

  guideGroup.add(ellipse(rx, ry, 0, 0, 0, y, matB, 'xy'));
  guideGroup.add(ellipse(rx, rz, 0, 0, 0, y, matB, 'xz'));
  guideGroup.add(ellipse(rz*.7, ry*.86, rx*.82, 0, 0, y, matB, 'zy', true));
  guideGroup.add(line([[0,y+ry*.75,front],[0,y-ry*1.18,front]], matP));

  const marks = [
    ['hair', y+ry*.42, matG], ['brow', y+ry*.12, matG], ['eyes', y+ry*.02, matY],
    ['nose', y-ry*.30, matG], ['mouth', y-ry*.54, matY], ['chin', y-ry*.82, matG]
  ];
  marks.forEach(([name,yy,m])=>{ guideGroup.add(faceArc(rx*.72, yy, front, m)); addLabel(name, -rx*.92, yy, front+.03, m.color); });

  const x=rx*1.04, y1=y+ry*.12, y2=y-ry*.30;
  guideGroup.add(line([[x,y1,0],[x,y2,0]], matY));
  guideGroup.add(line([[x-.08,y1,0],[x+.08,y1,0]], matY));
  guideGroup.add(line([[x-.08,y2,0],[x+.08,y2,0]], matY));
  addLabel('ear range', x+.08, (y1+y2)/2, .02, 0xffd66f);
  addLabel('side plane', rx*.9, y-ry*.65, 0, 0x57c9ff);
}

function mat(color){ return new THREE.LineBasicMaterial({color, transparent:true, opacity:.96, depthTest:false}); }
function line(points, material){ return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))), material); }
function ellipse(a,b,x,z,rot,y,material,plane='xy',dash=false){
  const pts=[];
  for(let i=0;i<=96;i++){
    const t=Math.PI*2*i/96; let px=x,py=y,pz=z;
    if(plane==='xy'){px=x+Math.cos(t)*a; py=y+Math.sin(t)*b; pz=z;}
    if(plane==='xz'){px=x+Math.cos(t)*a; py=y; pz=z+Math.sin(t)*b;}
    if(plane==='zy'){px=x; py=y+Math.sin(t)*b; pz=z+Math.cos(t)*a;}
    pts.push(new THREE.Vector3(px,py,pz));
  }
  const obj=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), material);
  if(dash){obj.material=material.clone(); obj.material.opacity=.75;}
  return obj;
}
function faceArc(rx, yy, front, material){
  const pts=[];
  for(let i=0;i<=40;i++){ const u=-1+2*i/40; const x=u*rx; const z=front - Math.abs(u)*.035; pts.push(new THREE.Vector3(x,yy,z)); }
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), material);
}
function addLabel(text,x,y,z,color){
  const c=document.createElement('canvas'); c.width=256; c.height=64; const ctx=c.getContext('2d');
  ctx.font='bold 34px Arial'; ctx.fillStyle='#000'; ctx.lineWidth=8; ctx.strokeStyle='#000'; ctx.strokeText(text,8,42); ctx.fillStyle='#'+color.toString(16).padStart(6,'0'); ctx.fillText(text,8,42);
  const tex=new THREE.CanvasTexture(c); const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
  spr.position.set(x,y,z); spr.scale.set(.28,.07,1); labelGroup.add(spr);
}

function setEdges(on){
  modelRoot.traverse(o=>{
    if(o.userData.edge){ o.visible=on; return; }
    if(o.isMesh && on && !o.userData.hasEdge){
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 25), new THREE.LineBasicMaterial({color:0x111111, transparent:true, opacity:.30}));
      e.userData.edge=true; o.add(e); o.userData.hasEdge=true;
    }
  });
}
function clean(n){ return String(n).replace(/^Wolf3D_Head\./,'').replace(/^blendShape1\./,'').replace(/_/g,' '); }
function lower(n){ return clean(n).toLowerCase(); }
function buildCats(){ catsEl.innerHTML=''; Object.keys(cats).forEach(c=>{ const b=document.createElement('button'); b.className='tab'+(c===activeCat?' on':''); b.textContent=c; b.onclick=()=>{activeCat=c; buildCats(); buildMorphSliders();}; catsEl.appendChild(b); }); }
function buildMorphSliders(){
  morphEl.innerHTML=''; const needles=cats[activeCat];
  const arr=morphNames.filter(n=>!needles || needles.some(s=>lower(n).includes(s)));
  if(!arr.length){ morphEl.innerHTML='<div class="status">אין sliders בקטגוריה הזאת במודל הנוכחי.</div>'; return; }
  arr.forEach(n=>morphEl.appendChild(slider(clean(n),0,1,.01,0,v=>setMorph(n,v))));
}
function setMorph(name,v){ morphMeshes.forEach(m=>{ const idx=m.morphTargetDictionary?.[name]; if(idx!==undefined) m.morphTargetInfluences[idx]=v; }); }
function slider(label,min,max,step,value,cb){
  const r=document.createElement('div'); r.className='slider'; r.innerHTML=`<div class="top"><span>${label}</span><span class="val">${value}</span></div><input type="range" min="${min}" max="${max}" step="${step}" value="${value}">`;
  const input=r.querySelector('input'), val=r.querySelector('.val');
  input.oninput=()=>{const v=+input.value; val.textContent=step<1?v.toFixed(2):v+'°'; cb(v);};
  return r;
}
function buildPoseSliders(){ poseEl.innerHTML=''; [['Yaw','yaw',-60,60],['Pitch','pitch',-45,45],['Roll','roll',-35,35]].forEach(([l,k,min,max])=>poseEl.appendChild(slider(l,min,max,1,pose[k]||0,v=>{pose[k]=v; applyPose();}))); }
function applyPose(){ rig.rotation.set(THREE.MathUtils.degToRad(pose.pitch),THREE.MathUtils.degToRad(pose.yaw),THREE.MathUtils.degToRad(pose.roll)); }
function resetAll(){ morphMeshes.forEach(m=>m.morphTargetInfluences?.fill(0)); pose={yaw:0,pitch:0,roll:0}; rig.rotation.set(0,0,0); buildPoseSliders(); buildMorphSliders(); setCamera('front'); }
function preset(p){ morphMeshes.forEach(m=>m.morphTargetInfluences?.fill(0)); const keys={smile:['smile'],blink:['blink','eyesclosed'],jaw:['jaw','mouthopen','mouth open','viseme aa']}; morphNames.forEach(n=>{ const l=lower(n); if(keys[p].some(s=>l.includes(s))) setMorph(n,.85); }); buildMorphSliders(); }
function setCamera(type){
  const t=new THREE.Vector3(0,.95,0), d=2.55;
  const map={front:[0,1.05,d],threeq:[-1.25,1.08,2.05],profile:[-d,1.05,.03],up:[0,1.68,d*.72],down:[0,.35,d*.72]};
  camera.position.set(...(map[type]||map.front)); controls.target.copy(t); controls.update();
}
function escapeHtml(s){ return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
