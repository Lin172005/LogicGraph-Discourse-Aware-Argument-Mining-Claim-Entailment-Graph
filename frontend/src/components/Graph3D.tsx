import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { GraphData, GraphLink, GraphNode } from '@/lib/types';

interface Graph3DProps {
  graph: GraphData;
  fitToken: number;
  onSelect: (node: GraphNode) => void;
  onClearSelection: () => void;
}

const nodeColors: Record<string, number> = {
  Document: 0x94a3b8,
  Claim: 0xf59e0b,
  Premise: 0x3b82f6,
};

const edgeColors: Record<string, number> = {
  CONTAINS: 0x94a3b8,
  SUPPORTS: 0x10b981,
  CONTRADICTS: 0xf43f5e,
};

function nodeKind(node: GraphNode): string {
  const label = node.type || node.labels?.[0];
  return label ? String(label).charAt(0).toUpperCase() + String(label).slice(1).toLowerCase() : 'Premise';
}

function nodePosition(index: number, total: number): THREE.Vector3 {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (index / Math.max(total - 1, 1)) * 2;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = goldenAngle * index;
  const distance = 110 + (index % 4) * 14;
  return new THREE.Vector3(
    Math.cos(theta) * radius * distance,
    y * distance,
    Math.sin(theta) * radius * distance,
  );
}

function makeArrow(from: THREE.Vector3, to: THREE.Vector3, color: number): THREE.Mesh {
  const direction = new THREE.Vector3().subVectors(to, from);
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(2.6, 8, 8),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
  );
  arrow.position.copy(to).sub(direction.normalize().multiplyScalar(8));
  arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return arrow;
}

export function Graph3D({ graph, fitToken, onSelect, onClearSelection }: Graph3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<(() => void) | null>(null);
  const [hovered, setHovered] = useState<GraphNode | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 1200);
    camera.position.set(0, 30, 360);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 90;
    controls.maxDistance = 700;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.25;

    scene.add(new THREE.AmbientLight(0xaab8d6, 1.8));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(180, 240, 220);
    scene.add(keyLight);

    const graphGroup = new THREE.Group();
    const edgeGroup = new THREE.Group();
    const nodeGroup = new THREE.Group();
    graphGroup.add(edgeGroup, nodeGroup);
    scene.add(graphGroup);

    const nodes = graph.nodes ?? [];
    const links = graph.links ?? graph.edges ?? [];
    const positions = new Map<string, THREE.Vector3>();
    const meshes = new Map<string, THREE.Mesh>();

    nodes.forEach((node, index) => {
      const id = String(node.id);
      const kind = nodeKind(node);
      const position = nodePosition(index, nodes.length);
      positions.set(id, position);

      const radius = kind === 'Document' ? 8 : kind === 'Claim' ? 7 : 5;
      const geometry = new THREE.SphereGeometry(radius, 24, 16);
      const material = new THREE.MeshStandardMaterial({
        color: nodeColors[kind] ?? nodeColors.Premise,
        emissive: nodeColors[kind] ?? nodeColors.Premise,
        emissiveIntensity: 0.18,
        roughness: 0.32,
        metalness: 0.24,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(position);
      mesh.userData.node = node;
      nodeGroup.add(mesh);
      meshes.set(id, mesh);
    });

    links.forEach((link: GraphLink) => {
      const source = positions.get(String(link.source));
      const target = positions.get(String(link.target));
      if (!source || !target) return;
      const relation = String(link.relation || link.type || 'SUPPORTS').toUpperCase();
      const color = edgeColors[relation] ?? edgeColors.SUPPORTS;
      const points = [source, target];
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: relation === 'CONTAINS' ? 0.24 : 0.68 }),
      );
      edgeGroup.add(line);
      if (relation !== 'CONTAINS') edgeGroup.add(makeArrow(source, target, color));
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onPointerMove = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(Array.from(meshes.values()))[0];
      setHovered(hit?.object.userData.node ?? null);
      renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
    };
    const onClick = () => {
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(Array.from(meshes.values()))[0];
      if (hit?.object.userData.node) onSelect(hit.object.userData.node as GraphNode);
      else onClearSelection();
    };
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('click', onClick);

    const fit = () => {
      const box = new THREE.Box3().setFromObject(graphGroup);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      controls.target.copy(sphere.center);
      camera.position.copy(sphere.center).add(new THREE.Vector3(0, sphere.radius * 0.22, Math.max(sphere.radius * 2.5, 260)));
      camera.near = Math.max(0.1, sphere.radius / 100);
      camera.far = Math.max(1200, sphere.radius * 10);
      camera.updateProjectionMatrix();
      controls.update();
    };
    fitRef.current = fit;
    fit();

    const resize = () => {
      const width = mount.clientWidth || 1;
      const height = mount.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    let animationFrame = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('click', onClick);
      controls.dispose();
      graphGroup.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose();
      });
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      fitRef.current = null;
    };
  }, [graph, onClearSelection, onSelect]);

  useEffect(() => {
    if (fitToken > 0) fitRef.current?.();
  }, [fitToken]);

  return (
    <div ref={mountRef} className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_center,rgba(30,41,59,0.72),rgba(2,6,23,0.96))]">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_48%,transparent_0,rgba(2,6,23,0.2)_55%,rgba(2,6,23,0.7)_100%)]" />
      {hovered && (
        <div className="absolute left-4 bottom-16 max-w-[280px] rounded-lg border border-white/10 bg-ink-950/90 px-3 py-2 text-xs text-ink-100 shadow-xl pointer-events-none">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-gold-300">{nodeKind(hovered)}</div>
          {hovered.label || hovered.text || hovered.id}
        </div>
      )}
    </div>
  );
}
