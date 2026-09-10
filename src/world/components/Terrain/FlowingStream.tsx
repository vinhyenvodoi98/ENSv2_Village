"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
  type Mesh,
} from "three";
import { getThemeMaterials } from "@/world/config/materials";
import { medievalTheme } from "@/world/config/theme";
import { SCENERY } from "@/world/config/world.config";

interface FlowingStreamProps {
  theme?: typeof medievalTheme;
}

function buildRibbon(width: number, y: number): BufferGeometry {
  const curve = new CatmullRomCurve3(
    SCENERY.streamPoints.map(([x, z]) => new Vector3(x, y, z)),
    false,
    "catmullrom",
    0.45
  );
  const positions = new Float32Array((SCENERY.streamSegments + 1) * 2 * 3);
  const uvs = new Float32Array((SCENERY.streamSegments + 1) * 2 * 2);
  const indices: number[] = [];
  const point = new Vector3();
  const tangent = new Vector3();
  const across = new Vector3();

  for (let i = 0; i <= SCENERY.streamSegments; i++) {
    const t = i / SCENERY.streamSegments;
    curve.getPointAt(t, point);
    curve.getTangentAt(t, tangent);
    across.set(-tangent.z, 0, tangent.x).normalize();
    const localWidth = width * (0.88 + Math.sin(t * Math.PI * 7) * 0.08);

    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? -1 : 1;
      const vertex = i * 2 + side;
      positions[vertex * 3] = point.x + across.x * localWidth * 0.5 * sign;
      positions[vertex * 3 + 1] = point.y;
      positions[vertex * 3 + 2] = point.z + across.z * localWidth * 0.5 * sign;
      uvs[vertex * 2] = side;
      uvs[vertex * 2 + 1] = t;
    }
    if (i < SCENERY.streamSegments) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createWaterMaterial(color: string, highlightColor: string, foamColor: string): ShaderMaterial {
  const base = new Color(color);
  return new ShaderMaterial({
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uTime: { value: 0 },
        uFlowSpeed: { value: SCENERY.streamFlowSpeed },
        uDeepColor: { value: base.clone().multiplyScalar(0.68) },
        uShallowColor: { value: base.clone().lerp(new Color(highlightColor), 0.35) },
        uFoamColor: { value: new Color(foamColor) },
      },
    ]),
    vertexShader: `
      uniform float uTime;
      uniform float uFlowSpeed;
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      #include <fog_pars_vertex>

      void main() {
        vUv = uv;
        vec3 p = position;
        float downstream = uv.y * 52.0 - uTime * uFlowSpeed * 5.2;
        float crossWave = uv.x * 8.0 + sin(uv.y * 13.0) * 1.2;
        p.y += sin(downstream + crossWave) * 0.016;
        p.y += sin(downstream * 0.43 - crossWave * 1.7) * 0.009;
        vec4 worldPosition = modelMatrix * vec4(p, 1.0);
        vWorldPosition = worldPosition.xyz;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uFlowSpeed;
      uniform vec3 uDeepColor;
      uniform vec3 uShallowColor;
      uniform vec3 uFoamColor;
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      #include <fog_pars_fragment>

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float valueNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
          mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }

      void main() {
        float time = uTime * uFlowSpeed;
        float bank = pow(abs(vUv.x * 2.0 - 1.0), 2.3);
        vec2 warpedUv = vec2(
          vUv.x * 5.0 + sin(vUv.y * 17.0 - time) * 0.28,
          vUv.y * 58.0 - time * 4.2
        );
        float coarseNoise = valueNoise(warpedUv * vec2(0.65, 0.12));
        float fineNoise = valueNoise(warpedUv * vec2(1.8, 0.28) + 8.7);

        float broadWave = sin(warpedUv.y + coarseNoise * 4.0) * 0.5 + 0.5;
        float fineWave = sin(warpedUv.y * 1.83 - warpedUv.x * 1.4 + fineNoise * 3.0) * 0.5 + 0.5;
        float movingShimmer = smoothstep(0.75, 0.98, broadWave) * 0.18
          + smoothstep(0.87, 1.0, fineWave) * 0.12;

        float brokenEdge = smoothstep(0.48, 0.82, valueNoise(vec2(vUv.y * 42.0 - time * 2.1, vUv.x * 5.0)));
        float edgeFoam = smoothstep(0.9, 0.995, bank) * brokenEdge;
        float currentFoam = smoothstep(0.93, 1.0, broadWave) * smoothstep(0.64, 0.92, fineNoise) * 0.24;

        vec3 normal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float fresnel = pow(1.0 - clamp(dot(normal, viewDirection), 0.0, 1.0), 3.0);
        vec3 lightDirection = normalize(vec3(0.35, 0.92, 0.22));
        vec3 halfVector = normalize(lightDirection + viewDirection);
        float specular = pow(max(dot(normal, halfVector), 0.0), 42.0);

        float shallowMix = 0.1 + bank * 0.2 + movingShimmer + fresnel * 0.14;
        vec3 waterColor = mix(uDeepColor, uShallowColor, clamp(shallowMix, 0.0, 0.58));
        waterColor += uFoamColor * specular * 0.24;
        float foam = clamp(edgeFoam * 0.46 + currentFoam, 0.0, 0.42);
        waterColor = mix(waterColor, uFoamColor, foam);

        gl_FragColor = vec4(waterColor, 0.84 + fresnel * 0.1 + foam * 0.05);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
}

/** Curved bank plus a lightweight animated shader surface; no textures or network assets. */
export function FlowingStream({ theme = medievalTheme }: FlowingStreamProps) {
  const waterRef = useRef<Mesh>(null);
  const bankGeometry = useMemo(() => buildRibbon(SCENERY.streamBankWidth, SCENERY.groundY + 0.012), []);
  const waterGeometry = useMemo(
    () => buildRibbon(SCENERY.streamWidth, SCENERY.groundY + SCENERY.streamSurfaceOffset),
    []
  );
  const waterMaterial = useMemo(
    () => createWaterMaterial(theme.terrain.water.color, theme.sky.bottom, theme.lighting.directionalColor),
    [theme.terrain.water.color, theme.sky.bottom, theme.lighting.directionalColor]
  );
  const bankMaterial = getThemeMaterials(theme).terrain.dirt;

  useEffect(() => {
    return () => {
      bankGeometry.dispose();
      waterGeometry.dispose();
    };
  }, [bankGeometry, waterGeometry]);

  useEffect(() => () => waterMaterial.dispose(), [waterMaterial]);

  useFrame((_, delta) => {
    const material = waterRef.current?.material as ShaderMaterial | undefined;
    if (material) material.uniforms.uTime.value += delta;
  });

  return (
    <group>
      <mesh geometry={bankGeometry} material={bankMaterial} receiveShadow />
      <mesh ref={waterRef} geometry={waterGeometry} material={waterMaterial} renderOrder={2} />
    </group>
  );
}
