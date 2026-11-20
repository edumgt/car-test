import * as THREE from 'three';
import type { VehicleState } from '../sim/types';
import { computePredictedArcs, VEHICLE_SPEC } from '../sim/vehiclePhysics';
import {
  createContactShadowTexture,
  createLicensePlateTexture,
  createRoofSignTexture,
} from './proceduralTextures';

export interface TestVehicleRig {
  root: THREE.Group;
  guideGroup: THREE.Group;
  updateVisuals: (state: VehicleState, elapsedSec: number, showGuides: boolean) => void;
  dispose: () => void;
}

export function createTestVehicleRig(maxAnisotropy: number, castShadow: boolean): TestVehicleRig {
  const root = new THREE.Group();
  root.name = 'KoreanTestSedan';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // Materials (varied roughness >= 0.25 between body clearcoat, matte trim, dark glass, metallic rims)
  const bodyPaintMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xf4f6f9,
      roughness: 0.22,
      metalness: 0.12,
      clearcoat: 1.0,
      clearcoatRoughness: 0.12,
    })
  );
  const accentStripeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      roughness: 0.35,
      metalness: 0.15,
    })
  );
  const darkTrimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1a1e24,
      roughness: 0.78,
      metalness: 0.08,
    })
  );
  const glassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x142230,
      roughness: 0.08,
      metalness: 0.28,
      transparent: true,
      opacity: 0.86,
    })
  );
  const tireMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x181b20,
      roughness: 0.88,
      metalness: 0.02,
    })
  );
  const rimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd0d7e2,
      roughness: 0.24,
      metalness: 0.84,
    })
  );
  const chromeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.16,
      metalness: 0.9,
    })
  );

  // Functional emissive lamp materials
  const headlightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfff8e6,
      emissive: 0xfff0c8,
      emissiveIntensity: 0.75,
      roughness: 0.15,
      metalness: 0.1,
    })
  );
  const brakeLightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x991b1b,
      emissive: 0xff1e28,
      emissiveIntensity: 0.25,
      roughness: 0.2,
      metalness: 0.1,
    })
  );
  const reverseLightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      emissive: 0xffffff,
      emissiveIntensity: 0.0,
      roughness: 0.2,
      metalness: 0.1,
    })
  );
  const leftTurnMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x92400e,
      emissive: 0xff9f0a,
      emissiveIntensity: 0.0,
      roughness: 0.22,
      metalness: 0.1,
    })
  );
  const rightTurnMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x92400e,
      emissive: 0xff9f0a,
      emissiveIntensity: 0.0,
      roughness: 0.22,
      metalness: 0.1,
    })
  );

  // 1. Contact shadow plane (grounded at y = 0.016)
  const shadowTex = createContactShadowTexture();
  textures.push(shadowTex);
  const contactShadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.72,
    })
  );
  const contactShadow = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(2.35, 5.15)), contactShadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.016;
  root.add(contactShadow);

  // Chassis group (slightly suspended above wheels)
  const chassis = new THREE.Group();
  root.add(chassis);

  // 2. Sculpted lower sedan body profile (extruded along X, nose toward -Z, tail toward +Z)
  const lowerShape = new THREE.Shape();
  // Shape coords: x = local Z (-2.25 front to +2.25 rear), y = local Y height
  lowerShape.moveTo(-2.22, 0.32);
  lowerShape.lineTo(-2.14, 0.68);
  lowerShape.quadraticCurveTo(-1.95, 0.83, -1.22, 0.89);
  lowerShape.lineTo(1.52, 0.94);
  lowerShape.quadraticCurveTo(2.08, 0.92, 2.22, 0.76);
  lowerShape.lineTo(2.24, 0.34);
  lowerShape.lineTo(1.88, 0.28);
  lowerShape.lineTo(-1.86, 0.28);
  lowerShape.closePath();

  const lowerExtrude = trackGeo(
    new THREE.ExtrudeGeometry(lowerShape, {
      depth: 1.64,
      bevelEnabled: true,
      bevelThickness: 0.07,
      bevelSize: 0.055,
      bevelSegments: 3,
      curveSegments: 10,
    })
  );
  // Rotate so shape's X becomes local +Z and extrude depth spans -X..+X centered at 0
  lowerExtrude.translate(0, 0, -0.82);
  lowerExtrude.rotateY(-Math.PI / 2);
  const lowerBody = new THREE.Mesh(lowerExtrude, bodyPaintMat);
  lowerBody.castShadow = castShadow;
  lowerBody.receiveShadow = true;
  chassis.add(lowerBody);

  // 3. Sculpted greenhouse / cabin roof (extruded narrower & sloped windshield + rear window)
  const cabinShape = new THREE.Shape();
  cabinShape.moveTo(-1.02, 0.87);
  cabinShape.lineTo(-0.34, 1.43);
  cabinShape.quadraticCurveTo(0.22, 1.48, 0.86, 1.41);
  cabinShape.lineTo(1.62, 0.91);
  cabinShape.closePath();

  const cabinExtrude = trackGeo(
    new THREE.ExtrudeGeometry(cabinShape, {
      depth: 1.32,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.04,
      bevelSegments: 2,
      curveSegments: 8,
    })
  );
  cabinExtrude.translate(0, 0, -0.66);
  cabinExtrude.rotateY(-Math.PI / 2);
  const cabinMesh = new THREE.Mesh(cabinExtrude, glassMat);
  cabinMesh.castShadow = castShadow;
  chassis.add(cabinMesh);

  // Painted roof cap over glasshouse
  const roofCap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.30, 0.05, 1.24)), bodyPaintMat);
  roofCap.position.set(0, 1.45, 0.24);
  roofCap.castShadow = castShadow;
  chassis.add(roofCap);

  // 4. Driving-school side blue accent stripe
  for (const side of [-1, 1]) {
    const stripe = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.025, 0.09, 3.65)), accentStripeMat);
    stripe.position.set(side * 0.895, 0.56, 0.02);
    chassis.add(stripe);
  }

  // 5. Lower front & rear bumper trim valances
  const frontLip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.68, 0.14, 0.14)), darkTrimMat);
  frontLip.position.set(0, 0.30, -2.22);
  chassis.add(frontLip);

  const rearDiffuser = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.66, 0.15, 0.14)), darkTrimMat);
  rearDiffuser.position.set(0, 0.32, 2.22);
  chassis.add(rearDiffuser);

  // 6. Front radiator grille + chrome bar
  const grille = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.92, 0.22, 0.06)), darkTrimMat);
  grille.position.set(0, 0.56, -2.25);
  chassis.add(grille);

  const grilleBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.86, 0.035, 0.075)), chromeMat);
  grilleBar.position.set(0, 0.61, -2.26);
  chassis.add(grilleBar);

  // 7. Korean Driving Test Roof Sign ("기능시험 · 도로주행 연습차량")
  const roofSignTex = createRoofSignTexture(maxAnisotropy);
  textures.push(roofSignTex);
  const roofSignFaceMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: roofSignTex,
      roughness: 0.35,
      metalness: 0.05,
    })
  );
  const roofSignFrameMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.38,
      metalness: 0.08,
    })
  );
  const roofMount = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.68, 0.04, 0.18)), darkTrimMat);
  roofMount.position.set(0, 1.49, 0.18);
  chassis.add(roofMount);

  const roofSign = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.62, 0.20, 0.14)), [
    roofSignFrameMat,
    roofSignFrameMat,
    roofSignFrameMat,
    roofSignFrameMat,
    roofSignFaceMat,
    roofSignFaceMat,
  ]);
  roofSign.position.set(0, 1.61, 0.18);
  roofSign.castShadow = castShadow;
  chassis.add(roofSign);

  // 8. Korean License Plates (Front & Rear)
  const plateTex = createLicensePlateTexture(maxAnisotropy);
  textures.push(plateTex);
  const plateMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: plateTex,
      roughness: 0.38,
      metalness: 0.08,
    })
  );
  const plateGeo = trackGeo(new THREE.PlaneGeometry(0.52, 0.12));
  const frontPlate = new THREE.Mesh(plateGeo, plateMat);
  frontPlate.position.set(0, 0.42, -2.29);
  frontPlate.rotation.y = Math.PI;
  chassis.add(frontPlate);

  const rearPlate = new THREE.Mesh(plateGeo, plateMat);
  rearPlate.position.set(0, 0.56, 2.29);
  chassis.add(rearPlate);

  // 9. Side Mirrors (critical reference markers in Cockpit & Chase views!)
  for (const side of [-1, 1]) {
    const mirrorArm = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 0.04, 0.06)), darkTrimMat);
    mirrorArm.position.set(side * 0.84, 0.96, -0.58);
    chassis.add(mirrorArm);

    const mirrorHousing = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.16, 0.10, 0.12)), bodyPaintMat);
    mirrorHousing.position.set(side * 0.94, 0.98, -0.56);
    mirrorHousing.castShadow = castShadow;
    chassis.add(mirrorHousing);

    const mirrorGlass = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.13, 0.08)), chromeMat);
    mirrorGlass.position.set(side * 0.94, 0.98, -0.498);
    chassis.add(mirrorGlass);
  }

  // 10. Front Headlights & Front Turn Signals
  const hlGeo = trackGeo(new THREE.BoxGeometry(0.32, 0.11, 0.08));
  const turnGeo = trackGeo(new THREE.BoxGeometry(0.12, 0.09, 0.08));
  for (const side of [-1, 1]) {
    const hl = new THREE.Mesh(hlGeo, headlightMat);
    hl.position.set(side * 0.62, 0.64, -2.22);
    chassis.add(hl);

    const fTurn = new THREE.Mesh(turnGeo, side < 0 ? leftTurnMat : rightTurnMat);
    fTurn.position.set(side * 0.80, 0.63, -2.18);
    chassis.add(fTurn);
  }

  // 11. Rear Taillights, Brake Lights, Reverse Lights & Rear Turn Signals
  const tailGeo = trackGeo(new THREE.BoxGeometry(0.34, 0.12, 0.08));
  const revGeo = trackGeo(new THREE.BoxGeometry(0.14, 0.08, 0.085));
  for (const side of [-1, 1]) {
    const tl = new THREE.Mesh(tailGeo, brakeLightMat);
    tl.position.set(side * 0.62, 0.77, 2.23);
    chassis.add(tl);

    const rev = new THREE.Mesh(revGeo, reverseLightMat);
    rev.position.set(side * 0.44, 0.74, 2.24);
    chassis.add(rev);

    const rTurn = new THREE.Mesh(turnGeo, side < 0 ? leftTurnMat : rightTurnMat);
    rTurn.position.set(side * 0.80, 0.76, 2.20);
    chassis.add(rTurn);
  }
  // Center high-mount stop lamp (CHMSL) + rear trunk trim bar & exhaust tips
  const chmsl = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.38, 0.04, 0.04)), brakeLightMat);
  chmsl.position.set(0, 1.38, 0.94);
  chassis.add(chmsl);

  const trunkTrim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.82, 0.025, 0.04)), chromeMat);
  trunkTrim.position.set(0, 0.77, 2.25);
  chassis.add(trunkTrim);

  const platePocket = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.62, 0.18, 0.03)), darkTrimMat);
  platePocket.position.set(0, 0.56, 2.275);
  chassis.add(platePocket);

  const exhaustGeo = trackGeo(new THREE.CylinderGeometry(0.042, 0.042, 0.14, 10));
  exhaustGeo.rotateX(Math.PI / 2);
  const exhaustR = new THREE.Mesh(exhaustGeo, chromeMat);
  exhaustR.position.set(0.54, 0.30, 2.26);
  chassis.add(exhaustR);

  // 12. Four Independent Steerable & Spinning Wheels
  const wheelR = VEHICLE_SPEC.wheelRadius;
  const tireGeo = trackGeo(new THREE.CylinderGeometry(wheelR, wheelR, 0.23, 20));
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = trackGeo(new THREE.CylinderGeometry(wheelR * 0.66, wheelR * 0.66, 0.24, 14));
  rimGeo.rotateZ(Math.PI / 2);
  const spokeGeo = trackGeo(new THREE.BoxGeometry(0.245, wheelR * 1.15, 0.048));

  const createWheelAssembly = (): THREE.Group => {
    const spinGroup = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = castShadow;
    spinGroup.add(tire);

    const rim = new THREE.Mesh(rimGeo, rimMat);
    spinGroup.add(rim);

    // Cross spokes so wheel rotation is visibly crisp!
    const spoke1 = new THREE.Mesh(spokeGeo, darkTrimMat);
    const spoke2 = new THREE.Mesh(spokeGeo, darkTrimMat);
    spoke2.rotation.x = Math.PI / 2;
    spinGroup.add(spoke1, spoke2);
    return spinGroup;
  };

  const hw = VEHICLE_SPEC.trackWidth * 0.5;
  const frontLeftPivot = new THREE.Group();
  frontLeftPivot.position.set(-hw, wheelR, VEHICLE_SPEC.frontAxleZ);
  const frontLeftWheel = createWheelAssembly();
  frontLeftPivot.add(frontLeftWheel);

  const frontRightPivot = new THREE.Group();
  frontRightPivot.position.set(hw, wheelR, VEHICLE_SPEC.frontAxleZ);
  const frontRightWheel = createWheelAssembly();
  frontRightPivot.add(frontRightWheel);

  const rearLeftWheel = createWheelAssembly();
  rearLeftWheel.position.set(-hw, wheelR, VEHICLE_SPEC.rearAxleZ);

  const rearRightWheel = createWheelAssembly();
  rearRightWheel.position.set(hw, wheelR, VEHICLE_SPEC.rearAxleZ);

  root.add(frontLeftPivot, frontRightPivot, rearLeftWheel, rearRightWheel);

  // 13. Dynamic World-Space Predicted Tire Trajectory Lines (for Guide Mode ON)
  const guideGroup = new THREE.Group();
  guideGroup.name = 'PredictedTrajectoryGuides';
  const arcSteps = 14;
  const leftPosArr = new Float32Array((arcSteps + 1) * 3);
  const rightPosArr = new Float32Array((arcSteps + 1) * 3);
  const leftLineGeo = trackGeo(new THREE.BufferGeometry());
  leftLineGeo.setAttribute('position', new THREE.BufferAttribute(leftPosArr, 3));
  const rightLineGeo = trackGeo(new THREE.BufferGeometry());
  rightLineGeo.setAttribute('position', new THREE.BufferAttribute(rightPosArr, 3));

  const guideLineMat = trackMat(
    new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    })
  );
  const leftLine = new THREE.Line(leftLineGeo, guideLineMat);
  const rightLine = new THREE.Line(rightLineGeo, guideLineMat);
  leftLine.frustumCulled = false;
  rightLine.frustumCulled = false;
  guideGroup.add(leftLine, rightLine);

  const updateVisuals = (state: VehicleState, elapsedSec: number, showGuides: boolean) => {
    root.position.set(state.x, 0, state.z);
    root.rotation.y = state.yaw;

    // Subtle body pitch/roll suspension feedback
    const pitch = state.isBraking ? -0.014 * Math.sign(state.speed || 1) : 0;
    const roll = -state.steerAngle * Math.min(1, Math.abs(state.speed) / 5) * 0.04;
    chassis.rotation.x += (pitch - chassis.rotation.x) * 0.18;
    chassis.rotation.z += (roll - chassis.rotation.z) * 0.18;

    // Steerable front wheels + spinning axles
    frontLeftPivot.rotation.y = state.steerAngle;
    frontRightPivot.rotation.y = state.steerAngle;
    frontLeftWheel.rotation.x = -state.wheelSpin;
    frontRightWheel.rotation.x = -state.wheelSpin;
    rearLeftWheel.rotation.x = -state.wheelSpin;
    rearRightWheel.rotation.x = -state.wheelSpin;

    // Functional brake, reverse, and turn signals
    brakeLightMat.emissiveIntensity = state.isBraking || state.handbrake ? 2.4 : 0.25;
    reverseLightMat.emissiveIntensity = state.gear === 'R' ? 2.1 : 0.0;

    const blinkOn = Math.floor(elapsedSec * 2.4) % 2 === 0;
    const leftActive = (state.turnSignal === 'left' || state.turnSignal === 'hazard') && blinkOn;
    const rightActive = (state.turnSignal === 'right' || state.turnSignal === 'hazard') && blinkOn;
    leftTurnMat.emissiveIntensity = leftActive ? 2.4 : 0.0;
    rightTurnMat.emissiveIntensity = rightActive ? 2.4 : 0.0;

    // Predicted tire path arcs
    guideGroup.visible = showGuides && state.gear !== 'P';
    if (guideGroup.visible) {
      const arcs = computePredictedArcs(state, arcSteps, 0.45);
      guideLineMat.color.setHex(state.gear === 'R' ? 0xf59e0b : 0x38bdf8);
      for (let i = 0; i <= arcSteps; i++) {
        leftPosArr[i * 3] = arcs.left[i].x;
        leftPosArr[i * 3 + 1] = 0.045;
        leftPosArr[i * 3 + 2] = arcs.left[i].z;

        rightPosArr[i * 3] = arcs.right[i].x;
        rightPosArr[i * 3 + 1] = 0.045;
        rightPosArr[i * 3 + 2] = arcs.right[i].z;
      }
      leftLineGeo.attributes.position.needsUpdate = true;
      rightLineGeo.attributes.position.needsUpdate = true;
    }
  };

  const dispose = () => {
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
  };

  return { root, guideGroup, updateVisuals, dispose };
}
