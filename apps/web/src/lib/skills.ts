/** Qualifikationsstufen nach Schweizer Berufslogik — jede Stufe umfasst die tieferen. */
export const SKILL_LEVELS = [0, 1, 2, 3] as const;
export const SKILL_LABELS: Record<number, string> = {
  0: "Egal / keine Vorgabe",
  1: "Automobilfachmann/-frau",
  2: "Automechatroniker/in",
  3: "Automobildiagnostiker/in",
};
export const SKILL_SHORT: Record<number, string> = {
  1: "Fachmann",
  2: "Mechatroniker",
  3: "Diagnostiker",
};
