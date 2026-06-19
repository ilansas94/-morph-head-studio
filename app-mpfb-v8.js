import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const GLB_URL = './assets/morph-loomis-head/mpfb.glb?no_cache=mpfb-real-v8';

const canvas = document.getElementById('view');
const loaderBox = document.getElementById('loader');
const loaderText = document.getElementById('loaderText');
const statusEl = document.getElementById('status');
const poseEl = document.getElementById('poseSliders');
const morphEl = document.getElementById('morphSliders');
const catsEl = document.getElementById('cats');
const guidesBtn = document.getElementById('guidesBtn');
const edgeBtn = document.getElementById('edgeBtn');
const labelBtn = document.getElementById('labelBtn');

let scene, camera, renderer, controls, rig, modelRoot, guideGroup, labelGroup;
let morphMeshes = [];
let morphNames = [];
let meshCount = 0;
let activeCat = 'All';
let pose = { yaw:0, pitch:0, roll:0 };
let viewTarget = new THREE.Vector3(0, 1, 0);
let edgesOn = true;
let guidesOn = true;
let labelsOn = true;

const cats = {
  All: null,
  Brows: ['brow'],
  Eyes: ['eye','blink','squint','look','wide'],
  Nose: ['nose','sneer'],
  Mouth: ['mouth','jaw','lip','smile','pucker','funnel','viseme'],
  Cheek: ['cheek']
};

showStatus('v8 app started. Loading real mpfb.glb from repo...');
init();
loadRealMpfb();

function init(){
  renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111318);
  camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.01, 1000);
  camera.position.set(0, 1.1, 4);

  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.8);
  key.position.set(2, 4, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8edfff, 1.2);
  fill.position.set(-3, 2, -2);
  scene.add(fill);

  rig = new THREE.Group(); scene.add(rig);
  modelRoot = new THREE.Group(); rig.add(modelRoot);
  guideGroup = new THREE.Group(); rig.add(guideGroup);
  labelGroup = new THREE.Group(); rig.add(labelGroup);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.copy(viewTarget);
  controls.minDistance = 0.4;
  controls.maxDistance = 20;

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  document.querySelectorAll('[data-camera]').forEach(b => b.onclick = () => setCamera(b.dataset.camera));
  document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => preset(b.dataset.preset));
  document.getElementById('resetBtn').onclick = resetAll;
  guidesBtn.onclick = () => { guidesOn = !guidesOn; guideGroup.visible = guidesOn; guidesBtn.classList.toggle('on', guidesOn); };
  edgeBtn.onclick = () => { edgesOn = !edgesOn; edgeBtn.classList.toggle('on', edgesOn); setEdges(edgesOn); };
  labelBtn.onclick = () => { labelsOn = !labelsOn; labelGroup.visible = labelsOn; labelBtn.classList.toggle('on', labelsOn); };
  guidesBtn.classList.add('on'); edgeBtn.classList.add('on'); labelBtn.classList.add('on');

  buildPoseSliders();
  buildCats();
  animate();
}

function animate(){
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

function loadRealMpfb(){
  loaderBox.classList.remove('hide');
  loaderText.textContent = 'Downloading real mpfb.glb from repo...';

  const timeout = setTimeout(() => {
    showStatus('Still loading mpfb.glb. It is a real 36MB model, so mobile Safari may take time. No fallback model is being used.');
  }, 12000);

  new GLTFLoader().load(
    GLB_URL,
    gltf => {
      clearTimeout(timeout);
      loaderText.textContent = 'GLB parsed. Fitting model to camera...';
      setupModel(gltf.scene);
      loaderBox.classList.add('hide');
    },
    e => {
      const total = e.total || 36815920;
      const pct = total ? Math.round((e.loaded || 0) / total * 100) : 0;
      loaderText.textContent = `Downloading mpfb.glb: ${pct}%`;
      showStatus(`Downloading real mpfb.glb: ${Math.round((e.loaded || 0) / 1024 / 1024)}MB / ${Math.round(total / 1024 / 1024)}MB`);
    },
    err => {
      clearTimeout(timeout);
      loaderBox.classList.add('hide');
      showError('GLTFLoader failed: ' + (err?.message || String(err)));
    }
  );
}

function setupModel(root){
  modelRoot.clear();
  guideGroup.clear();
  labelGroup.clear();
  morphMeshes = [];
  morphNames = [];
  meshCount = 0;

  const visibleMat = new THREE.MeshStandardMaterial({ color:0xd7ad99, roughness:0.75, metalness:0, side:THREE.DoubleSide });

  root.traverse(o => {
    if(o.isMesh){
      meshCount++;
      o.visible = true;
      o.frustumCulled = false;
      o.material = visibleMat.clone();
      if(o.morphTargetDictionary && o.morphTargetInfluences){
        morphMeshes.push(o);
        Object.keys(o.morphTargetDictionary).forEach(k => morphNames.push(k));
      }
    }
  });

  morphNames = [...new Set(morphNames)].sort((a,b) => clean(a).localeCompare(clean(b)));
  modelRoot.add(root);
  fitRootToCamera(root);

  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size); box.getCenter(center);

  const helper = new THREE.BoxHelper(root, 0x48e58e);
  helper.name = 'visible_model_bounds';
  modelRoot.add(helper);

  const headY = box.max.y - size.y * 0.16;
  const headH = Math.max(size.y * 0.22, 0.45);
  viewTarget.set(center.x, headY, center.z);
  buildLoomisGuides(headY, headH);
  setEdges(true);
  buildMorphSliders();
  setCamera('front');

  showStatus(`REAL MPFB loaded. meshes=${meshCount}, morphTargets=${morphNames.length}, bounds=${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)}. Green box shows the actual loaded model bounds.`);
}

function fitRootToCamera(root){
  root.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size); box.getCenter(center);
  if(!Number.isFinite(size.length()) || size.length() < 0.0001) throw new Error('Loaded GLB has empty bounds');

  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = 2.2 / maxDim;
  root.scale.multiplyScalar(scale);
  root.position.x -= center.x * scale;
  root.position.y -= center.y * scale;
  root.position.z -= center.z * scale;
  root.updateMatrixWorld(true);
}

function buildLoomisGuides(y, h){
  const rx=h*.46, ry=h*.56, rz=h*.34, front=rz*.92;
  const matG=mat(0x5af096), matY=mat(0xffd66f), matB=mat(0x57c9ff), matP=mat(0xff78a0);
  guideGroup.add(ellipse(rx, ry, 0, 0, y, matB, 'xy'));
  guideGroup.add(ellipse(rx, rz, 0, 0, y, matB, 'xz'));
  guideGroup.add(ellipse(rz*.7, ry*.86, rx*.82, 0, y, matB, 'zy'));
  guideGroup.add(line([[0,y+ry*.75,front],[0,y-ry*1.18,front]], matP));
  [['hair',y+ry*.42,matG],['brow',y+ry*.12,matG],['eyes',y+ry*.02,matY],['nose',y-ry*.30,matG],['mouth',y-ry*.54,matY],['chin',y-ry*.82,matG]].forEach(([name,yy,m])=>{
    guideGroup.add(faceArc(rx*.72, yy, front, m));
    addLabel(name, -rx*.92, yy, front+.03, m.color);
  });
}

function mat(color){ return new THREE.LineBasicMaterial({ color, transparent:true, opacity:.96, depthTest:false }); }
function line(points, material){ return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))), material); }
function ellipse(a,b,x,z,y,material,plane){
  const pts=[];
  for(let i=0;i<=96;i++){
    const t=Math.PI*2*i/96; let px=x, py=y, pz=z;
    if(plane==='xy'){ px=x+Math.cos(t)*a; py=y+Math.sin(t)*b; pz=z; }
    if(plane==='xz'){ px=x+Math.cos(t)*a; py=y; pz=z+Math.sin(t)*b; }
    if(plane==='zy'){ px=x; py=y+Math.sin(t)*b; pz=z+Math.cos(t)*a; }
    pts.push(new THREE.Vector3(px,py,pz));
  }
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), material);
}
function faceArc(rx, yy, front, material){
  const pts=[];
  for(let i=0;i<=40;i++){ const u=-1+2*i/40; pts.push(new THREE.Vector3(u*rx, yy, front-Math.abs(u)*.035)); }
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), material);
}
function addLabel(text,x,y,z,color){
  const c=document.createElement('canvas'); c.width=256; c.height=64;
  const ctx=c.getContext('2d'); ctx.font='bold 34px Arial'; ctx.lineWidth=8; ctx.strokeStyle='#000'; ctx.strokeText(text,8,42); ctx.fillStyle='#'+color.toString(16).padStart(6,'0'); ctx.fillText(text,8,42);
  const tex=new THREE.CanvasTexture(c);
  const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
  spr.position.set(x,y,z); spr.scale.set(.28,.07,1); labelGroup.add(spr);
}

function setEdges(on){
  modelRoot.traverse(o=>{
    if(o.userData.edge){ o.visible=on; return; }
    if(o.isMesh && on && !o.userData.hasEdge){
      const e=new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry,25), new THREE.LineBasicMaterial({color:0x111111,transparent:true,opacity:.25}));
      e.userData.edge=true; o.add(e); o.userData.hasEdge=true;
    }
  });
}
function clean(n){ return String(n).replace(/^Wolf3D_Head\./,'').replace(/^blendShape1\./,'').replace(/_/g,' '); }
function lower(n){ return clean(n).toLowerCase(); }
function buildCats(){
  catsEl.innerHTML='';
  Object.keys(cats).forEach(c=>{ const b=document.createElement('button'); b.className='tab'+(c===activeCat?' on':''); b.textContent=c; b.onclick=()=>{activeCat=c; buildCats(); buildMorphSliders();}; catsEl.appendChild(b); });
}
function buildMorphSliders(){
  morphEl.innerHTML='';
  const needles=cats[activeCat];
  const arr=morphNames.filter(n=>!needles || needles.some(s=>lower(n).includes(s)));
  if(!arr.length){ morphEl.innerHTML='<div class="status">No sliders in this category.</div>'; return; }
  arr.slice(0,160).forEach(n=>morphEl.appendChild(slider(clean(n),0,1,.01,0,v=>setMorph(n,v))));
}
function setMorph(name,v){ morphMeshes.forEach(m=>{ const idx=m.morphTargetDictionary?.[name]; if(idx!==undefined) m.morphTargetInfluences[idx]=v; }); }
function slider(label,min,max,step,value,cb){
  const r=document.createElement('div'); r.className='slider'; r.innerHTML=`<div class="top"><span>${label}</span><span class="val">${value}</span></div><input type="range" min="${min}" max="${max}" step="${step}" value="${value}">`;
  const input=r.querySelector('input'), val=r.querySelector('.val'); input.oninput=()=>{const v=+input.value; val.textContent=step<1?v.toFixed(2):v+'°'; cb(v);}; return r;
}
function buildPoseSliders(){ poseEl.innerHTML=''; [['Yaw','yaw',-60,60],['Pitch','pitch',-45,45],['Roll','roll',-35,35]].forEach(([l,k,min,max])=>poseEl.appendChild(slider(l,min,max,1,pose[k]||0,v=>{pose[k]=v; applyPose();}))); }
function applyPose(){ rig.rotation.set(THREE.MathUtils.degToRad(pose.pitch),THREE.MathUtils.degToRad(pose.yaw),THREE.MathUtils.degToRad(pose.roll)); }
function resetAll(){ morphMeshes.forEach(m=>m.morphTargetInfluences?.fill(0)); pose={yaw:0,pitch:0,roll:0}; rig.rotation.set(0,0,0); buildPoseSliders(); buildMorphSliders(); setCamera('front'); }
function preset(p){
  morphMeshes.forEach(m=>m.morphTargetInfluences?.fill(0));
  const keys={smile:['smile'],blink:['blink','eyesclosed'],jaw:['jaw','mouthopen','viseme aa','viseme_aa']};
  morphNames.forEach(n=>{ const l=lower(n); if(keys[p].some(s=>l.includes(s))) setMorph(n,.85); }); buildMorphSliders();
}
function setCamera(type){
  const d=3.2;
  const map={front:[0,viewTarget.y,d],threeq:[-1.4,viewTarget.y+.05,2.5],profile:[-d,viewTarget.y,.03],up:[0,viewTarget.y+.65,d*.75],down:[0,viewTarget.y-.65,d*.75]};
  camera.position.set(...(map[type]||map.front)); controls.target.copy(viewTarget); controls.update();
}
function showStatus(msg){ if(statusEl) statusEl.innerHTML = `<span class="ok">${String(msg)}</span>`; }
function showError(msg){ if(statusEl) statusEl.innerHTML = `<span class="err">${String(msg)}</span>`; }
