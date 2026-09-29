import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { ModelObject } from '../../src/scene/ModelPrimitive';
import { disposeModel } from '../../src/performance/modelResources';
import { Lighting } from '../../src/scene/Lighting';
const node = { material: {}, transform: { scale: [1,1,1] } } as any;
function Raw({ source }) {
  const { gl } = useThree(); const [asset, setAsset] = useState<any>();
  useEffect(() => {
    let closed = false, model;
    const draco = new DRACOLoader().setDecoderPath('/decoders/draco/').setWorkerLimit(1);
    const ktx = new KTX2Loader().setTranscoderPath('/decoders/basis/').setWorkerLimit(1).detectSupport(gl);
    new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx).setMeshoptDecoder(MeshoptDecoder).loadAsync(source).then(value => { model = value; if(closed) disposeModel(value); else { setAsset(value); window.comparisonReady = (window.comparisonReady ?? 0) + 1; } });
    return () => { closed = true; if(model) disposeModel(model); draco.dispose(); ktx.dispose(); };
  }, [source, gl]);
  return asset ? <ModelObject scene={asset.scene} node={node} fit="contain" align="center" targetScale={node.transform.scale}/> : null;
}
createRoot(document.getElementById('root')!).render(<>{[['Original', '/performance-originals/bed_lamp.glb'], ['Prepared detail', '/performance-models/bed_lamp.detail.glb']].map(([label,source]) => <div className="panel" key={label}><div className="label">{label}</div><Canvas frameloop="demand" dpr={1} camera={{position:[0,.05,1.45], fov:45}}><Lighting/><Raw source={source}/><OrbitControls target={[0,0,0]}/></Canvas></div>)}</>);
