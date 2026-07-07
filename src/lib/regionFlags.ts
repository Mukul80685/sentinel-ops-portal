/** ISO 3166-1 alpha-2 codes bundled under /public/flags for offline use. */
export const BUNDLED_FLAG_CODES = ["cn", "pk", "tr", "bd", "eu", "ru", "us"] as const;

export type BundledFlagCode = (typeof BUNDLED_FLAG_CODES)[number];

export function getRegionFlagUrl(flagCode: string): string {
  return `/flags/${flagCode.toLowerCase()}.png`;
}

export function isBundledFlagCode(code: string): code is BundledFlagCode {
  return (BUNDLED_FLAG_CODES as readonly string[]).includes(code.toLowerCase());
}
