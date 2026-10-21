import React from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { DoubleSide } from 'three';
import { Lighting } from '../../src/scene/Lighting';
import { SpatialScene } from '../../src/scene/SpatialScene';
import { createSpatialDocument } from '../../src/model/createSpatialDocument';
const panels = `"+0+4/+0+1d/+0+4" : "color: white"
"+0+4/+4+1d/+0+4" : "color: white"
"+0+1d/+0+4/+0+4" : "color: white"
"+4+1d/+0+4/+0+4" : "color: white"
"+0+4/+0+4/+0+1d" : "color: white"
"+0+4/+0+4/+4+1d" : "color: white"`;
const params = new URLSearchParams(location.search);
const lit = params.has('lit');
const external = params.has('external');
const thin = params.has('thin');
const base = params.has('csg') ? `"shell/+0+4/+0+4/+0+4" : "color: white"
"cavity/+1d+38d/+1d+38d/+1d+38d" : "operation: subtraction"` : panels;
const source = thin ? base.replaceAll('1d', '1c').replaceAll('38d', '398c') : base;
const doc = createSpatialDocument(source + (lit || external ? `\n"+2+1m/+2+1m/${external ? '+6+1m' : '+2+1m'}" : "light-source: true; light-intensity: 30"` : ''));
function Probe() {
 const { camera, gl, scene } = useThree();
 useEffect(() => {
  camera.lookAt(2, 2, 0);
  const timer = setTimeout(() => {
   if (params.has('zero')) scene.traverse((object: any) => { if (object.isPointLight) { object.shadow.bias = 0; object.shadow.normalBias = 0; } });
   if (params.has('unshadowed')) scene.traverse((object: any) => { if (object.isPointLight) object.castShadow = false; });
   gl.render(scene, camera);
   const pixel = new Uint8Array(4);
   gl.getContext().readPixels(128,128,1,1,gl.getContext().RGBA,gl.getContext().UNSIGNED_BYTE,pixel);
   const frame = new Uint8Array(256 * 256 * 4);
   gl.getContext().readPixels(0,0,256,256,gl.getContext().RGBA,gl.getContext().UNSIGNED_BYTE,frame);
   let maxRGB = 0;
   for (let i = 0; i < frame.length; i++) if (i % 4 !== 3) maxRGB = Math.max(maxRGB, frame[i]);
   let noisyEdges = 0, samples = 0;
   for (let y = 64; y < 192; y++) for (let x = 65; x < 191; x++) {
     const i = (y * 256 + x) * 4;
     if (Math.abs(frame[i - 4] - 2 * frame[i] + frame[i + 4]) > 10) noisyEdges++;
     samples++;
   }
   const roughness = noisyEdges / samples;
   const lights: string[] = [];
   scene.traverse(object => { if ('isLight' in object) lights.push(object.type); });
   (window as any).qa = { pixel: [...pixel], roughness, lights, maxRGB, csgCount: doc.csgExpressions.length, errors: doc.diagnostics };
  }, 1000);
  return () => clearTimeout(timer);
 }, [camera, gl, scene]);
 return null;
}
createRoot(document.getElementById('root')!).render(<div style={{width:256,height:256}}><Canvas shadows camera={{position:[2,2,2],near:.001,far:100}} gl={{preserveDrawingBuffer:true}}><Lighting document={doc}/>{params.has('smooth') ? <mesh castShadow receiveShadow position={[2,2,0]}>
<planeGeometry args={[4,4]}/><meshStandardMaterial color="white" roughness={0.7} side={DoubleSide} shadowSide={DoubleSide}/>
</mesh> : <SpatialScene document={doc}/>}<Probe/></Canvas></div>);
