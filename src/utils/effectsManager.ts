// Visual effects manager for god powers and weather.
import * as THREE from 'three';

interface ActiveEffect {
  object: THREE.Object3D;
  age: number;
  lifetime: number;
  update: (effect: ActiveEffect, delta: number) => void;
}

const disposeObject = (object: THREE.Object3D): void => {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = (mesh as THREE.Mesh).material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else if (material) material.dispose();
  });
};

export class EffectsManager {
  private scene: THREE.Scene;
  private effects: ActiveEffect[] = [];
  private rain: THREE.Points | null = null;
  private rainVelocity = 14;
  private rainArea = 64;
  private clouds: THREE.Sprite[] = [];
  private cloudArea = 70;
  private stars: THREE.Points | null = null;
  private starTargetOpacity = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Create drifting clouds and a starfield sized to the world. */
  initAtmosphere(worldUnits: number): void {
    this.cloudArea = worldUnits * 1.1;
    this.rainArea = worldUnits;

    // Procedural soft cloud texture
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      for (let i = 0; i < 14; i++) {
        const x = 20 + Math.random() * 88;
        const y = 20 + Math.random() * 24;
        const r = 10 + Math.random() * 16;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, 'rgba(255,255,255,0.55)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
    const cloudTexture = new THREE.CanvasTexture(canvas);

    for (let i = 0; i < 10; i++) {
      const material = new THREE.SpriteMaterial({
        map: cloudTexture,
        transparent: true,
        opacity: 0.35 + Math.random() * 0.25,
        depthWrite: false,
      });
      const cloud = new THREE.Sprite(material);
      const scale = 6 + Math.random() * 10;
      cloud.scale.set(scale, scale * 0.45, 1);
      cloud.position.set(
        (Math.random() - 0.5) * this.cloudArea,
        9 + Math.random() * 5,
        (Math.random() - 0.5) * this.cloudArea,
      );
      this.scene.add(cloud);
      this.clouds.push(cloud);
    }

    // Starfield dome, hidden during the day
    const starCount = 350;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.45;
      const radius = worldUnits * 1.6;
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi) + 4;
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starMaterial = new THREE.PointsMaterial({
      color: 0xdde6ff,
      size: 0.35,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.stars = new THREE.Points(starGeometry, starMaterial);
    this.scene.add(this.stars);
  }

  setStarVisibility(visible: boolean): void {
    this.starTargetOpacity = visible ? 0.9 : 0;
  }

  update(delta: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];
      effect.age += delta;
      if (effect.age >= effect.lifetime) {
        this.scene.remove(effect.object);
        disposeObject(effect.object);
        this.effects.splice(i, 1);
      } else {
        effect.update(effect, delta);
      }
    }

    // Drift clouds and wrap them around the world
    const half = this.cloudArea / 2;
    for (const cloud of this.clouds) {
      cloud.position.x += delta * 0.4;
      cloud.position.z += delta * 0.15;
      if (cloud.position.x > half) cloud.position.x = -half;
      if (cloud.position.z > half) cloud.position.z = -half;
    }

    // Fade stars toward their target opacity
    if (this.stars) {
      const material = this.stars.material as THREE.PointsMaterial;
      material.opacity += (this.starTargetOpacity - material.opacity) * Math.min(1, delta * 1.5);
    }

    if (this.rain) {
      const positions = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < positions.count; i++) {
        let y = positions.getY(i) - this.rainVelocity * delta;
        if (y < 0) y = 18 + Math.random() * 6;
        positions.setY(i, y);
      }
      positions.needsUpdate = true;
    }
  }

  private add(object: THREE.Object3D, lifetime: number, update: ActiveEffect['update']): void {
    this.scene.add(object);
    this.effects.push({ object, age: 0, lifetime, update });
  }

  /** Burst of glowing particles rising from a point. */
  spawnBurst(position: THREE.Vector3, color: number, count = 24, speed = 2.2): void {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;
      velocities.push(new THREE.Vector3(
        (Math.random() - 0.5) * speed,
        Math.random() * speed,
        (Math.random() - 0.5) * speed,
      ));
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color,
      size: 0.12,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);

    this.add(points, 1.2, (effect, delta) => {
      const attr = (effect.object as THREE.Points).geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < attr.count; i++) {
        attr.setXYZ(
          i,
          attr.getX(i) + velocities[i].x * delta,
          attr.getY(i) + velocities[i].y * delta,
          attr.getZ(i) + velocities[i].z * delta,
        );
        velocities[i].y -= 4 * delta;
      }
      attr.needsUpdate = true;
      material.opacity = 1 - effect.age / effect.lifetime;
    });
  }

  /** Expanding shockwave ring on the ground. */
  spawnShockwave(position: THREE.Vector3, color: number, maxRadius = 3): void {
    const geometry = new THREE.RingGeometry(0.1, 0.25, 32);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(position);
    ring.position.y += 0.05;

    this.add(ring, 0.8, (effect) => {
      const t = effect.age / effect.lifetime;
      const scale = 1 + t * maxRadius * 4;
      effect.object.scale.set(scale, scale, scale);
      material.opacity = 0.9 * (1 - t);
    });
  }

  /** Meteor falling from the sky onto a target, with impact burst. */
  spawnMeteor(target: THREE.Vector3, onImpact: () => void): void {
    const start = target.clone().add(new THREE.Vector3(8, 22, 8));
    const geometry = new THREE.SphereGeometry(0.35, 8, 8);
    const material = new THREE.MeshBasicMaterial({ color: 0xff6622 });
    const meteor = new THREE.Mesh(geometry, material);
    meteor.position.copy(start);

    const trailMaterial = new THREE.PointsMaterial({
      color: 0xffaa33,
      size: 0.18,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    const trailGeometry = new THREE.BufferGeometry();
    const trailPositions = new Float32Array(30 * 3);
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    const trail = new THREE.Points(trailGeometry, trailMaterial);
    meteor.add(trail);

    const duration = 0.9;
    let impacted = false;

    this.add(meteor, duration + 0.05, (effect) => {
      const t = Math.min(1, effect.age / duration);
      effect.object.position.lerpVectors(start, target, t);
      const attr = trailGeometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = attr.count - 1; i > 0; i--) {
        attr.setXYZ(i, attr.getX(i - 1), attr.getY(i - 1) + 0.1, attr.getZ(i - 1));
      }
      attr.setXYZ(0, 0, 0, 0);
      attr.needsUpdate = true;
      if (t >= 1 && !impacted) {
        impacted = true;
        this.spawnBurst(target, 0xff5511, 40, 4);
        this.spawnShockwave(target, 0xff8844, 4);
        onImpact();
      }
    });
  }

  /** Vertical lightning bolt striking a point. */
  spawnLightning(target: THREE.Vector3): void {
    const points: THREE.Vector3[] = [];
    let current = target.clone().add(new THREE.Vector3(0, 20, 0));
    points.push(current.clone());
    while (current.y > target.y + 0.5) {
      current = current.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 1.2,
        -(1 + Math.random() * 2),
        (Math.random() - 0.5) * 1.2,
      ));
      points.push(current.clone());
    }
    points.push(target.clone());

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0xbbddff,
      transparent: true,
      opacity: 1,
    });
    const bolt = new THREE.Line(geometry, material);

    this.add(bolt, 0.35, (effect) => {
      material.opacity = 1 - effect.age / effect.lifetime;
    });
    this.spawnBurst(target, 0xbbddff, 16, 3);
  }

  /** Persistent flame markers on a burning tile. */
  spawnFlame(position: THREE.Vector3, lifetime = 4): void {
    const geometry = new THREE.ConeGeometry(0.12, 0.4, 6);
    const material = new THREE.MeshBasicMaterial({
      color: 0xff7700,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const flame = new THREE.Mesh(geometry, material);
    flame.position.copy(position);
    flame.position.y += 0.25;

    this.add(flame, lifetime, (effect) => {
      const flicker = 0.85 + Math.sin(effect.age * 22) * 0.25;
      effect.object.scale.set(flicker, flicker * (1 + Math.sin(effect.age * 15) * 0.2), flicker);
      material.opacity = Math.min(0.85, (effect.lifetime - effect.age) * 0.6);
    });
  }

  /** Soft rising glow for blessings and curses. */
  spawnAura(position: THREE.Vector3, color: number): void {
    this.spawnBurst(position, color, 20, 1.4);
    this.spawnShockwave(position, color, 2);
  }

  startRain(centerY = 0): void {
    if (this.rain) return;
    const count = 900;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * this.rainArea;
      positions[i * 3 + 1] = centerY + Math.random() * 22;
      positions[i * 3 + 2] = (Math.random() - 0.5) * this.rainArea;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0x88aadd,
      size: 0.08,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    this.rain = new THREE.Points(geometry, material);
    this.scene.add(this.rain);
  }

  stopRain(): void {
    if (!this.rain) return;
    this.scene.remove(this.rain);
    this.rain.geometry.dispose();
    (this.rain.material as THREE.Material).dispose();
    this.rain = null;
  }

  get isRaining(): boolean {
    return this.rain !== null;
  }

  dispose(): void {
    this.stopRain();
    for (const effect of this.effects) {
      this.scene.remove(effect.object);
      disposeObject(effect.object);
    }
    this.effects = [];
    for (const cloud of this.clouds) {
      this.scene.remove(cloud);
      cloud.material.map?.dispose();
      cloud.material.dispose();
    }
    this.clouds = [];
    if (this.stars) {
      this.scene.remove(this.stars);
      this.stars.geometry.dispose();
      (this.stars.material as THREE.Material).dispose();
      this.stars = null;
    }
  }
}
