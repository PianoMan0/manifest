/* WIP */

/* ================= CONFIG ================= */
const CUBE_PX = 48;
document.documentElement.style.setProperty('--cube-size', CUBE_PX + 'px');

const WORLD = { width: 10, height: 5, depth: 10 };

const BLOCK_TYPES = [
  { id:0, name:'Air',   color:null,        solid:false },
  { id:1, name:'Grass', color:'#6dbf4b',   solid:true  },
  { id:2, name:'Dirt',  color:'#8b5a2b',   solid:true  },
  { id:3, name:'Stone', color:'#8a8a8a',   solid:true  },
  { id:4, name:'Water', color:'#4aa3ff',   solid:false }
];

/* ================= STATE ================= */
let selectedBlock = 1;
let world = [];

let sceneEl = null;
let viewport = null;

let keys = {};
let pointerLocked = false;

/* Camera / player state */
let camX = 0;
let camY = 0;
let camZ = 0;
let yaw = 0;
let pitch = 0;
let vy = 0;
let onGround = false;

const MOVE_SPEED = 0.08;
const GRAVITY    = -0.02;
const JUMP       = 0.6;

const cubeElements = new Array(WORLD.width * WORLD.height * WORLD.depth).fill(null);

/* ================= HELPERS ================= */
function inBounds(x,y,z){
  return x>=0 && x<WORLD.width && y>=0 && y<WORLD.height && z>=0 && z<WORLD.depth;
}
function idx(x,y,z){
  return x + y*WORLD.width + z*WORLD.width*WORLD.height;
}

function getNeighbors(x,y,z){
  return {
    top:    [x, y+1, z],
    bottom: [x, y-1, z],
    left:   [x-1, y, z],
    right:  [x+1, y, z],
    front:  [x, y, z+1],
    back:   [x, y, z-1],
  };
}

function isSolidAt(x,y,z){
  if(!inBounds(x,y,z)) return false;
  const id = world[idx(x,y,z)];
  const type = BLOCK_TYPES[id];
  return !!(type && type.solid);
}

function getVisibleFaces(x,y,z){
  const faces = [];
  const neighbors = getNeighbors(x,y,z);
  for(const face of Object.keys(neighbors)){
    const [nx,ny,nz] = neighbors[face];
    if(!isSolidAt(nx,ny,nz)) faces.push(face);
  }
  return faces;
}

/* ================= WORLD GENERATION ================= */
function generateWorld(){
  world = new Array(WORLD.width * WORLD.height * WORLD.depth).fill(0);
  const ground = Math.floor(WORLD.height * 0.5);

  for(let x=0;x<WORLD.width;x++){
    for(let z=0;z<WORLD.depth;z++){
      for(let y=0;y<WORLD.height;y++){
        if(y < ground) world[idx(x,y,z)] = 2;        // dirt
        else if(y === ground) world[idx(x,y,z)] = 1; // grass
        else world[idx(x,y,z)] = 0;
      }
      if(Math.random() < 0.06){
        const sy = ground + Math.floor(Math.random()*2);
        if(inBounds(x, sy, z)) world[idx(x,sy,z)] = 3; // stone
      }
    }
  }

  // small pool (kept to world bounds)
  const px = Math.max(0, Math.floor(WORLD.width*0.15));
  const poolW = Math.min(6, WORLD.width - px);
  const poolD = Math.min(6, WORLD.depth - px);
  for(let x=px; x<px+poolW; x++){
    for(let z=px; z<px+poolD; z++){
      const groundBelow = Math.floor(WORLD.height * 0.5) - 1;
      if(inBounds(x, groundBelow, z)) world[idx(x, groundBelow, z)] = 4;
    }
  }

  // trees (kept to world bounds)
  const treeAttempts = 6;
  for(let t=0;t<treeAttempts;t++){
    const tx = 2 + Math.floor(Math.random()*(Math.max(1, WORLD.width-4)));
    const tz = 2 + Math.floor(Math.random()*(Math.max(1, WORLD.depth-4)));
    placeTree(tx, tz, Math.floor(WORLD.height * 0.5) + 1);
  }

  refreshAllCubesFromWorld();
}

function placeTree(x,z, baseY){
  const h = 3 + Math.floor(Math.random()*2);
  for(let i=0;i<h;i++){
    if(inBounds(x, baseY+i, z)) world[idx(x, baseY+i, z)] = 2; // trunk
  }
  const top = baseY + h;
  for(let dx=-2;dx<=2;dx++){
    for(let dz=-2;dz<=2;dz++){
      if(inBounds(x+dx, top, z+dz) && Math.random()>0.2){
        world[idx(x+dx, top, z+dz)] = 1; // leaves
      }
    }
  }
}

/* ================= SCENE BUILDING ================= */
function createCubeElement(x,y,z){
  const i = idx(x,y,z);
  if(cubeElements[i]) return cubeElements[i];

  if(!sceneEl) return null;

  const cube = document.createElement('div');
  cube.className = 'cube';
  cube.dataset.x = x;
  cube.dataset.y = y;
  cube.dataset.z = z;

  const centerX = WORLD.width / 2;
  const centerY = WORLD.height / 2;
  const centerZ = WORLD.depth / 2;
  const px = (x - centerX) * CUBE_PX;
  const py = -(y - centerY) * CUBE_PX;
  const pz = (z - centerZ) * CUBE_PX;

  cube.style.transform = `translate3d(${px}px, ${py}px, ${pz}px)`;

  const faces = ['top','bottom','left','right','front','back'];
  for(const faceName of faces){
    const f = document.createElement('div');
    f.className = 'face ' + faceName + ' ' +
      (faceName==='top'   ? 'shade-top'   :
       faceName==='left'  ? 'shade-left'  :
       faceName==='right' ? 'shade-right' :
                            'shade-front');
    cube.appendChild(f);
  }

  cubeElements[i] = cube;
  sceneEl.appendChild(cube);
  return cube;
}

function removeCubeElement(x,y,z){
  const i = idx(x,y,z);
  const cube = cubeElements[i];
  if(!cube) return;
  cube.remove();
  cubeElements[i] = null;
}

function refreshSingleCube(x,y,z){
  if(!inBounds(x,y,z)) return;
  const i = idx(x,y,z);
  const id = world[i];

  if(id === 0){
    removeCubeElement(x,y,z);
    return;
  }

  const type = BLOCK_TYPES[id];
  if(!type || type.color === null){
    removeCubeElement(x,y,z);
    return;
  }

  const cube = createCubeElement(x,y,z);
  if(!cube) return;
  const visibleFaces = getVisibleFaces(x,y,z);
  const faceMap = {
    top: 0, bottom: 1, left: 2,
    right: 3, front: 4, back: 5
  };

  for(const [faceName, idxFace] of Object.entries(faceMap)){
    const face = cube.children[idxFace];
    if(!face) continue;
    if(visibleFaces.includes(faceName)){
      face.style.display = 'block';
      face.style.background = type.color;
    } else {
      face.style.display = 'none';
    }
  }
}

function refreshAllCubesFromWorld(){
  for(let x=0;x<WORLD.width;x++){
    for(let y=0;y<WORLD.height;y++){
      for(let z=0;z<WORLD.depth;z++){
        refreshSingleCube(x,y,z);
      }
    }
  }
}

function refreshNeighbors(x,y,z){
  const n = getNeighbors(x,y,z);
  refreshSingleCube(x,y,z);
  for(const [_, [nx,ny,nz]] of Object.entries(n)){
    if(inBounds(nx,ny,nz)) refreshSingleCube(nx,ny,nz);
  }
}

/* ================= INVENTORY UI ================= */
function buildInventory(){
  const inv = document.getElementById('inventory');
  if(!inv) return;
  inv.innerHTML = '';
  BLOCK_TYPES.forEach(b=>{
    const btn = document.createElement('div');
    btn.className = 'block-btn';
    btn.title = b.name;
    btn.style.background = b.color || 'linear-gradient(45deg,#fff,#ddd)';
    btn.textContent = b.name;
    btn.addEventListener('click', ()=>{
      selectedBlock = b.id;
      document.querySelectorAll('.block-btn').forEach(el=>el.classList.remove('selected'));
      btn.classList.add('selected');
      const sel = document.getElementById('selName');
      if(sel) sel.textContent = b.name;
    });
    if(b.id === selectedBlock) btn.classList.add('selected');
    inv.appendChild(btn);
  });
  const sel = document.getElementById('selName');
  if(sel) sel.textContent = BLOCK_TYPES[selectedBlock].name;
}

/* ================= CAMERA / CONTROLS ================= */
function updateCameraTransform(){
  const centerTranslate = 'translate(-50%,-50%)';
  const cx = -camX * CUBE_PX;
  const cy =  camY * CUBE_PX;
  const cz = -camZ * CUBE_PX;
  const rot = `rotateX(${pitch}rad) rotateY(${yaw}rad)`;
  if(sceneEl) sceneEl.style.transform = `${centerTranslate} translate3d(${cx}px, ${cy}px, ${cz}px) ${rot}`;
}

function attachInputHandlers(){
  if(!viewport) return;

  viewport.addEventListener('click', ()=> {
    if(viewport.requestPointerLock) viewport.requestPointerLock();
  });

  document.addEventListener('pointerlockchange', ()=>{
    pointerLocked = document.pointerLockElement === viewport;
    const hud = document.getElementById('hud');
    if(hud) hud.style.display = pointerLocked ? 'none' : 'block';
  });

  document.addEventListener('mousemove', e=>{
    if(!pointerLocked) return;
    const sens = 0.0025;
    yaw   -= e.movementX * sens;
    pitch -= e.movementY * sens;
    const limit = Math.PI/2 - 0.01;
    pitch = Math.max(-limit, Math.min(limit, pitch));
  });

  viewport.addEventListener('mousedown', e=>{
    if(!pointerLocked) return;

    const hit = raycast();
    if(!hit) return;

    if(e.button === 0){
      const { hitX, hitY, hitZ } = hit;
      if(inBounds(hitX,hitY,hitZ)){
        world[idx(hitX,hitY,hitZ)] = 0;
        refreshNeighbors(hitX, hitY, hitZ);
      }
    } else if(e.button === 2){
      const { prevX, prevY, prevZ } = hit;
      if(inBounds(prevX,prevY,prevZ) && world[idx(prevX,prevY,prevZ)] === 0){
        world[idx(prevX,prevY,prevZ)] = selectedBlock;
        refreshNeighbors(prevX, prevY, prevZ);
      }
    }
  });

  viewport.addEventListener('contextmenu', e=> e.preventDefault());

  window.addEventListener('keydown', e=>{
    const k = e.key.toLowerCase();
    keys[k] = true;
    if(e.code === 'Space' && onGround){
      vy = JUMP;
      onGround = false;
    }
  });
  window.addEventListener('keyup', e=>{
    const k = e.key.toLowerCase();
    keys[k] = false;
  });
}

/* ================= PHYSICS & COLLISION ================= */
function isBlockedAtPlayerHeight(x, feetY, z) {
  return isSolidAt(x, feetY, z) || isSolidAt(x, feetY + 1, z);
}

function stepPhysics(){
  const sinYaw = Math.sin(yaw);
  const cosYaw = Math.cos(yaw);

  const forwardX = sinYaw;
  const forwardZ = cosYaw;
  const rightX   = Math.sin(yaw - Math.PI/2);
  const rightZ   = Math.cos(yaw - Math.PI/2);

  let dx = 0, dz = 0;
  if(keys['w']) { dx += forwardX; dz += forwardZ; }
  if(keys['s']) { dx -= forwardX; dz -= forwardZ; }
  if(keys['a']) { dx += rightX;   dz += rightZ;   }
  if(keys['d']) { dx -= rightX;   dz -= rightZ;   }

  if(dx !== 0 || dz !== 0){
    const len = Math.hypot(dx,dz);
    dx = dx/len * MOVE_SPEED;
    dz = dz/len * MOVE_SPEED;
  }

  const feetY = Math.floor(camY - 1.6 + 0.001);

  let nextX = camX + dx;
  let nextZ = camZ + dz;

  if(!isBlockedAtPlayerHeight(Math.floor(nextX), feetY, Math.floor(camZ))){
    camX = nextX;
  }
  if(!isBlockedAtPlayerHeight(Math.floor(camX), feetY, Math.floor(nextZ))){
    camZ = nextZ;
  }

  vy += GRAVITY;
  camY += vy;

  const newFeetY = Math.floor(camY - 1.6 + 0.001);
  if(isSolidAt(Math.floor(camX), newFeetY, Math.floor(camZ))){
    camY = newFeetY + 1.6 + 0.001;
    vy = 0;
    onGround = true;
  } else {
    onGround = false;
  }

  updateCameraTransform();
}

/* ================= RAYCAST / CLICK HANDLING ================= */
function raycast(maxDist = 6, step = 0.1){
  const cosPitch = Math.cos(pitch);
  const dirX = Math.sin(yaw) * cosPitch;
  const dirY = Math.sin(pitch);
  const dirZ = Math.cos(yaw) * cosPitch;

  let prevX = Math.floor(camX);
  let prevY = Math.floor(camY);
  let prevZ = Math.floor(camZ);

  for(let t=0; t<=maxDist; t+=step){
    const rx = camX + dirX * t;
    const ry = camY + dirY * t;
    const rz = camZ + dirZ * t;

    const vx = Math.floor(rx);
    const vyCell = Math.floor(ry);
    const vz = Math.floor(rz);

    if(!inBounds(vx,vyCell,vz)) break;

    const id = world[idx(vx,vyCell,vz)];
    if(id !== 0){
      return { hitX:vx, hitY:vyCell, hitZ:vz, prevX, prevY, prevZ };
    }

    prevX = vx;
    prevY = vyCell;
    prevZ = vz;
  }
  return null;
}

/* ================= UI HOOKS ================= */
function wireUiButtons(){
  const regenBtn = document.getElementById('regen');
  if(regenBtn) regenBtn.addEventListener('click', ()=>{
    generateWorld();
    resetCameraToGround();
  });

  const resetBtn = document.getElementById('resetCam');
  if(resetBtn) resetBtn.addEventListener('click', resetCameraToGround);
}

function resetCameraToGround() {
  const ground = Math.floor(WORLD.height * 0.5);
  camX = Math.floor(WORLD.width / 2) + 0.5;
  camZ = Math.floor(WORLD.depth / 2) + 0.5;
  camY = ground + 1.6;
  yaw = 0;
  pitch = 0;
  vy = 0;
  onGround = true;
  updateCameraTransform();
}

/* ================= MAIN LOOP ================= */
function loop(){
  stepPhysics();
  requestAnimationFrame(loop);
}

/* ================= INIT ================= */
function init(){
  sceneEl  = document.getElementById('scene');
  viewport = document.getElementById('viewport');

  buildInventory();
  wireUiButtons();
  attachInputHandlers();

  generateWorld();        // world must exist before placing camera
  resetCameraToGround();
  updateCameraTransform();
  loop();
}

init();
