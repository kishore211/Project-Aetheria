// Visual effects manager for god powers and weather.
import * as THREE from 'three';
import { TILE_SIZE } from '../types/world';
import { random } from './random';

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
  /** One per cloud, on the ground below it. */
  private cloudShadows: THREE.Sprite[] = [];
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

    // Clouds made of pixels, not of airbrush.
    //
    // These were soft radial gradients stretched across thirty tiles, which
    // made them the one blurred thing on a map where everything else is an
    // eight-pixel grid — zoomed in they read as a smear on the lens rather
    // than as weather. Same gradients, but the alpha is then cut into three
    // hard steps and sampled with a nearest filter, so a cloud has an edge and
    // that edge is made of the same size pixel as the ground under it.
    //
    // The canvas is sized so one texel lands on one terrain pixel at the fixed
    // sprite scale below: 256 texels over 32 tiles is the 8-per-tile the
    // ground uses. Shape variety comes from three different textures rather
    // than from scaling one, because scaling would break that alignment.
    const CLOUD_TEXELS = 128;
    const CLOUD_TILES = 16;
    const cloudWidth = CLOUD_TILES * TILE_SIZE;

    const makeCloudTexture = (): THREE.Texture => {
      const canvas = document.createElement('canvas');
      canvas.width = CLOUD_TEXELS;
      canvas.height = CLOUD_TEXELS / 2;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        for (let i = 0; i < 14; i++) {
          const x = 20 + random() * 88;
          const y = 20 + random() * 24;
          const r = 10 + random() * 16;
          const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
          gradient.addColorStop(0, 'rgba(255,255,255,0.55)');
          gradient.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        // Body, fringe, nothing. Two steps rather than one so a cloud still
        // has a softer rim, which is what keeps it from reading as a sticker.
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 3; i < image.data.length; i += 4) {
          const alpha = image.data[i];
          image.data[i] = alpha > 140 ? 235 : alpha > 70 ? 130 : 0;
        }
        ctx.putImageData(image, 0, 0);
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      return texture;
    };

    const cloudTextures = [makeCloudTexture(), makeCloudTexture(), makeCloudTexture()];

    // Fewer, smaller, and all at one opacity. Ten sprites thirty tiles wide at
    // random opacities do not read as ten clouds — they overlap into a single
    // grey haze with no edge anywhere in it, which on this map looks like a
    // smudge on the glass. At one opacity the overlaps land on a handful of
    // discrete levels instead, and each cloud keeps its own shape.
    for (let i = 0; i < 7; i++) {
      const material = new THREE.SpriteMaterial({
        map: cloudTextures[i % cloudTextures.length],
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      });
      const cloud = new THREE.Sprite(material);
      cloud.scale.set(cloudWidth, cloudWidth * 0.5, 1);
      cloud.position.set(
        (random() - 0.5) * this.cloudArea,
        9 + random() * 5,
        (random() - 0.5) * this.cloudArea,
      );
      this.scene.add(cloud);
      this.clouds.push(cloud);

      // Its shadow, on the ground. The same pixel shape in dark at low
      // opacity, thrown down and to the right like everything else on the
      // map. It is what puts the cloud *above* the world rather than painted
      // on the glass in front of it.
      const shadow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: material.map,
        color: 0x0a1420,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      }));
      shadow.scale.copy(cloud.scale);
      shadow.renderOrder = -1;
      this.scene.add(shadow);
      this.cloudShadows.push(shadow);
    }

    // Starfield dome, hidden during the day
    const starCount = 350;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = random() * Math.PI * 2;
      const phi = random() * Math.PI * 0.45;
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

  /**
   * The cloud sprites, for whoever is deciding what falls out of them.
   *
   * Handed over rather than driven from here: this class knows how to *draw* a
   * cloud and nothing about weather, plagues or seeding a continent, and the
   * split is what lets the drop table be tested without a renderer.
   */
  cloudSprites(): { sprites: THREE.Sprite[]; area: number } {
    return { sprites: this.clouds, area: this.cloudArea };
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

    // Drifting belongs to the cloud system now, along with what each cloud is
    // carrying — see `clouds.ts`. This still owns making and disposing them,
    // and keeps each shadow under its cloud.
    for (let i = 0; i < this.cloudShadows.length; i++) {
      const cloud = this.clouds[i];
      const shadow = this.cloudShadows[i];
      if (!cloud) continue;
      shadow.position.set(cloud.position.x + 1.4, 0.09, cloud.position.z + 2.2);
      shadow.visible = cloud.visible;
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
        if (y < 0) y = 18 + random() * 6;
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
        (random() - 0.5) * speed,
        random() * speed,
        (random() - 0.5) * speed,
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
        (random() - 0.5) * 1.2,
        -(1 + random() * 2),
        (random() - 0.5) * 1.2,
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

  /**
   * A red cross where a power was refused. WorldBox pops an X when a power
   * cannot be used somewhere; without it a rejected click is indistinguishable
   * from a broken game.
   */
  spawnRefusal(position: THREE.Vector3): void {
    const material = new THREE.LineBasicMaterial({
      color: 0xff5a4a,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      depthTest: false,
    });
    const arm = 0.22;
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-arm, 0, -arm), new THREE.Vector3(arm, 0, arm),
      new THREE.Vector3(-arm, 0, arm), new THREE.Vector3(arm, 0, -arm),
    ]);
    const cross = new THREE.LineSegments(geometry, material);
    cross.position.copy(position);
    cross.position.y += 0.3;
    cross.renderOrder = 4;

    this.add(cross, 0.55, (effect) => {
      const t = effect.age / effect.lifetime;
      material.opacity = 1 - t;
      effect.object.position.y += 0.35 * (1 / 60);
      const scale = 1 + t * 0.5;
      effect.object.scale.set(scale, scale, scale);
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
      positions[i * 3] = (random() - 0.5) * this.rainArea;
      positions[i * 3 + 1] = centerY + random() * 22;
      positions[i * 3 + 2] = (random() - 0.5) * this.rainArea;
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
    for (const shadow of this.cloudShadows) {
      this.scene.remove(shadow);
      shadow.material.dispose();
    }
    this.cloudShadows = [];
    if (this.stars) {
      this.scene.remove(this.stars);
      this.stars.geometry.dispose();
      (this.stars.material as THREE.Material).dispose();
      this.stars = null;
    }
  }
}
