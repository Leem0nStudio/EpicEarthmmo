'use client';

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { playerPosition } from '@/lib/playerPosition';
import * as THREE from 'three';

const FIXED_YAW = 0.7854;
const FIXED_PITCH = 0.7854;
const BASE_DIST = 12;
const MIN_DIST = 5;
const MAX_DIST = 22;
const FOLLOW_SPEED = 0.04;
const MAP_BOUND_PADDING = 5;
const PERSPECTIVE_FOV = 50;

interface CameraControllerProps {
  mapDimensions?: { width: number; height: number };
  zoomEnabled?: boolean;
  minZoom?: number;
  maxZoom?: number;
  fixedAngle?: boolean;
}

export function CameraController({
  mapDimensions,
  zoomEnabled = true,
  minZoom = MIN_DIST,
  maxZoom = MAX_DIST,
  fixedAngle = true,
}: CameraControllerProps) {
  const { camera, size } = useThree();
  const camTarget = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());
  const currentDist = useRef(BASE_DIST);
  const targetDist = useRef(BASE_DIST);
  const initialized = useRef(false);

  const theta = fixedAngle ? FIXED_YAW : FIXED_YAW;
  const phi = fixedAngle ? FIXED_PITCH : FIXED_PITCH;

  useEffect(() => {
    if (!initialized.current) {
      const pp = playerPosition;
      camera.position.set(
        pp.x + BASE_DIST * Math.sin(phi) * Math.sin(theta),
        pp.y + BASE_DIST * Math.cos(phi) + 2,
        pp.z + BASE_DIST * Math.sin(phi) * Math.cos(theta),
      );
      camera.lookAt(pp.x, pp.y + 0.5, pp.z);
      camera.updateProjectionMatrix();
      camTarget.current.copy(camera.position);
      lookTarget.current.set(pp.x, pp.y + 0.5, pp.z);
    }
  }, [camera, phi, theta]);

  useEffect(() => {
    if (!zoomEnabled) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      targetDist.current = Math.max(minZoom, Math.min(maxZoom, targetDist.current + e.deltaY * 0.01));
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [zoomEnabled, minZoom, maxZoom]);

  useFrame((_state, delta) => {
    const pp = playerPosition;
    const aspect = size.width / size.height;

    const lerpFactor = 1 - Math.pow(1 - FOLLOW_SPEED, delta * 60);
    currentDist.current = THREE.MathUtils.lerp(currentDist.current, targetDist.current, lerpFactor);
    const dist = currentDist.current;

    const lookX = pp.x;
    const lookZ = pp.z;

    const targetCamX = lookX + dist * Math.sin(phi) * Math.sin(theta);
    const targetCamY = pp.y + dist * Math.cos(phi) + 2;
    const targetCamZ = lookZ + dist * Math.sin(phi) * Math.cos(theta);

    camTarget.current.set(targetCamX, targetCamY, targetCamZ);
    lookTarget.current.set(lookX, pp.y + 0.5, lookZ);

    if (mapDimensions) {
      const zoomScale = dist / BASE_DIST;
      const padding = MAP_BOUND_PADDING * zoomScale;
      const halfW = mapDimensions.width / 2 + padding;
      const halfH = mapDimensions.height / 2 + padding;
      camTarget.current.x = Math.max(-halfW, Math.min(halfW, camTarget.current.x));
      camTarget.current.z = Math.max(-halfH, Math.min(halfH, camTarget.current.z));
    }

    if (camera.isOrthographicCamera) {
      const viewH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(PERSPECTIVE_FOV / 2));
      const viewW = viewH * aspect;
      camera.left = -viewW / 2;
      camera.right = viewW / 2;
      camera.top = viewH / 2;
      camera.bottom = -viewH / 2;
      camera.zoom = 1;
    }

    camera.position.lerp(camTarget.current, lerpFactor);
    camera.lookAt(lookTarget.current);
    camera.updateProjectionMatrix();

    if (!initialized.current) {
      camera.position.copy(camTarget.current);
      camera.lookAt(lookTarget.current);
      initialized.current = true;
    }
  });

  return null;
}
