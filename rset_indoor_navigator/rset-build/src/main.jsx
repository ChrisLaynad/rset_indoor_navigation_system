import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Html, OrbitControls, Grid, OrthographicCamera } from '@react-three/drei';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as THREE from 'three';
import { floors, places, locationMarkers, DEFAULT_CURRENT_LOCATION, campusBoundary, mapWarnings, qrCheckpoints } from './data';
import { createRoute, pathToPoints, routeFloors, nearestPointOnRoute, pointAt, routeDistanceRemaining, getTurnInstruction } from './navigation';
import './styles.css';

const MODEL_PATH = '/main_block_test-9.1.fbx';
const FLOOR_Y = { ground: -11.35, first: -3.82, second: 3.71, third: 11.24 };
const MAP_FLOOR = { ground:'G', first:'F1', second:'F2', third:'F3' };
const APP_FLOOR = { G:'ground', F1:'first', F2:'second', F3:'third' };

function CampusModel({ opacity, ghost, visible=true }) {
  const fbx = useLoader(FBXLoader, MODEL_PATH);
  const model = useMemo(() => {
    const root = fbx.clone(true); const box = new THREE.Box3().setFromObject(root); const size = box.getSize(new THREE.Vector3());
    root.scale.setScalar(50 / (Math.max(size.x, size.y, size.z) || 1)); const b = new THREE.Box3().setFromObject(root); root.position.sub(b.getCenter(new THREE.Vector3()));
    root.traverse(o => { if (!o.isMesh) return; o.material = o.material?.clone?.() || new THREE.MeshStandardMaterial(); o.material.color = new THREE.Color('#c5d0dc'); o.material.roughness=.62; o.material.metalness=.08; o.material.transparent=true; o.material.opacity=opacity; o.material.depthWrite=!ghost; });
    return root;
  }, [fbx, opacity, ghost]);
  if (!visible) return null;
  return <primitive object={model} />;
}
const CALIBRATION_KEY='rset-map-calibration-v2-fbx';
const DEFAULT_CALIBRATION={scaleX:1,scaleY:1,offsetX:0,offsetY:0,rotation:0};
function readCalibration(){
  try{return JSON.parse(localStorage.getItem(CALIBRATION_KEY)||'{}')}catch{return {}}
}
function transformMapPoint(x,z,cal={}){
  const c={...DEFAULT_CALIBRATION,...cal};
  const baseScaleX=49.62108662109358/76;
  const baseScaleZ=50/76;
  let mx=x/baseScaleX+38, my=38-z/baseScaleZ;
  mx=38+(mx-38)*c.scaleX+c.offsetX;
  my=38+(my-38)*c.scaleY+c.offsetY;
  if(c.rotation){
    const a=c.rotation*Math.PI/180, dx=mx-38, dy=my-38;
    mx=38+dx*Math.cos(a)-dy*Math.sin(a);
    my=38+dx*Math.sin(a)+dy*Math.cos(a);
  }
  return {left:(mx/76)*100,top:(my/76)*100};
}
function worldToPlanPercent(x,z,cal){return transformMapPoint(x,z,cal)}

function Plan2D({floor, selected, routePoints, location, displayPlaces, onSelect, calibration}){
  const [zoom,setZoom]=useState(1);
  const [pan,setPan]=useState({x:0,y:0});
  const drag=useRef(null);
  const f=floors.find(x=>x.id===floor)||floors[0];
  const cal=calibration[f.mapId]||DEFAULT_CALIBRATION;
  const floorPoints=routePoints.filter(p=>p.floorId===f.mapId);
  const segments=[];
  let seg=[];
  routePoints.forEach((p)=>{
    if(p.floorId===f.mapId) seg.push(p);
    else if(seg.length){segments.push(seg);seg=[];}
  });
  if(seg.length)segments.push(seg);
  const routePaths=segments.filter(a=>a.length>1).map(a=>a.map((p,i)=>{const q=worldToPlanPercent(p.x,p.z,cal);return `${i?'L':'M'} ${q.left} ${q.top}`}).join(' '));
  const loc=location.floor===floor?worldToPlanPercent(location.x,location.z,cal):null;
  const markerPlaces=displayPlaces.filter(p=>p.floor===floor);
  const onWheel=e=>{e.preventDefault();setZoom(z=>Math.min(2.8,Math.max(.75,z*(e.deltaY<0?1.12:.89))))};
  const down=e=>{drag.current={x:e.clientX,y:e.clientY,px:pan.x,py:pan.y};e.currentTarget.setPointerCapture?.(e.pointerId)};
  const move=e=>{if(!drag.current)return;setPan({x:drag.current.px+(e.clientX-drag.current.x),y:drag.current.py+(e.clientY-drag.current.y)})};
  const up=()=>{drag.current=null};
  return <div className="plan2d" onWheel={onWheel} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
    <div className="plan-architectural-header"><div><b>{f.label.toUpperCase()}</b><span>FBX-REFERENCED ARCHITECTURAL PLAN</span></div><div className="plan-north">N</div></div>
    <div className="plan-canvas" style={{transform:`translate(${pan.x}px,${pan.y}px) scale(${zoom})`}}>
      <img src={f.image} className="plan-image" draggable="false" alt={`${f.label} floor plan`}/>
      <svg className="plan-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
        {routePaths.map((d,i)=><g key={i}><path d={d} className="plan-route-shadow"/><path d={d} className="plan-route"/></g>)}
      </svg>
      <div className="plan-scale"><span>0</span><i></i><span>5 m</span></div>
      {markerPlaces.map(p=>{const q=worldToPlanPercent(p.doorWorld.x,p.doorWorld.z,cal);return <button key={p.id} className={`plan-pin ${selected?.id===p.id?'selected':''}`} style={{left:`${q.left}%`,top:`${q.top}%`}} onClick={e=>{e.stopPropagation();onSelect?.(p)}} title={p.name}><span>{selected?.id===p.id?'●':'•'}</span><b>{p.name}</b></button>})}
      {loc&&<div className="plan-user-dot" style={{left:`${loc.left}%`,top:`${loc.top}%`}}><span></span><b>YOU</b></div>}
    </div>
    <div className="plan-zoom"><button onClick={()=>setZoom(z=>Math.min(2.8,z+.2))}>+</button><span>{Math.round(zoom*100)}%</span><button onClick={()=>setZoom(z=>Math.max(.75,z-.2))}>−</button><button onClick={()=>{setZoom(1);setPan({x:0,y:0})}}>⌖</button></div>
    <div className="plan-help"><b>ARCHITECTURAL 2D · FBX CALIBRATED</b><span>Square plan frame is locked to the same 50 m reference used by the FBX. Blue band marks the walkable corridor.</span></div>
  </div>;
}

function FloorSlabs({ activeFloor }) {
  const slabs = floors.map((f) => ({
    ...f,
    y: FLOOR_Y[f.id] ?? 0,
  }));
  return <group>
    {slabs.map((f) => {
      const active = f.id === activeFloor;
      return <group key={f.id} position={[0, f.y - 0.10, 0]}>
        <mesh receiveShadow>
          <boxGeometry args={[50, 0.20, 50]} />
          <meshStandardMaterial
            color={active ? '#e8eef4' : '#cbd5df'}
            transparent
            opacity={active ? 0.42 : 0.16}
            roughness={0.88}
            metalness={0.02}
            depthWrite={false}
          />
        </mesh>
        <Html position={[-23, 0.16, -23]} distanceFactor={18}>
          <div className="floor-level-tag">{f.short} · {f.label.replace(' Floor','')}</div>
        </Html>
      </group>;
    })}
  </group>;
}

function FloorPlan({ floor, visible=true, opacity=0.38 }) {
  if (!visible) return null;
  const texture = useLoader(THREE.TextureLoader, floor.image);
  texture.colorSpace = THREE.SRGBColorSpace;
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y[floor.id] + 0.02, 0]}>
    <planeGeometry args={[50, 50]} />
    <meshBasicMaterial map={texture} transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} />
  </mesh>;
}
function DestinationMarker({ marker, active }) {
  if (!active) return null;
  const y=(FLOOR_Y[marker.floor]??0)+.38;
  return <group position={[marker.position.x,y,marker.position.z]}>
    <mesh rotation={[-Math.PI/2,0,0]}>
      <ringGeometry args={[.55,.78,40]}/>
      <meshBasicMaterial color="#087ff5" transparent opacity={.95}/>
    </mesh>
    <mesh position={[0,.18,0]}>
      <cylinderGeometry args={[.18,.18,.28,24]}/>
      <meshStandardMaterial color="#0b84ff" emissive="#006ee0" emissiveIntensity={1.2}/>
    </mesh>
    <mesh position={[0,.48,0]}>
      <sphereGeometry args={[.23,24,24]}/>
      <meshStandardMaterial color="#ffffff" emissive="#087ff5" emissiveIntensity={1.8}/>
    </mesh>
    <Html distanceFactor={8} center>
      <div className="destination-3d-label"><span>DESTINATION</span><b>{marker.name}</b></div>
    </Html>
  </group>;
}
function UserMarker({ location, heading }) {
  const y=(FLOOR_Y[location.floor]??0)+.28;
  return <group position={[location.x,y,location.z]} rotation={[0,heading,0]}>
    <mesh rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.4,.55,32]}/><meshBasicMaterial color="#087ff5" transparent opacity={.9}/></mesh>
    <mesh position={[0,.2,0]}><sphereGeometry args={[.17,20,20]}/><meshStandardMaterial color="#fff" emissive="#087ff5" emissiveIntensity={1.5}/></mesh>
    <mesh position={[0,.06,-.5]} rotation={[Math.PI/2,0,0]}><coneGeometry args={[.16,.5,3]}/><meshBasicMaterial color="#087ff5"/></mesh>
    <Html distanceFactor={9} center><div className="user-label">YOU</div></Html>
  </group>;
}
function CorridorGuide({ points, activeFloor }) {
  const floorId=MAP_FLOOR[activeFloor];
  const visible=points.filter(p=>p.floorId===floorId);
  if(visible.length<2) return null;
  const corridorWidth=1.85;
  return <group>
    {visible.slice(0,-1).map((a,i)=>{
      const b=visible[i+1];
      const y=FLOOR_Y[activeFloor]+0.035;
      const dx=b.x-a.x, dz=b.z-a.z;
      const len=Math.hypot(dx,dz)||.001;
      const angle=Math.atan2(dx,dz);
      return <mesh key={`corridor-${a.nodeId}-${i}`} position={[(a.x+b.x)/2,y,(a.z+b.z)/2]} rotation={[-Math.PI/2,0,angle]}>
        <planeGeometry args={[corridorWidth,len]}/>
        <meshBasicMaterial color="#087ff5" transparent opacity={0.075} depthWrite={false} side={THREE.DoubleSide}/>
      </mesh>;
    })}
  </group>;
}
function VerticalRouteConnector({ points }) {
  const connectors=[];
  for(let i=0;i<points.length-1;i++){
    const a=points[i], b=points[i+1];
    if(a.floorId===b.floorId) continue;
    const fa=APP_FLOOR[a.floorId], fb=APP_FLOOR[b.floorId];
    if(!fa||!fb) continue;
    connectors.push({a,b,fa,fb,i});
  }
  return <group>
    {connectors.map(({a,b,fa,fb,i})=>{
      const low=FLOOR_Y[fa], high=FLOOR_Y[fb];
      const y1=Math.min(low,high)+.12, y2=Math.max(low,high)+.12;
      const mid=(y1+y2)/2;
      const len=Math.abs(y2-y1);
      return <group key={`vertical-${i}`}>
        <mesh position={[a.x,mid,a.z]}>
          <cylinderGeometry args={[.16,.16,len,12]}/>
          <meshStandardMaterial color="#087ff5" emissive="#006ee0" emissiveIntensity={1.6}/>
        </mesh>
        <mesh position={[a.x,mid,a.z]}>
          <torusGeometry args={[.42,.045,12,32]}/>
          <meshBasicMaterial color="#087ff5" transparent opacity={.7}/>
        </mesh>
        <Html position={[a.x,mid,a.z]} distanceFactor={12} center>
          <div className="stair-route-label"><b>STAIRS</b><span>{low<high?'↑':'↓'} {low<high?fb.toUpperCase():fa.toUpperCase()}</span></div>
        </Html>
      </group>;
    })}
  </group>;
}
function Route({ points, activeFloor, destination }) {
  const floor=MAP_FLOOR[activeFloor];
  const visible=points.filter(p=>p.floorId===floor);
  return <group>
    <CorridorGuide points={points} activeFloor={activeFloor}/>
    <VerticalRouteConnector points={points}/>
    {visible.length>1 && visible.slice(0,-1).map((a,i)=>{
      const b=visible[i+1];
      const s=new THREE.Vector3(a.x,FLOOR_Y[activeFloor]+0.16,a.z);
      const e=new THREE.Vector3(b.x,FLOOR_Y[activeFloor]+0.16,b.z);
      const v=e.clone().sub(s);
      const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),v.clone().normalize());
      return <group key={a.nodeId+i}>
        <mesh position={s.clone().add(e).multiplyScalar(.5)} quaternion={q}>
          <cylinderGeometry args={[.11,.11,v.length(),12]}/>
          <meshStandardMaterial color="#087ff5" emissive="#006ee0" emissiveIntensity={1.8} roughness={.18}/>
        </mesh>
        {i%2===0 && <mesh position={s.clone().lerp(e,.5)} rotation={[0,Math.atan2(v.x,v.z),0]}>
          <coneGeometry args={[.20,.44,3]}/><meshBasicMaterial color="#ffffff"/>
        </mesh>}
      </group>;
    })}
    {destination && destination.floor===activeFloor && <DestinationMarker marker={{...destination,position:destination.doorWorld}} active/>}
  </group>;
}
function WalkCamera({ walking, location, heading, pitch=0 }) {
  const {camera}=useThree();
  const smooth=useRef(new THREE.Vector3());
  const target=useRef(new THREE.Vector3());
  const bob=useRef(0);
  const initialized=useRef(false);
  useFrame((_,dt)=>{
    if(!walking) { initialized.current=false; return; }
    const y=(FLOOR_Y[location.floor]??0)+1.68;
    const forward=new THREE.Vector3(Math.sin(heading),0,Math.cos(heading));
    const desired=new THREE.Vector3(location.x,y,location.z).addScaledVector(forward,.10);
    if(!initialized.current){ smooth.current.copy(desired); initialized.current=true; }
    const alpha=1-Math.exp(-Math.min(dt,.05)*10);
    smooth.current.lerp(desired,alpha);
    bob.current+=dt*6.5;
    const bobY=Math.sin(bob.current)*.012;
    camera.position.copy(smooth.current).add(new THREE.Vector3(0,bobY,0));
    const lookPitch=THREE.MathUtils.clamp(pitch,-0.30,0.22);
    const lookDistance=12;
    target.current.copy(camera.position).addScaledVector(forward,lookDistance);
    target.current.y += Math.tan(lookPitch)*lookDistance;
    camera.lookAt(target.current);
    camera.fov=74;
    camera.near=.03;
    camera.far=180;
    camera.updateProjectionMatrix();
  });
  return null;
}
function Scene({floor,showPlan,planOpacity,modelOpacity,ghost,selected,routePoints,location,heading,pitch,walking,viewMode,displayPlaces,onSelect,calibration}){
 const f=floors.find(x=>x.id===floor)||floors[0];
 if(viewMode==='2d') return <Plan2D floor={floor} selected={selected} routePoints={routePoints} location={location} displayPlaces={displayPlaces} onSelect={onSelect} calibration={calibration}/>;
 const activeMarker=selected?{id:selected.id,name:selected.name,floor:selected.floor,mapFloor:selected.mapFloor,position:selected.doorWorld}:null;
 return <Canvas shadows camera={{position:[27,18,27],fov:62}}>
   <color attach="background" args={[walking?'#dce9f2':'#edf5fa']}/>
   <ambientLight intensity={1.85}/><hemisphereLight intensity={1.2}/>
   <directionalLight position={[25,35,15]} intensity={2.5} castShadow/>
   <FloorSlabs activeFloor={floor}/><CampusModel opacity={walking?Math.max(modelOpacity,.96):modelOpacity} ghost={ghost}/>
   {!walking&&<FloorPlan floor={f} visible={showPlan} opacity={planOpacity}/>} 
   {!walking&&<Grid args={[60,60]} cellSize={1} cellThickness={.2} sectionSize={5} sectionThickness={.7} fadeDistance={70} position={[0,FLOOR_Y[floor]-.03,0]}/>} 
   {activeMarker&&activeMarker.floor===floor&&<DestinationMarker marker={activeMarker} active/>}
   {location.floor===floor&&<UserMarker location={location} heading={heading}/>} 
   {routePoints.length>1&&<Route points={routePoints} activeFloor={floor} destination={selected}/>} 
   <WalkCamera walking={walking} location={location} heading={heading} pitch={pitch}/>
   <OrbitControls enabled={!walking} enableDamping dampingFactor={.08} maxPolarAngle={Math.PI/2.04}/>
 </Canvas>;
}

function App(){
 const [floor,setFloor]=useState('ground'),[query,setQuery]=useState(''),[selected,setSelected]=useState(null),[viewMode,setViewMode]=useState('3d'),[route,setRoute]=useState(null),[points,setPoints]=useState([]),[walking,setWalking]=useState(false),[pitch,setPitch]=useState(-.02),[lookDragging,setLookDragging]=useState(false),[showPlan,setShowPlan]=useState(true),[planOpacity,setPlanOpacity]=useState(.38),[modelOpacity,setModelOpacity]=useState(.94),[ghost,setGhost]=useState(false),[location,setLocation]=useState(DEFAULT_CURRENT_LOCATION),[heading,setHeading]=useState(0),[message,setMessage]=useState('Search for a room, lab or office'),[liveGps,setLiveGps]=useState(false),[demoMode,setDemoMode]=useState(true),[outside,setOutside]=useState(false),[admin,setAdmin]=useState(false),[adminUnlocked,setAdminUnlocked]=useState(false),[adminLogin,setAdminLogin]=useState(false),[adminPin,setAdminPin]=useState(''),[adminError,setAdminError]=useState(''),[nameOverrides,setNameOverrides]=useState(()=>{try{return JSON.parse(localStorage.getItem('rset-admin-names')||'{}')}catch{return {}}}),[progress,setProgress]=useState(0),[step,setStep]=useState({text:'Choose a destination',distance:0,type:'straight'}),[history,setHistory]=useState([]),[favorites,setFavorites]=useState([]),[showPlaces,setShowPlaces]=useState(false),[qrMode,setQrMode]=useState(false);
 const [calibration,setCalibration]=useState(()=>readCalibration());
 const [calFloor,setCalFloor]=useState('ground');
 const walk=useRef({seg:0,t:0});
 const touchLook=useRef(null);
 const displayPlaces=useMemo(()=>places.map(p=>({...p,name:nameOverrides[p.id]?.name||p.name,label:nameOverrides[p.id]?.name||p.label,aliases:nameOverrides[p.id]?.aliases||p.aliases})),[nameOverrides]);
 const results=useMemo(()=>{const q=query.trim().toLowerCase(); const list=displayPlaces.filter(p=>p.searchable!==false); if(!q)return list.slice(0,16); return list.filter(p=>[p.name,p.label,p.floorLabel,p.doorRef,...(p.aliases||[])].filter(Boolean).join(' ').toLowerCase().includes(q)).slice(0,16)},[query,displayPlaces]);
 useEffect(()=>{try{localStorage.setItem('rset-admin-names',JSON.stringify(nameOverrides))}catch{}},[nameOverrides]);
 useEffect(()=>{try{localStorage.setItem(CALIBRATION_KEY,JSON.stringify(calibration))}catch{}},[calibration]);
 const remaining=route?Math.max(0,routeDistanceRemaining(points,walk.current.seg,walk.current.t)):0;
 useEffect(()=>{if(!liveGps)return; if(!navigator.geolocation){setMessage('This browser does not provide GPS');return;} const watch=navigator.geolocation.watchPosition(pos=>{const {latitude,longitude,accuracy}=pos.coords; const dLat=(latitude-campusBoundary.centerLatitude)*111320,dLon=(longitude-campusBoundary.centerLongitude)*111320*Math.cos(campusBoundary.centerLatitude*Math.PI/180); const inside=Math.hypot(dLat,dLon)<=campusBoundary.radius; setOutside(!inside);setMessage(inside?`Campus GPS active • ±${Math.round(accuracy)} m`: 'You appear to be outside the campus');},()=>setMessage('Location permission was not granted'),{enableHighAccuracy:true,maximumAge:2000,timeout:8000}); return()=>navigator.geolocation.clearWatch(watch)},[liveGps]);
 useEffect(()=>{const onKey=e=>{if(!walking)return; if(['w','W','ArrowUp'].includes(e.key)){e.preventDefault();moveForward(.55)} else if(['s','S','ArrowDown'].includes(e.key)){e.preventDefault();moveForward(-.35)} else if(['a','A','ArrowLeft'].includes(e.key)){e.preventDefault();turn(-Math.PI/18)} else if(['d','D','ArrowRight'].includes(e.key)){e.preventDefault();turn(Math.PI/18)} else if(e.key==='Escape'){setWalking(false)}}; window.addEventListener('keydown',onKey); return()=>window.removeEventListener('keydown',onKey)});
 useEffect(()=>{if(!walking)return; const move=e=>{if(!lookDragging)return; setHeading(h=>h-e.movementX*.0032); setPitch(p=>THREE.MathUtils.clamp(p-e.movementY*.0022,-.30,.22));}; const up=()=>setLookDragging(false); window.addEventListener('mousemove',move); window.addEventListener('mouseup',up); return()=>{window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up)}} ,[walking,lookDragging]);
 useEffect(()=>{if(!walking)return; const move=e=>{if(!touchLook.current||!e.touches?.[0])return; const t=e.touches[0],dx=t.clientX-touchLook.current.x,dy=t.clientY-touchLook.current.y; touchLook.current={x:t.clientX,y:t.clientY}; setHeading(h=>h-dx*.004); setPitch(p=>THREE.MathUtils.clamp(p-dy*.0025,-.30,.22)); e.preventDefault();}; const end=()=>{touchLook.current=null;setLookDragging(false)}; window.addEventListener('touchmove',move,{passive:false}); window.addEventListener('touchend',end); window.addEventListener('touchcancel',end); return()=>{window.removeEventListener('touchmove',move);window.removeEventListener('touchend',end);window.removeEventListener('touchcancel',end)}} ,[walking]);
 function startDemo(){setDemoMode(true);setLiveGps(false);setOutside(false);setMessage('Demo mode active • simulated Reception location');if(selected){buildRoute();return;}const p=displayPlaces.find(x=>x.name.toLowerCase().includes('library'))||displayPlaces[0];if(p){setSelected(p);setQuery('');setFloor(p.floor);const r=createRoute(DEFAULT_CURRENT_LOCATION,p);if(r.path.length){const pts=pathToPoints(r.path);setRoute(r);setPoints(pts);walk.current={seg:0,t:0};setStep(getTurnInstruction(pts,0,0));setHeading(pts[1]?Math.atan2(pts[1].x-pts[0].x,pts[1].z-pts[0].z):0);setMessage(`Demo route ready • ${p.name}`);}}}
 function unlockAdmin(){if(adminPin==='2468'){setAdminUnlocked(true);setAdmin(true);setAdminLogin(false);setAdminPin('');setAdminError('');setMessage('Admin mode unlocked');}else{setAdminError('Incorrect PIN. Use the demo PIN 2468.');}}
 function choose(p){setSelected(p);setQuery('');setFloor(p.floor);setMessage(`${p.name} selected`);setShowPlaces(false);setHistory(h=>[p.id,...h.filter(id=>id!==p.id)].slice(0,6));}
 function buildRoute(){if(!selected){setMessage('Select a destination first');return;} const r=createRoute(location,selected); if(!r.path.length){setMessage(`No connected walking route to ${selected.name}`);return;} const pts=pathToPoints(r.path); setRoute(r);setPoints(pts);walk.current={seg:0,t:0};setProgress(0);setFloor(location.floor);setWalking(false);const p=pointAt(pts,{seg:0,t:0});setHeading(p?.heading||0);setStep(getTurnInstruction(pts,0,0));setMessage(`Route ready • ${Math.round(r.distance)} m • ${Math.max(1,Math.ceil(r.minutes))} min`);}
 function enterWalk(){if(!points.length){setMessage('Start a route first');return;}const p=points[0];const n=points[1]||p;setWalking(true);setViewMode('3d');setFloor(location.floor);setPitch(-.02);setHeading(Math.atan2(n.x-p.x,n.z-p.z));setMessage('POV walk • follow the blue corridor route');}
 function stop(){setWalking(false);setRoute(null);setPoints([]);walk.current={seg:0,t:0};setLocation(DEFAULT_CURRENT_LOCATION);setHeading(0);setProgress(0);setSelected(null);setMessage('Navigation stopped • back at Reception');}
 function moveForward(amount){if(!points.length)return; let {seg,t}=walk.current; let left=Math.abs(amount),dir=amount>=0?1:-1; while(left>.0001){ if(dir>0){ if(seg>=points.length-1){setMessage('Arrived at destination');setWalking(false);setProgress(1);return;} const a=points[seg],b=points[seg+1],len=Math.hypot(b.x-a.x,b.z-a.z)||.001,remain=(1-t)*len; if(left<=remain){t+=left/len;left=0;}else{left-=remain;seg++;t=0;} } else { if(seg===0&&t<=0)break; const a=points[seg],b=points[seg+1],len=Math.hypot(b.x-a.x,b.z-a.z)||.001,covered=t*len; if(left<=covered){t-=left/len;left=0;}else{left-=covered;seg=Math.max(0,seg-1);t=1;} }} walk.current={seg,t}; const p=pointAt(points,walk.current); if(!p)return; setLocation(l=>({...l,x:p.x,z:p.z,floor:APP_FLOOR[p.floorId],mapFloor:p.floorId,nodeId:p.nodeId,source:'POV Corridor Route'}));setFloor(APP_FLOOR[p.floorId]);setHeading(p.heading);setProgress(Math.min(1,(seg+t)/Math.max(1,points.length-1)));setStep(getTurnInstruction(points,seg,t));}
 function turn(a){setHeading(h=>h+a);setMessage(a<0?'Turn left':'Turn right');}
 function recalc(){if(!selected)return;const near=nearestPointOnRoute({x:location.x,z:location.z,floorId:location.mapFloor},points);if(near.distance>3){buildRoute();setMessage('Route recalculated from your current position');}else setMessage('You are on the blue route');}
 function resetDemo(){setDemoMode(true);setLiveGps(false);setOutside(false);setWalking(false);setRoute(null);setPoints([]);setLocation(DEFAULT_CURRENT_LOCATION);setHeading(0);setSelected(null);setProgress(0);setMessage('Demo source: Reception checkpoint');setFloor('ground');}
 const favPlaces=places.filter(p=>favorites.includes(p.id)); const recentPlaces=history.map(id=>places.find(p=>p.id===id)).filter(Boolean);
 return <div className="app"><header className="topbar"><div><div className="brand">RSET <span>INDOOR</span></div><div className="subtitle">3D campus navigation • Kakkanad</div></div><div className="top-actions"><span className={`status ${liveGps?'live':demoMode?'demo':''}`}>{liveGps?'LIVE GPS':demoMode?'DEMO MODE':'USER MODE'}</span><div className="mode-switch"><button className={!admin && !demoMode?'active':''} onClick={()=>{setAdmin(false);setDemoMode(false);setLiveGps(false);setMessage('User mode • real positioning can be enabled below')}}>USER</button><button className={demoMode?'active':''} onClick={startDemo}>DEMO</button><button className={admin?'active':''} onClick={()=>{if(adminUnlocked){setAdmin(true);setDemoMode(false);}else{setAdminLogin(true);setAdminError('');}}}>ADMIN</button></div></div></header><main className="workspace">{adminLogin&&<div className="modal-backdrop" onClick={()=>setAdminLogin(false)}><div className="admin-login" onClick={e=>e.stopPropagation()}><div className="eyebrow">RSET ADMIN</div><h2>Unlock Admin Mode</h2><p>Enter the administrator PIN to edit names and map settings.</p><input autoFocus type="password" inputMode="numeric" maxLength={8} value={adminPin} onChange={e=>setAdminPin(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')unlockAdmin()}} placeholder="Admin PIN"/><button className="primary full" onClick={unlockAdmin}>Unlock Admin</button><button className="secondary full" onClick={()=>setAdminLogin(false)}>Cancel</button>{adminError&&<div className="login-error">{adminError}</div>}<small>Demo PIN: 2468</small></div></div>}<section className="map-wrap"><Scene calibration={calibration} onSelect={choose} viewMode={viewMode} displayPlaces={displayPlaces} floor={floor} showPlan={showPlan} planOpacity={planOpacity} modelOpacity={modelOpacity} ghost={ghost} selected={selected} routePoints={points} location={location} heading={heading} pitch={pitch} walking={walking}/>
 {walking&&<div className="pov-look-zone" onMouseDown={e=>{e.preventDefault();setLookDragging(true)}} onTouchStart={e=>{const t=e.touches?.[0];if(t)touchLook.current={x:t.clientX,y:t.clientY};setLookDragging(true)}}><div className="pov-crosshair"><i></i><i></i></div><div className="pov-help">DRAG TO LOOK · W / ↑ TO WALK</div></div>}
 <div className="searchbox"><span>⌕</span><input value={query} onFocus={()=>setShowPlaces(true)} onChange={e=>{setQuery(e.target.value);setShowPlaces(true)}} placeholder="Search room, lab, office…"/><button onClick={()=>{setQuery('');setShowPlaces(false)}}>×</button></div>
 {showPlaces&&<div className="results"><div className="results-title">{query?'Search results':'Quick destinations'}</div>{!query&&recentPlaces.length>0&&<div className="quick-row"><span>Recent</span>{recentPlaces.slice(0,3).map(p=><button key={p.id} onClick={()=>choose(p)}>{p.name}</button>)}</div>}{results.map(p=><button className="result" key={p.id} onClick={()=>choose(p)}><span><b>{p.name}</b><small>{p.floorLabel}{p.doorRef?` · ${p.doorRef}`:''}</small></span><span>›</span></button>)}{!results.length&&<div className="empty">No matching place</div>}</div>}
 <div className="floor-picker">{floors.map(f=><button key={f.id} className={floor===f.id?'active':''} onClick={()=>setFloor(f.id)}><b>{f.short}</b><small>{f.label.replace(' Floor','')}</small></button>)}</div>
 <div className="map-tools"><button className={viewMode==='2d'?'selected-tool':''} onClick={()=>{setWalking(false);setViewMode('2d')}}>▦ 2D</button><button className={viewMode==='3d'?'selected-tool':''} onClick={()=>setViewMode('3d')}>◇ 3D</button>{!walking&&<><button onClick={()=>setShowPlan(v=>!v)}>▣ {showPlan?'Plan':'No plan'}</button><button onClick={()=>setModelOpacity(v=>Math.max(.2,v-.1))}>−</button><button onClick={()=>setModelOpacity(v=>Math.min(1,v+.1))}>＋</button><button onClick={()=>{setFloor(location.floor);setWalking(false)}}>◎ Center</button></>}{walking&&<button className="selected-tool" onClick={()=>setWalking(false)}>× Exit walk</button>}</div>
 {walking&&<div className="walk-hud"><div><strong>POV WALK</strong><span>{selected?.name||'Navigation'}</span></div><div className="instruction"><b>{step.text}</b><small>{Math.max(0,Math.round(step.distance))} m</small></div><div className="hud-distance">{Math.round(remaining)} m</div></div>}
 {outside&&<div className="outside">⚠ You appear to be outside RSET. <button onClick={resetDemo}>Use demo source</button></div>}
 {walking&&<div className="game-controls"><button onClick={()=>turn(-Math.PI/18)}>↶<small>TURN</small></button><button className="forward" onClick={()=>moveForward(.55)}>▲<small>WALK</small></button><button onClick={()=>turn(Math.PI/18)}>↷<small>TURN</small></button><button onClick={()=>moveForward(-.35)}>▼<small>BACK</small></button><button onClick={()=>{setPitch(-.02)}}>◎<small>LEVEL</small></button></div>}
 </section><aside className={`panel ${walking?"panel-walking":""}`}>
 {!selected?<div className="welcome"><div className="icon">⌖</div><div className="eyebrow">RSET CAMPUS</div><h2>Find any place in 3D</h2><p>Search a room, preview the blue route, then enter first-person walking mode.</p><button className="primary" onClick={()=>document.querySelector('.searchbox input')?.focus()}>⌕ Find a destination</button><div className="feature-grid"><span>🔵 Blue route</span><span>🎮 POV controls</span><span>↗ Turn guidance</span><span>⌂ 4 floors</span></div></div>:<div className="destination"><div className="eyebrow">DESTINATION</div><h2>{selected.name}</h2><p>{selected.floorLabel}{selected.doorRef?` · ${selected.doorRef}`:''}</p><div className="dest-actions"><button className="primary" onClick={buildRoute}>▶ START ROUTE</button>{route&&<button className="walk-btn" onClick={enterWalk}>◉ ENTER POV</button>}<button className="secondary" onClick={()=>setFavorites(f=>f.includes(selected.id)?f.filter(x=>x!==selected.id):[...f,selected.id])}>{favorites.includes(selected.id)?'★ Saved':'☆ Save'}</button></div></div>}
 {route&&<div className="nav-card"><div className="nav-live"><span className="pulse"/> ROUTE READY</div><strong>{selected?.name}</strong><div className="nav-meta">{Math.round(route.distance)} m · {Math.max(1,Math.ceil(route.minutes))} min</div><div className="route-floors">{routeFloors(route.path).map(f=><span key={f}>{f}</span>)}</div>{walking&&<div className="next-step"><span>NOW</span><b>{step.text}</b><small>{Math.max(0,Math.round(step.distance))} m</small></div>}<div className="nav-actions">{!walking&&<button className="walk-btn" onClick={enterWalk}>◉ Enter POV Walk</button>}<button className="secondary" onClick={recalc}>↻ Recalculate</button><button className="stop-btn" onClick={stop}>■ Stop</button></div></div>}
 <div className="location-card"><div><b>Current source</b><span>{liveGps?'GPS campus check':demoMode?'Reception checkpoint · demo':'Not active'}</span></div><div className="location-actions"><button onClick={startDemo}>Start demo</button><button onClick={()=>{setDemoMode(false);setLiveGps(v=>!v)}}>{liveGps?'Stop GPS':'Use GPS'}</button></div></div>
 <div className="utility-card"><button onClick={()=>setQrMode(v=>!v)}>▣ QR checkpoints <small>{qrCheckpoints.length} mapped</small></button><button onClick={()=>setShowPlaces(true)}>☰ Browse all places <small>{places.length} spaces</small></button></div>
 {qrMode&&<div className="qr-panel"><b>Indoor positioning checkpoints</b><p>QR checkpoints are mapped in the project data. Camera scanning needs a QR scanner library; for now select a checkpoint to simulate a position.</p>{qrCheckpoints.slice(0,8).map((q,i)=><button key={q.id||i} onClick={()=>{setMessage(`Checkpoint ${q.id||i+1} selected`);setQrMode(false)}}>{q.id||`Checkpoint ${i+1}`}</button>)}</div>}
 {admin&&<div className="admin"><div className="admin-head"><div><div className="eyebrow">ADMIN MODE</div><h3>Building editor</h3></div><button className="secondary" onClick={()=>setAdmin(false)}>Exit</button></div><p className="admin-note">Changes are saved in this browser. User mode only sees the published names.</p><label>Plan opacity <input type="range" min="0" max="1" step=".01" value={planOpacity} onChange={e=>setPlanOpacity(+e.target.value)}/></label><label>3D model opacity <input type="range" min=".35" max="1" step=".01" value={modelOpacity} onChange={e=>setModelOpacity(+e.target.value)}/></label><label><input type="checkbox" checked={ghost} onChange={e=>setGhost(e.target.checked)}/> Ghost model</label><div className="editor-list"><b>Rename areas</b>{displayPlaces.map(p=><div className="editor-row" key={p.id}><span>{p.floorLabel}</span><input value={p.name} onChange={e=>setNameOverrides(o=>({...o,[p.id]:{...o[p.id],name:e.target.value}}))}/><button onClick={()=>setNameOverrides(o=>{const n={...o}; delete n[p.id]; return n})}>Reset</button></div>)}</div><button className="secondary full" onClick={()=>setNameOverrides({})}>Reset all names</button><div className="calibration-box"><div className="editor-list"><b>2D MAP CALIBRATION</b><p className="admin-note">The supplied drawings are not survey-calibrated. Adjust these values only after comparing a known door/corner on the drawing with the real building.</p><label>Floor<select value={calFloor} onChange={e=>setCalFloor(e.target.value)}>{floors.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select></label>{['scaleX','scaleY','offsetX','offsetY','rotation'].map(k=><label key={k}>{k}<input type="number" step={k==='rotation'?'0.1':'0.01'} value={calibration[floors.find(f=>f.id===calFloor)?.mapId]?[k] ?? DEFAULT_CALIBRATION[k]:DEFAULT_CALIBRATION[k]} onChange={e=>{const mapId=floors.find(f=>f.id===calFloor)?.mapId;setCalibration(c=>({...c,[mapId]:{...DEFAULT_CALIBRATION,...(c[mapId]||{}),[k]:Number(e.target.value)}}))}}/></label>)}<div className="location-actions"><button className="secondary" onClick={()=>setCalibration(c=>{const n={...c};delete n[floors.find(f=>f.id===calFloor)?.mapId];return n})}>Reset floor</button><button className="secondary" onClick={()=>setCalibration({})}>Reset all</button></div></div></div><div className="warning"><b>Calibration / map data</b><ul>{mapWarnings.slice(0,3).map(w=><li key={w}>{w}</li>)}</ul></div></div>}
 </aside></main><footer><span>{message}</span><span>152 mapped spaces · 344 nodes · 374 edges</span></footer></div>;
}
createRoot(document.getElementById('root')).render(<App/>);
