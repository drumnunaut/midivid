export type EffectsSettings = {
  colorSpeed:    number;  // 0–3  — multiplier on all hue-cycle rates
  rotSpeed:      number;  // 0–3  — global rotation speed multiplier
  scale:         number;  // 0.5–2 — global kaleidoscope scale multiplier
  segments:      number;  // 0 = random, 3–8 = fixed wedge count
  blendMode:     string;  // 'random' | canvas blend mode name
  maxEffects:    number;  // 1–5  — max simultaneous live effects
  micThreshold:  number;  // 0.05–0.5 — band energy that triggers a mic note
  fadeDuration:  number;  // 0.1–2 s — how long an effect fades after note-off
  brightness:    number;  // 0.3–1.5 — global alpha/intensity multiplier
  fractalDepth:  number;  // 1–4  — max recursive fractal layers in media-show mic mode
};

export const DEFAULT_EFFECTS_SETTINGS: EffectsSettings = {
  colorSpeed:   1.0,
  rotSpeed:     1.0,
  scale:        1.0,
  segments:     0,
  blendMode:    'random',
  maxEffects:   3,
  micThreshold: 0.22,
  fadeDuration: 0.6,
  brightness:   1.0,
  fractalDepth: 4,
};

export const BLEND_MODE_OPTIONS = [
  'random', 'screen', 'overlay', 'hard-light', 'multiply', 'soft-light',
] as const;
