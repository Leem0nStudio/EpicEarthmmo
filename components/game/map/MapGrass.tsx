'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';

export function MapGrass({ count }: { count?: number }) {
  const safeCount = Math.max(0, count ?? 0);
  const instancedMesh = useMemo(() => {
    if (safeCount < 1) return null;
    const dummy = new THREE.Object3D();
    const mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.08, 0.15),
      new THREE.MeshBasicMaterial({ color: '#5aaa5a', transparent: true, opacity: 0.6, depthWrite: false }),
      safeCount,
    );
    for (let i = 0; i < safeCount; i++) {
      const x = (Math.random() - 0.5) * 30;
      const z = (Math.random() - 0.5) * 30;
      if (Math.abs(x) < 6 && Math.abs(z) < 6) continue;
      dummy.position.set(x, 0.06, z);
      dummy.rotation.set(0, Math.random() * Math.PI, 0);
      dummy.scale.set(1 + Math.random() * 0.5, 1 + Math.random() * 0.5, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [safeCount]);

  if (safeCount < 1 || !instancedMesh) return null;

  return <primitive object={instancedMesh} />;
}
