import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/environments/RoomEnvironment.js';

const LOCAL_GLB = new URL('./assets/morph-loomis-head/morph_loomis_head_arkit_oculus.glb?v=20260619c', import.meta.url).href;

const AVATARS = [
  { url: LOCAL_GLB, label: 'local repo GLB', headOnly: true },
  { url: 'https://models.readyplayer.me/65a8dba831b23abb4f401bae.glb?quality=medium&morphTargets=ARKit,Oculus%20Visemes&textureAtlas=none&useDracoMeshCompression=false', label: 'Ready Player Me 1', headOnly: false },
  { url: 'https://models.readyplayer.me/638df48b65dcf4dcd8c0ad10.glb?quality=medium&morphTargets=ARKit,Oculus%20Visemes&textureAtlas=none&useDracoMeshCompression=false', label: 'Ready Player Me 2', headOnly: false }
];

const TARGET_NAMES = [
  'eyeBlinkLeft','eyeBlinkRight','eyeLookDownLeft','eyeLookDownRight','eyeLookInLeft','eyeLookInRight','eyeLookOutLeft','eyeLookOutRight','eyeLookUpLeft','eyeLookUpRight','eyeSquintLeft','eyeSquintRight','eyeWideLeft','eyeWideRight','jawForward','jawLeft','jawRight','jawOpen','mouthClose','mouthFunnel','mouthPucker','mouthLeft','mouthRight','mouthSmileLeft','mouthSmileRight','mouthFrownLeft','mouthFrownRight','mouthDimpleLeft','mouthDimpleRight','mouthStretchLeft','mouthStretchRight','mouthRollLower','mouthRollUpper','mouthShrugLower','mouthShrugUpper','mouthPressLeft','mouthPressRight','mouthLowerDownLeft','mouthLowerDownRight','mouthUpperUpLeft','mouthUpperUpRight','browDownLeft','browDownRight','browInnerUp','browOuterUpLeft','browOuterUpRight','cheekPuff','cheekSquintLeft','cheekSquintRight','noseSneerLeft','noseSneerRight','tongueOut','viseme_sil','viseme_PP','viseme_FF','viseme_TH','viseme_DD','viseme_kk','viseme_CH','viseme_SS','viseme_nn','viseme_RR','viseme_aa','viseme_E','viseme_I','viseme_O','viseme_U','mouthOpen','mouthSmile','eyesClosed','eyesLookUp','eyesLookDown'
];

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
  Brows: ['brow','eyebrow'],
  Eyes: ['eye','blink','squint','look','wide'],
  Nose: ['nose','sneer'],
  Mouth: ['mouth','jaw','lip','smile','pucker','funnel','viseme'],
  Cheek: ['cheek']
};

init();
loadAvatar();

function init(){
  renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111318);
  camera = new THREE.PerspectiveCamera(35, innerWidth/innerHeight, 0.01, 100);
  camera.position.set(0, 1.05, 3.0);

  const env = new RoomEnvironment(renderer);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(env, .04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x263040, 1.8));
  const key = new THREE.DirectionalLight(0xffffff, 3.0); key.position.set(2,3,4); scene.add(key);
  const rim = new THREE.DirectionalLight(0x8edfff, 1.2); rim.position.set(-3,2,-2); scene.add(rim);

  rig = new THREE.Group(); scene.add(rig);
  modelRoot = new THREE.Group(); rig.add(modelRoot);
  guideGroup = new THREE.Group(); rig.add(guideGroup);
  labelGroup = new THREE.Group(); rig.add(labelGroup);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 1.05, 0);
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

async function loadAvatar(){
  const errors = [];
  for(let i=0;i<AVATARS.length;i++){
    const src = AVATARS[i];
    loaderText.textContent = `טוען מודל ${i+1}/${AVATARS.length}: ${src.label}...`;
    try{
      const gltf = await new Promise((resolve,reject)=>{
        const l = new GLTFLoader();
        l.setMeshoptDecoder(MeshoptDecoder);
        l.load(src.url, resolve, e=>{
          if(e.total) loaderText.textContent = `טוען ${src.label}: ${Math.round(e.loaded/e.total*100)}%`;
        }, reject);
      });
      setupModel(gltf.scene, src);
      loader.classList.add('hide');
      return;
    }catch(e){
      console.warn('model failed', src.label, e);
      errors.push(src.label);
    }
  }

  loaderText.textContent = 'ה־GLB לא נטען בדפדפן, בונה ראש פנימי זמני...';
  setupModel(createProceduralFallback(), { label: 'built-in fallback', headOnly: true, fallback: true });
  loader.classList.add('hide');
  statusEl.innerHTML += `<br><span class="err">המודל החיצוני נכשל: ${errors.join(', ')}. מוצג fallback פנימי כדי שהאפליקציה לא תישאר ריקה.</span>`;
}

function setupModel(root, source={label:'model', headOnly:false}){
  modelRoot.clear(); guideGroup.clear(); labelGroup.clear(); morphMeshes=[]; morphNames=[];

  root.traverse(o=>{
    if(o.isMesh){
      o.frustumCulled = false;
      if(!o.material) o.material = new THREE.MeshStandardMaterial({ color:0xd6b09c, roughness:.72, metalness:0 });
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m=>{ if('roughness' in m) m.roughness=.72; if('metalness' in m) m.metalness=0; m.side = THREE.DoubleSide; });
      if(o.morphTargetDictionary && o.morphTargetInfluences){
        morphMeshes.push(o);
        Object.keys(o.morphTargetDictionary).forEach(k=>morphNames.push(k));
      }
    }
  });

  morphNames = [...new Set(morphNames)].sort((a,b)=>clean(a).localeCompare(clean(b)));
  modelRoot.add(root);
  normalizeToView(root);

  let box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3(); box.getSize(size);
  const headY = source.headOnly ? box.min.y + size.y * .62 : box.max.y - size.y * .15;
  const headH = source.headOnly ? size.y * .60 : size.y * .24;

  buildLoomisGuides(headY, headH);
  setEdges(true);
  buildMorphSliders();
  setCamera('front');

  const srcText = source.fallback ? 'fallback פנימי' : source.label;
  statusEl.innerHTML = morphNames.length
    ? `<span class="ok">נטען: ${srcText}. נמצאו ${morphNames.length} morph targets. קווי Loomis נמצאים באותה סצנת Three.js.</span>`
    : `<span class="err">נטען: ${srcText}, אבל לא נמצאו morph targets.</span>`;
}

function normalizeToView(root){
  let box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3(); box.getSize(size);
  if(!Number.isFinite(size.y) || size.y <= 0.0001) throw new Error('empty model bounds');

  const scale = 2.35 / size.y;
  root.scale.multiplyScalar(scale);
  box = new THREE.Box3().setFromObject(root);
  const center = new THREE.Vector3(); box.getCenter(center);
  root.position.x -= center.x;
  root.position.y += 1.05 - center.y;
  root.position.z -= center.z;
}

function createProceduralFallback(){
  const root = new THREE.Group();
  root.name = 'Procedural_Morph_Loomis_Head';

  const headGeo = new THREE.SphereGeometry(.58, 48, 32);
  headGeo.scale(.72, 1.02, .62);
  headGeo.translate(0, 1.18, 0);
  headGeo.morphTargetsRelative = true;
  headGeo.morphAttributes.position = TARGET_NAMES.map(name=>{
    const attr = new THREE.Float32BufferAttribute(makeMorphDelta(headGeo.attributes.position, name), 3);
    attr.name = name;
    return attr;
  });

  const head = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color:0xd3aa96, roughness:.78, metalness:0 }));
  head.name = 'Head_Neck_ARKit_OVR_Morphs';
  head.updateMorphTargets();
  head.morphTargetDictionary = Object.fromEntries(TARGET_NAMES.map((n,i)=>[n,i]));
  head.morphTargetInfluences = TARGET_NAMES.map(()=>0);
  root.add(head);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.22,.30,.65,32), new THREE.MeshStandardMaterial({ color:0xc99f8c, roughness:.78, metalness:0 }));
  neck.position.y = .25;
  neck.name = 'Neck';
  root.add(neck);

  const eyeMat = new THREE.MeshBasicMaterial({ color:0x151515 });
  [['L',-.20],['R',.20]].forEach(([side,x])=>{
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.035,16,8), eyeMat);
    eye.name = `Eye_${side}`;
    eye.position.set(x,1.35,.39);
    eye.scale.set(1.7,.65,.5);
    root.add(eye);
  });

  const nose = new THREE.Mesh(new THREE.ConeGeometry(.055,.18,24), new THREE.MeshStandardMaterial({ color:0xc79683, roughness:.8, metalness:0 }));
  nose.name = 'Simple_Nose';
  nose.rotation.x = Math.PI/2;
  nose.position.set(0,1.15,.44);
  root.add(nose);

  const mouth = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.18,.88,.43), new THREE.Vector3(.18,.88,.43)]),
    new THREE.LineBasicMaterial({ color:0x4b1f25, linewidth:2 })
  );
  mouth.name = 'Simple_Mouth_Line';
  root.add(mouth);

  return root;
}

function makeMorphDelta(pos, name){
  const key = name.toLowerCase();
  const out = new Float32Array(pos.count * 3);
  for(let i=0;i<pos.count;i++){
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const front = smooth(z, .15, .48);
    const lower = smooth(1.05-y, .0, .55);
    const upper = smooth(y-1.28, .0, .55);
    const mouth = front * smooth(.22-Math.abs(y-.9), 0, .22);
    const eyes = front * smooth(.20-Math.abs(y-1.34), 0, .20);
    const brow = front * smooth(.18-Math.abs(y-1.52), 0, .18);
    const cheek = front * smooth(.18-Math.abs(y-1.15), 0, .18) * smooth(Math.abs(x)-.18, 0, .35);
    const left = smooth(-x, 0, .45);
    const right = smooth(x, 0, .45);
    let dx=0, dy=0, dz=0;

    if(key.includes('jawopen') || key.includes('mouthopen') || key.includes('viseme_aa')) { dy -= lower*.16; dz += mouth*.05; }
    if(key.includes('jawforward')) dz += lower*.10;
    if(key.includes('jawleft')) dx -= lower*.08;
    if(key.includes('jawright')) dx += lower*.08;
    if(key.includes('smile')) dy += mouth*.12; 
    if(key.includes('frown')) dy -= mouth*.10;
    if(key.includes('pucker') || key.includes('funnel') || key.includes('viseme_o') || key.includes('viseme_u')) { dz += mouth*.12; dx += -Math.sign(x)*mouth*.045; }
    if(key.includes('stretch')) dx += Math.sign(x)*mouth*.09;
    if(key.includes('mouthleft')) dx -= mouth*.09;
    if(key.includes('mouthright')) dx += mouth*.09;
    if(key.includes('close') || key.includes('press') || key.includes('roll')) dy += (y>.9?-1:1)*mouth*.045;
    if(key.includes('upperup')) dy += mouth*upper*.10;
    if(key.includes('lowerdown')) dy -= mouth*lower*.10;
    if(key.includes('blink') || key.includes('eyesclosed')) dy -= eyes*.075;
    if(key.includes('wide')) dy += eyes*.065;
    if(key.includes('lookupleft')) dy += eyes*left*.055;
    if(key.includes('lookupright')) dy += eyes*right*.055;
    if(key.includes('lookdownleft')) dy -= eyes*left*.055;
    if(key.includes('lookdownright')) dy -= eyes*right*.055;
    if(key.includes('lookinleft')) dx += eyes*left*.05;
    if(key.includes('lookinright')) dx -= eyes*right*.05;
    if(key.includes('lookoutleft')) dx -= eyes*left*.05;
    if(key.includes('lookoutright')) dx += eyes*right*.05;
    if(key.includes('squint')) dy -= eyes*.045;
    if(key.includes('browinnerup')) dy += brow*(1-smooth(Math.abs(x),.05,.32))*.10;
    if(key.includes('browouterup')) dy += brow*smooth(Math.abs(x),.08,.34)*.09;
    if(key.includes('browdown')) dy -= brow*.08;
    if(key.includes('cheekpuff')) dz += cheek*.09;
    if(key.includes('cheeksquint')) dy += cheek*.055;
    if(key.includes('nosesneer')) dy += front*smooth(.13-Math.abs(y-1.12),0,.13)*.08;
    if(key.includes('tongueout')) dz += mouth*.18;
    if(key.includes('viseme_e') || key.includes('viseme_i')) dx += Math.sign(x)*mouth*.055;
    if(key.includes('viseme_pp') || key.includes('viseme_ff')) dz += mouth*.04;
    if(key.includes('eyeslookup')) dy += eyes*.055;
    if(key.includes('eyeslookdown')) dy -= eyes*.055;

    out[i*3] = dx; out[i*3+1] = dy; out[i*3+2] = dz;
  }
  return out;
}

function smooth(v, edge0, edge1){
  const t = Math.min(1, Math.max(0, (v-edge0)/(edge1-edge0 || 1)));
  return t*t*(3-2*t);
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
  marks.forEach(([name,yy,m])=>{ guideGroup.add(faceArc(rx*.72, yy, y, front, m)); addLabel(name, -rx*.92, yy, front+.02, m.color); });

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
function faceArc(rx, yy, cy, front, material){
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
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 25), new THREE.LineBasicMaterial({color:0x111111, transparent:true, opacity:.32}));
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
  const input=r.querySelector('input'), val=r.querySelector('.val'); input.oninput=()=>{const v=+input.value; val.textContent=step<1?v.toFixed(2):v+'°'; cb(v);}; return r;
}
function buildPoseSliders(){ poseEl.innerHTML=''; [['Yaw','yaw',-60,60],['Pitch','pitch',-45,45],['Roll','roll',-35,35]].forEach(([l,k,min,max])=>poseEl.appendChild(slider(l,min,max,1,0,v=>{pose[k]=v; applyPose();}))); }
function applyPose(){ rig.rotation.set(THREE.MathUtils.degToRad(pose.pitch),THREE.MathUtils.degToRad(pose.yaw),THREE.MathUtils.degToRad(pose.roll)); }
function resetAll(){ morphMeshes.forEach(m=>m.morphTargetInfluences?.fill(0)); pose={yaw:0,pitch:0,roll:0}; rig.rotation.set(0,0,0); buildPoseSliders(); buildMorphSliders(); setCamera('front'); }
function preset(p){ morphMeshes.forEach(m=>m.morphTargetInfluences?.fill(0)); const keys={smile:['smile'],blink:['blink'],jaw:['jaw','mouthopen','mouth open']}; morphNames.forEach(n=>{ const l=lower(n); if(keys[p].some(s=>l.includes(s))) setMorph(n,.85); }); buildMorphSliders(); }
function setCamera(type){ const t=new THREE.Vector3(0,1.05,0), d=2.65; const map={front:[0,t.y,d],threeq:[-1.25,t.y+.05,2.15],profile:[-d,t.y,.03],up:[0,t.y+.75,d*.75],down:[0,t.y-.72,d*.75]}; camera.position.set(...(map[type]||map.front)); controls.target.copy(t); controls.update(); }
