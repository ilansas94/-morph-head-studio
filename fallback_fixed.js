import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js';
import {OrbitControls} from 'https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/controls/OrbitControls.js';

const el = id => document.getElementById(id);
const canvas = el('view');
const loader = el('loader');
const statusEl = el('status');
const poseEl = el('poseSliders');
const morphEl = el('morphSliders');
const catsEl = el('cats');
const guidesBtn = el('guidesBtn');
const edgeBtn = el('edgeBtn');
const labelBtn = el('labelBtn');
const resetBtn = el('resetBtn');

let scene, camera, renderer, controls, rig, model, guides, labels;
let parts = {};
let pose = { yaw:0, pitch:0, roll:0 };
let morph = { brow:0, eye:0, nose:0, mouth:0, jaw:0, chin:0, ear:0 };
let activeCat = 'All';
const catMap = { All:['brow','eye','nose','mouth','jaw','chin','ear'], Brows:['brow'], Eyes:['eye'], Nose:['nose'], Mouth:['mouth','jaw'], Cheek:['chin','ear'] };
const names = { brow:'Eyebrows', eye:'Eyes', nose:'Nose', mouth:'Mouth / smile', jaw:'Jaw open', chin:'Chin forward', ear:'Ear size' };

main();

function main(){
  try {
    init3D();
    buildHead();
    buildPoseUI();
    buildCatsUI();
    buildMorphUI();
    bindButtons();
    setCamera('front');
    if (loader) loader.classList.add('hide');
    if (statusEl) statusEl.innerHTML = '<span class="ok">Local V3 loaded. The head is generated in the browser, so it does not depend on an external GLB.</span>';
    animate();
  } catch (e) {
    console.error(e);
    if (loader) loader.innerHTML = '<div><b>Script error</b><br>' + String(e.message || e) + '</div>';
  }
}

function init3D(){
  renderer = new THREE.WebGLRenderer({canvas, antialias:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x10141a);
  camera = new THREE.PerspectiveCamera(35, window.innerWidth/window.innerHeight, 0.01, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x263040, 2.0));
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(2,3,4);
  scene.add(key);
  rig = new THREE.Group();
  model = new THREE.Group();
  guides = new THREE.Group();
  labels = new THREE.Group();
  rig.add(model, guides, labels);
  scene.add(rig);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0,0.8,0);
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function animate(){
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

function skin(){ return new THREE.MeshStandardMaterial({color:0xbfc7cf, roughness:.75, metalness:0, flatShading:true}); }
function mat(c){ return new THREE.MeshStandardMaterial({color:c, roughness:.75, metalness:0, flatShading:true}); }
function add(name, geo, material, pos, scale){
  const o = new THREE.Mesh(geo, material);
  o.position.set(pos[0],pos[1],pos[2]);
  o.scale.set(scale[0],scale[1],scale[2]);
  model.add(o);
  parts[name] = o;
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 15), new THREE.LineBasicMaterial({color:0x111111, transparent:true, opacity:.45}));
  e.name = 'edge';
  o.add(e);
  return o;
}

function buildHead(){
  const headGeo = new THREE.SphereGeometry(.55, 9, 9);
  headGeo.scale(.78, 1.1, .62);
  add('head', headGeo, skin(), [0,1.05,0], [1,1,1]);
  add('neck', new THREE.CylinderGeometry(.18,.25,.65,6), mat(0x56606c), [0,.22,0], [1,1,1]);
  add('shoulder', new THREE.CylinderGeometry(.75,.9,.18,6), mat(0x56606c), [0,-.15,0], [1,.35,.5]);
  add('jaw', new THREE.BoxGeometry(.55,.28,.18), skin(), [0,.55,.34], [1,1,1]);
  add('chin', new THREE.BoxGeometry(.25,.16,.14), skin(), [0,.36,.46], [1,1,1]);
  add('eyeL', new THREE.SphereGeometry(.07,10,6), mat(0xf2f5f7), [-.2,1.13,.51], [1.3,.55,.35]);
  add('eyeR', new THREE.SphereGeometry(.07,10,6), mat(0xf2f5f7), [.2,1.13,.51], [1.3,.55,.35]);
  add('browL', new THREE.BoxGeometry(.22,.05,.03), mat(0x2f3338), [-.22,1.27,.53], [1,1,1]);
  add('browR', new THREE.BoxGeometry(.22,.05,.03), mat(0x2f3338), [.22,1.27,.53], [1,1,1]);
  add('nose', new THREE.ConeGeometry(.12,.34,4), skin(), [0,.94,.61], [.85,1,1]).rotation.x = Math.PI/2;
  add('mouth', new THREE.BoxGeometry(.32,.035,.03), mat(0x514338), [0,.66,.57], [1,1,1]);
  add('open', new THREE.BoxGeometry(.22,.1,.035), mat(0x20252c), [0,.62,.59], [1,.05,1]);
  add('earL', new THREE.TorusGeometry(.1,.023,6,12), skin(), [-.52,1.02,0], [.7,1.1,.25]).rotation.y = Math.PI/2;
  add('earR', new THREE.TorusGeometry(.1,.023,6,12), skin(), [.52,1.02,0], [.7,1.1,.25]).rotation.y = Math.PI/2;
  buildGuides();
}

function lineMat(c){ return new THREE.LineBasicMaterial({color:c, depthTest:false}); }
function line(points,c){ return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(p[0],p[1],p[2]))), lineMat(c)); }
function ellipse(rx, ry, z, y, c){
  const pts=[];
  for(let i=0;i<=96;i++){ const t=i/96*Math.PI*2; pts.push(new THREE.Vector3(Math.cos(t)*rx, y+Math.sin(t)*ry, z)); }
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat(c));
}
function buildGuides(){
  guides.add(ellipse(.44,.53,.55,1.08,0x57c9ff));
  guides.add(line([[0,1.55,.57],[0,.35,.57]],0xff78a0));
  const marks=[['hair',1.33,0x5af096],['brow',1.18,0x5af096],['eyes',1.10,0xffd66f],['nose',.88,0x5af096],['mouth',.70,0xffd66f],['chin',.48,0x5af096]];
  marks.forEach(([n,y,c])=>guides.add(line([[-.38,y,.58],[.38,y,.58]],c)));
  guides.add(ellipse(.18,.43,.02,1.06,0x57c9ff));
}

function bindButtons(){
  document.querySelectorAll('[data-camera]').forEach(b => b.onclick = () => setCamera(b.dataset.camera));
  document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => preset(b.dataset.preset));
  resetBtn.onclick = reset;
  guidesBtn.onclick = () => { guides.visible = !guides.visible; guidesBtn.classList.toggle('on', guides.visible); };
  edgeBtn.onclick = () => { toggleEdges(); edgeBtn.classList.toggle('on'); };
  labelBtn.onclick = () => { labels.visible = !labels.visible; labelBtn.classList.toggle('on', labels.visible); };
  guidesBtn.classList.add('on'); edgeBtn.classList.add('on'); labelBtn.classList.add('on');
}

function toggleEdges(){
  model.traverse(o => { if(o.name === 'edge') o.visible = !o.visible; });
}

function makeSlider(label,min,max,step,value,cb){
  const d=document.createElement('div');
  d.className='slider';
  d.innerHTML='<div class="top"><span>'+label+'</span><span class="val">'+value+'</span></div><input type="range" min="'+min+'" max="'+max+'" step="'+step+'" value="'+value+'">';
  const input=d.querySelector('input');
  const val=d.querySelector('.val');
  input.oninput=()=>{ val.textContent=input.value; cb(Number(input.value)); };
  return d;
}
function buildPoseUI(){
  poseEl.innerHTML='';
  [['Yaw','yaw',-60,60],['Pitch','pitch',-45,45],['Roll','roll',-35,35]].forEach(x=>{
    poseEl.appendChild(makeSlider(x[0],x[2],x[3],1,0,v=>{ pose[x[1]]=v; applyPose(); }));
  });
}
function buildCatsUI(){
  catsEl.innerHTML='';
  Object.keys(catMap).forEach(k=>{
    const b=document.createElement('button');
    b.className='tab'+(k===activeCat?' on':'');
    b.textContent=k;
    b.onclick=()=>{ activeCat=k; buildCatsUI(); buildMorphUI(); };
    catsEl.appendChild(b);
  });
}
function buildMorphUI(){
  morphEl.innerHTML='';
  catMap[activeCat].forEach(k=>morphEl.appendChild(makeSlider(names[k],0,1,.01,morph[k],v=>{ morph[k]=v; applyMorph(); })));
}
function applyPose(){ rig.rotation.set(THREE.MathUtils.degToRad(pose.pitch),THREE.MathUtils.degToRad(pose.yaw),THREE.MathUtils.degToRad(pose.roll)); }
function applyMorph(){
  parts.browL.position.y = 1.27 + morph.brow*.09; parts.browR.position.y = 1.27 + morph.brow*.09;
  parts.eyeL.scale.y = parts.eyeR.scale.y = .55 + morph.eye*.55;
  parts.nose.scale.z = 1 + morph.nose*.5; parts.nose.position.z = .61 + morph.nose*.08;
  parts.mouth.scale.x = 1 + morph.mouth*.55; parts.open.scale.y = .05 + morph.jaw*.95;
  parts.jaw.position.y = .55 - morph.jaw*.12; parts.chin.position.z = .46 + morph.chin*.15;
  parts.earL.scale.set(.7+morph.ear*.35,1.1+morph.ear*.45,.25); parts.earR.scale.set(.7+morph.ear*.35,1.1+morph.ear*.45,.25);
}
function preset(p){ Object.keys(morph).forEach(k=>morph[k]=0); if(p==='smile') morph.mouth=.9; if(p==='jaw') morph.jaw=.9; if(p==='blink') morph.eye=0; applyMorph(); buildMorphUI(); }
function reset(){ Object.keys(morph).forEach(k=>morph[k]=0); pose={yaw:0,pitch:0,roll:0}; applyPose(); applyMorph(); buildPoseUI(); buildMorphUI(); setCamera('front'); }
function setCamera(t){
  const y=.8, d=2.45;
  const map={front:[0,y,d],threeq:[-1.1,y,2.05],profile:[-d,y,.03],up:[0,y+.55,d*.78],down:[0,y-.55,d*.78]};
  camera.position.set(...(map[t]||map.front));
  controls.target.set(0,.78,0); controls.update();
}
