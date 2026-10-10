// The light the whole world is standing in.
//
// Time of day used to darken the painted map and nothing else, so at night the
// creatures and buildings stayed at full daylight brightness and looked pasted
// on top of the world rather than standing in it. This is the one tint every
// lit thing reads: the map shader, the building and boat clouds, and the
// creature sprites. Labels and icons deliberately do not — they are interface,
// and interface you cannot read at night is a bug.
//
// Expressed as `colour * k + o` per channel, because that is exactly what a
// lerp toward a tint followed by a scale is. Materials that can only multiply
// use `color`, which is the same transform applied to white.
import * as THREE from 'three';

export const DAYLIGHT = {
  k: new THREE.Vector3(1, 1, 1),
  o: new THREE.Vector3(0, 0, 0),
  color: new THREE.Color(1, 1, 1),
};

export const setDaylight = (k: THREE.Vector3, o: THREE.Vector3): void => {
  DAYLIGHT.k.copy(k);
  DAYLIGHT.o.copy(o);
  DAYLIGHT.color.setRGB(k.x + o.x, k.y + o.y, k.z + o.z);
};
